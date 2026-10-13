/**
 * BLOOD MOON: ETERNAL NIGHT — procedural audio engine.
 *
 * Every sound effect, music track and ambience bed is synthesised at runtime
 * with the Web Audio API: oscillators, looped noise buffers through filters,
 * envelopes, a generated convolution reverb and a master limiter. There are no
 * audio files and no dependencies.
 *
 * Signal flow
 *   one-shot voices ─► sfxBus ───┐
 *   music tracks ────► musicBus ─┼─► master ─► compressor (limiter) ─► destination
 *   ambience beds ───► ambBus ───┤
 *   (each bus has a matching send, scaled by the same volume)
 *        sfxSend / musicSend / ambSend ─► convolver ─► reverbReturn ─┘
 *
 * The AudioContext is created lazily inside unlock() (autoplay policy). When Web
 * Audio is unavailable the manager warns once and becomes a silent no-op.
 *
 * Custom music: music/playlist.json (next to the page) may map track names (or "all")
 * to audio files the player owns; loadUserFile() does the same for a picked File for
 * the current session. Such files are decoded, looped and crossfaded on the music bus
 * instead of the synthesized track; any failure falls back to the built-in score.
 */

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const LOOKAHEAD = 0.15; // music scheduler lookahead (s)
const MUSIC_FADE = 2.5; // music crossfade (s)
const AMB_FADE = 3.0; // ambience crossfade (s)
const MAX_VOICES = 32; // simultaneous one-shot voices
const RETRIGGER = 0.03; // same-name retriggers inside this window are ignored (s)
const NEAR = 3; // positional sounds are at full volume within this distance
const FAR = 45; // ...and silent beyond this one
const LOUD_REDUCTION = 0.4; // "reduce loud sounds" keeps 40 % of the level
const LOUD = new Set(['stinger', 'thunder', 'boss_shriek', 'hit_heavy', 'eclipse', 'execution', 'queen']);
const TRIM = { music: 2.0, sfx: 1.1, amb: 1.0 }; // bus trims for a sensible default mix
const CUSTOM_LEVEL = 0.7; // level of user-supplied music files (before the music bus trim)
const PLAYLIST_TIMEOUT = 4000; // ms to wait for music/playlist.json before using built-in music

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const curve = (v) => v * v; // perceptual volume-slider curve
const own = (obj, key) => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : null);
const readBlob = (blob) =>
  typeof blob.arrayBuffer === 'function'
    ? blob.arrayBuffer()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsArrayBuffer(blob);
      });
const unplug = (n) => {
  try {
    n.disconnect();
  } catch (e) {
    /* already disconnected */
  }
};

/** Vowel formants: [centre Hz, gain]. Used for choirs, grunts, shrieks, whispers. */
const VOWELS = {
  a: [[750, 3], [1200, 2], [2600, 0.8]],
  o: [[450, 3], [800, 2], [2600, 0.5]],
  u: [[325, 3.5], [700, 1.2], [2500, 0.3]],
  e: [[550, 3], [1800, 1.8], [2600, 0.8]],
  i: [[300, 3], [2300, 1.8], [3000, 1]],
};

// ---------------------------------------------------------------------------
// Generated buffers
// ---------------------------------------------------------------------------

/** Seamlessly looping mono noise ('white' | 'pink' | 'brown'), RMS-normalised. */
function makeNoise(ctx, kind, seconds = 3) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.05);
  const raw = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') {
      // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last;
    } else {
      raw[i] = w;
    }
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += raw[i] * raw[i];
  const scale = 0.3 / Math.sqrt(sum / n || 1);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = clamp(raw[i] * scale, -1, 1);
  // Crossfade the overshoot into the head so the loop point is click-free.
  for (let i = 0; i < fade; i++) {
    const x = i / fade;
    d[i] = clamp((raw[i] * Math.sqrt(x) + raw[n + i] * Math.sqrt(1 - x)) * scale, -1, 1);
  }
  return buf;
}

/** Stereo reverb impulse: early reflections + a decaying tail that darkens over time. */
function makeImpulse(ctx, seconds = 3.2) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.018);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const x = (i - pre) / (n - pre);
      const onset = Math.min(1, (i - pre) / (sr * 0.02));
      const c = 0.15 + 0.75 * x; // one-pole smoothing grows -> darker tail
      lp += (1 - c) * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-6.2 * x) * onset * (1 - x * x * 0.2);
    }
    for (let k = 0; k < 10; k++) {
      const idx = pre + Math.floor(sr * rand(0.004, 0.09));
      if (idx < n) d[idx] += rand(-0.6, 0.6) * (1 - k / 12);
    }
  }
  return buf;
}

/** Gramophone surface noise: faint hiss plus sparse random clicks and pops (loopable). */
function makeCrackle(ctx, seconds = 4) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.012;
  const clicks = Math.floor(seconds * 26);
  for (let c = 0; c < clicks; c++) {
    const pos = Math.floor(Math.random() * (n - 400));
    const amp = Math.random() < 0.08 ? rand(0.45, 0.85) : rand(0.04, 0.25);
    const len = 6 + Math.floor(Math.random() * (amp > 0.4 ? 160 : 50));
    for (let j = 0; j < len; j++) d[pos + j] += amp * Math.exp(-j / (len * 0.25)) * (Math.random() * 2 - 1);
  }
  return buf;
}

/** Additive PeriodicWave from harmonic amplitudes (index 1 = fundamental). */
function makeWave(ctx, amps) {
  const real = new Float32Array(amps.length);
  const imag = new Float32Array(amps.length);
  for (let i = 1; i < amps.length; i++) imag[i] = amps[i];
  return ctx.createPeriodicWave(real, imag);
}

// ---------------------------------------------------------------------------
// Synth: low-level building blocks + instruments
// ---------------------------------------------------------------------------
/*
 * Common note options (all optional):
 *   t                     start time (ctx time)
 *   a, hold, r, g, ea     envelope: attack, hold, release, peak gain, exponential attack
 *   f, f2, glide, fp      pitch: start Hz, end Hz, glide time, or path [[dt, ratio], ...]
 *   type | wave, det      oscillator type or PeriodicWave name, detune (cents)
 *   ft, ff, ff2, fg, q    filter type / start Hz / end Hz / sweep time / Q
 *   lp, hp                extra fixed low/high-pass (noise only)
 *   vib [rate, cents]     vibrato         trem [rate, depth, type]  tremolo
 *   pan                   per-note stereo position
 * When a note belongs to a Voice, all frequencies are scaled by the voice pitch.
 */
class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.nyq = ctx.sampleRate / 2 - 100;
    this.buf = {
      white: makeNoise(ctx, 'white'),
      pink: makeNoise(ctx, 'pink'),
      brown: makeNoise(ctx, 'brown'),
    };
    this.waves = {
      organ: makeWave(ctx, [0, 1, 0.75, 0.45, 0.3, 0, 0.2, 0, 0.12]),
      piano: makeWave(ctx, [0, 1, 0.5, 0.32, 0.2, 0.12, 0.07, 0.05, 0.03]),
    };
    this._crackle = null;
  }

  /** Vinyl crackle buffer, generated on first use. */
  get crackle() {
    if (!this._crackle) this._crackle = makeCrackle(this.ctx);
    return this._crackle;
  }

  /** Attack / hold / exponential release envelope. Returns the end time. */
  env(p, t, o) {
    const a = Math.max(0.001, o.a ?? 0.005);
    const hold = o.hold ?? 0;
    const r = Math.max(0.01, o.r ?? 0.2);
    const g = Math.max(1e-4, o.g ?? 0.3);
    p.setValueAtTime(1e-4, t);
    if (o.ea) p.exponentialRampToValueAtTime(g, t + a);
    else p.linearRampToValueAtTime(g, t + a);
    if (hold > 0) p.setValueAtTime(g, t + a + hold);
    p.exponentialRampToValueAtTime(1e-4, t + a + hold + r);
    return t + a + hold + r;
  }

  _pitch(p, t, end, o, k) {
    const hz = (x) => clamp(x, 1, this.nyq);
    const f = (o.f ?? 440) * k;
    p.setValueAtTime(hz(f), t);
    if (o.fp) for (const [dt, ratio] of o.fp) p.exponentialRampToValueAtTime(hz(f * ratio), t + dt);
    else if (o.f2) p.exponentialRampToValueAtTime(hz(o.f2 * k), t + (o.glide ?? end - t));
  }

  _filter(type, t, end, f, f2, glide, q, k = 1) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.setValueAtTime(clamp(f * k, 20, this.nyq), t);
    if (f2) n.frequency.exponentialRampToValueAtTime(clamp(f2 * k, 20, this.nyq), t + (glide ?? end - t));
    n.Q.setValueAtTime(q ?? (type === 'bandpass' ? 1 : 0.7), t);
    return n;
  }

  /** LFO (osc -> depth gain -> param). Returns the depth gain so it can feed more params. */
  _mod(param, t, rate, depth, srcs, nodes, type = 'sine') {
    const l = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    l.type = type;
    l.frequency.setValueAtTime(rate, t);
    g.gain.setValueAtTime(depth, t);
    l.connect(g);
    if (param) g.connect(param);
    srcs.push(l);
    nodes.push(l, g);
    return g;
  }

  /** Optional tremolo + pan, connect to dest, start/stop sources and auto-clean. */
  _finish(amp, dest, o, t, end, srcs, nodes, v) {
    const ctx = this.ctx;
    let out = amp;
    if (o.trem) {
      const [rate, depth, type] = o.trem;
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(1 - depth / 2, t);
      this._mod(tg.gain, t, rate, depth / 2, srcs, nodes, type || 'sine');
      out.connect(tg);
      out = tg;
      nodes.push(tg);
    }
    if (o.pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(clamp(o.pan, -1, 1), t);
      out.connect(p);
      out = p;
      nodes.push(p);
    }
    out.connect(dest);
    const stop = end + 0.03;
    if (v) v._begin(stop);
    // All sources stop together; the first one's onended cleans up the chain.
    srcs[0].onended = () => {
      for (const n of nodes) unplug(n);
      if (v) v._end();
    };
    for (const s of srcs) {
      s.start(t, s._off || 0);
      s.stop(stop);
    }
    return end;
  }

  /** Oscillator note. */
  tone(dest, o, v = null) {
    const ctx = this.ctx;
    const k = v ? v.p : 1;
    const t = o.t ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    if (o.wave) osc.setPeriodicWave(this.waves[o.wave]);
    else osc.type = o.type || 'sine';
    const amp = ctx.createGain();
    const end = this.env(amp.gain, t, o);
    this._pitch(osc.frequency, t, end, o, k);
    if (o.det) osc.detune.setValueAtTime(o.det, t);
    const srcs = [osc];
    const nodes = [osc, amp];
    let head = osc;
    if (o.ft) {
      const f = this._filter(o.ft, t, end, o.ff ?? 1000, o.ff2, o.fg, o.q, k);
      head.connect(f);
      head = f;
      nodes.push(f);
    }
    head.connect(amp);
    if (o.vib) this._mod(osc.detune, t, o.vib[0], o.vib[1], srcs, nodes);
    return this._finish(amp, dest, o, t, end, srcs, nodes, v);
  }

  /** Filtered noise burst. */
  noise(dest, o, v = null) {
    const ctx = this.ctx;
    const k = v ? v.p : 1;
    const t = o.t ?? ctx.currentTime;
    const buf = this.buf[o.buf || 'white'];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (o.rate) src.playbackRate.setValueAtTime(o.rate, t);
    src._off = Math.random() * (buf.duration - 0.1);
    const amp = ctx.createGain();
    const end = this.env(amp.gain, t, o);
    const srcs = [src];
    const nodes = [src, amp];
    let head = src;
    const chain = (f) => {
      head.connect(f);
      head = f;
      nodes.push(f);
    };
    if (o.ft) chain(this._filter(o.ft, t, end, o.ff ?? 1000, o.ff2, o.fg, o.q, k));
    if (o.lp) chain(this._filter('lowpass', t, end, o.lp, 0, 0, 0.5, k));
    if (o.hp) chain(this._filter('highpass', t, end, o.hp, 0, 0, 0.5, k));
    head.connect(amp);
    return this._finish(amp, dest, o, t, end, srcs, nodes, v);
  }

  /** Stack of detuned oscillators (shared vibrato) summed into one gain node. */
  _stack(o, k, t, end, srcs, nodes) {
    const ctx = this.ctx;
    const n = o.n ?? 3;
    const spread = o.spread ?? 12;
    const mix = ctx.createGain();
    mix.gain.value = 1 / n;
    nodes.push(mix);
    const oscs = [];
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sawtooth';
      this._pitch(osc.frequency, t, end, o, k);
      const off = n > 1 ? (i / (n - 1) - 0.5) * 2 * spread : 0;
      osc.detune.setValueAtTime((o.det || 0) + off, t);
      osc.connect(mix);
      srcs.push(osc);
      nodes.push(osc);
      oscs.push(osc);
    }
    if (o.vib && o.vib[1]) {
      const depth = this._mod(null, t, o.vib[0], o.vib[1], srcs, nodes);
      for (const osc of oscs) depth.connect(osc.detune);
    }
    return mix;
  }

  /**
   * Voice-like source: detuned oscillators through vowel formant band-passes.
   * Extra options: n (voices), spread (cents), vowel / vowel2 (glide), vglide, fk (formant shift), q.
   */
  vox(dest, o, v = null) {
    const ctx = this.ctx;
    const k = v ? v.p : 1;
    const t = o.t ?? ctx.currentTime;
    const amp = ctx.createGain();
    const end = this.env(amp.gain, t, o);
    const srcs = [];
    const nodes = [amp];
    const mix = this._stack(o, k, t, end, srcs, nodes);
    const v1 = typeof o.vowel === 'string' ? VOWELS[o.vowel] : o.vowel || VOWELS.a;
    const v2 = o.vowel2 ? VOWELS[o.vowel2] : null;
    const fk = o.fk ?? 1;
    const q = o.q ?? 6;
    v1.forEach(([ff, fg], idx) => {
      const bp = this._filter('bandpass', t, end, ff * fk, v2 ? v2[idx][0] * fk : 0, o.vglide, q);
      const g = ctx.createGain();
      g.gain.value = fg;
      mix.connect(bp);
      bp.connect(g);
      g.connect(amp);
      nodes.push(bp, g);
    });
    return this._finish(amp, dest, o, t, end, srcs, nodes, v);
  }

  /** Ensemble (bowed strings): detuned oscillators through a low-pass (lpf) and optional high-pass (hpf). */
  ens(dest, o, v = null) {
    const ctx = this.ctx;
    const k = v ? v.p : 1;
    const t = o.t ?? ctx.currentTime;
    const amp = ctx.createGain();
    const end = this.env(amp.gain, t, o);
    const srcs = [];
    const nodes = [amp];
    let head = this._stack(o, k, t, end, srcs, nodes);
    const lp = this._filter('lowpass', t, end, o.lpf ?? 2200, 0, 0, o.q ?? 0.5, k);
    head.connect(lp);
    head = lp;
    nodes.push(lp);
    if (o.hpf) {
      const hp = this._filter('highpass', t, end, o.hpf, 0, 0, 0.5, k);
      head.connect(hp);
      head = hp;
      nodes.push(hp);
    }
    head.connect(amp);
    return this._finish(amp, dest, o, t, end, srcs, nodes, v);
  }

  // ---- instruments (used by music, ambience and some SFX) -----------------

  piano(d, m, t, vel = 0.08, len = 3) {
    const f = mtof(m);
    this.tone(d, { t, wave: 'piano', f, a: 0.004, r: len, g: vel, ft: 'lowpass', ff: Math.min(f * 8, 7000), ff2: f * 1.5, fg: len * 0.5, q: 0 });
    this.tone(d, { t, f: f * 2, det: 4, a: 0.003, r: len * 0.35, g: vel * 0.22 });
    this.noise(d, { t, ft: 'bandpass', ff: Math.min(f * 4, 8000), q: 2, a: 0.001, r: 0.03, g: vel * 0.25 });
  }

  harp(d, m, t, vel = 0.06) {
    // harpsichord-like pluck
    const f = mtof(m);
    this.tone(d, { t, type: 'sawtooth', f, a: 0.002, r: 0.9, g: vel, ft: 'lowpass', ff: 5200, ff2: f * 2.5, fg: 0.45, q: 2 });
    this.tone(d, { t, type: 'square', f: f * 2, det: 5, a: 0.002, r: 0.3, g: vel * 0.25, ft: 'highpass', ff: 1400 });
  }

  organ(d, m, t, dur, vel = 0.05) {
    const f = mtof(m);
    const hold = Math.max(0, dur - 0.08);
    this.tone(d, { t, wave: 'organ', f, a: 0.08, hold, r: 0.4, g: vel, ft: 'lowpass', ff: 2400, vib: [5.2, 3] });
    this.tone(d, { t, wave: 'organ', f, det: 7, a: 0.1, hold, r: 0.45, g: vel * 0.55, ft: 'lowpass', ff: 1800 });
  }

  lead(d, m, t, dur, vel = 0.05) {
    const f = mtof(m);
    this.tone(d, { t, type: 'triangle', f, a: 0.12, hold: dur * 0.6, r: dur * 0.6 + 0.5, g: vel, vib: [5, 7], ft: 'lowpass', ff: 2600 });
    this.tone(d, { t, wave: 'organ', f, det: -5, a: 0.18, hold: dur * 0.5, r: dur * 0.5 + 0.4, g: vel * 0.3, ft: 'lowpass', ff: 1600 });
  }

  /** Church-bell partials (hum, prime, minor tierce, quint, nominal...). */
  bell(d, f, t, vel = 0.08, len = 4, v = null) {
    const P = [[0.5, 0.8, 1], [1, 0.7, 0.8], [1.19, 0.45, 0.55], [1.5, 0.3, 0.45], [2, 0.4, 0.35], [2.52, 0.18, 0.25], [3.01, 0.14, 0.18], [4.17, 0.08, 0.1]];
    for (const [ratio, g, dec] of P) this.tone(d, { t, f: f * ratio, det: rand(-4, 4), a: 0.002, r: len * dec, g: vel * g }, v);
    this.noise(d, { t, ft: 'bandpass', ff: Math.min(f * 3, 9000), q: 1.5, a: 0.001, r: 0.05, g: vel * 0.4 }, v);
  }

  /** Choir-like pad: one formant voice per chord note. */
  pad(d, notes, t, dur, vel, o = {}) {
    const a = o.a ?? 1.2;
    for (const m of notes) {
      this.vox(d, {
        t, f: mtof(m), n: o.n ?? 3, spread: o.spread ?? 10, a, hold: Math.max(0, dur - a), r: o.r ?? 1.8, g: vel,
        vowel: o.vowel || 'a', vowel2: o.vowel2, q: o.q ?? 5, vib: [rand(4.2, 5.4), o.vibDepth ?? 10], type: o.type || 'sawtooth',
      });
    }
  }

  kick(d, t, vel = 0.5) {
    this.tone(d, { t, f: 150, fp: [[0.03, 0.6], [0.14, 0.31]], a: 0.002, r: 0.38, g: vel });
    this.noise(d, { t, ft: 'lowpass', ff: 2500, a: 0.001, r: 0.015, g: vel * 0.3 });
  }

  tom(d, t, f = 90, vel = 0.3) {
    this.tone(d, { t, f: f * 1.5, f2: f, glide: 0.08, a: 0.002, r: 0.4, g: vel });
    this.tone(d, { t, type: 'triangle', f: f * 2.3, f2: f * 1.6, glide: 0.1, a: 0.002, r: 0.15, g: vel * 0.2 });
    this.noise(d, { t, buf: 'pink', ft: 'bandpass', ff: f * 4, q: 1, a: 0.002, r: 0.12, g: vel * 0.3 });
  }

  snare(d, t, vel = 0.15) {
    this.noise(d, { t, ft: 'bandpass', ff: 1800, q: 0.8, lp: 6000, a: 0.002, r: 0.18, g: vel });
    this.tone(d, { t, type: 'triangle', f: 210, f2: 160, glide: 0.06, a: 0.002, r: 0.1, g: vel * 0.5 });
  }

  hat(d, t, vel = 0.03) {
    this.noise(d, { t, ft: 'highpass', ff: 7000, lp: 11000, a: 0.001, r: 0.04, g: vel });
  }

  bass(d, m, t, dur, vel = 0.12, bright = 1) {
    const f = mtof(m);
    this.tone(d, { t, type: 'sawtooth', f, a: 0.004, hold: dur * 0.25, r: dur * 0.9, g: vel, ft: 'lowpass', ff: 1300 * bright, ff2: 200, fg: dur * 0.8, q: 6 });
    this.tone(d, { t, type: 'square', f, det: -6, a: 0.004, hold: dur * 0.2, r: dur * 0.7, g: vel * 0.35, ft: 'lowpass', ff: 600 * bright, ff2: 150, fg: dur * 0.6 });
  }

  stab(d, notes, t, vel = 0.03, bright = 1) {
    for (const m of notes) {
      for (const det of [-9, 9]) {
        this.tone(d, { t, type: 'sawtooth', f: mtof(m), det, a: 0.004, r: 0.3, g: vel, ft: 'lowpass', ff: 3000 * bright, ff2: 350, fg: 0.22, q: 3 });
      }
    }
  }

  glass(d, m, t, dur, vel = 0.02) {
    const f = mtof(m);
    this.tone(d, { t, f, a: dur * 0.4, hold: dur * 0.3, r: dur, g: vel, vib: [rand(3, 6), 6] });
    this.tone(d, { t, type: 'triangle', f: f * 1.004, a: dur * 0.45, hold: dur * 0.3, r: dur, g: vel * 0.5 });
    this.tone(d, { t, f: f * 2.01, a: dur * 0.5, r: dur * 0.8, g: vel * 0.25 });
  }

  pulse(d, t, vel = 0.3, f = 55) {
    this.tone(d, { t, f: f * 1.6, f2: f, glide: 0.06, a: 0.005, r: 0.35, g: vel });
    this.noise(d, { t, buf: 'brown', ft: 'lowpass', ff: 200, a: 0.005, r: 0.2, g: vel * 0.5 });
  }

  /** Legato string section note: slow bow attack, gentle vibrato, darkened saws. */
  strings(d, m, t, dur, vel = 0.04, o = {}) {
    const f = mtof(m);
    const a = Math.min(o.a ?? 0.3, Math.max(0.005, dur * 0.8));
    this.ens(d, {
      t, f, n: 3, spread: o.spread ?? 8, a, hold: Math.max(0, dur - a), r: o.r ?? 0.7, g: vel,
      lpf: o.lpf ?? clamp(f * 4, 900, 3400), hpf: o.hpf, vib: [rand(4.6, 5.6), o.vib ?? 9],
    });
  }

  /** Music-box / celesta: pure tone, soft octave and a tiny metallic tine. */
  celesta(d, m, t, vel = 0.04) {
    const f = mtof(m);
    this.tone(d, { t, f, a: 0.002, r: 1.6, g: vel });
    this.tone(d, { t, f: f * 2, a: 0.002, r: 0.6, g: vel * 0.35 });
    this.tone(d, { t, f: f * 5.4, a: 0.001, r: 0.12, g: vel * 0.12 });
  }

  pizz(d, m, t, vel = 0.06) {
    const f = mtof(m);
    this.tone(d, { t, type: 'triangle', f, a: 0.003, r: 0.45, g: vel });
    this.tone(d, { t, type: 'sawtooth', f, a: 0.003, r: 0.2, g: vel * 0.4, ft: 'lowpass', ff: f * 6, ff2: f * 1.5, fg: 0.15 });
  }

  /** Timpani-like hit: tuned membrane partials + mallet noise. */
  timp(d, m, t, vel = 0.3) {
    const f = mtof(m);
    this.tone(d, { t, f: f * 1.04, f2: f, glide: 0.08, a: 0.003, r: 1.4, g: vel });
    this.tone(d, { t, f: f * 1.5, a: 0.003, r: 0.6, g: vel * 0.3 });
    this.tone(d, { t, f: f * 1.99, a: 0.003, r: 0.35, g: vel * 0.18 });
    this.noise(d, { t, buf: 'brown', ft: 'lowpass', ff: 500, a: 0.002, r: 0.3, g: vel * 0.7 });
    this.noise(d, { t, buf: 'pink', ft: 'bandpass', ff: 1200, q: 1, a: 0.001, r: 0.05, g: vel * 0.25 });
  }
}

// ---------------------------------------------------------------------------
// Voice: one one-shot SFX instance (shared gain/pan/reverb send + cleanup)
// ---------------------------------------------------------------------------
class Voice {
  constructor(am, o) {
    const ctx = am.ctx;
    this.am = am;
    this.syn = am._syn;
    this.p = o.pitch;
    this.pending = 0;
    this.sealed = false;
    this.done = false;
    this.end = ctx.currentTime + 0.1;
    this.out = ctx.createGain();
    this.out.gain.value = o.gain;
    this.nodes = [this.out];
    let tail = this.out;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      tail.connect(f);
      tail = f;
      this.nodes.push(f);
    }
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      tail.connect(p);
      tail = p;
      this.nodes.push(p);
    }
    tail.connect(o.bus);
    if (o.rev > 0 && o.send) {
      const s = ctx.createGain();
      s.gain.value = o.rev;
      tail.connect(s);
      s.connect(o.send);
      this.nodes.push(s);
    }
    am._voices.add(this);
  }

  tone(o) { return this.syn.tone(o.dest || this.out, o, this); }
  noise(o) { return this.syn.noise(o.dest || this.out, o, this); }
  vox(o) { return this.syn.vox(o.dest || this.out, o, this); }
  bell(f, t, vel, len) { this.syn.bell(this.out, f, t, vel, len, this); }

  _begin(stop) {
    this.pending++;
    if (stop > this.end) this.end = stop;
  }

  _end() {
    this.pending--;
    if (this.pending <= 0 && this.sealed) this.dispose();
  }

  seal() {
    this.sealed = true;
    if (this.pending <= 0) this.dispose();
  }

  dispose() {
    if (this.done) return;
    this.done = true;
    for (const n of this.nodes) unplug(n);
    this.am._voices.delete(this);
  }
}

// ---------------------------------------------------------------------------
// Sound effect recipes: fn(voice, startTime). vary = random pitch spread,
// rev = reverb send, gain = level trim, lp = fixed low-pass (distance).
// ---------------------------------------------------------------------------
const SFX = {
  // ---- UI ------------------------------------------------------------------
  ui_hover: { gain: 6, rev: 0.05, fn(v, t) {
    v.tone({ t, f: 2600, a: 0.001, r: 0.035, g: 0.05 });
    v.noise({ t, ft: 'highpass', ff: 6000, a: 0.001, r: 0.015, g: 0.04 });
  } },
  ui_click: { gain: 4, rev: 0.1, fn(v, t) {
    v.tone({ t, type: 'triangle', f: 1400, f2: 700, glide: 0.05, a: 0.001, r: 0.07, g: 0.16 });
    v.tone({ t, f: 220, f2: 140, a: 0.002, r: 0.06, g: 0.15 });
    v.noise({ t, ft: 'bandpass', ff: 3500, q: 1.5, a: 0.001, r: 0.02, g: 0.2 });
  } },
  ui_back: { gain: 2.3, rev: 0.1, fn(v, t) {
    v.tone({ t, type: 'triangle', f: 880, f2: 520, glide: 0.09, a: 0.002, r: 0.12, g: 0.14 });
    v.tone({ t: t + 0.06, type: 'triangle', f: 587, f2: 392, glide: 0.1, a: 0.002, r: 0.16, g: 0.11 });
  } },
  ui_open: { gain: 1.6, rev: 0.35, fn(v, t) {
    v.noise({ t, ft: 'bandpass', ff: 700, ff2: 3200, q: 1.2, a: 0.09, r: 0.18, g: 0.12 });
    v.tone({ t: t + 0.03, f: 587.3, a: 0.005, r: 0.6, g: 0.1 });
    v.tone({ t: t + 0.09, f: 880, a: 0.005, r: 0.7, g: 0.08 });
    v.tone({ t: t + 0.09, f: 1760, a: 0.005, r: 0.3, g: 0.02 });
  } },

  // ---- player combat -------------------------------------------------------
  swing: { gain: 10, vary: 0.1, rev: 0.12, fn(v, t) {
    v.noise({ t, ft: 'bandpass', ff: 500, ff2: 3200, fg: 0.1, q: 1.4, a: 0.025, r: 0.13, g: 0.6 });
    v.noise({ t: t + 0.01, ft: 'highpass', ff: 4500, a: 0.02, r: 0.07, g: 0.14 });
    v.tone({ t, f: 190, f2: 95, a: 0.01, r: 0.1, g: 0.06 });
  } },
  swing_heavy: { gain: 3.4, vary: 0.08, rev: 0.18, fn(v, t) {
    v.noise({ t, ft: 'bandpass', ff: 260, ff2: 1900, fg: 0.22, q: 1, a: 0.07, r: 0.24, g: 0.7 });
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 500, a: 0.06, r: 0.25, g: 0.35 });
    v.noise({ t: t + 0.05, ft: 'highpass', ff: 3500, a: 0.04, r: 0.1, g: 0.12 });
    v.tone({ t, f: 120, f2: 55, a: 0.04, r: 0.25, g: 0.14 });
  } },
  hit: { gain: 4.5, vary: 0.08, rev: 0.15, fn(v, t) {
    v.tone({ t, f: 170, f2: 55, glide: 0.1, a: 0.002, r: 0.16, g: 0.5 });
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 2200, ff2: 400, fg: 0.1, a: 0.002, r: 0.12, g: 0.6 });
    v.noise({ t, ft: 'bandpass', ff: 2800, q: 2, a: 0.001, r: 0.045, g: 0.4 });
    v.noise({ t: t + 0.01, buf: 'pink', ft: 'bandpass', ff: 900, ff2: 280, fg: 0.1, q: 5, a: 0.004, r: 0.11, g: 0.5 });
  } },
  hit_heavy: { gain: 2.8, vary: 0.06, rev: 0.3, fn(v, t) {
    v.tone({ t, f: 120, f2: 36, glide: 0.25, a: 0.002, r: 0.45, g: 0.75 });
    v.noise({ t, buf: 'brown', ft: 'lowpass', ff: 1200, ff2: 150, fg: 0.3, a: 0.002, r: 0.4, g: 0.8 });
    v.noise({ t, ft: 'bandpass', ff: 2000, q: 0.9, a: 0.001, r: 0.12, g: 0.45 });
    v.noise({ t: t + 0.015, buf: 'pink', ft: 'bandpass', ff: 700, ff2: 200, q: 4, a: 0.004, r: 0.2, g: 0.5 });
    v.tone({ t, type: 'triangle', f: 1180, f2: 1100, a: 0.001, r: 0.25, g: 0.03 });
  } },
  block: { gain: 3.4, vary: 0.04, rev: 0.3, fn(v, t) {
    const P = [[1, 0.2, 0.8], [2.32, 0.15, 0.6], [3.61, 0.1, 0.45], [4.87, 0.07, 0.35], [6.13, 0.05, 0.25], [8.2, 0.03, 0.15]];
    for (const [ratio, g, d] of P) v.tone({ t, f: 520 * ratio, det: rand(-8, 8), a: 0.001, r: d, g });
    v.noise({ t, ft: 'highpass', ff: 2500, a: 0.001, r: 0.05, g: 0.45 });
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 900, a: 0.001, r: 0.06, g: 0.3 });
  } },
  player_hurt: { gain: 3.5, vary: 0.06, rev: 0.15, fn(v, t) {
    v.vox({ t, f: 230, f2: 150, a: 0.01, r: 0.25, g: 0.45, vowel: 'a', vowel2: 'o', n: 2, spread: 15, trem: [32, 0.4] });
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 1400, a: 0.002, r: 0.12, g: 0.45 });
    v.tone({ t, f: 100, f2: 50, a: 0.002, r: 0.18, g: 0.4 });
  } },
  player_death: { rev: 0.55, fn(v, t) {
    v.vox({ t, f: 190, fp: [[0.15, 0.9], [1.3, 0.34]], a: 0.02, hold: 0.2, r: 1.2, g: 0.45, vowel: 'a', vowel2: 'u', n: 3, spread: 14, trem: [18, 0.3] });
    v.tone({ t, f: 80, f2: 28, glide: 1.2, a: 0.003, r: 1.4, g: 0.6 });
    v.noise({ t, buf: 'brown', ft: 'lowpass', ff: 400, ff2: 120, a: 0.25, r: 2.0, g: 0.45 });
    for (const m of [50, 53, 57]) v.tone({ t: t + 0.4, type: 'triangle', f: mtof(m), det: rand(-6, 6), a: 0.8, hold: 0.4, r: 2.4, g: 0.06 });
  } },
  jump: { gain: 8, vary: 0.06, rev: 0.08, fn(v, t) {
    v.noise({ t, ft: 'bandpass', ff: 350, ff2: 1500, q: 1.1, a: 0.02, r: 0.12, g: 0.35 });
    v.tone({ t, f: 140, f2: 230, a: 0.005, r: 0.08, g: 0.08 });
  } },
  land: { gain: 3, vary: 0.08, rev: 0.1, fn(v, t) {
    v.tone({ t, f: 120, f2: 45, glide: 0.1, a: 0.002, r: 0.16, g: 0.45 });
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 700, a: 0.002, r: 0.13, g: 0.45 });
    v.noise({ t, ft: 'highpass', ff: 2500, a: 0.002, r: 0.05, g: 0.08 });
  } },
  dash: { gain: 5, vary: 0.06, rev: 0.15, fn(v, t) {
    v.noise({ t, ft: 'bandpass', ff: 2000, ff2: 450, fg: 0.25, q: 0.9, a: 0.03, r: 0.25, g: 0.55 });
    v.noise({ t, ft: 'highpass', ff: 5000, a: 0.01, r: 0.09, g: 0.1 });
    v.tone({ t, f: 95, f2: 60, a: 0.01, r: 0.16, g: 0.16 });
  } },
  levelup: { gain: 2.5, rev: 0.5, fn(v, t) {
    [74, 77, 81, 84, 86, 89, 93].forEach((m, i) => {
      const tt = t + i * 0.075;
      const f = mtof(m);
      v.tone({ t: tt, type: 'triangle', f, a: 0.004, r: 0.9, g: 0.09 });
      v.tone({ t: tt, f: f * 2, det: 6, a: 0.004, r: 0.5, g: 0.03 });
    });
    v.noise({ t, ft: 'highpass', ff: 6000, a: 0.35, r: 0.8, g: 0.06 });
    for (const m of [62, 69, 74, 77]) v.tone({ t: t + 0.45, type: 'triangle', f: mtof(m), a: 0.25, hold: 0.3, r: 1.2, g: 0.045, vib: [5, 8] });
  } },
  heal: { gain: 1.4, rev: 0.55, fn(v, t) {
    [65, 69, 72, 76].forEach((m, i) => {
      v.tone({ t: t + i * 0.04, f: mtof(m), a: 0.18, hold: 0.2, r: 0.9, g: 0.06, vib: [5.5, 6] });
      v.tone({ t: t + 0.05, type: 'triangle', f: mtof(m + 12), det: 5, a: 0.2, r: 0.7, g: 0.025 });
    });
    for (let i = 0; i < 7; i++) v.tone({ t: t + 0.1 + i * 0.08 + rand(0, 0.03), f: rand(2000, 4200), a: 0.003, r: 0.25, g: 0.025 });
    v.noise({ t, ft: 'bandpass', ff: 3000, q: 0.8, a: 0.3, r: 0.6, g: 0.05 });
  } },
  pickup: { gain: 2.4, vary: 0.03, rev: 0.35, fn(v, t) {
    v.tone({ t, f: 1318.5, a: 0.002, r: 0.45, g: 0.13 });
    v.tone({ t: t + 0.06, f: 1975.5, a: 0.002, r: 0.5, g: 0.1 });
    v.tone({ t: t + 0.06, type: 'triangle', f: 3951, a: 0.002, r: 0.15, g: 0.02 });
  } },
  blood_orb: { gain: 3, vary: 0.06, rev: 0.3, fn(v, t) {
    v.tone({ t, f: 160, f2: 620, glide: 0.04, a: 0.002, r: 0.07, g: 0.35 });
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 1100, ff2: 500, q: 5, a: 0.002, r: 0.06, g: 0.45 });
    v.tone({ t: t + 0.05, f: 880, a: 0.002, r: 0.4, g: 0.08 });
    v.tone({ t: t + 0.05, f: 1318.5, a: 0.002, r: 0.35, g: 0.06 });
    v.tone({ t: t + 0.05, f: 2637, a: 0.002, r: 0.15, g: 0.015 });
  } },

  // ---- abilities -----------------------------------------------------------
  blink: { rev: 0.4, fn(v, t) {
    // reversed whoosh (exponential swell) into a low thump
    v.noise({ t, ft: 'bandpass', ff: 3500, ff2: 500, fg: 0.28, q: 1.5, a: 0.26, ea: true, r: 0.04, g: 0.55 });
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 600, a: 0.25, ea: true, r: 0.05, g: 0.3 });
    v.tone({ t: t + 0.27, f: 120, f2: 38, glide: 0.2, a: 0.003, r: 0.3, g: 0.6 });
    v.tone({ t: t + 0.27, f: 220, a: 0.01, r: 0.5, g: 0.05, trem: [11, 0.6] });
    v.tone({ t: t + 0.27, f: 233.1, a: 0.01, r: 0.5, g: 0.04 });
  } },
  soul_drain: { gain: 1.3, rev: 0.5, fn(v, t) {
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 1400, ff2: 180, fg: 1.0, q: 9, a: 0.35, hold: 0.35, r: 0.5, g: 1.2 });
    v.noise({ t, ft: 'bandpass', ff: 4000, ff2: 800, fg: 1.0, q: 4, a: 0.4, hold: 0.2, r: 0.4, g: 0.15 });
    for (const det of [-8, 9]) {
      v.tone({ t, type: 'sawtooth', f: 55, det, a: 0.3, hold: 0.4, r: 0.6, g: 0.16, ft: 'lowpass', ff: 200, ff2: 700, q: 8, trem: [6, 0.5] });
    }
    v.vox({ t: t + 0.1, f: 98, f2: 82, a: 0.4, hold: 0.3, r: 0.6, g: 0.3, vowel: 'u', vowel2: 'o', n: 3, spread: 20 });
  } },
  eclipse: { rev: 0.6, fn(v, t) {
    v.tone({ t, f: 70, f2: 24, glide: 1.6, a: 0.004, r: 2.2, g: 0.8 });
    v.tone({ t, f: 36.7, a: 0.05, hold: 0.5, r: 2.8, g: 0.4 });
    v.noise({ t, buf: 'brown', ft: 'lowpass', ff: 600, ff2: 70, fg: 2.0, a: 0.005, r: 2.6, g: 0.9 });
    v.noise({ t, ft: 'lowpass', ff: 4000, ff2: 300, fg: 0.5, a: 0.002, r: 0.6, g: 0.45 });
    [50, 53, 57, 62, 65].forEach((m, i) => {
      v.vox({ t: t + 0.15, f: mtof(m), a: 0.7, hold: 0.7, r: 1.8, g: 0.1, vowel: 'a', vowel2: 'o', n: 3, spread: 12, vib: [4.5 + i * 0.3, 14] });
    });
  } },
  roses: { gain: 2.8, rev: 0.55, fn(v, t) {
    const notes = [86, 89, 93, 96, 98, 101, 93, 88];
    for (let i = 0; i < 12; i++) {
      v.tone({ t: t + i * 0.045 + rand(0, 0.02), f: mtof(pick(notes)), a: 0.002, r: rand(0.3, 0.7), g: 0.04, pan: rand(-0.7, 0.7) });
    }
    v.noise({ t, ft: 'highpass', ff: 5000, a: 0.15, r: 0.55, g: 0.07 });
    v.noise({ t: t + 0.06, buf: 'pink', ft: 'bandpass', ff: 900, q: 0.8, a: 0.004, r: 0.28, g: 0.4 });
    v.tone({ t: t + 0.06, f: 240, f2: 110, a: 0.004, r: 0.22, g: 0.18 });
  } },
  chains: { gain: 4, rev: 0.25, fn(v, t) {
    let tt = t;
    for (let i = 0; i < 14; i++) {
      const g = (i === 0 ? 0.3 : 0.16) * (1 - i / 18);
      const base = rand(1800, 2600);
      const pan = rand(-0.35, 0.35);
      v.tone({ t: tt, f: base, a: 0.001, r: rand(0.04, 0.09), g: g * 0.5, pan });
      v.tone({ t: tt, f: base * 1.73, a: 0.001, r: 0.05, g: g * 0.35, pan });
      v.tone({ t: tt, f: base * 2.61, a: 0.001, r: 0.035, g: g * 0.25, pan });
      v.noise({ t: tt, ft: 'bandpass', ff: rand(3000, 6000), q: 2.5, a: 0.001, r: 0.025, g: g * 1.5, pan });
      tt += rand(0.025, 0.07) * (1 + i * 0.06);
    }
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 700, a: 0.002, r: 0.1, g: 0.3 });
  } },
  queen: { gain: 3, rev: 0.45, fn(v, t) {
    // storm of blades: many swishes flying across the stereo field
    for (let i = 0; i < 16; i++) {
      const tt = t + i * 0.085 + rand(-0.015, 0.015);
      const lo = rand(500, 1200);
      const hi = rand(2500, 4500);
      const up = chance(0.5);
      v.noise({ t: tt, ft: 'bandpass', ff: up ? lo : hi, ff2: up ? hi : lo, fg: 0.09, q: 1.6, a: 0.015, r: 0.09, g: 0.32, pan: rand(-0.8, 0.8) });
      if (i % 3 === 0) v.tone({ t: tt + 0.05, f: rand(2800, 4200), a: 0.001, r: 0.08, g: 0.03 });
    }
    v.noise({ t, ft: 'bandpass', ff: 300, ff2: 2500, fg: 1.3, q: 0.8, a: 1.2, ea: true, r: 0.35, g: 0.3 });
    for (const m of [62, 65, 69]) v.vox({ t: t + 0.3, f: mtof(m), a: 0.9, hold: 0.3, r: 0.8, g: 0.08, vowel: 'a', n: 3, spread: 12, vib: [5, 12] });
    const s = t + 1.45;
    for (const [ratio, g, d] of [[1, 0.08, 0.6], [2.32, 0.05, 0.4], [3.61, 0.03, 0.3]]) v.tone({ t: s, f: 1560 * ratio, a: 0.001, r: d, g });
    v.noise({ t: s, ft: 'highpass', ff: 3000, a: 0.001, r: 0.12, g: 0.3 });
  } },
  spectral_dash: { gain: 4.5, rev: 0.5, fn(v, t) {
    v.noise({ t, ft: 'bandpass', ff: 800, ff2: 2600, fg: 0.2, q: 0.9, a: 0.04, r: 0.24, g: 0.5 });
    v.noise({ t: t + 0.08, ft: 'highpass', ff: 7000, a: 0.08, r: 0.5, g: 0.06 });
    v.tone({ t: t + 0.08, f: 1760, a: 0.02, r: 0.8, g: 0.05, vib: [7, 15] });
    v.tone({ t: t + 0.1, f: 2637, a: 0.02, r: 0.7, g: 0.035, vib: [6, 15] });
    v.tone({ t: t + 0.12, f: 3520, a: 0.02, r: 0.5, g: 0.02 });
  } },
  guard: { gain: 1.15, rev: 0.45, fn(v, t) {
    for (const [ratio, g, d] of [[1, 0.14, 1.4], [2, 0.08, 0.9], [2.76, 0.06, 0.7], [4.07, 0.04, 0.5], [5.4, 0.025, 0.3]]) {
      v.tone({ t, f: 392 * ratio, det: rand(-5, 5), a: 0.002, r: d, g });
    }
    v.tone({ t, f: 196, a: 0.08, hold: 0.35, r: 0.7, g: 0.1, trem: [7, 0.4] });
    v.tone({ t, f: 196.9, a: 0.08, hold: 0.35, r: 0.7, g: 0.08 });
    v.tone({ t, type: 'triangle', f: 98, a: 0.06, hold: 0.3, r: 0.6, g: 0.08 });
  } },
  execution: { gain: 0.9, rev: 0.4, fn(v, t) {
    // five sharp slashes, a wind-up, then a heavy impact
    [0, 0.14, 0.27, 0.38, 0.48].forEach((dt, i) => {
      const tt = t + dt;
      const pan = i % 2 ? 0.5 : -0.5;
      v.noise({ t: tt, ft: 'bandpass', ff: 1400, ff2: 5500, fg: 0.06, q: 1.3, a: 0.006, r: 0.08, g: 0.5, pan });
      v.noise({ t: tt, ft: 'highpass', ff: 6000, a: 0.002, r: 0.04, g: 0.12, pan });
      v.tone({ t: tt + 0.03, f: rand(3200, 4600), a: 0.001, r: 0.07, g: 0.04, pan });
      v.noise({ t: tt + 0.04, buf: 'pink', ft: 'bandpass', ff: 800, q: 3, a: 0.002, r: 0.06, g: 0.2 });
    });
    const th = t + 0.9;
    v.noise({ t: th - 0.25, ft: 'bandpass', ff: 300, ff2: 1500, fg: 0.25, q: 1, a: 0.22, ea: true, r: 0.04, g: 0.35 });
    v.tone({ t: th, f: 110, f2: 30, glide: 0.4, a: 0.002, r: 0.65, g: 0.8 });
    v.noise({ t: th, buf: 'brown', ft: 'lowpass', ff: 1500, ff2: 120, fg: 0.4, a: 0.002, r: 0.55, g: 0.8 });
    v.noise({ t: th, ft: 'bandpass', ff: 2200, q: 0.8, a: 0.001, r: 0.15, g: 0.5 });
    v.noise({ t: th + 0.01, buf: 'pink', ft: 'bandpass', ff: 600, ff2: 180, q: 4, a: 0.003, r: 0.25, g: 0.5 });
    for (const m of [38, 45, 50]) v.tone({ t: th, type: 'sawtooth', f: mtof(m), det: rand(-10, 10), a: 0.01, r: 0.9, g: 0.05, ft: 'lowpass', ff: 1200, ff2: 150 });
  } },
  blade_throw: { gain: 4.5, vary: 0.06, rev: 0.25, fn(v, t) {
    v.noise({ t, ft: 'bandpass', ff: 600, ff2: 2200, fg: 0.08, q: 1.2, a: 0.015, r: 0.1, g: 0.4 });
    v.noise({ t: t + 0.03, ft: 'bandpass', ff: 2800, ff2: 1900, q: 18, a: 0.03, r: 0.35, g: 1.6 });
    v.tone({ t: t + 0.03, f: 2500, f2: 1800, a: 0.03, r: 0.3, g: 0.045, vib: [22, 25] });
  } },

  // ---- enemies -------------------------------------------------------------
  crawler_screech: { gain: 4.5, vary: 0.1, rev: 0.2, fn(v, t) {
    const n = 7 + ((Math.random() * 3) | 0);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const f = rand(1700, 2600);
      v.tone({ t: tt, type: 'sawtooth', f, f2: f * 0.75, a: 0.003, r: 0.035, g: 0.22, ft: 'bandpass', ff: 2600, q: 3 });
      tt += rand(0.03, 0.045);
    }
    v.noise({ t, ft: 'bandpass', ff: 3500, q: 4, a: 0.02, r: 0.25, g: 0.2, trem: [38, 0.8, 'square'] });
  } },
  knight_clank: { gain: 3.2, vary: 0.06, rev: 0.2, fn(v, t) {
    v.tone({ t, f: 95, f2: 50, a: 0.002, r: 0.14, g: 0.4 });
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 600, a: 0.002, r: 0.1, g: 0.3 });
    for (const [ratio, g, d] of [[1, 0.07, 0.35], [2.71, 0.06, 0.25], [3.93, 0.045, 0.18], [5.3, 0.035, 0.12]]) {
      v.tone({ t: t + 0.01, f: 340 * ratio, det: rand(-10, 10), a: 0.001, r: d, g });
    }
    v.noise({ t: t + 0.01, ft: 'highpass', ff: 2500, a: 0.001, r: 0.03, g: 0.22 });
  } },
  stalker_shriek: { gain: 2.2, vary: 0.06, rev: 0.4, fn(v, t) {
    v.vox({ t, f: 900, fp: [[0.25, 1.5], [0.8, 0.72]], a: 0.04, hold: 0.35, r: 0.4, g: 0.35, vowel: 'i', vowel2: 'e', n: 3, spread: 30, vib: [16, 60], fk: 1.4 });
    v.tone({ t, f: 1420, f2: 1100, a: 0.06, hold: 0.3, r: 0.4, g: 0.04 });
    v.tone({ t, f: 1488, f2: 1170, a: 0.06, hold: 0.3, r: 0.4, g: 0.04 });
    v.noise({ t, ft: 'bandpass', ff: 3200, q: 2, a: 0.05, hold: 0.25, r: 0.45, g: 0.12 });
  } },
  mage_cast: { gain: 1.5, vary: 0.05, rev: 0.4, fn(v, t) {
    v.tone({ t, type: 'sawtooth', f: 110, det: -7, a: 0.55, hold: 0.1, r: 0.3, g: 0.12, ft: 'lowpass', ff: 200, ff2: 2200, fg: 0.65, q: 6 });
    v.tone({ t, type: 'sawtooth', f: 110, det: 8, a: 0.55, hold: 0.1, r: 0.3, g: 0.12, ft: 'lowpass', ff: 200, ff2: 2200, fg: 0.65, q: 6, trem: [9, 0.5] });
    v.tone({ t, f: 220, f2: 440, glide: 0.65, a: 0.6, r: 0.25, g: 0.07 });
    v.noise({ t, ft: 'bandpass', ff: 1500, ff2: 4000, fg: 0.65, q: 6, a: 0.6, r: 0.2, g: 0.25, trem: [17, 0.6] });
  } },
  projectile: { gain: 9, vary: 0.08, rev: 0.25, fn(v, t) {
    v.noise({ t, ft: 'bandpass', ff: 3200, ff2: 1100, fg: 0.3, q: 2, a: 0.01, r: 0.32, g: 0.4 });
    v.tone({ t, type: 'square', f: 640, f2: 180, a: 0.005, r: 0.2, g: 0.05, ft: 'lowpass', ff: 1600 });
    v.noise({ t, ft: 'highpass', ff: 6000, a: 0.01, r: 0.25, g: 0.12, trem: [45, 0.9, 'square'] });
  } },
  enemy_attack: { gain: 5.5, vary: 0.1, rev: 0.2, fn(v, t) {
    v.vox({ t, f: 105, f2: 80, a: 0.04, r: 0.38, g: 0.5, vowel: 'a', vowel2: 'o', n: 3, spread: 25, trem: [28, 0.6], fk: 0.85 });
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 350, q: 1.5, a: 0.04, r: 0.3, g: 0.2, trem: [28, 0.5] });
    v.noise({ t: t + 0.13, ft: 'bandpass', ff: 450, ff2: 2400, fg: 0.12, q: 1.2, a: 0.02, r: 0.14, g: 0.45 });
  } },
  enemy_death: { gain: 1.5, vary: 0.1, rev: 0.3, fn(v, t) {
    v.vox({ t, f: 170, f2: 48, glide: 0.8, a: 0.02, r: 0.9, g: 0.5, vowel: 'a', vowel2: 'u', n: 3, spread: 22, trem: [24, 0.5], fk: 0.9 });
    v.noise({ t: t + 0.05, buf: 'pink', ft: 'bandpass', ff: 800, ff2: 240, fg: 0.2, q: 3, a: 0.004, r: 0.28, g: 0.6 });
    v.noise({ t: t + 0.05, ft: 'lowpass', ff: 3000, a: 0.002, r: 0.1, g: 0.25 });
    v.tone({ t: t + 0.05, f: 85, f2: 38, a: 0.003, r: 0.3, g: 0.4 });
    for (let i = 0; i < 3; i++) v.tone({ t: t + 0.12 + rand(0, 0.25), f: rand(350, 500), f2: 140, a: 0.002, r: 0.06, g: 0.08 });
  } },
  enemy_hurt: { gain: 6, vary: 0.12, rev: 0.12, fn(v, t) {
    v.vox({ t, f: 175, f2: 118, a: 0.01, r: 0.17, g: 0.45, vowel: 'a', vowel2: 'o', n: 2, spread: 18, trem: [30, 0.3] });
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 1500, a: 0.002, r: 0.08, g: 0.3 });
  } },

  // ---- boss ----------------------------------------------------------------
  boss_laugh: { gain: 1.6, rev: 0.55, fn(v, t) {
    // descending "ha-ha-ha": stacked detuned formant voices with tremolo
    const syl = 7;
    for (let i = 0; i < syl; i++) {
      const tt = t + i * 0.19;
      const f = 300 * Math.pow(0.9, i);
      const len = i === syl - 1 ? 0.45 : 0.13;
      const base = { t: tt, fp: [[len * 0.3, 1.04], [len + 0.08, 0.86]], a: 0.015, hold: len * 0.4, r: len * 0.7 + 0.06, vowel: 'a', vowel2: 'o', trem: [9, 0.35] };
      v.vox({ ...base, f, g: 0.4, n: 3, spread: 16 });
      v.vox({ ...base, f: f * 0.5, g: 0.28, n: 2, spread: 24, fk: 0.85 });
      v.vox({ ...base, f: f * 1.414, g: 0.08, n: 1, fk: 1.2 });
      v.noise({ t: tt, ft: 'bandpass', ff: 1200, q: 3, a: 0.01, r: len, g: 0.08 });
    }
    v.tone({ t, f: 74, f2: 55, glide: 1.5, a: 0.3, hold: 0.6, r: 0.7, g: 0.14, trem: [4.5, 0.5] });
  } },
  boss_teleport: { rev: 0.5, fn(v, t) {
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 300, ff2: 2600, fg: 0.5, q: 1.4, a: 0.5, ea: true, r: 0.04, g: 0.6 });
    v.tone({ t, type: 'sawtooth', f: 70, f2: 150, glide: 0.5, a: 0.5, ea: true, r: 0.04, g: 0.15, ft: 'lowpass', ff: 300, ff2: 1500 });
    const s = t + 0.52;
    v.noise({ t: s, ft: 'highpass', ff: 1500, a: 0.001, r: 0.06, g: 0.6 });
    v.tone({ t: s, f: 1900, f2: 250, glide: 0.05, a: 0.001, r: 0.06, g: 0.15 });
    v.tone({ t: s, f: 95, f2: 36, glide: 0.2, a: 0.002, r: 0.3, g: 0.55 });
  } },
  boss_shriek: { rev: 0.55, fn(v, t) {
    [[520, 'a'], [551, 'e'], [735, 'a'], [1040, 'i']].forEach(([f, vw], i) => {
      v.vox({ t: t + i * 0.02, f, fp: [[0.3, 1.06], [1.4, 0.82]], a: 0.06, hold: 0.55, r: 0.8, g: 0.25, vowel: vw, n: 3, spread: 25, vib: [6 + i, 50], fk: 1.15 });
    });
    v.noise({ t, ft: 'bandpass', ff: 2200, q: 1, a: 0.05, hold: 0.4, r: 0.9, g: 0.22 });
    v.tone({ t, f: 55, f2: 41, a: 0.08, hold: 0.5, r: 0.8, g: 0.35 });
  } },
  boss_volley: { gain: 2, rev: 0.35, fn(v, t) {
    v.tone({ t, f: 70, f2: 50, a: 0.02, r: 0.5, g: 0.35 });
    for (let i = 0; i < 5; i++) {
      const tt = t + i * 0.08;
      const pan = (i / 4) * 1.4 - 0.7;
      v.noise({ t: tt, ft: 'bandpass', ff: 2800, ff2: 900, fg: 0.22, q: 2, a: 0.006, r: 0.24, g: 0.3, pan });
      v.tone({ t: tt, type: 'square', f: 520 - i * 25, f2: 150, a: 0.004, r: 0.18, g: 0.04, ft: 'lowpass', ff: 1500, pan });
    }
  } },
  pool_warn: { gain: 1.4, rev: 0.45, fn(v, t) {
    v.tone({ t, type: 'sawtooth', f: 55, f2: 110, glide: 1.0, a: 0.6, hold: 0.25, r: 0.25, g: 0.14, ft: 'lowpass', ff: 250, ff2: 1600, fg: 1.0, q: 7, trem: [8, 0.45] });
    v.tone({ t, type: 'sawtooth', f: 55, det: 14, f2: 110, glide: 1.0, a: 0.6, hold: 0.25, r: 0.25, g: 0.12, ft: 'lowpass', ff: 250, ff2: 1600, fg: 1.0, q: 7 });
    v.tone({ t, f: 110, f2: 233, glide: 1.0, a: 0.5, hold: 0.25, r: 0.25, g: 0.08 });
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 350, ff2: 700, q: 8, a: 0.5, hold: 0.3, r: 0.2, g: 0.45, trem: [13, 0.7] });
  } },
  pool_erupt: { gain: 1.1, rev: 0.4, fn(v, t) {
    v.tone({ t, f: 85, f2: 28, glide: 0.6, a: 0.003, r: 0.85, g: 0.8 });
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 700, ff2: 180, fg: 0.35, q: 2, a: 0.004, r: 0.45, g: 0.75 });
    v.noise({ t, ft: 'lowpass', ff: 2800, ff2: 500, fg: 0.25, a: 0.002, r: 0.28, g: 0.35 });
    for (let i = 0; i < 7; i++) {
      const f = rand(250, 600);
      v.tone({ t: t + 0.05 + rand(0, 0.45), f, f2: f * 2.2, glide: 0.04, a: 0.002, r: 0.06, g: 0.08, pan: rand(-0.6, 0.6) });
    }
  } },

  // ---- world ---------------------------------------------------------------
  door: { gain: 0.8, rev: 0.35, fn(v, t) {
    // stick-slip creak (sawtooth grains through resonant band-passes) then a thud
    v.tone({ t, type: 'sawtooth', f: 70, fp: [[0.25, 1.3], [0.5, 0.9], [0.8, 1.5], [1.0, 1.1]], a: 0.1, hold: 0.7, r: 0.2, g: 0.45, ft: 'bandpass', ff: 900, q: 4, trem: [23, 0.7, 'sawtooth'] });
    v.tone({ t, type: 'sawtooth', f: 141, fp: [[0.3, 1.2], [0.7, 0.85], [1.0, 1.3]], a: 0.15, hold: 0.6, r: 0.2, g: 0.2, ft: 'bandpass', ff: 1700, q: 5 });
    const th = t + 1.05;
    v.tone({ t: th, f: 75, f2: 40, a: 0.002, r: 0.4, g: 0.6 });
    v.noise({ t: th, buf: 'brown', ft: 'lowpass', ff: 500, a: 0.002, r: 0.35, g: 0.6 });
    v.noise({ t: th, buf: 'pink', ft: 'bandpass', ff: 1200, q: 1.2, a: 0.001, r: 0.08, g: 0.25 });
  } },
  lock: { gain: 3, vary: 0.04, rev: 0.2, fn(v, t) {
    [0, 0.07, 0.15, 0.22].forEach((dt, i) => {
      const tt = t + dt;
      v.noise({ t: tt, ft: 'bandpass', ff: 3400, q: 4, a: 0.001, r: 0.03, g: 0.6 });
      v.tone({ t: tt, f: 2150 + i * 40, a: 0.001, r: 0.05, g: 0.04 });
      v.tone({ t: tt, f: 3170, a: 0.001, r: 0.04, g: 0.03 });
      if (i % 2 === 0) v.noise({ t: tt, buf: 'pink', ft: 'lowpass', ff: 700, a: 0.002, r: 0.06, g: 0.3 });
    });
  } },
  secret: { gain: 1.7, rev: 0.5, fn(v, t) {
    v.noise({ t, buf: 'brown', ft: 'bandpass', ff: 260, q: 1.2, a: 0.25, hold: 0.9, r: 0.4, g: 0.7, trem: [13, 0.6, 'sawtooth'] });
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 900, q: 1, a: 0.3, hold: 0.8, r: 0.4, g: 0.2, trem: [7.3, 0.5] });
    v.tone({ t, type: 'sawtooth', f: 48, a: 0.3, hold: 0.8, r: 0.4, g: 0.06, ft: 'lowpass', ff: 200 });
    const c = t + 1.15;
    [74, 77, 81, 86, 89].forEach((m, i) => v.tone({ t: c + i * 0.09, f: mtof(m), a: 0.003, r: 1.4, g: 0.07 }));
    v.bell(mtof(81), c, 0.05, 2.5);
    v.noise({ t: c, ft: 'highpass', ff: 6000, a: 0.3, r: 0.9, g: 0.05 });
  } },
  altar_break: { gain: 1.1, rev: 0.55, fn(v, t) {
    v.noise({ t, ft: 'highpass', ff: 1200, a: 0.001, r: 0.1, g: 0.8 });
    v.tone({ t, f: 75, f2: 26, glide: 1.0, a: 0.003, r: 1.3, g: 0.8 });
    v.noise({ t, buf: 'brown', ft: 'lowpass', ff: 400, ff2: 90, a: 0.003, r: 1.1, g: 0.7 });
    for (let i = 0; i < 20; i++) {
      v.tone({ t: t + 0.02 + Math.pow(Math.random(), 1.5) * 0.6, f: rand(2500, 7500), a: 0.001, r: rand(0.04, 0.25), g: rand(0.02, 0.06), pan: rand(-0.7, 0.7) });
    }
    v.noise({ t: t + 0.01, ft: 'highpass', ff: 4000, a: 0.003, r: 0.55, g: 0.25 });
    for (const m of [38, 39, 45]) v.tone({ t: t + 0.1, type: 'sawtooth', f: mtof(m), det: rand(-8, 8), a: 0.3, r: 1.6, g: 0.05, ft: 'lowpass', ff: 600, ff2: 120 });
  } },
  checkpoint: { gain: 2.1, rev: 0.6, fn(v, t) {
    v.bell(mtof(74), t, 0.08, 3);
    [62, 69, 76, 81].forEach((m, i) => {
      v.tone({ t: t + 0.15, type: 'triangle', f: mtof(m), det: rand(-5, 5), a: 0.6, hold: 0.4, r: 1.5, g: 0.045, vib: [4.5 + i * 0.3, 6] });
    });
  } },
  note: { gain: 2.5, vary: 0.08, rev: 0.12, fn(v, t) {
    let tt = t;
    for (let i = 0; i < 4; i++) {
      v.noise({ t: tt, ft: 'bandpass', ff: rand(2500, 5500), q: 0.7, a: 0.008, r: rand(0.04, 0.1), g: rand(0.15, 0.28) });
      tt += rand(0.06, 0.11);
    }
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 1200, q: 0.8, a: 0.05, r: 0.25, g: 0.08 });
  } },
  quest: { rev: 0.55, fn(v, t) {
    // solemn two-chord fanfare: Bb major -> D minor, brassy filtered saws
    const brass = (notes, tt, hold, r, g) => {
      for (const m of notes) {
        for (const det of [-6, 6]) {
          v.tone({ t: tt, type: 'sawtooth', f: mtof(m), det, a: 0.06, hold, r, g, ft: 'lowpass', ff: 2400, ff2: 800, fg: hold + 0.1, q: 1 });
        }
      }
    };
    brass([46, 58, 62, 65], t, 0.35, 0.5, 0.035);
    brass([50, 57, 62, 65, 69], t + 0.55, 0.7, 1.4, 0.035);
    v.tone({ t: t + 0.55, f: 110, f2: 73.4, glide: 0.08, a: 0.002, r: 0.8, g: 0.35 });
    v.noise({ t: t + 0.55, buf: 'pink', ft: 'bandpass', ff: 300, q: 1, a: 0.002, r: 0.3, g: 0.2 });
  } },
  whisper: { gain: 5, rev: 0.6, fn(v, t) {
    // breathy noise through moving vowel formants, syllable by syllable
    const syl = [[0, 0.35, 'e', 'a'], [0.42, 0.3, 'i', 'u'], [0.8, 0.45, 'a', 'o'], [1.35, 0.55, 'u', 'i']];
    for (const [dt, len, v1, v2] of syl) {
      const tt = t + dt;
      const pan = rand(-0.6, 0.6);
      for (let j = 0; j < 2; j++) {
        v.noise({ t: tt, ft: 'bandpass', ff: VOWELS[v1][j][0] * 1.1, ff2: VOWELS[v2][j][0] * 1.1, q: 7, a: len * 0.35, hold: len * 0.2, r: len * 0.6, g: j ? 0.5 : 0.6, pan });
      }
      if (chance(0.6)) v.noise({ t: tt + len * 0.6, ft: 'highpass', ff: 5500, a: 0.04, r: 0.12, g: 0.07, pan });
    }
  } },
  distant_steps: { gain: 0.4, rev: 0.65, lp: 1800, fn(v, t) {
    const n = 3 + ((Math.random() * 2) | 0);
    let tt = t;
    for (let i = 0; i < n; i++) {
      v.tone({ t: tt, f: 85, f2: 50, a: 0.003, r: 0.12, g: 0.15 });
      v.noise({ t: tt, buf: 'pink', ft: 'lowpass', ff: 380, a: 0.003, r: 0.1, g: 0.22 });
      tt += rand(0.5, 0.62);
    }
  } },
  bell: { gain: 1.35, rev: 0.75, lp: 3200, fn(v, t) {
    v.bell(220, t, 0.13, 7);
  } },
  crow: { gain: 0.6, vary: 0.08, rev: 0.4, fn(v, t) {
    const n = chance(0.5) ? 2 : 3;
    let tt = t;
    for (let i = 0; i < n; i++) {
      v.vox({ t: tt, f: 480, fp: [[0.05, 1.12], [0.24, 0.8]], a: 0.015, hold: 0.06, r: 0.18, g: 0.45, vowel: 'a', vowel2: 'o', fk: 1.6, q: 4, n: 2, spread: 30, trem: [55, 0.6, 'square'] });
      v.noise({ t: tt, ft: 'bandpass', ff: 1500, q: 3, a: 0.015, r: 0.18, g: 0.15, trem: [55, 0.6, 'square'] });
      tt += rand(0.3, 0.38);
    }
  } },
  heartbeat: { rev: 0.1, fn(v, t) {
    for (const [dt, g] of [[0, 0.8], [0.28, 0.6]]) {
      v.tone({ t: t + dt, f: 62, f2: 38, glide: 0.12, a: 0.008, r: 0.22, g });
      v.noise({ t: t + dt, buf: 'brown', ft: 'lowpass', ff: 140, a: 0.005, r: 0.14, g: g * 0.5 });
    }
  } },
  stinger: { gain: 2, rev: 0.5, fn(v, t) {
    // dissonant string-cluster stab + noise burst + low hit
    for (const m of [50, 51, 56, 62, 63, 68, 74]) {
      for (const det of [-12, 0, 11]) {
        v.tone({ t, type: 'sawtooth', f: mtof(m), det: det + rand(-3, 3), a: 0.008, hold: 0.15, r: 1.1, g: 0.03, ft: 'lowpass', ff: 5000, ff2: 900, fg: 0.8, q: 2, vib: [rand(6, 8), 18] });
      }
    }
    v.noise({ t, ft: 'bandpass', ff: 2000, q: 0.6, a: 0.002, r: 0.4, g: 0.5 });
    v.tone({ t, f: 75, f2: 32, glide: 0.5, a: 0.003, r: 0.7, g: 0.6 });
    v.tone({ t, f: 2200, f2: 2600, a: 0.01, r: 0.6, g: 0.035, vib: [9, 40] });
  } },
  thunder: { gain: 1.3, rev: 0.55, fn(v, t) {
    v.noise({ t, ft: 'highpass', ff: 700, lp: 5000, a: 0.004, r: 0.3, g: 0.5 });
    v.noise({ t: t + 0.02, ft: 'bandpass', ff: 1200, ff2: 300, q: 0.7, a: 0.01, r: 0.6, g: 0.35 });
    for (let i = 0; i < 6; i++) {
      v.noise({ t: t + 0.05 + rand(0, 1.3), buf: 'brown', ft: 'lowpass', ff: rand(150, 300), ff2: 80, a: rand(0.08, 0.3), r: rand(1, 2.4), g: rand(0.3, 0.55) });
    }
    v.tone({ t, f: 42, f2: 30, a: 0.1, r: 3, g: 0.3 });
  } },
};

/** Footsteps by surface (kept soft). */
const STEPS = {
  stone: { vary: 0.08, rev: 0.12, gain: 3.5, fn(v, t) {
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 900, a: 0.002, r: 0.06, g: 0.3 });
    v.noise({ t, ft: 'bandpass', ff: 2600, q: 1.2, a: 0.001, r: 0.03, g: 0.14 });
    v.tone({ t, f: 150, f2: 80, a: 0.002, r: 0.05, g: 0.12 });
  } },
  dirt: { vary: 0.1, rev: 0.05, gain: 3.5, fn(v, t) {
    v.noise({ t, buf: 'pink', ft: 'lowpass', ff: 550, a: 0.006, r: 0.09, g: 0.35 });
    v.noise({ t, buf: 'brown', ft: 'bandpass', ff: 300, q: 0.8, a: 0.004, r: 0.08, g: 0.25 });
    v.noise({ t: t + 0.01, ft: 'highpass', ff: 3200, a: 0.004, r: 0.05, g: 0.06 });
  } },
  wood: { vary: 0.07, rev: 0.12, gain: 3.5, fn(v, t) {
    v.tone({ t, type: 'triangle', f: 230, f2: 170, a: 0.002, r: 0.09, g: 0.14 });
    v.tone({ t, f: 115, f2: 90, a: 0.002, r: 0.11, g: 0.16 });
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 650, q: 2, a: 0.002, r: 0.06, g: 0.28 });
  } },
};

/** Random ambience events (routed through the ambience bus). */
const AMB_EV = {
  drip: { gain: 4, rev: 0.8, fn(v, t) {
    const n = chance(0.3) ? 2 : 1;
    let tt = t;
    for (let i = 0; i < n; i++) {
      const f = rand(900, 1600);
      v.tone({ t: tt, f, f2: f * 2.2, glide: 0.035, a: 0.001, r: 0.07, g: 0.12 });
      tt += rand(0.3, 0.7);
    }
  } },
  creak: { gain: 3.5, rev: 0.6, fn(v, t) {
    const d = rand(0.5, 1.1);
    v.tone({ t, type: 'sawtooth', f: rand(55, 85), fp: [[d * 0.4, 1.25], [d, 0.9]], a: d * 0.3, hold: d * 0.4, r: d * 0.3, g: 0.2, ft: 'bandpass', ff: rand(700, 1100), q: 4, trem: [rand(18, 30), 0.7, 'sawtooth'] });
  } },
  owl: { gain: 0.9, rev: 0.7, fn(v, t) {
    for (const [dt, len] of [[0, 0.3], [0.45, 0.18], [0.75, 0.5]]) {
      v.tone({ t: t + dt, f: 390, fp: [[0.06, 1.02], [len, 0.9]], a: 0.05, hold: len * 0.4, r: len * 0.6, g: 0.08, vib: [6, 10] });
      v.noise({ t: t + dt, ft: 'bandpass', ff: 400, q: 6, a: 0.05, hold: len * 0.3, r: len * 0.6, g: 0.08 });
    }
  } },
  twig: { gain: 2.5, rev: 0.5, fn(v, t) {
    v.noise({ t, ft: 'highpass', ff: 2200, a: 0.001, r: 0.02, g: 0.35 });
    v.noise({ t: t + rand(0.04, 0.09), ft: 'bandpass', ff: 3000, q: 2, a: 0.001, r: 0.03, g: 0.25 });
    v.tone({ t, f: 1400, a: 0.001, r: 0.015, g: 0.04 });
  } },
  rustle: { gain: 2, rev: 0.3, fn(v, t) {
    const d = rand(0.25, 0.7);
    v.noise({ t, ft: 'highpass', ff: rand(2500, 4500), a: d * 0.4, r: d * 0.6, g: rand(0.05, 0.1), trem: [rand(11, 19), 0.6] });
  } },
  gust: { gain: 2.8, rev: 0.5, fn(v, t) {
    const d = rand(2, 4);
    v.noise({ t, buf: 'pink', ft: 'bandpass', ff: 300, ff2: 900, fg: d * 0.5, q: 1.2, a: d * 0.5, r: d * 0.5, g: 0.15 });
  } },
  boom: { gain: 0.63, rev: 0.8, fn(v, t) {
    v.tone({ t, f: 50, f2: 30, a: 0.02, r: 2, g: 0.25 });
    v.noise({ t, buf: 'brown', ft: 'lowpass', ff: 160, a: 0.03, r: 1.8, g: 0.35 });
  } },
  eerie: { gain: 1.4, rev: 0.8, fn(v, t) {
    const f = mtof(pick([74, 75, 81, 82]));
    v.tone({ t, f, f2: f * 0.944, glide: 3.5, a: 1.8, hold: 0.4, r: 1.8, g: 0.03, vib: [5, 8] });
    v.tone({ t, f: f * 1.5, f2: f * 1.41, glide: 3.5, a: 2.0, r: 1.8, g: 0.015 });
  } },
  knock: { gain: 1.5, rev: 0.5, fn(v, t) {
    for (const dt of [0, rand(0.15, 0.3)]) {
      v.tone({ t: t + dt, type: 'triangle', f: 180, f2: 120, a: 0.002, r: 0.08, g: 0.12 });
      v.noise({ t: t + dt, buf: 'pink', ft: 'bandpass', ff: 700, q: 2, a: 0.002, r: 0.06, g: 0.2 });
    }
  } },
};

// ---------------------------------------------------------------------------
// Bed: long-lived layer (music track or ambience) with its own fade gain
// ---------------------------------------------------------------------------
class Bed {
  constructor(am, bus, sendBus, rev) {
    const ctx = am.ctx;
    this.am = am;
    this.ctx = ctx;
    this.syn = am._syn;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(bus);
    this.sources = [];
    this.nodes = [this.out];
    if (rev > 0) {
      const send = ctx.createGain();
      send.gain.value = rev;
      this.out.connect(send);
      send.connect(sendBus);
      this.nodes.push(send);
    }
    this.stopAt = Infinity;
  }

  _src(node, t, offset = 0) {
    this.sources.push(node);
    this.nodes.push(node);
    node.start(t, offset);
  }

  _lfo(param, rate, depth, t, type = 'sine') {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    this.nodes.push(g);
    this._src(o, t);
  }

  /** Persistent oscillators -> low-pass (optional LFO) -> gain (optional LFO). */
  drone(freqs, o) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = o.g ?? 0.03;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.ff ?? 600;
    f.Q.value = o.q ?? 0.5;
    f.connect(g);
    g.connect(o.dest || this.L || this.out);
    this.nodes.push(g, f);
    freqs.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.value = hz;
      osc.detune.value = (i % 2 ? 1 : -1) * (o.det ?? 4);
      osc.connect(f);
      this._src(osc, o.t);
    });
    if (o.lfo) this._lfo(f.frequency, o.lfo[0], o.lfo[1], o.t);
    if (o.amp) this._lfo(g.gain, o.amp[0], o.amp[1], o.t);
  }

  /** Looping filtered noise layer with optional filter (fl) / amplitude (al, al2) LFOs. */
  noiseBed(o) {
    const ctx = this.ctx;
    const buf = this.syn.buf[o.buf || 'pink'];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = o.rate ?? rand(0.92, 1.05);
    const f = ctx.createBiquadFilter();
    f.type = o.ft || 'lowpass';
    f.frequency.value = o.ff ?? 800;
    f.Q.value = o.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.value = o.g ?? 0.05;
    src.connect(f);
    f.connect(g);
    g.connect(o.dest || this.out);
    this.nodes.push(f, g);
    if (o.fl) this._lfo(f.frequency, o.fl[0], o.fl[1], o.t);
    if (o.al) this._lfo(g.gain, o.al[0], o.al[1], o.t);
    if (o.al2) this._lfo(g.gain, o.al2[0], o.al2[1], o.t);
    this._src(src, o.t, rand(0, buf.duration - 0.1));
  }

  /** Gramophone surface noise layer (band-passed crackle loop). */
  crackle(t, level) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.syn.crackle;
    src.loop = true;
    src.playbackRate.value = rand(0.95, 1.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(this.out);
    this.nodes.push(hp, lp, g);
    this._src(src, t, rand(0, src.buffer.duration - 0.1));
  }

  fadeIn(t, dur, level = 1) {
    const g = this.out.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(level, t + dur);
  }

  fadeOut(t, dur) {
    if (this.stopAt !== Infinity) return;
    const g = this.out.gain;
    if (g.cancelAndHoldAtTime) {
      g.cancelAndHoldAtTime(t);
    } else {
      const cur = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(cur, t);
    }
    g.linearRampToValueAtTime(0, t + dur);
    this.stopAt = t + dur;
    for (const s of this.sources) {
      try {
        s.stop(this.stopAt + 0.05);
      } catch (e) {
        /* already stopped */
      }
    }
  }

  dispose() {
    for (const n of this.nodes) unplug(n);
    this.nodes.length = 0;
    this.sources.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------
class MusicTrack extends Bed {
  constructor(am, name, def) {
    super(am, am._musicBus, am._musicSend, def.rev ?? 0.4);
    this.name = name;
    this.def = def;
    this.L = this.ctx.createGain(); // main layer
    this.L.gain.value = def.level ?? 1;
    if (def.lofi) {
      // gramophone band-limiting: [high-pass Hz, low-pass Hz]
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = def.lofi[0];
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = def.lofi[1];
      this.L.connect(hp);
      hp.connect(lp);
      lp.connect(this.out);
      this.nodes.push(hp, lp);
    } else {
      this.L.connect(this.out);
    }
    this.I = this.ctx.createGain(); // combat-intensity layer
    this.I.gain.value = 0;
    this.I.connect(this.out);
    this.nodes.push(this.L, this.I);
    this.stepDur = def.stepDur;
    this.step = 0;
    this.next = 0;
    this.s = {}; // per-track scratch state
  }

  begin(t) {
    this.next = t + 0.05;
    this.fadeIn(t, MUSIC_FADE);
    if (this.def.init) this.def.init(this, t);
  }

  setIntensity(v, t) {
    if (this.def.intensity) this.I.gain.setTargetAtTime(v * 0.55, t, 0.8);
  }

  /** Lookahead scheduler: emit every step that starts before `horizon`. */
  schedule(now, horizon) {
    if (this.next < now - 0.25) {
      // fell behind (tab hidden / long frame): skip ahead, keeping the grid
      const skip = Math.ceil((now - this.next) / this.stepDur);
      this.step += skip;
      this.next += skip * this.stepDur;
    }
    while (this.next < horizon && this.next < this.stopAt) {
      this.def.step(this, this.step, this.next);
      this.step++;
      this.next += this.stepDur;
    }
  }
}

/** A user-supplied audio file (AudioBuffer) looping on the music bus. */
class FileTrack extends Bed {
  constructor(am, name, custom) {
    super(am, am._musicBus, am._musicSend, 0);
    this.name = name;
    this.buffer = custom.buffer;
    this.label = custom.name;
  }

  begin(t) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(this.out);
    this._src(src, t);
    this.fadeIn(t, MUSIC_FADE, CUSTOM_LEVEL / TRIM.music);
  }

  setIntensity() {}

  schedule() {}
}

/**
 * Shared combat tension layer. Default: low tresillo pulse + ticks on a 0.25 s grid.
 * waltz = true: pulses on the three beats of a 6-eighth bar.
 */
function tension(tr, i, t, f, waltz = false) {
  const k = tr.am._intensity;
  if (k < 0.02) return;
  const S = tr.syn;
  const I = tr.I;
  if (waltz) {
    const w = i % 6;
    if (w % 2 === 0) S.pulse(I, t, w === 0 ? 0.32 : 0.16, f);
    if (k > 0.35 && w % 2 === 1) S.hat(I, t, 0.012 + Math.random() * 0.012);
    if (k > 0.6 && i % 12 === 10) S.tom(I, t, f * 1.6, 0.14);
    return;
  }
  const s = i % 8;
  if (s === 0 || s === 3 || s === 6) S.pulse(I, t, s === 0 ? 0.32 : 0.22, f);
  if (k > 0.35 && i % 2 === 1) S.hat(I, t, 0.012 + Math.random() * 0.012);
  if (k > 0.6 && i % 16 === 14) S.tom(I, t, f * 1.6, 0.14);
}

// ---- waltz material (all melodies are original) -----------------------------
// Chords: b = bass note, c = chord voicing, deg = scale degree of the root (D minor),
// lead = raise the 7th (C -> C#) for melodic fragments over the dominant.
const WD = {
  Dm: { b: 38, c: [57, 62, 65], deg: 0 },
  DmC: { b: 36, c: [57, 62, 65], deg: 0 },
  Bb: { b: 34, c: [58, 62, 65], deg: 5 },
  A7: { b: 33, c: [57, 61, 67], deg: 4, lead: true },
  A7hi: { b: 45, c: [57, 61, 67], deg: 4, lead: true },
  Gm: { b: 43, c: [58, 62, 67], deg: 3 },
  DmF: { b: 41, c: [57, 62, 65], deg: 0 },
  Edim: { b: 40, c: [58, 61, 67], deg: 1 },
  F: { b: 41, c: [57, 60, 65], deg: 2 },
  CE: { b: 40, c: [55, 60, 64], deg: 6 },
  DmA: { b: 45, c: [57, 62, 65], deg: 0 },
};
// Menu waltz (D minor, 3/4, eighth-note grid): [step, midi, length in eighths] per bar.
const MENU_A_CH = [WD.Dm, WD.DmC, WD.Bb, WD.A7, WD.Gm, WD.DmF, WD.Edim, WD.Dm];
const MENU_A = [
  [[0, 69, 4], [4, 74, 2]],
  [[0, 77, 3], [3, 76, 1], [4, 74, 2]],
  [[0, 74, 4], [4, 72, 1], [5, 70, 1]],
  [[0, 69, 6]],
  [[0, 67, 2], [2, 70, 2], [4, 74, 2]],
  [[0, 77, 4], [4, 76, 1], [5, 77, 1]],
  [[0, 79, 2], [2, 76, 2], [4, 73, 2]],
  [[0, 74, 6]],
];
const MENU_B_CH = [WD.F, WD.CE, WD.Dm, WD.Bb, WD.Gm, WD.DmA, WD.A7hi, WD.A7];
const MENU_B = [
  [[0, 81, 4], [4, 79, 1], [5, 77, 1]],
  [[0, 76, 4], [4, 74, 1], [5, 72, 1]],
  [[0, 74, 3], [3, 76, 1], [4, 77, 2]],
  [[0, 79, 4], [4, 77, 2]],
  [[0, 82, 4], [4, 81, 1], [5, 79, 1]],
  [[0, 77, 3], [3, 76, 1], [4, 74, 2]],
  [[0, 76, 4], [4, 73, 2]],
  [[0, 79, 2], [2, 76, 2], [4, 73, 2]],
];
const MUSIC_BOX = [74, 77, 81, 77, 74, 69];
// Explore: wandering progression + one-bar motifs as [step, scale offset from chord root, length].
const EXP_PROG = [WD.Dm, WD.Bb, WD.Gm, WD.A7, WD.Dm, WD.F, WD.Gm, WD.A7];
const EXP_MOTIFS = [
  [[0, 4, 4], [4, 3, 2]],
  [[0, 2, 2], [2, 4, 2], [4, 7, 2]],
  [[0, 7, 3], [3, 6, 1], [4, 4, 2]],
  [[2, 4, 4]],
  [[0, 2, 6]],
  [[0, 4, 2], [2, 5, 1], [3, 4, 1], [4, 2, 2]],
];
const D_MINOR = [62, 64, 65, 67, 69, 70, 72];
function scaleNote(ch, off) {
  const idx = ch.deg + off;
  const pc = ((idx % 7) + 7) % 7;
  return D_MINOR[pc] + 12 * Math.floor(idx / 7) + (ch.lead && pc === 6 ? 1 : 0);
}
// Castle ballroom waltz (G minor).
const WG = {
  Gm: { b: 43, c: [55, 58, 62] },
  GmF: { b: 41, c: [55, 58, 62] },
  Eb: { b: 39, c: [55, 58, 63] },
  D7: { b: 38, c: [54, 57, 60] },
  Cm: { b: 36, c: [55, 60, 63] },
  GmBb: { b: 46, c: [55, 58, 62] },
  BbD: { b: 38, c: [53, 58, 62] },
  Ab: { b: 44, c: [56, 60, 63] },
  EbG: { b: 43, c: [55, 58, 63] },
};
const CAS_A_CH = [WG.Gm, WG.GmF, WG.Eb, WG.D7, WG.Cm, WG.GmBb, WG.D7, WG.Gm];
const CAS_A = [
  [[0, 74, 2], [2, 79, 4]],
  [[0, 82, 3], [3, 81, 1], [4, 79, 2]],
  [[0, 79, 4], [4, 77, 1], [5, 75, 1]],
  [[0, 74, 4], [4, 78, 2]],
  [[0, 75, 2], [2, 79, 2], [4, 84, 2]],
  [[0, 82, 4], [4, 81, 1], [5, 79, 1]],
  [[0, 84, 2], [2, 81, 2], [4, 78, 2]],
  [[0, 79, 6]],
];
const CAS_B_CH = [WG.Eb, WG.BbD, WG.Cm, WG.Gm, WG.Ab, WG.EbG, WG.Cm, WG.D7];
const CAS_B = [
  [[0, 82, 4], [4, 79, 2]],
  [[0, 77, 4], [4, 74, 2]],
  [[0, 75, 2], [2, 77, 2], [4, 79, 2]],
  [[0, 74, 6]],
  [[0, 84, 4], [4, 82, 1], [5, 80, 1]],
  [[0, 79, 4], [4, 77, 1], [5, 75, 1]],
  [[0, 75, 2], [2, 74, 2], [4, 72, 2]],
  [[0, 74, 2], [2, 78, 2], [4, 81, 2]],
];
// Sovereigns battle (C minor, driving 3/4): chord root r and third q (3 = minor, 4 = major).
const SV = { Cm: { r: 48, q: 3 }, Ab: { r: 44, q: 4 }, Bb: { r: 46, q: 4 }, Fm: { r: 41, q: 3 }, G: { r: 43, q: 4 }, Db: { r: 49, q: 4 } };
const SOV_X = [SV.Cm, SV.Cm, SV.Ab, SV.Bb, SV.Fm, SV.G, SV.Ab, SV.G];
const SOV_Y = [SV.Cm, SV.Cm, SV.Ab, SV.Bb, SV.Fm, SV.G, SV.Db, SV.G];
const SOV_THEME = [
  [[0, 79, 6]],
  [[0, 80, 4], [4, 79, 2]],
  [[0, 75, 6]],
  [[0, 77, 4], [4, 74, 2]],
  [[0, 72, 3], [3, 75, 3]],
  [[0, 74, 3], [3, 71, 3]],
  [[0, 73, 2], [2, 77, 2], [4, 80, 2]],
  [[0, 79, 4], [4, 71, 2]],
];

/** Piano left hand "oom-pah-pah" on a 6-eighth bar. */
function oompah(S, L, ch, s, t, vel) {
  if (s === 0) S.piano(L, ch.b, t, vel, 2.2);
  else if (s === 2 || s === 4) for (const m of ch.c) S.piano(L, m, t + rand(0, 0.012), vel * 0.4, 0.7);
}

/** Play the melody notes of a bar that start on step s. */
function melody(bar, s, fn) {
  for (const [ss, m, len] of bar) if (ss === s) fn(m, len);
}

const CATH_CHORDS = [
  { root: 38, organ: [50, 57, 62], choir: [62, 65, 69], top: [74, 77] }, // Dm
  { root: 34, organ: [46, 53, 58], choir: [62, 65, 70], top: [74, 77] }, // Bb
  { root: 31, organ: [43, 50, 55], choir: [62, 67, 70], top: [74, 79] }, // Gm
  { root: 33, organ: [45, 52, 57], choir: [61, 64, 69], top: [73, 76] }, // A
];
const FOREST_GLASS = [83, 84, 88, 89, 90, 94, 95];
const BOSS_CH = [
  { root: 50, pad: [62, 65, 69], stab: [62, 65, 69, 74] }, // Dm
  { root: 46, pad: [62, 65, 70], stab: [58, 62, 65, 70] }, // Bb
  { root: 43, pad: [62, 67, 70], stab: [55, 62, 67, 70] }, // Gm
  { root: 45, pad: [61, 64, 69], stab: [57, 61, 64, 69] }, // A
];
const BOSS2_CH = [
  { root: 50, pad: [62, 65, 69], stab: [62, 63, 65, 69] }, // Dm(b9)
  { root: 51, pad: [63, 67, 70], stab: [63, 67, 69, 70] }, // Eb (+ tritone A)
  { root: 43, pad: [62, 67, 70], stab: [55, 61, 62, 67] }, // Gm (+ C#)
  { root: 45, pad: [61, 64, 70], stab: [57, 61, 64, 70] }, // A7(b9)
];
const OSTINATO = [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 5, 7, 12];
const VIC = [
  { root: 34, pad: [58, 62, 65, 69], arp: [58, 62, 65, 69, 74, 69, 65, 62] }, // Bbmaj7
  { root: 41, pad: [57, 60, 65, 69], arp: [57, 60, 65, 69, 72, 69, 65, 60] }, // F
  { root: 43, pad: [58, 62, 65, 67], arp: [55, 58, 62, 65, 70, 65, 62, 58] }, // Gm7
  { root: 45, pad: [57, 62, 64, 69], arp: [57, 62, 64, 69, 73, 69, 64, 61] }, // Asus4 -> A
  { root: 38, pad: [50, 57, 62, 65, 69], arp: [] }, // Dm
];
const VIC_MEL = [
  [[0, 77, 4], [4, 76, 2], [6, 74, 2]],
  [[0, 72, 6], [6, 69, 2]],
  [[0, 70, 4], [4, 74, 4]],
  [[0, 74, 4], [4, 73, 4]],
  [[0, 74, 8]],
];

function bossStep(tr, i, t, p2) {
  const S = tr.syn;
  const L = tr.L;
  const d = tr.stepDur;
  const s = i % 16;
  const bar = Math.floor(i / 16);
  const ch = (p2 ? BOSS2_CH : BOSS_CH)[Math.floor(bar / 2) % 4];
  // percussion
  const kicks = p2 ? [0, 3, 6, 8, 11, 14] : [0, 8, 11];
  if (kicks.includes(s)) S.kick(L, t, s === 0 ? 0.5 : 0.38);
  if (s === 4 || s === 12) {
    S.snare(L, t, 0.1);
    S.tom(L, t, 70, 0.2);
  }
  if (p2 || s % 2 === 0) S.hat(L, t, s % 4 === 2 ? 0.03 : 0.016);
  if (p2 && bar % 4 === 3 && s >= 12) S.tom(L, t, 120 - (s - 12) * 14, 0.22);
  if (!p2 && bar % 8 === 7 && s >= 13) S.tom(L, t, 100 - (s - 13) * 15, 0.2);
  // ostinato: 8ths in phase 1, driving 16ths in phase 2
  if (p2 || s % 2 === 0) {
    S.bass(L, ch.root + OSTINATO[s], t, d * (p2 ? 1.1 : 2), s % 4 === 0 ? 0.11 : 0.085, p2 ? 1.4 : 1);
  }
  if (s % 4 === 0) S.tone(L, { t, f: mtof(ch.root - 12), a: 0.004, r: d * 3, g: 0.1 });
  // stabbing chords
  const stabs = p2 ? [0, 6, 10] : bar % 2 === 1 ? [0, 10] : [];
  if (stabs.includes(s)) S.stab(L, ch.stab, t, 0.022, p2 ? 1.3 : 1);
  // choir pad every two bars (an octave higher in phase 2)
  if (bar % 2 === 0 && s === 0) {
    S.pad(L, ch.pad.map((m) => m + (p2 ? 12 : 0)), t, 32 * d + 0.2, p2 ? 0.035 : 0.04, { a: 0.8, r: 1.2, vowel: 'a', n: 3, spread: 14 });
  }
  if (p2 && bar % 4 === 0 && s === 0) S.bell(L, mtof(pick([80, 81, 87])), t, 0.03, 3);
}

/**
 * Track definitions: stepDur (s), rev (reverb send), level, intensity (supports the
 * combat layer), init(track, t) for persistent drones, step(track, index, time).
 */
const TRACKS = {
  menu: {
    // Belle-Epoque waltz in D minor, 80 BPM, eighth-note grid. Form: intro 2 | A 8 | B 8 | A' 8.
    stepDur: 60 / 80 / 2,
    rev: 0.5,
    lofi: [110, 5200],
    init(tr, t) {
      tr.crackle(t, 0.05);
    },
    step(tr, i, t) {
      const S = tr.syn;
      const L = tr.L;
      const d = tr.stepDur;
      const s = i % 6;
      const bar = Math.floor(i / 6) % 26;
      let sec = 'I';
      let ch = WD.Dm;
      let mel = null;
      if (bar >= 18) {
        sec = 'A2';
        ch = MENU_A_CH[bar - 18];
        mel = MENU_A[bar - 18];
      } else if (bar >= 10) {
        sec = 'B';
        ch = MENU_B_CH[bar - 10];
        mel = MENU_B[bar - 10];
      } else if (bar >= 2) {
        sec = 'A';
        ch = MENU_A_CH[bar - 2];
        mel = MENU_A[bar - 2];
      }
      oompah(S, L, ch, s, t, sec === 'I' ? 0.055 : 0.075);
      if (sec === 'I') S.celesta(L, MUSIC_BOX[s] + 12, t, s === 0 ? 0.04 : 0.028); // music box intro
      if (s === 0) {
        if (sec === 'A') {
          for (const m of ch.c) S.strings(L, m, t, 6 * d + 0.2, 0.012, { a: 0.9, r: 1.2, lpf: 1400 }); // distant pad
        } else if (sec !== 'I') {
          S.strings(L, ch.b + 12, t, 6 * d + 0.1, 0.04, { a: 0.6, r: 0.9, lpf: 900 }); // cellos
        }
        if (sec === 'A2' && bar % 2 === 0) S.pad(L, ch.c.map((m) => m - 12), t, 12 * d, 0.012, { a: 1.5, r: 2, vowel: 'u', n: 2 });
      }
      if (!mel) return;
      melody(mel, s, (m, len) => {
        const dur = len * d;
        if (sec === 'A') {
          S.piano(L, m, t, 0.1, dur + 1.2); // solo piano states the theme
        } else {
          S.strings(L, m, t, dur + 0.05, 0.075, { a: 0.18, r: 0.55 }); // strings take it over
          if (sec === 'B') S.strings(L, m - 12, t, dur + 0.05, 0.03, { a: 0.2, r: 0.55 });
          else if (s === 0) S.celesta(L, m + 12, t, 0.03);
        }
      });
      if (sec === 'A' && s === 4 && mel.length === 1) S.celesta(L, ch.c[2] + 24, t, 0.025); // music-box answer
    },
  },

  explore: {
    // Sparse, tired waltz (66 BPM): solo piano fragments, distant strings, irregular rests.
    stepDur: 60 / 66 / 2,
    rev: 0.65,
    lofi: [90, 7000],
    intensity: true,
    init(tr, t) {
      tr.crackle(t, 0.025);
      tr.drone([36.71, 55], { t, type: 'sine', g: 0.01 });
      Object.assign(tr.s, { rest: 1, played: 0, ci: 0, mode: 'rest', strings: false });
    },
    step(tr, i, t) {
      const S = tr.syn;
      const L = tr.L;
      const st = tr.s;
      const d = tr.stepDur;
      const s = i % 6;
      if (s === 0) {
        if (st.rest > 0) {
          st.rest--;
          st.mode = 'rest';
          if (chance(0.35)) S.piano(L, pick([81, 86, 89]), t + rand(0, 4 * d), 0.03, 4);
        } else {
          st.mode = 'play';
          st.ch = EXP_PROG[st.ci++ % EXP_PROG.length];
          st.motif = chance(0.6) ? pick(EXP_MOTIFS) : null;
          st.pah = chance(0.55);
          if (st.played % 4 === 0) st.strings = chance(0.6);
          st.played++;
          if (st.played % 4 === 0) st.rest = chance(0.5) ? (chance(0.4) ? 2 : 1) : 0;
          if (st.strings) for (const m of st.ch.c) S.strings(L, m, t, 6 * d + 0.4, 0.014, { a: 1.2, r: 1.5, lpf: 1100 });
        }
      }
      if (st.mode === 'play') {
        const ch = st.ch;
        if (s === 0) S.piano(L, ch.b, t, 0.06, 2.5);
        else if ((s === 2 || s === 4) && st.pah) for (const m of ch.c) S.piano(L, m, t + rand(0, 0.015), 0.018, 0.7);
        if (st.motif) {
          melody(st.motif, s, (off, len) => S.piano(L, scaleNote(ch, off), t + rand(0, 0.02), rand(0.06, 0.09), len * d + 1.6));
        }
        if (s === 0 && chance(0.12)) S.strings(L, scaleNote(ch, 7), t, 12 * d, 0.022, { a: 1.5, r: 2, lpf: 1500 });
      }
      tension(tr, i, t, 55, true);
    },
  },

  castle: {
    // Grand vampire-ballroom waltz in G minor, 92 BPM. Form: A | A' (+harpsichord, choir) | B | A'' (tutti).
    stepDur: 60 / 92 / 2,
    rev: 0.55,
    level: 0.85,
    intensity: true,
    step(tr, i, t) {
      const S = tr.syn;
      const L = tr.L;
      const d = tr.stepDur;
      const s = i % 6;
      const bar = Math.floor(i / 6) % 32;
      const sec = bar >> 3;
      const b8 = bar & 7;
      const isB = sec === 2;
      const ch = (isB ? CAS_B_CH : CAS_A_CH)[b8];
      // oom-pah-pah: piano, pizzicato basses, short string chords
      if (s === 0) {
        S.piano(L, ch.b, t, 0.07, 2);
        S.pizz(L, ch.b - 12, t, 0.09);
        S.strings(L, ch.b, t, 6 * d, 0.04, { a: 0.12, r: 0.5, lpf: 800 });
      } else if (s === 2 || s === 4) {
        for (const m of ch.c) {
          S.piano(L, m, t + rand(0, 0.01), 0.026, 0.6);
          S.strings(L, m, t, d * 0.9, 0.016, { a: 0.02, r: 0.2, lpf: 2000, vib: 0 });
        }
        if (sec === 1 || sec === 3) S.harp(L, ch.c[2] + 12, t, 0.035);
      }
      // melody: violins (cellos in B), doubled an octave lower in the final A
      melody((isB ? CAS_B : CAS_A)[b8], s, (m, len) => {
        const dur = len * d + 0.03;
        if (isB) {
          S.strings(L, m - 12, t, dur, 0.075, { a: 0.15, r: 0.5 });
        } else {
          S.strings(L, m, t, dur, 0.07, { a: 0.12, r: 0.5 });
          if (sec === 3) S.strings(L, m - 12, t, dur, 0.045, { a: 0.12, r: 0.5 });
        }
      });
      if (isB && s === 0) S.strings(L, ch.c[2] + 12, t, 6 * d + 0.1, 0.03, { a: 0.5, r: 0.8 }); // violin counter-line
      if (sec > 0 && s === 0 && b8 % 2 === 0) S.pad(L, ch.c.map((m) => m - 12), t, 12 * d, 0.025, { a: 1, r: 1.5, vowel: 'o', n: 2 });
      if ((b8 === 3 || b8 === 7) && s === 4) {
        [ch.c[0], ch.c[1], ch.c[2], ch.c[0] + 12].forEach((m, k) => S.harp(L, m + 12, t + (k * d) / 2, 0.05)); // flourish
      }
      if (b8 === 0 && s === 0) S.timp(L, ch.b, t, 0.1);
      if (b8 === 7 && s >= 4) S.timp(L, 38, t, 0.06);
      // combat: spiccato low strings join the pulse layer
      if (tr.am._intensity > 0.3) S.strings(tr.I, ch.b + 12 + (s % 2 ? 7 : 0), t, d * 0.5, 0.035, { a: 0.008, r: 0.1, lpf: 2600, vib: 0 });
      tension(tr, i, t, 49, true);
    },
  },

  cathedral: {
    stepDur: 0.25,
    rev: 0.75,
    intensity: true,
    init(tr, t) {
      tr.drone([36.71, 55], { t, type: 'sine', g: 0.03 });
    },
    step(tr, i, t) {
      const S = tr.syn;
      const L = tr.L;
      const s = i % 32;
      const ch = CATH_CHORDS[Math.floor(i / 32) % 4];
      const len = 32 * tr.stepDur;
      if (s === 0) {
        S.pad(L, ch.choir, t, len + 0.5, 0.035, { a: 2.5, r: 3, vowel: 'a', vowel2: 'o', n: 3, spread: 12 });
        for (const m of ch.organ) S.organ(L, m, t + 0.3, len - 0.6, 0.02);
        S.organ(L, ch.root, t, len - 0.2, 0.035);
        if (chance(0.3)) S.bell(L, mtof(pick([74, 81, 86])), t + 0.5, 0.025, 5);
      }
      if (s === 16 && chance(0.4)) {
        S.vox(L, { t, f: mtof(pick(ch.top)), a: 1.5, hold: 1.5, r: 2.5, g: 0.03, vowel: 'u', vowel2: 'o', n: 3, spread: 8, vib: [5, 12] });
      }
      tension(tr, i, t, 49);
    },
  },

  forest: {
    stepDur: 0.25,
    rev: 0.7,
    level: 0.8,
    intensity: true,
    init(tr, t) {
      tr.drone([49, 49.6], { t, type: 'sine', g: 0.035 });
      tr.drone([1975.5, 2093], { t, type: 'sine', g: 0.004, ff: 8000, amp: [0.05, 0.003] });
      tr.s.nextGlass = t + rand(2, 4);
      tr.s.nextSwell = t + rand(10, 16);
    },
    step(tr, i, t) {
      const S = tr.syn;
      const L = tr.L;
      const st = tr.s;
      // uneasy heartbeat-like pairs in a lopsided 20-step cycle
      const s = i % 20;
      if ((s === 0 || s === 3 || s === 10 || s === 13) && !chance(0.15)) S.pulse(L, t, s % 10 === 0 ? 0.18 : 0.11, 43);
      if (t >= st.nextGlass) {
        const m = pick(FOREST_GLASS);
        S.glass(L, m, t, rand(1.5, 3), 0.02);
        if (chance(0.45)) S.glass(L, m + pick([1, -1, 6]), t + rand(0, 0.6), rand(1.5, 3), 0.014);
        st.nextGlass = t + rand(3, 8);
      }
      if (t >= st.nextSwell) {
        S.pad(L, pick([[43, 44, 50], [38, 44, 51], [41, 47, 52]]), t, 5, 0.018, { a: 3, r: 3, vowel: 'u', n: 2, spread: 25 });
        st.nextSwell = t + rand(18, 30);
      }
      tension(tr, i, t, 43);
    },
  },

  boss: {
    stepDur: 60 / 140 / 4, // 16ths at 140 BPM
    rev: 0.3,
    level: 0.47,
    step(tr, i, t) {
      bossStep(tr, i, t, false);
    },
  },

  boss2: {
    stepDur: 60 / 152 / 4, // 16ths at 152 BPM
    rev: 0.3,
    level: 0.5,
    step(tr, i, t) {
      bossStep(tr, i, t, true);
    },
  },

  sovereigns: {
    // Dual-boss battle in C minor, driving 3/4 at 150 BPM: 8 bars ostinato + choir stabs, 8 bars with the theme.
    stepDur: 60 / 150 / 2,
    rev: 0.3,
    level: 0.4,
    step(tr, i, t) {
      const S = tr.syn;
      const L = tr.L;
      const d = tr.stepDur;
      const s = i % 6;
      const bar = Math.floor(i / 6) % 16;
      const two = bar >= 8;
      const b8 = bar & 7;
      const ch = (two ? SOV_Y : SOV_X)[b8];
      const pat = [ch.r, ch.r + 12, ch.r + 7, ch.r + 12, ch.r + ch.q, ch.r + 12];
      let tp = ch.r;
      while (tp > 47) tp -= 12;
      // spiccato ostinato; the second sovereign answers an octave up in part two
      S.strings(L, pat[s], t, d * 0.55, s === 0 ? 0.12 : 0.09, { a: 0.008, r: 0.12, lpf: 3000, vib: 0, spread: 12 });
      if (two) S.strings(L, pat[(s + 3) % 6] + 12, t, d * 0.5, 0.05, { a: 0.008, r: 0.1, lpf: 3600, vib: 0 });
      // timpani, low drums, ticks
      if (s === 0) {
        S.timp(L, tp, t, 0.24);
        S.kick(L, t, 0.4);
      }
      if (s === 3) S.kick(L, t, 0.28);
      if (s === 2 || s === 4) S.tom(L, t, s === 2 ? 95 : 78, 0.16);
      S.hat(L, t, s % 2 ? 0.012 : 0.02);
      if (b8 === 7 && s >= 3) {
        S.timp(L, tp, t, 0.16);
        S.timp(L, tp, t + d / 2, 0.13);
      }
      // choir: short stabs in part one, sustained in part two
      const stab = [ch.r + 12, ch.r + 12 + ch.q, ch.r + 19];
      if (!two && ((b8 % 2 === 1 && s === 0) || ((b8 === 3 || b8 === 7) && s === 3))) {
        S.pad(L, stab, t, 0.12, 0.06, { a: 0.015, r: 0.35, vowel: 'a', n: 2, spread: 18 });
      }
      if (two && s === 0) {
        if (b8 % 2 === 0) S.pad(L, stab, t, 12 * d, 0.035, { a: 0.3, r: 0.6, vowel: 'a' });
        S.strings(L, ch.r - 12, t, 6 * d, 0.06, { a: 0.04, r: 0.3, lpf: 800 });
      }
      if (two) {
        melody(SOV_THEME[b8], s, (m, len) => {
          S.strings(L, m, t, len * d + 0.03, 0.08, { a: 0.06, r: 0.35, lpf: 3200 });
          S.strings(L, m - 12, t, len * d + 0.03, 0.045, { a: 0.06, r: 0.35 });
        });
      }
    },
  },

  victory: {
    stepDur: 60 / 72 / 2, // eighths at 72 BPM
    rev: 0.6,
    step(tr, i, t) {
      const S = tr.syn;
      const L = tr.L;
      const d = tr.stepDur;
      if (i < 40) {
        // the resolution, played once: Bbmaj7 - F - Gm7 - Asus4/A - Dm
        const bar = Math.floor(i / 8);
        const s = i % 8;
        const ch = VIC[bar];
        if (s === 0) {
          const last = bar === 4;
          S.pad(L, ch.pad, t, last ? 8 : 8 * d + 0.3, 0.03, { a: 0.9, r: last ? 4 : 1.8, vowel: 'o', vowel2: 'a' });
          S.organ(L, ch.root, t, last ? 6 : 8 * d, 0.03);
          for (const m of ch.pad) S.strings(L, m, t, last ? 7 : 8 * d + 0.2, 0.012, { a: 1, r: last ? 3 : 1.2, lpf: 1600 });
          if (bar === 0 || last) S.bell(L, mtof(last ? 74 : 77), t, 0.04, 5);
        }
        if (ch.arp.length) S.piano(L, ch.arp[s], t, 0.04, 2.5);
        for (const [ss, m, len] of VIC_MEL[bar]) if (ss === s) S.lead(L, m, t, len * d, 0.055);
      } else {
        // then hold a soft, slowly breathing pad
        const j = i - 40;
        if (j % 32 === 16) {
          S.pad(L, [50, 57, 64, 65], t, 8, 0.02, { a: 4, r: 5, vowel: 'u', vowel2: 'o', n: 2 });
          for (const m of [57, 62, 65]) S.strings(L, m, t, 8, 0.008, { a: 4, r: 5, lpf: 1200 });
        }
        if (j % 32 === 0 && chance(0.4)) S.bell(L, mtof(pick([74, 81, 86])), t, 0.02, 5);
        if (chance(0.025)) S.piano(L, pick([74, 76, 77, 81]), t, 0.035, 4);
      }
    },
  },
};

// ---------------------------------------------------------------------------
// Ambience
// ---------------------------------------------------------------------------
class Ambience extends Bed {
  constructor(am, name, def) {
    super(am, am._ambBus, am._ambSend, def.rev ?? 0.5);
    this.name = name;
    this.def = def;
    this.timers = {};
  }

  begin(t) {
    this.fadeIn(t, AMB_FADE, this.def.level ?? 1);
    this.def.init(this, t);
  }

  tick(dt) {
    if (this.stopAt === Infinity && this.def.tick) this.def.tick(this, dt);
  }

  /** Countdown timer: run fn every rand(min, max) seconds (first one comes sooner). */
  every(key, min, max, dt, fn) {
    let c = this.timers[key];
    if (c === undefined) c = rand(min * 0.3, max * 0.6);
    c -= dt;
    if (c <= 0) {
      fn();
      c = rand(min, max);
    }
    this.timers[key] = c;
  }

  event(name, volume = 1) {
    const def = own(AMB_EV, name) || own(SFX, name);
    if (def) this.am._spawn('amb:' + name, def, { volume, pan: rand(-0.8, 0.8) }, { bus: this.out, send: this.am._ambSend });
  }
}

const AMBIENCES = {
  cathedral: {
    rev: 0.7,
    level: 0.8,
    init(b, t) {
      b.drone([55, 82.4], { t, type: 'sine', g: 0.035, ff: 400, amp: [0.05, 0.012] });
      b.drone([41.2, 41.5], { t, type: 'sawtooth', g: 0.02, ff: 120, lfo: [0.03, 40] });
      b.noiseBed({ t, buf: 'brown', ft: 'lowpass', ff: 180, g: 0.12 });
      b.noiseBed({ t, buf: 'pink', ft: 'bandpass', ff: 520, q: 0.9, g: 0.04, fl: [0.06, 260], al: [0.083, 0.02] });
    },
    tick(b, dt) {
      b.every('ev', 6, 15, dt, () => {
        const r = Math.random();
        if (r < 0.55) b.event('drip', rand(0.5, 1));
        else if (r < 0.85) b.event('creak', rand(0.4, 0.8));
        else b.event('boom', rand(0.3, 0.5));
      });
    },
  },
  village: {
    rev: 0.4,
    level: 1.4,
    init(b, t) {
      b.noiseBed({ t, buf: 'pink', ft: 'lowpass', ff: 700, q: 1, g: 0.1, fl: [0.07, 400], al: [0.05, 0.04], al2: [0.13, 0.02] });
      b.noiseBed({ t, buf: 'white', ft: 'bandpass', ff: 950, q: 4, g: 0.02, fl: [0.045, 300], al: [0.09, 0.012] });
      b.noiseBed({ t, buf: 'brown', ft: 'lowpass', ff: 200, g: 0.07 });
    },
    tick(b, dt) {
      b.every('ev', 8, 18, dt, () => {
        const r = Math.random();
        if (r < 0.45) b.event('creak', rand(0.5, 0.9));
        else if (r < 0.8) b.event('crow', rand(0.2, 0.4));
        else b.event('knock', rand(0.3, 0.6));
      });
      b.every('gust', 10, 22, dt, () => b.event('gust', rand(0.5, 1)));
    },
  },
  forest: {
    rev: 0.35,
    level: 1.2,
    init(b, t) {
      b.noiseBed({ t, buf: 'pink', ft: 'bandpass', ff: 650, q: 0.6, g: 0.14, fl: [0.09, 350], al: [0.11, 0.06], al2: [0.037, 0.05] });
      b.noiseBed({ t, buf: 'brown', ft: 'lowpass', ff: 300, g: 0.12, al: [0.07, 0.04] });
      b.noiseBed({ t, buf: 'white', ft: 'highpass', ff: 4500, g: 0.015, al: [0.15, 0.01] });
    },
    tick(b, dt) {
      b.every('rustle', 0.6, 2.5, dt, () => b.event('rustle', rand(0.5, 1)));
      b.every('ev', 10, 25, dt, () => b.event(chance(0.5) ? 'owl' : 'twig', rand(0.4, 0.8)));
      b.every('gust', 6, 14, dt, () => b.event('gust', rand(0.7, 1.2)));
    },
  },
  altar: {
    rev: 0.6,
    level: 0.63,
    init(b, t) {
      b.noiseBed({ t, buf: 'brown', ft: 'lowpass', ff: 140, q: 2, g: 0.22, fl: [0.05, 50], al: [0.06, 0.08] });
      b.noiseBed({ t, buf: 'pink', ft: 'bandpass', ff: 260, q: 1, g: 0.07, fl: [0.035, 120], al: [0.08, 0.03] });
      b.drone([36.71, 36.9, 55.0], { t, type: 'sawtooth', g: 0.04, ff: 160, q: 3, lfo: [0.04, 60] });
      b.drone([73.4, 77.8], { t, type: 'sine', g: 0.014, amp: [0.03, 0.008] });
    },
    tick(b, dt) {
      b.every('ev', 7, 14, dt, () => b.event(chance(0.5) ? 'boom' : 'eerie', rand(0.5, 1)));
    },
  },
  menu: {
    rev: 0.5,
    level: 1.8,
    init(b, t) {
      b.noiseBed({ t, buf: 'pink', ft: 'lowpass', ff: 550, q: 0.8, g: 0.05, fl: [0.05, 250], al: [0.07, 0.02] });
      b.drone([73.42, 110], { t, type: 'sine', g: 0.008 });
    },
    tick(b, dt) {
      b.every('gust', 12, 24, dt, () => b.event('gust', rand(0.3, 0.6)));
    },
  },
};

// ---------------------------------------------------------------------------
// AudioManager (public API)
// ---------------------------------------------------------------------------
export class AudioManager {
  constructor() {
    this.ctx = null; // created lazily in unlock()
    this._disabled = false;
    this._warned = new Set();
    this._vol = { master: 0.8, music: 0.6, sfx: 0.8 };
    this._reduceLoud = false;
    this._listener = { x: 0, z: 0, yaw: 0 };
    this._musicName = null; // requested track (remembered before unlock)
    this._ambName = null; // requested ambience
    this._music = null; // active MusicTrack
    this._amb = null; // active Ambience
    this._tracks = []; // active + fading music tracks
    this._ambs = []; // active + fading ambience beds
    this._intensity = 0;
    this._voices = new Set();
    this._lastPlay = new Map();
    this._watchdog = 0;
    // custom music
    this._musicToken = 0; // invalidates pending async music switches
    this._playlist = null; // { track | 'all': absolute URL }
    this._playlistReady = false;
    this._playlistP = null;
    this._userMusic = new Map(); // track | 'all' -> { buffer, name } (this session)
    this._fileCache = new Map(); // url -> Promise<AudioBuffer | null>
  }

  /** True once the AudioContext exists and is running. */
  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Name of the custom file playing now, else of the last file loaded with loadUserFile(), else null. */
  get customMusicName() {
    if (this._music && this._music.label) return this._music.label;
    let name = null;
    for (const u of this._userMusic.values()) name = u.name;
    return name;
  }

  /** Create / resume the AudioContext. Safe and cheap to call on every user gesture. */
  unlock() {
    if (this._disabled) return;
    if (!this.ctx && !this._init()) return;
    const ctx = this.ctx;
    // resume() must be retried from inside a gesture: a call made before the first
    // gesture can stay pending forever, so never gate this on an earlier attempt.
    if (ctx.state !== 'running' && ctx.state !== 'closed') {
      try {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        /* ignore */
      }
    }
  }

  setVolumes({ master, music, sfx } = {}) {
    const norm = (v, d) => clamp(num(v, d), 0, 1);
    this._vol.master = norm(master, this._vol.master);
    this._vol.music = norm(music, this._vol.music);
    this._vol.sfx = norm(sfx, this._vol.sfx);
    if (this.ctx) this._applyVolumes(false);
  }

  setReduceLoud(on) {
    this._reduceLoud = !!on;
    if (this.ctx) this._applyCompressor();
  }

  setListener(x, z, yaw) {
    const L = this._listener;
    L.x = num(x, L.x);
    L.z = num(z, L.z);
    L.yaw = num(yaw, L.yaw);
  }

  /** One-shot SFX. opts: { volume, pitch, pan, pos: {x, z} } */
  play(name, opts = {}) {
    const def = own(SFX, name);
    if (!def) {
      this._warnOnce('sfx:' + name, `[AudioManager] Unknown sound "${name}"`);
      return;
    }
    if (!this.ready) return;
    this._spawn(name, def, opts || {});
  }

  footstep(surface) {
    if (!this.ready) return;
    const key = own(STEPS, surface) ? surface : 'stone';
    this._spawn('step:' + key, STEPS[key], {});
  }

  playMusic(track) {
    const name = track || null;
    if (name && !own(TRACKS, name)) {
      this._warnOnce('music:' + name, `[AudioManager] Unknown music track "${name}"`);
      return;
    }
    if (name === this._musicName) return;
    this._musicName = name;
    if (this.ctx) this._startMusic(name);
  }

  setAmbience(type) {
    const name = type || null;
    if (name && !own(AMBIENCES, name)) {
      this._warnOnce('amb:' + name, `[AudioManager] Unknown ambience "${name}"`);
      return;
    }
    if (name === this._ambName) return;
    this._ambName = name;
    if (this.ctx) this._startAmbience(name);
  }

  /**
   * Use an audio File/Blob (e.g. from <input type="file">) for `track` ('all' = every track)
   * for this session. Resolves true when the file decoded and is in use.
   */
  async loadUserFile(file, track = 'all') {
    const key = track == null ? 'all' : String(track);
    if (key !== 'all' && !own(TRACKS, key)) {
      this._warnOnce('music:' + key, `[AudioManager] Unknown music track "${key}"`);
      return false;
    }
    const label = (file && file.name) || 'custom audio';
    try {
      if (!file || (typeof file.arrayBuffer !== 'function' && typeof FileReader === 'undefined')) {
        throw new Error('not a File or Blob');
      }
      if (!this.ctx) this.unlock();
      if (!this.ctx) return false;
      const buffer = await this._decode(await readBlob(file));
      this._userMusic.set(key, { buffer, name: label });
      this._refreshMusic();
      return true;
    } catch (err) {
      this._warnOnce('user:' + label, `[AudioManager] Could not use "${label}" as music: ${(err && err.message) || err}`);
      return false;
    }
  }

  /** Forget files loaded with loadUserFile() and return to the built-in (or playlist) music. */
  clearUserMusic() {
    if (!this._userMusic.size) return;
    this._userMusic.clear();
    this._refreshMusic();
  }

  setMusicIntensity(v) {
    this._intensity = clamp(num(v, 0), 0, 1);
    if (this.ctx && this._music) this._music.setIntensity(this._intensity, this.ctx.currentTime);
  }

  /** Per-frame tick: music lookahead scheduling, ambience events, voice watchdog. */
  update(dt) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const step = clamp(num(dt, 0), 0, 0.25);
    this._service(this._tracks, now, (tr) => tr.schedule(now, now + LOOKAHEAD));
    this._service(this._ambs, now, (b) => b.tick(step));
    this._watchdog += step;
    if (this._watchdog > 1) {
      this._watchdog = 0;
      for (const v of this._voices) if (now > v.end + 3) v.dispose(); // safety net
    }
  }

  // ---- internals -------------------------------------------------------------

  /** Run fn on each live bed, dispose finished ones; a failing bed is faded out. */
  _service(list, now, fn) {
    for (let i = list.length - 1; i >= 0; i--) {
      const bed = list[i];
      if (now > bed.stopAt + 0.3) {
        bed.dispose();
        list.splice(i, 1);
        continue;
      }
      try {
        fn(bed);
      } catch (err) {
        this._warnOnce('bed:' + bed.name, `[AudioManager] "${bed.name}" failed: ${err && err.message}`);
        bed.fadeOut(now, 0.5);
      }
    }
  }

  _warnOnce(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(msg);
  }

  _init() {
    let ctx = null;
    try {
      const g = typeof window !== 'undefined' ? window : globalThis;
      const AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API is not available');
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        ctx = new AC();
      }
      this.ctx = ctx;
      this._buildGraph();
    } catch (err) {
      this._disabled = true;
      this.ctx = null;
      try {
        if (ctx) ctx.close();
      } catch (e) {
        /* ignore */
      }
      console.warn('[AudioManager] Audio disabled:', (err && err.message) || err);
      return false;
    }
    // A one-sample silent buffer helps unlock audio on older iOS versions.
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.onended = () => unplug(s);
      s.start(0);
    } catch (e) {
      /* ignore */
    }
    this._loadPlaylist();
    // Start whatever was requested before the context existed.
    if (this._ambName) this._startAmbience(this._ambName);
    if (this._musicName) this._startMusic(this._musicName);
    return true;
  }

  _buildGraph() {
    const ctx = this.ctx;
    const gain = (dest) => {
      const g = ctx.createGain();
      g.connect(dest);
      return g;
    };
    this._comp = ctx.createDynamicsCompressor();
    this._comp.connect(ctx.destination);
    this._master = gain(this._comp);
    this._reverb = ctx.createConvolver();
    this._reverb.buffer = makeImpulse(ctx, 3.2);
    this._revReturn = gain(this._master);
    this._revReturn.gain.value = 1.6;
    this._reverb.connect(this._revReturn);
    this._musicBus = gain(this._master);
    this._musicSend = gain(this._reverb);
    this._sfxBus = gain(this._master);
    this._sfxSend = gain(this._reverb);
    this._ambBus = gain(this._master);
    this._ambSend = gain(this._reverb);
    this._syn = new Synth(ctx);
    this._applyVolumes(true);
    this._applyCompressor();
  }

  _applyVolumes(immediate) {
    const t = this.ctx.currentTime;
    const set = (node, v) => {
      if (immediate) node.gain.value = v;
      else node.gain.setTargetAtTime(v, t, 0.05);
    };
    const { master, music, sfx } = this._vol;
    set(this._master, curve(master));
    set(this._musicBus, curve(music) * TRIM.music);
    set(this._musicSend, curve(music) * TRIM.music);
    set(this._sfxBus, curve(sfx) * TRIM.sfx);
    set(this._sfxSend, curve(sfx) * TRIM.sfx);
    set(this._ambBus, curve(sfx) * TRIM.amb);
    set(this._ambSend, curve(sfx) * TRIM.amb);
  }

  _applyCompressor() {
    const c = this._comp;
    const t = this.ctx.currentTime;
    const P = this._reduceLoud
      ? { threshold: -24, knee: 6, ratio: 12, attack: 0.002, release: 0.3 }
      : { threshold: -10, knee: 8, ratio: 6, attack: 0.003, release: 0.25 };
    for (const k of Object.keys(P)) c[k].setValueAtTime(P[k], t);
  }

  /** Stereo pan / gain / muffling for a world position relative to the listener. */
  _spatial(pos) {
    const L = this._listener;
    const dx = num(pos.x, L.x) - L.x;
    const dz = num(pos.z, L.z) - L.z;
    const d = Math.hypot(dx, dz);
    if (d >= FAR) return null;
    let gain = 1;
    if (d > NEAR) {
      const u = (d - NEAR) / (FAR - NEAR);
      gain = (1 - u) * (1 - u);
    }
    let pan = 0;
    let front = 1;
    if (d > 1e-3) {
      // forward = (sin yaw, cos yaw) -> right = (-cos yaw, sin yaw)
      const side = (dx * -Math.cos(L.yaw) + dz * Math.sin(L.yaw)) / d;
      front = (dx * Math.sin(L.yaw) + dz * Math.cos(L.yaw)) / d;
      pan = side * Math.min(1, d / 2) * 0.85;
    }
    if (front < 0) gain *= 1 + front * 0.15; // slightly quieter behind
    let lp = 18000 - (d / FAR) * 13000;
    if (front < 0) lp *= 1 + front * 0.35; // ...and duller
    return { gain, pan, lp: lp >= 15000 ? 0 : lp };
  }

  /** Create a Voice and run a recipe. route = { bus, send } (defaults to the SFX bus). */
  _spawn(key, def, opts, route) {
    try {
      const now = this.ctx.currentTime;
      if (this._voices.size >= MAX_VOICES) return;
      const last = this._lastPlay.get(key);
      if (last !== undefined && now - last < RETRIGGER && now >= last) return;
      let vol = Math.max(0, num(opts.volume, 1)) * (def.gain ?? 1);
      let pan = clamp(num(opts.pan, 0), -1, 1);
      let lp = def.lp || 0;
      if (opts.pos && typeof opts.pos === 'object') {
        const sp = this._spatial(opts.pos);
        if (!sp) return;
        vol *= sp.gain;
        pan = clamp(pan + sp.pan, -1, 1);
        if (sp.lp) lp = lp ? Math.min(lp, sp.lp) : sp.lp;
      }
      if (this._reduceLoud && LOUD.has(key)) vol *= LOUD_REDUCTION;
      if (vol < 0.002) return;
      this._lastPlay.set(key, now);
      let pitch = clamp(num(opts.pitch, 1), 0.25, 4);
      if (def.vary) pitch *= 1 + (Math.random() * 2 - 1) * def.vary;
      const v = new Voice(this, {
        gain: vol, pan, pitch, lp, rev: def.rev ?? 0.2,
        bus: (route && route.bus) || this._sfxBus,
        send: (route && route.send) || this._sfxSend,
      });
      try {
        def.fn(v, now + 0.005);
      } finally {
        v.seal();
      }
    } catch (err) {
      this._warnOnce('err:' + key, `[AudioManager] failed to play "${key}": ${err && err.message}`);
    }
  }

  /** Pick the source for a track (user file > playlist file > synth) and crossfade to it. */
  _startMusic(name) {
    const token = ++this._musicToken;
    if (!name) {
      this._switchMusic(null);
      return;
    }
    const user = this._userMusic.get(name) || this._userMusic.get('all');
    if (user) {
      this._switchMusic(name, user);
      return;
    }
    const decide = () => {
      if (token !== this._musicToken) return;
      const url = this._playlist && (this._playlist[name] || this._playlist.all);
      if (!url) {
        this._switchMusic(name);
        return;
      }
      // keep the current music playing until the file is decoded
      this._fetchBuffer(url).then((buffer) => {
        if (token !== this._musicToken) return;
        const file = decodeURIComponent(url.split('/').pop() || url);
        this._switchMusic(name, buffer ? { buffer, name: file } : null);
      });
    };
    if (this._playlistReady) decide();
    else this._loadPlaylist().then(decide);
  }

  /** Crossfade from the current music to a synth track or a decoded file ({ buffer, name }). */
  _switchMusic(name, custom = null) {
    try {
      const t = this.ctx.currentTime;
      const cur = this._music;
      if (cur && custom && cur.buffer === custom.buffer && cur.stopAt === Infinity) {
        cur.name = name; // same file already looping (e.g. "all"): keep it going
        return;
      }
      if (cur) cur.fadeOut(t, MUSIC_FADE);
      this._music = null;
      if (!name) return;
      const tr = custom ? new FileTrack(this, name, custom) : new MusicTrack(this, name, TRACKS[name]);
      tr.begin(t);
      tr.setIntensity(this._intensity, t);
      this._music = tr;
      this._tracks.push(tr);
    } catch (err) {
      this._warnOnce('music-err', '[AudioManager] music error: ' + (err && err.message));
    }
  }

  /** Re-evaluate the current track after user files were added or cleared. */
  _refreshMusic() {
    if (!this.ctx || !this._musicName) return;
    const cur = this._music;
    const user = this._userMusic.get(this._musicName) || this._userMusic.get('all');
    if (cur && !cur.label && !user) return; // built-in track keeps playing
    if (cur && user && cur.buffer === user.buffer) return;
    this._startMusic(this._musicName);
  }

  /** Fetch music/playlist.json once (relative to the page). Missing/invalid -> built-in music. */
  _loadPlaylist() {
    if (this._playlistP) return this._playlistP;
    const done = (map) => {
      if (this._playlistReady) return;
      this._playlist = map;
      this._playlistReady = true;
    };
    let base = null;
    try {
      if (typeof fetch === 'function' && typeof document !== 'undefined' && document.baseURI) {
        base = new URL('music/playlist.json', document.baseURI);
      }
    } catch (e) {
      base = null;
    }
    if (!base || !/^https?:$/.test(base.protocol)) {
      done({});
      this._playlistP = Promise.resolve();
      return this._playlistP;
    }
    const fail = (why) => {
      this._warnOnce('playlist', `[AudioManager] music/playlist.json not used (${why}); using built-in music`);
      done({});
    };
    let timer = 0;
    const load = fetch(base.href, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((json) => {
        const map = {};
        const tracks = json && typeof json.tracks === 'object' && json.tracks ? json.tracks : {};
        for (const [key, file] of Object.entries(tracks)) {
          if (typeof file !== 'string' || !file.trim()) continue;
          if (key === 'all' || own(TRACKS, key)) map[key] = new URL(file.trim(), base).href;
          else this._warnOnce('playlist:' + key, `[AudioManager] playlist.json: unknown track "${key}"`);
        }
        done(map);
      })
      .catch((err) => fail((err && err.message) || 'invalid'))
      .then(() => clearTimeout(timer));
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        fail('timed out');
        resolve();
      }, PLAYLIST_TIMEOUT);
    });
    this._playlistP = Promise.race([load, timeout]);
    return this._playlistP;
  }

  /** Fetch + decode a music file once; resolves null (after one warning) on failure. */
  _fetchBuffer(url) {
    let p = this._fileCache.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        })
        .then((data) => this._decode(data))
        .catch((err) => {
          this._warnOnce('file:' + url, `[AudioManager] Could not load music "${url}" (${(err && err.message) || err}); using built-in track`);
          return null;
        });
      this._fileCache.set(url, p);
      if (this._fileCache.size > 4) this._fileCache.delete(this._fileCache.keys().next().value);
    }
    return p;
  }

  /** decodeAudioData with both the promise and the legacy callback forms. */
  _decode(data) {
    return new Promise((resolve, reject) => {
      const fail = (e) => reject(e || new Error('unable to decode audio data'));
      try {
        const p = this.ctx.decodeAudioData(data, resolve, fail);
        if (p && typeof p.then === 'function') p.then(resolve, fail);
      } catch (e) {
        fail(e);
      }
    });
  }

  _startAmbience(name) {
    try {
      const t = this.ctx.currentTime;
      if (this._amb) this._amb.fadeOut(t, AMB_FADE);
      this._amb = null;
      if (!name) return;
      const b = new Ambience(this, name, AMBIENCES[name]);
      b.begin(t);
      this._amb = b;
      this._ambs.push(b);
    } catch (err) {
      this._warnOnce('amb-err', '[AudioManager] ambience error: ' + (err && err.message));
    }
  }
}

export default AudioManager;
