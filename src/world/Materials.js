// Procedural textures (canvas-generated) and shared environment materials.
// Everything is generated at runtime — no external image files are required.
import * as THREE from 'three';
import { seeded } from '../core/utils.js';

// ── tileable value noise ─────────────────────────────────────────────────────────────────────────
function makeNoise(period, seed) {
  const rng = seeded(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = grid[y0 * period + x0], b = grid[y0 * period + x1];
    const c = grid[y1 * period + x0], d = grid[y1 * period + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(noises, x, y) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (const nz of noises) {
    s += nz(x * f, y * f) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / n;
}

/**
 * Generic generator: fn(u, v, ctx) -> [r, g, b, height] in 0..1 (u, v in pixels).
 * Produces a colour texture and a normal map derived from the height channel.
 */
function generate(size, fn, { normalStrength = 2.5, seed = 1 } = {}) {
  const color = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const noises = [makeNoise(8, seed), makeNoise(16, seed + 1), makeNoise(32, seed + 2), makeNoise(64, seed + 3)];
  const ctx = { size, noise: (x, y) => fbm(noises, (x / size) * 8, (y / size) * 8), n1: noises[0], n2: noises[1], n3: noises[2], rng: seeded(seed + 99) };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, h] = fn(x, y, ctx);
      const i = y * size + x;
      color[i * 4] = r * 255;
      color[i * 4 + 1] = g * 255;
      color[i * 4 + 2] = b * 255;
      color[i * 4 + 3] = 255;
      height[i] = h;
    }
  }
  const normal = new Uint8ClampedArray(size * size * 4);
  const H = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * normalStrength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * normalStrength;
      const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      normal[i] = (-dx * nz * 0.5 + 0.5) * 255;
      normal[i + 1] = (dy * nz * 0.5 + 0.5) * 255;
      normal[i + 2] = (nz * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  const toTex = (data, srgb) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    cv.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: toTex(color, true), normalMap: toTex(normal, false) };
}

const mix = (a, b, t) => a + (b - a) * t;

// ── texture recipes ──────────────────────────────────────────────────────────────────────────────

function stoneBlocks(size = 256, base = [0.36, 0.34, 0.38], seed = 3) {
  const rows = 8, cols = 4;
  const bh = size / rows, bw = size / cols;
  const tint = {};
  const rng = seeded(seed);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols + 1; c++) tint[r + ':' + c] = rng.range(0.78, 1.12);
  return generate(size, (x, y, k) => {
    const row = Math.floor(y / bh);
    const off = row % 2 ? bw / 2 : 0;
    const col = Math.floor((x + off) / bw);
    const lx = (x + off) % bw, ly = y % bh;
    const edge = Math.min(lx, bw - lx, ly, bh - ly);
    const mortar = edge < 2.2;
    const bevel = Math.min(1, edge / 6);
    const n = k.noise(x, y);
    const t = tint[row + ':' + (col % (cols + 1))] ?? 1;
    if (mortar) {
      const m = 0.16 + n * 0.08;
      return [m, m * 0.95, m * 1.02, 0.0];
    }
    const s = (0.55 + n * 0.6) * t;
    const crack = k.n3((x / size) * 32, (y / size) * 32) > 0.82 ? 0.7 : 1;
    return [base[0] * s * crack, base[1] * s * crack, base[2] * s * crack, 0.5 + bevel * 0.4 + n * 0.25];
  }, { seed, normalStrength: 3 });
}

function floorTiles(size = 256, seed = 5) {
  const n = 4;
  const ts = size / n;
  return generate(size, (x, y, k) => {
    const tx = Math.floor(x / ts), ty = Math.floor(y / ts);
    const lx = x % ts, ly = y % ts;
    const edge = Math.min(lx, ts - lx, ly, ts - ly);
    const checker = (tx + ty) % 2;
    const nz = k.noise(x, y);
    const vein = Math.abs(Math.sin((x * 0.05 + y * 0.03) + nz * 6)) < 0.08 ? 0.75 : 1;
    if (edge < 1.6) return [0.08, 0.07, 0.08, 0];
    const c = checker ? 0.42 : 0.16;
    const v = (c + nz * 0.18) * vein;
    return [v * 1.02, v * 0.95, v * 1.0, 0.6 + nz * 0.2];
  }, { seed, normalStrength: 2 });
}

function cobblestone(size = 256, seed = 9) {
  // jittered voronoi cells
  const rng = seeded(seed);
  const cells = 7;
  const pts = [];
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) pts.push([(i + rng.range(0.2, 0.8)) / cells * size, (j + rng.range(0.2, 0.8)) / cells * size, rng.range(0.7, 1.15)]);
  return generate(size, (x, y, k) => {
    let d1 = 1e9, d2 = 1e9, tint = 1;
    for (const [px, py, t] of pts) {
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const dx = x - (px + ox * size), dy = y - (py + oy * size);
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          tint = t;
        } else if (d < d2) d2 = d;
      }
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    const nz = k.noise(x, y);
    if (edge < 2.5) return [0.07, 0.065, 0.06, 0];
    const h = Math.min(1, edge / 14);
    const v = (0.24 + nz * 0.22) * tint;
    return [v * 1.0, v * 0.96, v * 0.95, h * 0.8 + nz * 0.2];
  }, { seed, normalStrength: 3.5 });
}

function dirt(size = 256, seed = 11, palette = 'forest') {
  return generate(size, (x, y, k) => {
    const n = k.noise(x, y);
    const n2 = k.n3((x / size) * 64, (y / size) * 64);
    let r, g, b;
    if (palette === 'forest') {
      r = mix(0.1, 0.22, n); g = mix(0.08, 0.17, n); b = mix(0.08, 0.14, n);
      if (n2 > 0.72) { r *= 1.5; g *= 1.1; b *= 0.8; } // dead leaves
      if (n2 < 0.18) { r *= 0.7; g *= 0.85; b *= 0.8; } // moss
    } else if (palette === 'ash') {
      const v = mix(0.12, 0.26, n);
      r = v * 1.02; g = v * 0.97; b = v * 0.98;
      if (n2 > 0.78) { r *= 0.6; g *= 0.6; b *= 0.62; }
    } else {
      r = mix(0.16, 0.3, n); g = mix(0.12, 0.22, n); b = mix(0.12, 0.2, n);
    }
    return [r, g, b, n * 0.7 + n2 * 0.3];
  }, { seed, normalStrength: 2 });
}

function woodPlanks(size = 256, seed = 13, base = [0.27, 0.17, 0.12]) {
  const planks = 4;
  const pw = size / planks;
  return generate(size, (x, y, k) => {
    const p = Math.floor(x / pw);
    const lx = x % pw;
    const grain = Math.sin(y * 0.08 + k.n2((x / size) * 16, (y / size) * 4) * 10 + p * 3) * 0.5 + 0.5;
    const nz = k.noise(x, y);
    if (lx < 1.5) return [0.05, 0.035, 0.03, 0];
    const v = 0.65 + grain * 0.25 + nz * 0.3;
    return [base[0] * v, base[1] * v, base[2] * v, 0.5 + grain * 0.3];
  }, { seed, normalStrength: 1.5 });
}

function bark(size = 128, seed = 17) {
  return generate(size, (x, y, k) => {
    const ridge = Math.abs(Math.sin(x * 0.3 + k.n2((x / size) * 8, (y / size) * 2) * 6));
    const nz = k.noise(x, y);
    const v = 0.08 + ridge * 0.12 + nz * 0.08;
    return [v * 1.05, v * 0.95, v * 0.95, ridge * 0.8 + nz * 0.2];
  }, { seed, normalStrength: 4 });
}

function plaster(size = 256, seed = 19) {
  return generate(size, (x, y, k) => {
    const n = k.noise(x, y);
    const stain = Math.max(0, k.n2((x / size) * 4, (y / size) * 8) - 0.55) * 1.5;
    const v = mix(0.36, 0.5, n) - stain * 0.25;
    return [v * 1.0, v * 0.95, v * 0.9, n * 0.4];
  }, { seed, normalStrength: 1.2 });
}

function roofTiles(size = 256, seed = 23) {
  const rows = 10;
  const rh = size / rows;
  return generate(size, (x, y, k) => {
    const row = Math.floor(y / rh);
    const off = row % 2 ? rh * 0.8 : 0;
    const lx = (x + off) % (rh * 1.6);
    const ly = y % rh;
    const curve = Math.sin((lx / (rh * 1.6)) * Math.PI);
    const nz = k.noise(x, y);
    const v = (0.14 + curve * 0.08 + nz * 0.1) * (ly < 2 ? 0.4 : 1);
    return [v * 1.15, v * 0.85, v * 0.85, curve * 0.6 + (ly / rh) * 0.4];
  }, { seed, normalStrength: 3 });
}

/** Stained glass: emissive window texture (gothic lancet panes). */
function stainedGlass(palette, seed = 29) {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size * 2;
  const ctx = cv.getContext('2d');
  const rng = seeded(seed);
  ctx.fillStyle = '#050304';
  ctx.fillRect(0, 0, size, size * 2);
  const cells = 9;
  for (let i = 0; i < 160; i++) {
    const x = rng.range(0, size), y = rng.range(0, size * 2);
    const r = rng.range(16, 42);
    ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
    ctx.beginPath();
    const sides = 5 + Math.floor(rng() * 3);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + rng() * 0.4;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  // rose / central motif
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = palette[0];
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.55, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette[palette.length - 1];
  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(size / 2 + Math.cos(a) * size * 0.12, size * 0.55 + Math.sin(a) * size * 0.12, size * 0.06, size * 0.03, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // lead lines
  ctx.strokeStyle = '#080506';
  ctx.lineWidth = 4;
  for (let i = 0; i < cells; i++) {
    ctx.beginPath();
    ctx.moveTo(rng.range(0, size), 0);
    ctx.lineTo(rng.range(0, size), size * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, rng.range(0, size * 2));
    ctx.lineTo(size, rng.range(0, size * 2));
    ctx.stroke();
  }
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, size, size * 2);
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.55, size * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Radial soft sprite used for particles, glows, flames. */
function softSprite(size = 64, power = 2.2) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    g.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, power).toFixed(3)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function fogSprite(size = 128, seed = 31) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const nz = makeNoise(8, seed), nz2 = makeNoise(16, seed + 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5, dy = y / size - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const n = nz((x / size) * 4, (y / size) * 4) * 0.6 + nz2((x / size) * 8, (y / size) * 8) * 0.4;
      const a = Math.max(0, 1 - d) ** 1.6 * (0.4 + n * 0.8);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function moonTexture(size = 256, seed = 37) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = makeNoise(8, seed), n2 = makeNoise(32, seed + 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5, dy = y / size - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const i = (y * size + x) * 4;
      if (d > 1) {
        img.data[i + 3] = 0;
        continue;
      }
      const maria = n1((x / size) * 5, (y / size) * 5);
      const crater = n2((x / size) * 20, (y / size) * 20);
      const limb = Math.pow(1 - d * d, 0.25);
      const v = (0.65 + maria * 0.35 - (crater > 0.7 ? 0.15 : 0)) * limb;
      img.data[i] = Math.min(255, 255 * v);
      img.data[i + 1] = Math.min(255, 255 * v * 0.92);
      img.data[i + 2] = Math.min(255, 255 * v * 0.92);
      img.data[i + 3] = Math.min(255, 255 * Math.min(1, (1 - d) * 30));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function verticalGradient(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = 8;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function runeCircle(size = 256, color = '#ff2a3a') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const c = size / 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * 0.018;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.04;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = size * 0.01;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  // star / rune marks
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = (i * 3 * Math.PI * 2) / 7 - Math.PI / 2;
    const x = c + Math.cos(a) * size * 0.37, y = c + Math.sin(a) * size * 0.37;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.font = `${Math.floor(size * 0.05)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.save();
    ctx.translate(c + Math.cos(a) * size * 0.42, c + Math.sin(a) * size * 0.42);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(glyphs[i % glyphs.length], 0, 0);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── registry ─────────────────────────────────────────────────────────────────────────────────────

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export const Tex = {
  soft: () => cached('soft', () => softSprite(64, 2.2)),
  softHard: () => cached('softHard', () => softSprite(64, 1.2)),
  fog: () => cached('fog', () => fogSprite()),
  moon: () => cached('moon', () => moonTexture()),
  shaft: () => cached('shaft', () => verticalGradient()),
  rune: (color = '#ff2a3a') => cached('rune' + color, () => runeCircle(256, color)),
  glassCrimson: () => cached('glassC', () => stainedGlass(['#b3122a', '#5e0d3d', '#2b1a6e', '#d18a2a', '#7a0a18', '#3a2a8a'], 29)),
  glassViolet: () => cached('glassV', () => stainedGlass(['#4b2a9a', '#1f3a8a', '#8a1a4a', '#2a6a9a', '#6a1a7a'], 41)),
};

function stdMat(key, texFn, opts = {}) {
  return cached('mat:' + key, () => {
    const t = texFn();
    return new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      normalScale: new THREE.Vector2(opts.normal ?? 1, opts.normal ?? 1),
      roughness: opts.roughness ?? 0.92,
      metalness: opts.metalness ?? 0,
      color: opts.color ?? 0xffffff,
      side: opts.side ?? THREE.FrontSide,
    });
  });
}

export const Mat = {
  stone: () => stdMat('stone', () => cached('t:stone', () => stoneBlocks(256, [0.36, 0.34, 0.38], 3))),
  stoneDark: () => stdMat('stoneDark', () => cached('t:stone', () => stoneBlocks(256, [0.36, 0.34, 0.38], 3)), { color: 0x6a6470 }),
  stoneWarm: () => stdMat('stoneWarm', () => cached('t:stoneW', () => stoneBlocks(256, [0.42, 0.36, 0.33], 7))),
  floor: () => stdMat('floor', () => cached('t:floor', () => floorTiles()), { roughness: 0.55 }),
  cobble: () => stdMat('cobble', () => cached('t:cobble', () => cobblestone())),
  forestGround: () => stdMat('forestGround', () => cached('t:dirtF', () => dirt(256, 11, 'forest'))),
  ashGround: () => stdMat('ashGround', () => cached('t:dirtA', () => dirt(256, 12, 'ash'))),
  dirt: () => stdMat('dirt', () => cached('t:dirtD', () => dirt(256, 15, 'path'))),
  wood: () => stdMat('wood', () => cached('t:wood', () => woodPlanks())),
  woodDark: () => stdMat('woodDark', () => cached('t:wood', () => woodPlanks()), { color: 0x6a5a55 }),
  bark: () => stdMat('bark', () => cached('t:bark', () => bark())),
  plaster: () => stdMat('plaster', () => cached('t:plaster', () => plaster())),
  roof: () => stdMat('roof', () => cached('t:roof', () => roofTiles())),
  iron: () => cached('mat:iron', () => new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.8 })),
  gold: () => cached('mat:gold', () => new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.35, metalness: 0.9 })),
  cloth: (color = 0x5a0a16) => cached('mat:cloth' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })),
  black: () => cached('mat:black', () => new THREE.MeshStandardMaterial({ color: 0x0a080b, roughness: 1 })),
  basic: (color) => cached('mat:basic' + color, () => new THREE.MeshBasicMaterial({ color })),
  wax: () => cached('mat:wax', () => new THREE.MeshStandardMaterial({ color: 0xcfc2ae, emissive: 0x3a2410, roughness: 0.6 })),
  glass: (which = 'crimson') =>
    cached('mat:glass' + which, () => new THREE.MeshBasicMaterial({ map: which === 'violet' ? Tex.glassViolet() : Tex.glassCrimson(), color: new THREE.Color(1.6, 1.4, 1.5), toneMapped: false, side: THREE.DoubleSide })),
  emissive: (color, intensity = 2) =>
    cached('mat:em' + color + ':' + intensity, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false })),
  additive: (color, opacity = 0.5, tex = null) =>
    cached('mat:add' + color + ':' + opacity + ':' + (tex ? tex.uuid : ''), () =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, map: tex, side: THREE.DoubleSide, fog: false }),
    ),
};

// ── UV helpers (keep texel density consistent regardless of mesh size) ─────────────────────────────

export function boxUV(geo, w, h, d, scale = 2) {
  const uv = geo.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z ; 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / scale, uv.getY(i) * dims[f][1] / scale);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

/** Warm up the expensive procedural textures (call during loading screens). */
export function prewarmMaterials(list) {
  for (const name of list) {
    if (Mat[name]) Mat[name]();
  }
}
