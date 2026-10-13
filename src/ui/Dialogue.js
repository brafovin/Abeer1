// Dialogue panels (blocking conversations with choices) and non-blocking monologue lines.
import { CHARACTERS } from '../entities/characters.js';
import { escapeHtml as esc } from '../core/utils.js';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export class Dialogue {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.queue = [];
    this.el = null;
    this.onDone = null;
    this.typing = false;
    this.monoEl = null;
  }

  /** Blocking dialogue. lines: [{ speaker, sub, text, choices: [{ text, action, next, disabled, danger }], onShow }] */
  start(lines, onDone) {
    const g = this.game;
    if (this.active) {
      // chain after the current conversation
      const prevDone = this.onDone;
      this.queue.push(...lines);
      this.onDone = () => {
        prevDone?.();
        onDone?.();
      };
      return;
    }
    this.active = true;
    this.queue = [...lines];
    this.onDone = onDone;
    this.prevState = g.state;
    g.state = 'dialogue';
    g.input.clearHeld();
    g._ignoreUnlock = true;
    g.input.exitLock();
    this.el = h(`<div class="panel dialogue"><div class="panel-body"><div class="speaker"></div><div class="text"></div><div class="choices"></div><div class="cont">▶ Continue [F / Space / Click]</div></div></div>`);
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('.choice')) return;
      this.advance();
    });
    g.ui.layers.panels.appendChild(this.el);
    this.next();
  }

  next() {
    const line = this.queue.shift();
    if (!line) return this.finish();
    this.line = line;
    try {
      line.onShow?.();
    } catch (err) {
      console.error(err);
    }
    const sp = this.el.querySelector('.speaker');
    sp.innerHTML = `${esc(line.speaker ?? '')}${line.sub ? `<small>${esc(line.sub)}</small>` : ''}`;
    const textEl = this.el.querySelector('.text');
    textEl.classList.toggle('mono', !!line.mono);
    const choicesEl = this.el.querySelector('.choices');
    choicesEl.innerHTML = '';
    this.el.querySelector('.cont').style.visibility = line.choices ? 'hidden' : 'visible';
    // typewriter
    const full = line.text ?? '';
    this.typing = true;
    let i = 0;
    textEl.textContent = '';
    clearInterval(this.typeTimer);
    this.typeTimer = setInterval(() => {
      i += 2;
      textEl.textContent = full.slice(0, i);
      if (i >= full.length) this.finishTyping();
    }, 16);
    this.fullText = full;
    this.game.audio.play('ui_hover', { volume: 0.4 });
  }

  finishTyping() {
    clearInterval(this.typeTimer);
    this.typing = false;
    this.el.querySelector('.text').textContent = this.fullText;
    const line = this.line;
    if (line?.choices) {
      const choicesEl = this.el.querySelector('.choices');
      choicesEl.innerHTML = '';
      line.choices.forEach((c, idx) => {
        const b = h(`<button class="choice ${c.danger ? 'danger' : ''}" ${c.disabled ? 'disabled' : ''}><span class="num">${idx + 1}</span>${esc(c.text)}</button>`);
        b.addEventListener('click', () => this.choose(idx));
        b.addEventListener('mouseenter', () => this.game.audio.play('ui_hover', { volume: 0.4 }));
        choicesEl.appendChild(b);
      });
    }
  }

  choose(idx) {
    const c = this.line?.choices?.[idx];
    if (!c || c.disabled || this.typing) return;
    this.game.audio.play('ui_click');
    try {
      c.action?.();
    } catch (err) {
      console.error('[Dialogue] choice action failed', err);
    }
    if (c.next) this.queue.unshift(...(Array.isArray(c.next) ? c.next : [c.next]));
    this.next();
  }

  advance() {
    if (!this.active) return;
    if (this.typing) return this.finishTyping();
    if (this.line?.choices) return;
    this.game.audio.play('ui_click', { volume: 0.5 });
    this.next();
  }

  finish() {
    clearInterval(this.typeTimer);
    this.el?.remove();
    this.el = null;
    this.active = false;
    const g = this.game;
    if (g.state === 'dialogue') g.state = this.prevState === 'dialogue' ? 'playing' : this.prevState;
    const cb = this.onDone;
    this.onDone = null;
    try {
      cb?.();
    } catch (err) {
      console.error('[Dialogue] onDone failed', err);
    }
    if (g.state === 'playing') g.input.requestLock();
  }

  /** Abort any conversation without running callbacks. */
  cancel() {
    clearInterval(this.typeTimer);
    clearTimeout(this.monoTimer);
    this.el?.remove();
    this.monoEl?.remove();
    this.el = null;
    this.active = false;
    this.queue = [];
    this.onDone = null;
  }

  onKey(e) {
    if (!this.active) return;
    if (e.code === 'KeyF' || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault?.();
      this.advance();
    } else if (/^Digit[1-9]$/.test(e.code) && this.line?.choices) {
      if (this.typing) this.finishTyping();
      this.choose(+e.code.slice(5) - 1);
    }
  }

  /** Non-blocking inner monologue of the player character. */
  monologue(text, cb) {
    const name = CHARACTERS[this.game.player?.charId]?.name.split(' ')[0] ?? '';
    this.say(name, text, cb, true);
  }

  /** Non-blocking line that fades out on its own. */
  say(speaker, text, cb, mono = false) {
    const g = this.game;
    this.monoEl?.remove();
    clearTimeout(this.monoTimer);
    const el = h(`<div class="panel dialogue" style="pointer-events:none;bottom:120px;width:min(720px,calc(100vw - 40px))"><div class="panel-body" style="padding:12px 20px"><div class="speaker">${esc(speaker)}</div><div class="text ${mono ? 'mono' : ''}" style="font-size:19px;min-height:0">${esc(text)}</div></div></div>`);
    g.ui.layers.world.appendChild(el);
    this.monoEl = el;
    const dur = Math.min(9000, 2600 + text.length * 45);
    this.monoTimer = setTimeout(() => {
      el.style.transition = 'opacity 0.6s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 650);
      try {
        cb?.();
      } catch (err) {
        console.error(err);
      }
    }, dur);
  }
}
