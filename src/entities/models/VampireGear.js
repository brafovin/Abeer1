// Archetype gear for the vampires of Castle Nocturne: face markings, headgear, shoulders, backs
// (capes, cloaks, bat wings), outfit kits (plate armour, assassin harness, sorcerer robes, ancient rags)
// and weapons. Everything is built from the shared toon/strand helpers so it matches the heroes.
import * as THREE from 'three';
import { toon, glow, flat, part, limb, lathe, strandGeometry, bladeGeometry } from './Toon.js';

const BONE = 0xcfc6b4;
const lerpHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
const up = new THREE.Vector3(0, 1, 0);

// ───────────────────────────────────────────── face markings ────────────────────────────────────

/** z of the face surface at head-local (x, y) — matches headGeometry's deformation closely enough for decals. */
export function faceZ(r, f, x, y) {
  const w = f.width ?? 0.9, h = f.height ?? 1.12;
  const u = x / (r * w), v = y / (r * h);
  const d = 1 - u * u - v * v;
  let z = d > 0 ? r * Math.sqrt(d) : 0;
  if (z > r * 0.55 && y > -r * 0.2) z = r * 0.55 + (z - r * 0.55) * 0.75;
  return z;
}

/** A polyline decal that hugs the face: thin cylinders between surface points. */
function decalLine(head, r, f, pts, width, mat, lift = 0.0032) {
  const P = pts.map(([x, y]) => new THREE.Vector3(x, y, faceZ(r, f, x, y) + lift));
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const m = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.5, width * 0.5, a.distanceTo(b), 4), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    m.userData.outline = false;
    m.userData.static = true;
    head.add(m);
  }
}

/** Scars, veins, glowing runes, war paint, hollow sockets, a gaping maw and a bat nose. */
export function buildFaceExtras(head, r, f, marks, c, rng) {
  const eyeY = f.eyeY ?? -0.012, eyeX = f.eyeX ?? 0.04;
  const mouthY = eyeY - (f.mouthDrop ?? 0.062);
  const has = (k) => marks.includes(k);
  const eyeW = f.eyeW ?? 0.024, eyeH = f.eyeH ?? 0.0165;
  if (has('hollow')) {
    const dark = flat(0x2a1020), shade = flat(0x5a3446);
    for (const s of [1, -1]) {
      part(head, new THREE.SphereGeometry(1, 14, 10), dark, { pos: [eyeX * s, eyeY - 0.002, faceZ(r, f, eyeX * s, eyeY) + 0.0022], rot: [0, 0.32 * s, 0], scale: [eyeW * 1.28, eyeH * 1.55, 0.004], outline: false });
      part(head, new THREE.SphereGeometry(1, 10, 8), shade, { pos: [0.06 * s, eyeY - 0.052, faceZ(r, f, 0.06 * s, eyeY - 0.052) + 0.002], rot: [0, 0.55 * s, 0], scale: [0.02, 0.015, 0.004], outline: false });
    }
  }
  if (has('scar')) {
    const s = rng() < 0.5 ? 1 : -1;
    const sc = flat(0x8a2434);
    const x = eyeX * s;
    decalLine(head, r, f, [[x + 0.012 * s, eyeY + 0.052], [x + 0.004 * s, eyeY + 0.02], [x - 0.004 * s, eyeY - 0.018], [x - 0.012 * s, eyeY - 0.05]], 0.0036, sc);
    for (let i = 0; i < 3; i++) {
      const y = eyeY + 0.03 - i * 0.026;
      decalLine(head, r, f, [[x - 0.008 * s + 0.004 * s * (1 - i), y], [x + 0.008 * s + 0.004 * s * (1 - i), y + 0.003]], 0.0022, flat(0xe0b8b8));
    }
  }
  if (has('veins')) {
    const vm = flat(0x4a2c58);
    for (const s of [1, -1]) {
      const dirs = [[0.8, 0.6], [1, -0.05], [0.55, -0.85]];
      dirs.forEach(([dx, dy], bi) => {
        let x = eyeX * s + eyeW * 0.9 * s, y = eyeY + (bi === 0 ? 0.008 : bi === 1 ? 0.0 : -0.01);
        const pts = [[x, y]];
        let ang = Math.atan2(dy, dx * s);
        for (let k = 0; k < 4; k++) {
          ang += (rng() - 0.5) * 0.9;
          x += Math.cos(ang) * 0.014 * (1 - k * 0.1);
          y += Math.sin(ang) * 0.014;
          if (Math.abs(x) > r * 0.85) break;
          pts.push([x, y]);
        }
        if (pts.length > 1) decalLine(head, r, f, pts, 0.0024 - bi * 0.0003, vm, 0.0028);
      });
    }
    // a few veins creeping over the scalp
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 0.035;
      decalLine(head, r, f, [[ox, 0.06], [ox + (rng() - 0.5) * 0.02, 0.085], [ox + (rng() - 0.5) * 0.03, 0.105]], 0.002, vm, 0.0028);
    }
  }
  if (has('runes')) {
    const gm = glow(c.accent, 2.4);
    const z = faceZ(r, f, 0, 0.078) + 0.004;
    part(head, new THREE.TorusGeometry(0.0115, 0.0011, 5, 20), gm, { pos: [0, 0.078, z], rot: [-0.32, 0, 0], outline: false });
    decalLine(head, r, f, [[0, 0.062], [0, 0.094]], 0.0016, gm, 0.004);
    decalLine(head, r, f, [[-0.012, 0.066], [0.012, 0.09]], 0.0014, gm, 0.004);
    decalLine(head, r, f, [[0.012, 0.066], [-0.012, 0.09]], 0.0014, gm, 0.004);
    for (const s of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const x = (0.06 + k * 0.008) * s, y = eyeY - 0.03 - k * 0.012;
        part(head, new THREE.SphereGeometry(0.0022, 5, 4), gm, { pos: [x, y, faceZ(r, f, x, y) + 0.003], outline: false });
      }
    }
  }
  if (has('paint')) {
    const pm = flat(0x1a0508);
    for (const s of [1, -1]) {
      for (let k = 0; k < 2; k++) {
        const x = (eyeX + 0.004 + k * 0.012) * s;
        decalLine(head, r, f, [[x, eyeY - 0.03], [x + 0.002 * s, eyeY - 0.062 - k * 0.006]], 0.005, pm, 0.003);
      }
    }
    decalLine(head, r, f, [[-0.06, eyeY + 0.006], [0, eyeY + 0.012], [0.06, eyeY + 0.006]], 0.0045, pm, 0.0028);
  }
  if (has('maw')) {
    const mz = faceZ(r, f, 0, mouthY) + 0.0035;
    part(head, new THREE.SphereGeometry(1, 16, 10), flat(0x1a0306), { pos: [0, mouthY - 0.004, mz], scale: [0.033, 0.017, 0.006], outline: false });
    const tooth = flat(0xe8e0d2);
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 0.0088;
      const big = i % 2 === 0;
      part(head, new THREE.ConeGeometry(0.0021, big ? 0.011 : 0.008, 4), tooth, { pos: [x, mouthY + 0.0035 - (big ? 0.0055 : 0.004), mz + 0.002], rot: [Math.PI, 0, 0], outline: false });
      part(head, new THREE.ConeGeometry(0.002, big ? 0.008 : 0.006, 4), tooth, { pos: [x * 0.92, mouthY - 0.0115 + (big ? 0.004 : 0.003), mz + 0.002], outline: false });
    }
  }
  if (f.batNose) {
    const nz = faceZ(r, f, 0, eyeY - 0.03) + 0.003;
    const dm = flat(0x1a0a12);
    for (const s of [1, -1]) part(head, new THREE.SphereGeometry(1, 8, 6), dm, { pos: [0.0075 * s, eyeY - 0.034, nz], rot: [0, 0, -0.5 * s], scale: [0.0026, 0.0075, 0.003], outline: false });
    part(head, new THREE.ConeGeometry(0.005, 0.018, 3), toon(f.skinColor ?? 0xb4b2bd), { pos: [0, eyeY - 0.02, nz - 0.001], rot: [0.2, 0, 0], outline: false });
  }
}

// ───────────────────────────────────────────── headgear ─────────────────────────────────────────

function hornPath(kind, s) {
  if (kind === 'ram') return [[0.07 * s, 0.08, 0.01], [0.13 * s, 0.1, -0.02], [0.155 * s, 0.045, -0.085], [0.115 * s, -0.025, -0.115]];
  if (kind === 'small') return [[0.05 * s, 0.1, 0.02], [0.075 * s, 0.15, 0.01], [0.085 * s, 0.205, -0.02], [0.065 * s, 0.245, -0.05]];
  return [[0.06 * s, 0.09, 0.0], [0.115 * s, 0.14, -0.02], [0.14 * s, 0.23, -0.06], [0.11 * s, 0.31, -0.1]];
}

function crownBand(head, mat, o) {
  const g = new THREE.Group();
  g.position.set(0, o.y ?? 0.105, o.z ?? -0.01);
  g.rotation.x = o.tilt ?? 0;
  head.add(g);
  part(g, new THREE.CylinderGeometry(o.r ?? 0.098, (o.r ?? 0.098) + 0.007, o.band ?? 0.035, 18, 1, true), toon(o.color, { side: THREE.DoubleSide, rim: 1.6 }), { outline: 0.003 });
  const n = o.n ?? 8;
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2, h = o.heights[i % o.heights.length];
    part(g, new THREE.ConeGeometry(o.w ?? 0.014, h, 4), mat, { pos: [Math.sin(an) * (o.r ?? 0.098), h / 2 + 0.012, Math.cos(an) * (o.r ?? 0.098)], rot: [Math.cos(an) * 0.12, 0, -Math.sin(an) * 0.12], outline: 0.002 });
  }
  return g;
}

export function buildHeadgear(j, R, a, c, rng, f) {
  const kind = a.headgear;
  if (!kind || kind === 'none') return;
  const head = j.head;
  const metal = toon(c.armor ?? 0x3a3f4a, { rim: 1.6 });
  const trimM = toon(c.trim, { rim: 1.6 });
  const gem = glow(c.accent, 2.6);
  const bone = toon(a.boneColor ?? lerpHex(BONE, c.dark, 0.25), { rim: 1.0 });
  const horn = (path, w, mat = bone) => part(head, strandGeometry(path, { width: w, thick: 1, segments: 10, radial: 6, taper: 0.85, center: [0, 0, 0] }), mat, { outline: 0.003 });

  if (kind === 'crown') {
    const gold = toon(a.crownColor ?? c.trim, { rim: 1.8 });
    const g = crownBand(head, gold, { color: a.crownColor ?? c.trim, heights: [0.09, 0.05] });
    part(g, new THREE.OctahedronGeometry(0.018), gem, { pos: [0, 0.04, 0.105], scale: [0.8, 1.3, 0.5], outline: false });
  } else if (kind === 'spikedCrown') {
    const iron = toon(lerpHex(c.armor ?? 0x2a2228, 0x000000, 0.2), { rim: 1.8 });
    const g = crownBand(head, iron, { color: c.armor ?? 0x2a2228, tilt: -0.12, r: 0.1, n: 9, w: 0.011, heights: [0.17, 0.085, 0.13, 0.075], band: 0.04 });
    part(g, new THREE.OctahedronGeometry(0.017), gem, { pos: [0, 0.035, 0.108], scale: [0.7, 1.5, 0.5], outline: false });
    for (const s of [1, -1]) part(g, new THREE.OctahedronGeometry(0.009), gem, { pos: [0.1 * s, 0.0, 0.03], scale: [0.7, 1.4, 0.6], outline: false });
  } else if (kind === 'circlet' || kind === 'circletHorns') {
    const g = new THREE.Group();
    g.position.set(0, 0.07, 0.0);
    g.rotation.x = -0.05;
    head.add(g);
    part(g, new THREE.TorusGeometry(0.105, 0.005, 6, 28), trimM, { rot: [Math.PI / 2, 0, 0], scale: [0.95, 1.04, 1], outline: 0.002 });
    part(g, new THREE.OctahedronGeometry(0.014), gem, { pos: [0, -0.005, 0.108], scale: [0.7, 1.4, 0.5], outline: false });
    for (const s of [1, -1]) part(g, new THREE.ConeGeometry(0.008, 0.07, 4), trimM, { pos: [0.088 * s, 0.012, 0.045], rot: [0, 0, -0.35 * s], outline: 0.002 });
    if (kind === 'circletHorns') for (const s of [1, -1]) horn(hornPath('small', s), 0.02);
  } else if (kind === 'tiara') {
    const g = new THREE.Group();
    g.position.set(0, 0.075, 0.03);
    g.rotation.x = -0.35;
    head.add(g);
    const hs = [0.03, 0.05, 0.075, 0.05, 0.03];
    hs.forEach((h, i) => {
      const x = (i - 2) * 0.034;
      part(g, new THREE.ConeGeometry(0.008, h, 4), trimM, { pos: [x, h / 2, 0.075 - Math.abs(i - 2) * 0.012], outline: 0.002 });
    });
    part(g, new THREE.TorusGeometry(0.106, 0.004, 5, 24), trimM, { pos: [0, -0.012, -0.03], rot: [Math.PI / 2, 0, 0], scale: [0.95, 1.04, 1], outline: false });
    part(g, new THREE.OctahedronGeometry(0.011), gem, { pos: [0, 0.0, 0.095], scale: [0.7, 1.4, 0.5], outline: false });
  } else if (kind === 'horns') {
    for (const s of [1, -1]) horn(hornPath('ram', s), 0.027);
  } else if (kind === 'antlers') {
    const k = 0.72; // keeps the rack in proportion when the head tips forward
    const sc = (pts, s) => pts.map(([x, y, z]) => [x, y * k, z]);
    for (const s of [1, -1]) {
      horn(sc([[0.05 * s, 0.1, 0.0], [0.085 * s, 0.2, -0.03], [0.1 * s, 0.32, -0.06], [0.075 * s, 0.46, -0.075]]), 0.016);
      horn(sc([[0.087 * s, 0.205, -0.03], [0.14 * s, 0.25, -0.035], [0.185 * s, 0.31, -0.03]]), 0.01);
      horn(sc([[0.1 * s, 0.32, -0.06], [0.15 * s, 0.38, -0.065], [0.19 * s, 0.46, -0.06]]), 0.01);
      horn(sc([[0.098 * s, 0.3, -0.06], [0.05 * s, 0.37, -0.1], [0.03 * s, 0.45, -0.13]]), 0.008);
      horn(sc([[0.09 * s, 0.25, -0.045], [0.12 * s, 0.22, -0.1], [0.12 * s, 0.17, -0.15]]), 0.007);
    }
  } else if (kind === 'hat') {
    const felt = toon(c.main, { rim: 0.6, side: THREE.DoubleSide });
    const g = new THREE.Group();
    g.position.set(0, 0.075, -0.012);
    g.rotation.x = -0.1;
    head.add(g);
    part(g, new THREE.CylinderGeometry(0.225, 0.235, 0.012, 28), felt, { outline: 0.003 });
    part(g, new THREE.CylinderGeometry(0.125, 0.14, 0.12, 20), felt, { pos: [0, 0.06, 0], outline: 0.003 });
    part(g, new THREE.TorusGeometry(0.138, 0.009, 5, 22), toon(c.accent, { rim: 0.8 }), { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0], outline: false });
    part(g, strandGeometry([[0.14, 0.03, 0.0], [0.21, 0.11, -0.04], [0.22, 0.2, -0.14], [0.16, 0.23, -0.26]], { width: 0.03, thick: 0.25, segments: 10, radial: 4, taper: 0.6 }), trimM, { outline: 0.002 });
  } else if (kind === 'hood') {
    const hm = toon(c.main, { side: THREE.FrontSide, rim: 0.5 });
    const inner = toon(c.dark, { side: THREE.BackSide });
    const half = 0.95;
    const geo = new THREE.SphereGeometry(R * 1.26, 24, 16, Math.PI / 2 + half, Math.PI * 2 - half * 2, 0, Math.PI * 0.78);
    geo.scale(1, 1.04, 1.16);
    part(head, geo, hm, { pos: [0, 0.012, -0.034], outline: 0.003 });
    part(head, geo.clone(), inner, { pos: [0, 0.012, -0.034], scale: [0.99, 0.99, 0.99], outline: false });
    part(head, new THREE.ConeGeometry(0.075, 0.24, 10), hm, { pos: [0, 0.0, -0.17], rot: [-1.9, 0, 0], outline: 0.003 });
    // draped cowl over the shoulders
    part(j.chest, lathe([[0.082, 0.34], [0.105, 0.31], [0.19, 0.27], [0.255, 0.19], [0.27, 0.12]], { gap: 0.9, scaleZ: 0.82, segments: 22 }), toon(c.main, { side: THREE.DoubleSide, rim: 0.5 }), { outline: 0.003 });
  } else if (kind === 'helm' || kind === 'hornedHelm' || kind === 'winged') {
    const dome = new THREE.SphereGeometry(R * 1.2, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.42);
    dome.scale(0.97, 1, 1.04);
    part(head, dome, metal, { pos: [0, 0.012, -0.006], outline: 0.004 });
    part(head, new THREE.TorusGeometry(R * 1.18, 0.01, 6, 28), trimM, { pos: [0, 0.046, -0.006], rot: [Math.PI / 2, 0, 0], scale: [0.98, 1.04, 1], outline: 0.002 });
    for (const s of [1, -1]) {
      part(head, new THREE.BoxGeometry(0.012, 0.085, 0.085), metal, { pos: [0.095 * s, -0.012, -0.005], rot: [0, 0, 0.05 * s], outline: 0.003 });
      part(head, new THREE.BoxGeometry(0.012, 0.03, 0.04), metal, { pos: [0.088 * s, -0.062, 0.015], rot: [0, 0.3 * s, 0], outline: 0.003 });
    }
    // back-of-neck guard + plume
    part(head, new THREE.CylinderGeometry(R * 1.05, R * 1.0, 0.07, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9), toon(c.armor ?? 0x3a3f4a, { side: THREE.DoubleSide, rim: 1.4 }), { pos: [0, -0.04, -0.03], outline: 0.003 });
    if (kind === 'helm') {
      const plume = toon(c.accent, { rim: 1.4 });
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.006;
        part(head, strandGeometry([[x, 0.1, 0.075], [x, 0.17 + i % 2 * 0.01, 0.0], [x * 2, 0.16, -0.09], [x * 3, 0.06, -0.19], [x * 3, -0.05, -0.2]], { width: 0.018, thick: 0.5, segments: 10, radial: 5 }), plume, { outline: 0.002 });
      }
    } else if (kind === 'hornedHelm') {
      for (const s of [1, -1]) horn(hornPath('ram', s), 0.025, metal);
    } else {
      for (const s of [1, -1]) {
        const g = new THREE.Group();
        g.position.set(0.1 * s, 0.03, -0.01);
        g.rotation.set(0, 0.2 * s, -0.5 * s);
        head.add(g);
        for (let i = 0; i < 3; i++) part(g, new THREE.ConeGeometry(0.014, 0.17 - i * 0.04, 3), trimM, { pos: [0.02 * s * i, 0.08 - i * 0.012, -0.012 * i], rot: [0, 0, -0.35 * s * i], scale: [1, 1, 0.4], outline: 0.002 });
      }
    }
  }
}

// ───────────────────────────────────────────── shoulders ────────────────────────────────────────

function pauldron(sh, s, mat, mid, trimM, size, nSpikes, rng) {
  part(sh, new THREE.SphereGeometry(size, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.52), mat, { pos: [0.012 * s, 0.022, 0], scale: [1.25, 0.85, 1.1], outline: 0.004 });
  part(sh, new THREE.TorusGeometry(size, 0.007, 6, 22), trimM, { pos: [0.012 * s, 0.016, 0], rot: [Math.PI / 2, 0, 0], scale: [1.25, 1.1, 1], outline: false });
  for (let i = 0; i < 2; i++) {
    part(sh, new THREE.CylinderGeometry(size * 1.02, size * (1.14 + i * 0.1), 0.034, 18, 1, true), mid, { pos: [0.014 * s, -0.012 - i * 0.03, 0], scale: [1.25, 1, 1.1], outline: 0.003 });
  }
  for (let i = 0; i < nSpikes; i++) {
    const an = (i / Math.max(1, nSpikes - 1) - 0.5) * 1.6;
    const h = 0.09 + rng() * 0.05 + (i === Math.floor(nSpikes / 2) ? 0.05 : 0);
    part(sh, new THREE.ConeGeometry(0.014, h, 5), trimM, { pos: [(0.02 + size * 0.8) * s * Math.cos(an) * 0.9, 0.04 + h * 0.35, Math.sin(an) * size], rot: [Math.sin(an) * 0.5, 0, -0.55 * s], outline: 0.002 });
  }
}

export function buildShoulders(j, a, c, ctx) {
  const kind = a.shoulders;
  if (!kind || kind === 'none') return;
  const { rng, bw, female } = ctx;
  const armor = toon(c.armor ?? 0x3a3f4a, { rim: 1.6 });
  const mid = toon(c.armor ?? 0x3a3f4a, { side: THREE.DoubleSide, rim: 1.4 });
  const trimM = toon(c.trim, { rim: 1.6 });
  const size = (female ? 0.072 : 0.085) * (0.85 + bw * 0.2);
  if (kind === 'pauldrons' || kind === 'spikes') {
    for (const s of [1, -1]) pauldron(s > 0 ? j.shoulderL : j.shoulderR, s, armor, mid, trimM, size, kind === 'spikes' ? 4 : 0, rng);
  } else if (kind === 'fur') {
    const fur = toon(lerpHex(c.trim, c.dark, 0.74), { rim: 1.2, side: THREE.DoubleSide });
    // sloped fur mantle over both shoulders with a shaggy hem
    part(j.chest, lathe([[0.085, 0.335], [0.17, 0.31], [0.25, 0.235], [0.285, 0.165]], { gap: 0.5, scaleZ: 0.82, segments: 24 }), fur, { scale: [bw, 1, bw], outline: 0.004 });
    for (let i = 0; i < 26; i++) {
      const an = Math.PI * 0.14 + (i / 25) * Math.PI * 1.72;
      const rr = 0.285 * bw;
      part(j.chest, new THREE.ConeGeometry(0.022, 0.06 + rng() * 0.05, 4), fur, { pos: [Math.sin(an) * rr, 0.155 - rng() * 0.02, Math.cos(an) * rr * 0.82], rot: [Math.PI + Math.cos(an) * 0.3, 0, -Math.sin(an) * 0.3], outline: 0.002 });
    }
    for (const s of [1, -1]) pauldron(s > 0 ? j.shoulderL : j.shoulderR, s, armor, mid, trimM, size * 0.75, 0, rng);
  } else if (kind === 'collar') {
    const g = new THREE.Group();
    g.position.set(0, 0.34, -0.07);
    g.rotation.x = -0.22;
    j.chest.add(g);
    const panel = toon(c.dark, { side: THREE.DoubleSide, rim: 1.2 });
    const edge = glow(c.accent, 1.8);
    for (let i = -3; i <= 3; i++) {
      const L = 0.34 - Math.abs(i) * 0.05;
      const holder = new THREE.Group();
      holder.rotation.z = i * 0.3;
      g.add(holder);
      part(holder, new THREE.BoxGeometry(0.05, L, 0.006).translate(0, L / 2, 0), panel, { outline: 0.003 });
      part(holder, new THREE.BoxGeometry(0.004, L * 0.95, 0.008).translate(0, L / 2, 0), edge, { outline: false });
    }
    for (const s of [1, -1]) pauldron(s > 0 ? j.shoulderL : j.shoulderR, s, armor, mid, trimM, size * 0.8, 3, rng);
  } else if (kind === 'mantle') {
    part(j.chest, lathe([[0.09, 0.31], [0.17, 0.29], [0.26, 0.22], [0.31, 0.11], [0.32, 0.05]], { gap: 0.8, scaleZ: 0.8, segments: 24 }), toon(c.main, { side: THREE.DoubleSide, rim: 0.6 }), { outline: 0.004 });
    part(j.chest, new THREE.TorusGeometry(0.315, 0.008, 5, 28, Math.PI * 1.85), trimM, { pos: [0, 0.055, 0], rot: [Math.PI / 2, 0, Math.PI * 0.575], scale: [1, 0.8, 1], outline: false });
    part(j.chest, new THREE.OctahedronGeometry(0.02), glow(c.accent, 2.2), { pos: [0, 0.3, 0.12], scale: [0.8, 1.3, 0.6], outline: false });
  } else if (kind === 'bone') {
    for (const s of [1, -1]) {
      const sh = s > 0 ? j.shoulderL : j.shoulderR;
      const bm = toon(BONE, { rim: 1.2 });
      for (let i = 0; i < 3; i++) {
        const h = 0.14 - i * 0.03;
        part(sh, new THREE.ConeGeometry(0.014 - i * 0.002, h, 5), bm, { pos: [(0.02 + i * 0.02) * s, 0.05 + h * 0.3, (i - 1) * 0.03], rot: [(i - 1) * 0.3, 0, -(0.5 + i * 0.25) * s], outline: 0.002 });
      }
      // elbow spur
      const el = s > 0 ? j.elbowL : j.elbowR;
      part(el, new THREE.ConeGeometry(0.015, 0.11, 5), bm, { pos: [0.035 * s, -0.02, -0.02], rot: [-0.5, 0, -1.2 * s], outline: 0.002 });
    }
    // spine ridge
    for (let i = 0; i < 5; i++) part(j.chest, new THREE.ConeGeometry(0.011, 0.07 - i * 0.008, 5), toon(BONE, { rim: 1.2 }), { pos: [0, 0.2 - i * 0.07, -0.098 - i * 0.003], rot: [-1.1, 0, 0], outline: 0.002 });
  }
}

// ───────────────────────────────────────────── backs: capes, cloaks, wings ─────────────────────

/** Rags: displaces the lowest vertices of a lathe to give it a torn hem. */
export function tatter(geo, below, amp, phase = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y >= below) continue;
    const an = Math.atan2(p.getX(i), p.getZ(i));
    const k = Math.min(1, (below - y) / 0.25 + 0.4);
    const n = Math.sin(an * 7 + phase) * 0.6 + Math.sin(an * 17 + phase * 2.1) * 0.4;
    p.setY(i, y - (n * 0.5 + 0.5) * amp * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function capeGeo(profile, phiLen, scaleZ = 0.75) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 24, Math.PI - phiLen / 2, phiLen);
  g.scale(1, 1, scaleZ);
  return g;
}

function wingGeometry(s, span) {
  const P = (x, y, z) => new THREE.Vector3(x * s * span, y * span, z * span);
  const root = P(0, 0, 0), elbow = P(0.3, 0.38, 0.02), wrist = P(0.68, 0.7, -0.06);
  const tips = [P(1.1, 0.92, -0.14), P(1.2, 0.42, -0.16), P(1.0, -0.1, -0.14), P(0.64, -0.5, -0.1)];
  const body = P(0.04, -0.58, -0.02);
  const tris = [[root, wrist, body], [wrist, tips[3], body]];
  for (let i = 0; i < 3; i++) {
    const mid = tips[i].clone().add(tips[i + 1]).multiplyScalar(0.5).lerp(wrist, 0.22);
    tris.push([wrist, tips[i], mid], [wrist, mid, tips[i + 1]]);
  }
  const pos = [];
  for (const t of tris) for (const v of s > 0 ? t : [t[0], t[2], t[1]]) pos.push(v.x, v.y, v.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return { geo: g, bones: [[root, elbow, wrist], ...tips.map((t) => [wrist, wrist.clone().lerp(t, 0.55).add(new THREE.Vector3(0, 0.06 * span, 0)), t])] };
}

/** Bat wings on the cape joint; returns the wing pivots for animation. */
function buildWings(j, c, span, spread) {
  const wings = [];
  const membrane = toon(lerpHex(c.main, 0x000000, 0.35), { side: THREE.DoubleSide, rim: 1.0, emissive: c.accent, emissiveIntensity: 0.06 });
  const bone = toon(lerpHex(BONE, c.dark, 0.35), { rim: 1.0 });
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.1 * s, -0.04, -0.03);
    pivot.userData.s = s;
    pivot.userData.spread = spread;
    j.cape.add(pivot);
    const { geo, bones } = wingGeometry(s, span);
    part(pivot, geo, membrane, { outline: false });
    bones.forEach((pts, i) => part(pivot, strandGeometry(pts.map((v) => [v.x, v.y, v.z]), { width: i === 0 ? 0.028 : 0.014, thick: 0.8, segments: 8, radial: 5, taper: 0.7 }), bone, { outline: i === 0 ? 0.003 : false }));
    pivot.rotation.y = s * spread;
    pivot.rotation.z = -s * 0.1;
    wings.push(pivot);
  }
  return wings;
}

export function buildBack(j, a, c, ctx) {
  const kind = a.back;
  const out = { wings: [] };
  if (!kind || kind === 'none') return out;
  const { rng } = ctx;
  if (kind === 'bigCape') {
    const prof = [[0.52, -1.5], [0.42, -0.95], [0.3, -0.35], [0.23, 0.05]];
    const geo = capeGeo(prof, Math.PI * 1.25, 0.72);
    part(j.cape, geo, toon(c.main, { side: THREE.FrontSide }), { pos: [0, 0, 0.09] });
    part(j.cape, geo.clone(), toon(c.accent, { side: THREE.BackSide, rim: 0.3 }), { pos: [0, 0, 0.09], scale: [0.985, 1, 0.985], outline: false });
    part(j.cape, new THREE.TorusGeometry(0.235, 0.012, 5, 24, Math.PI * 1.25), toon(c.trim, { rim: 1.6 }), { pos: [0, 0.03, 0.09], rot: [Math.PI / 2, 0, Math.PI * 0.375], scale: [1, 0.72, 1], outline: false });
  } else if (kind === 'cloak' || kind === 'wingsCape') {
    const prof = [[0.36, -0.95], [0.3, -0.55], [0.23, -0.15], [0.19, 0.05]];
    const geo = tatter(capeGeo(prof, Math.PI * 1.1, 0.75), -0.6, 0.18, rng() * 6);
    part(j.cape, geo, toon(c.main, { side: THREE.FrontSide }), { pos: [0, 0, 0.1] });
    part(j.cape, geo.clone(), toon(lerpHex(c.accent, c.dark, 0.55), { side: THREE.BackSide, rim: 0.25 }), { pos: [0, 0, 0.1], scale: [0.985, 1, 0.985], outline: false });
  }
  if (kind === 'wings' || kind === 'wingsCape') out.wings = buildWings(j, c, a.archetype === 'ancient' ? 0.95 : 0.78, a.archetype === 'ancient' ? 0.95 : 1.05);
  return out;
}

// ───────────────────────────────────────────── outfit kits ──────────────────────────────────────

/** Overlay gear that turns the base outfit into the archetype's look. Returns animated bits. */
export function buildKit(j, a, c, ctx) {
  const out = { spinners: [] };
  const { female, bw, rng, dims, armR, thighR } = ctx;
  const k = female ? 0.86 : 1;
  const arch = a.archetype;
  const armor = toon(c.armor ?? 0x3a3f4a, { rim: 1.6 });
  const trimM = toon(c.trim, { rim: 1.6 });
  const accentGlow = glow(c.accent, 2.2);
  const cloth = toon(c.main, { side: THREE.DoubleSide, rim: 0.5 });

  if (arch === 'warrior') {
    const v = a.variant ?? 0;
    const leather = toon(0x2a1a14, { rim: 0.8 });
    if (v === 1) {
      // berserker: scarred bare chest under leather straps, a single massive pauldron, spiked bracers
      const bare = toon(c.skin, { rim: 0.6 });
      part(j.chest, lathe([[0.15 * k, -0.08], [0.175 * k, 0.03], [0.19 * k, 0.13], [0.182 * k, 0.23], [0.115 * k, 0.285]], { scaleZ: 0.72 }), bare, { scale: [bw, 1, bw], outline: 0.004 });
      for (const s of [1, -1]) part(j.chest, new THREE.BoxGeometry(0.032, 0.46, 0.012), leather, { pos: [0, 0.1, 0.14 * bw * k], rot: [0, 0, 0.6 * s], outline: 0.002 });
      part(j.chest, new THREE.BoxGeometry(0.05, 0.05, 0.016), trimM, { pos: [0, 0.1, 0.148 * bw * k], rot: [0, 0, 0.78], outline: false });
      part(j.spine, new THREE.TorusGeometry(0.15 * k, 0.026, 6, 22), leather, { rot: [Math.PI / 2, 0, 0], scale: [bw * 1.08, 0.78 * bw, 1], outline: 0.002 });
      for (let i = 0; i < 6; i++) {
        const an = (i / 5 - 0.5) * 2.4;
        part(j.skirt, new THREE.BoxGeometry(0.07 * bw, 0.3 + (i % 2) * 0.08, 0.012), leather, { pos: [Math.sin(an) * 0.17 * bw, -0.17, Math.cos(an) * 0.15 * bw], rot: [0.16, an, 0], outline: 0.002 });
      }
      part(j.skirt, new THREE.BoxGeometry(0.15 * bw, 0.5, 0.012), toon(c.main, { rim: 0.5 }), { pos: [0, -0.3, 0.17 * bw], outline: 0.003 });
      const mid = toon(c.armor ?? 0x3a3f4a, { side: THREE.DoubleSide, rim: 1.4 });
      pauldron(j.shoulderL, 1, armor, mid, trimM, 0.12 * (0.85 + bw * 0.2), 5, rng);
      for (const side of ['L', 'R']) {
        part(j['elbow' + side], limb(armR * 1.12, armR * 1.05, 0.15, 10), leather, { pos: [0, -dims.forearm + 0.17, 0], outline: 0.003 });
        for (let i = 0; i < 3; i++) part(j['elbow' + side], new THREE.ConeGeometry(0.009, 0.045, 4), trimM, { pos: [(i - 1) * 0.026, -dims.forearm + 0.1, armR * 1.15], rot: [Math.PI / 2, 0, 0], outline: false });
      }
    } else {
      part(j.chest, lathe([[0.15 * k, -0.08], [0.175 * k, 0.03], [0.19 * k, 0.13], [0.182 * k, 0.23], [0.115 * k, 0.285]], { scaleZ: 0.72 }), armor, { scale: [bw, 1, bw], outline: 0.004 });
      part(j.chest, new THREE.BoxGeometry(0.014, 0.21, 0.022), trimM, { pos: [0, 0.1, 0.138 * bw * k], outline: false });
      part(j.chest, new THREE.TorusGeometry(0.15 * k, 0.012, 5, 24), trimM, { pos: [0, -0.07, 0], rot: [Math.PI / 2, 0, 0], scale: [bw * 1.05, 0.74 * bw, 1], outline: false });
      part(j.chest, lathe([[0.078, 0.27], [0.092, 0.31], [0.098, 0.345]], { scaleZ: 0.9 }), armor, { outline: 0.003 });
      part(j.chest, new THREE.OctahedronGeometry(0.02), accentGlow, { pos: [0, 0.17, 0.135 * bw * k], scale: [0.8, 1.3, 0.5], outline: false });
      // tassets + tabard
      for (let i = 0; i < 7; i++) {
        const an = (i / 6 - 0.5) * 2.5;
        part(j.skirt, new THREE.BoxGeometry(0.095 * bw, 0.21, 0.014), armor, { pos: [Math.sin(an) * 0.17 * bw, -0.13, Math.cos(an) * 0.15 * bw], rot: [0.16, an, 0], outline: 0.003 });
      }
      const long = v === 2;
      part(j.skirt, new THREE.BoxGeometry(0.16 * bw, long ? 0.86 : 0.62, 0.012), toon(c.main, { rim: 0.5 }), { pos: [0, long ? -0.43 : -0.3, 0.17 * bw], rot: [0.04, 0, 0], outline: 0.003 });
      part(j.skirt, new THREE.BoxGeometry(0.014, long ? 0.8 : 0.58, 0.014), accentGlow, { pos: [0, long ? -0.45 : -0.31, 0.18 * bw], outline: false });
      if (long) {
        // heraldic emblem on the tabard and a matching rear panel
        part(j.skirt, new THREE.TorusGeometry(0.035 * bw, 0.006, 5, 18), accentGlow, { pos: [0, -0.2, 0.18 * bw], outline: false });
        part(j.skirt, new THREE.BoxGeometry(0.15 * bw, 0.8, 0.012), toon(c.main, { rim: 0.5 }), { pos: [0, -0.4, -0.17 * bw], outline: 0.003 });
      }
      // vambraces, knee cops, greaves
      for (const side of ['L', 'R']) {
        part(j['elbow' + side], limb(armR * 1.12, armR * 1.0, 0.2, 10), armor, { pos: [0, -dims.forearm + 0.22, 0], outline: 0.004 });
        part(j['elbow' + side], new THREE.TorusGeometry(armR * 1.1, 0.007, 5, 14), trimM, { pos: [0, -dims.forearm + 0.215, 0], rot: [Math.PI / 2, 0, 0], outline: false });
        part(j['knee' + side], new THREE.SphereGeometry(thighR * 0.85, 10, 8), armor, { pos: [0, 0.0, 0.03], scale: [1, 0.9, 0.9], outline: 0.004 });
        part(j['knee' + side], limb(thighR * 0.74, thighR * 0.58, 0.3, 10), armor, { pos: [0, -0.04, 0.012], scale: [1, 1, 1.05], outline: 0.004 });
      }
    }
  } else if (arch === 'assassin') {
    const v = a.variant ?? 0;
    const leather = toon(0x241814, { rim: 0.8 });
    // daggers sheathed across the lower back
    for (const s of [1, -1]) {
      part(j.hips, new THREE.CylinderGeometry(0.008, 0.009, 0.1, 6), toon(0x0c0a0e), { pos: [0.06 * s, 0.01, -0.15 * bw], rot: [0.2, 0, 0.9 * s], outline: 0.002 });
      part(j.hips, new THREE.BoxGeometry(0.07, 0.01, 0.014), trimM, { pos: [0.1 * s, 0.045, -0.15 * bw], rot: [0.2, 0, 0.9 * s], outline: false });
    }
    if (v === 0) {
      // harness, belt pouches and throwing knives
      for (const s of [1, -1]) part(j.chest, new THREE.BoxGeometry(0.024, 0.4, 0.012), leather, { pos: [0, 0.1, 0.122 * bw * k], rot: [0, 0, 0.62 * s], outline: 0.002 });
      part(j.chest, new THREE.BoxGeometry(0.036, 0.036, 0.016), trimM, { pos: [0, 0.1, 0.13 * bw * k], rot: [0, 0, 0.78], outline: false });
      part(j.spine, new THREE.TorusGeometry(0.13 * k, 0.014, 5, 22), leather, { rot: [Math.PI / 2, 0, 0], scale: [bw * 1.05, 0.76 * bw, 1], outline: false });
      for (const s of [1, -1]) part(j.hips, new THREE.BoxGeometry(0.05, 0.065, 0.04), leather, { pos: [0.14 * s * bw, -0.01, 0.07], rot: [0, 0.4 * s, 0], outline: 0.002 });
      for (let i = 0; i < 3; i++) part(j.chest, bladeGeometry(0.06, 0.016, 0.0, 0.004).rotateZ(Math.PI / 2), toon(0xa8b0c0, { rim: 1.8 }), { pos: [(i - 1) * 0.045, 0.18 - i * 0.045, 0.132 * bw * k], rot: [0, 0, 0.62], outline: false });
    } else if (v === 1) {
      // wrapped in bandages: forearms, shins and a crossed chest wrap
      const wrap = toon(lerpHex(c.trim, c.dark, 0.35), { rim: 0.8 });
      for (const side of ['L', 'R']) {
        for (let i = 0; i < 5; i++) part(j['elbow' + side], new THREE.TorusGeometry(armR * 1.0 + 0.004, 0.006, 5, 14), wrap, { pos: [0, -0.05 - i * 0.04, 0], rot: [Math.PI / 2, 0, 0], outline: false });
        for (let i = 0; i < 4; i++) part(j['knee' + side], new THREE.TorusGeometry(thighR * 0.66, 0.006, 5, 14), wrap, { pos: [0, -0.1 - i * 0.05, 0], rot: [Math.PI / 2, 0, 0], outline: false });
      }
      for (const s of [1, -1]) part(j.chest, new THREE.BoxGeometry(0.03, 0.42, 0.01), wrap, { pos: [0, 0.1, 0.122 * bw * k], rot: [0, 0, 0.55 * s], outline: false });
      part(j.spine, new THREE.TorusGeometry(0.13 * k, 0.016, 5, 22), wrap, { rot: [Math.PI / 2, 0, 0], scale: [bw * 1.05, 0.76 * bw, 1], outline: false });
    } else {
      // duelist: lace cravat, gold-buttoned sash and tailcoat flair
      part(j.neck, new THREE.ConeGeometry(0.04, 0.09, 8), toon(0xe8e0e4, { rim: 0.8 }), { pos: [0, -0.02, 0.045], rot: [Math.PI, 0, 0], outline: 0.002 });
      part(j.chest, new THREE.BoxGeometry(0.05, 0.5, 0.012), toon(c.accent, { rim: 0.6 }), { pos: [0, 0.08, 0.124 * bw * k], rot: [0, 0, 0.62], outline: 0.002 });
      for (let i = 0; i < 4; i++) part(j.chest, new THREE.SphereGeometry(0.008, 6, 5), trimM, { pos: [0.05 - i * 0.032, 0.2 - i * 0.07, 0.132 * bw * k], outline: false });
      part(j.spine, new THREE.TorusGeometry(0.13 * k, 0.018, 5, 22), trimM, { rot: [Math.PI / 2, 0, 0], scale: [bw * 1.05, 0.76 * bw, 1], outline: false });
    }
    // bracers + wrapped scarf
    for (const side of ['L', 'R']) {
      part(j['elbow' + side], limb(armR * 1.1, armR * 1.0, 0.17, 10), leather, { pos: [0, -dims.forearm + 0.19, 0], outline: 0.003 });
      part(j['elbow' + side], new THREE.TorusGeometry(armR * 1.08, 0.006, 5, 14), accentGlow, { pos: [0, -dims.forearm + 0.1, 0], rot: [Math.PI / 2, 0, 0], outline: false });
    }
    if (v !== 2) {
      part(j.neck, new THREE.TorusGeometry(0.058, 0.026, 7, 18), toon(c.accent, { rim: 0.8 }), { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.95, 0.8], outline: 0.003 });
      part(j.cape, new THREE.BoxGeometry(0.07, 0.62, 0.008), toon(c.accent, { rim: 0.6 }), { pos: [0.06, -0.34, 0.1], rot: [0.12, 0, 0.1], outline: 0.002 });
    }
  } else if (arch === 'sorcerer') {
    // bell sleeves, sash, hanging charms, sigil
    for (const side of ['L', 'R']) {
      part(j['elbow' + side], lathe([[armR * 1.0, 0.04], [armR * 1.6, -0.1], [armR * 2.5, -0.26], [armR * 2.8, -0.31]], { segments: 16 }), toon(c.main, { side: THREE.DoubleSide, rim: 0.5 }), { pos: [0, -0.03, 0], outline: 0.003 });
      part(j['elbow' + side], new THREE.TorusGeometry(armR * 2.78, 0.006, 5, 18), trimM, { pos: [0, -0.34, 0], rot: [Math.PI / 2, 0, 0], outline: false });
    }
    part(j.spine, new THREE.TorusGeometry(0.128 * k, 0.026, 6, 22), toon(c.accent, { rim: 0.6 }), { rot: [Math.PI / 2, 0, 0], scale: [bw * 1.05, 0.76 * bw, 1], outline: 0.002 });
    part(j.skirt, new THREE.BoxGeometry(0.09, 0.78, 0.01), toon(c.accent, { rim: 0.6 }), { pos: [0.05 * bw, -0.46, 0.2 * bw], rot: [0.05, 0, 0], outline: 0.002 });
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.06 * bw;
      part(j.skirt, new THREE.CylinderGeometry(0.0015, 0.0015, 0.1 + (i % 2) * 0.05, 3), flat(c.trim), { pos: [x, -0.07 - (i % 2) * 0.025, 0.17 * bw], outline: false });
      part(j.skirt, new THREE.OctahedronGeometry(0.014), accentGlow, { pos: [x, -0.13 - (i % 2) * 0.05, 0.17 * bw], scale: [0.7, 1.3, 0.7], outline: false });
    }
    part(j.chest, new THREE.TorusGeometry(0.03, 0.004, 5, 20), accentGlow, { pos: [0, 0.14, 0.125 * bw * k], outline: false });
    part(j.chest, new THREE.OctahedronGeometry(0.016), accentGlow, { pos: [0, 0.14, 0.125 * bw * k], scale: [0.7, 1.2, 0.5], outline: false });
    // rotating sigil halo behind the shoulders
    const halo = new THREE.Group();
    halo.position.set(0, 0.2, -0.2);
    j.chest.add(halo);
    const ring = new THREE.Group();
    halo.add(ring);
    part(ring, new THREE.TorusGeometry(0.3, 0.005, 5, 44), accentGlow, { outline: false });
    part(ring, new THREE.TorusGeometry(0.22, 0.003, 5, 36), accentGlow, { outline: false });
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2;
      part(ring, new THREE.BoxGeometry(0.02, 0.05, 0.004), accentGlow, { pos: [Math.cos(an) * 0.26, Math.sin(an) * 0.26, 0], rot: [0, 0, an], outline: false });
    }
    out.spinners.push({ obj: ring, axis: 'z', rate: 0.5 });
  } else if (arch === 'lord') {
    const gold = toon(c.trim, { rim: 1.8 });
    part(j.chest, new THREE.OctahedronGeometry(0.026), accentGlow, { pos: [0, 0.205, 0.128 * bw * k], scale: [0.8, 1.4, 0.55], outline: false });
    part(j.chest, new THREE.TorusGeometry(0.03, 0.007, 6, 18), gold, { pos: [0, 0.205, 0.124 * bw * k], outline: 0.002 });
    part(j.spine, new THREE.TorusGeometry(0.13 * k, 0.018, 6, 24), gold, { rot: [Math.PI / 2, 0, 0], scale: [bw * 1.05, 0.76 * bw, 1], outline: false });
    for (const side of ['L', 'R']) {
      part(j['elbow' + side], new THREE.TorusGeometry(armR * 1.0, 0.012, 5, 16), gold, { pos: [0, -dims.forearm + 0.14, 0], rot: [Math.PI / 2, 0, 0], outline: false });
      part(j['elbow' + side], new THREE.TorusGeometry(armR * 1.0, 0.012, 5, 16), gold, { pos: [0, -dims.forearm + 0.18, 0], rot: [Math.PI / 2, 0, 0], outline: false });
    }
  } else if (arch === 'ancient') {
    const skinD = toon(lerpHex(a.skin ?? 0xbfbac4, 0x2a1824, 0.18), { rim: 0.7 });
    const ribM = toon(lerpHex(a.skin ?? 0xbfbac4, 0x1a0e18, 0.55), { rim: 0.4 });
    part(j.spine, lathe([[0.085, -0.05], [0.082, 0.06], [0.09, 0.2]], { scaleZ: 0.7 }), skinD, { scale: [bw, 1, bw] });
    part(j.chest, lathe([[0.1, -0.1], [0.122, 0.0], [0.13, 0.1], [0.126, 0.2], [0.07, 0.265], [0.045, 0.285]], { scaleZ: 0.66 }), skinD, { scale: [bw, 1, bw] });
    part(j.chest, new THREE.CylinderGeometry(0.035, 0.04, 0.12, 8).translate(0, 0.3, 0), skinD, { outline: false });
    for (let i = 0; i < 6; i++) {
      part(j.chest, new THREE.TorusGeometry(0.136 * bw - i * 0.002, 0.0058, 5, 16, Math.PI), ribM, { pos: [0, 0.2 - i * 0.04, 0.0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.68, 1], outline: false });
    }
    // loincloth rags + threadbare mantle
    part(j.hips, lathe([[0.1, 0.08], [0.125, 0.0], [0.13, -0.06], [0.08, -0.11]], { scaleZ: 0.75 }), toon(c.dark));
    const rags = tatter(lathe([[0.13, 0.08], [0.16, -0.1], [0.23, -0.45], [0.29, -0.88]], { gap: 0.7, scaleZ: 0.82, segments: 26 }), -0.5, 0.2, rng() * 6);
    part(j.skirt, rags, toon(c.main, { side: THREE.FrontSide }), { outline: 0.003 });
    part(j.skirt, rags.clone(), toon(lerpHex(c.accent, c.dark, 0.5), { side: THREE.BackSide }), { scale: [0.985, 1, 0.985], outline: false });
    part(j.chest, tatter(lathe([[0.075, 0.31], [0.14, 0.29], [0.24, 0.2], [0.3, 0.02]], { gap: 0.9, scaleZ: 0.8, segments: 22 }), 0.1, 0.1, rng() * 6), toon(c.main, { side: THREE.DoubleSide, rim: 0.5 }), { outline: 0.003 });
    // bandage straps + a fastening of old bone
    part(j.chest, new THREE.BoxGeometry(0.03, 0.3, 0.008), toon(lerpHex(BONE, c.dark, 0.5)), { pos: [0.03, 0.1, 0.12 * bw], rot: [0, 0, 0.5], outline: false });
    // long bone claws on every finger
    for (const side of ['L', 'R']) {
      const hand = j['hand' + side];
      const cm = toon(BONE, { rim: 1.4 });
      for (let f = 0; f < 4; f++) {
        const x = (f - 1.5) * 0.017;
        part(hand, new THREE.ConeGeometry(0.0055, 0.15 - Math.abs(f - 1.5) * 0.015, 5), cm, { pos: [x, -0.115, 0.036 + (f % 2) * 0.004], rot: [-0.25, 0, 0], outline: 0.002 });
      }
    }
  }
  return out;
}

// ───────────────────────────────────────────── weapons ──────────────────────────────────────────

function axeHead(w, h) {
  const sh = new THREE.Shape();
  sh.moveTo(0, -h * 0.12);
  sh.lineTo(w * 0.55, -h * 0.5);
  sh.quadraticCurveTo(w * 1.12, 0, w * 0.55, h * 0.5);
  sh.lineTo(0, h * 0.12);
  sh.lineTo(-w * 0.35, h * 0.28);
  sh.lineTo(-w * 0.35, -h * 0.28);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false });
  g.translate(0, 0, -0.009);
  g.rotateX(Math.PI / 2);
  return g;
}

function hiltGroup(j, rotX = 0.8) {
  const g = new THREE.Group();
  g.position.set(0, -0.04, 0);
  g.rotation.x = rotX;
  j.handR.add(g);
  return g;
}

/** Builds the vampire's weapon. Returns { blades } for floating-blade casters. */
export function buildWeapon(j, a, c, ctx) {
  const weapon = a.weapon;
  const out = { blades: null };
  const steel = toon(0xa8b0c0, { rim: 1.8 });
  const dark = toon(0x1a1820, { rim: 1.6, side: THREE.DoubleSide });
  const trimM = toon(c.trim, { rim: 1.6 });
  const grip = toon(0x0c0a0e);
  const edge = glow(c.accent, 2.4);
  const haft = toon(0x1a1216, { rim: 1.2 });

  if (weapon === 'sword' || weapon === 'swordShield') {
    const sw = hiltGroup(j);
    part(sw, new THREE.CylinderGeometry(0.016, 0.018, 0.2, 8), grip, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.02], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.2, 0.024, 0.03), trimM, { pos: [0, 0, 0.125], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.05, 0.012, 0.95), dark, { pos: [0, 0, 0.6], outline: 0.004 });
    part(sw, new THREE.BoxGeometry(0.006, 0.016, 0.85), edge, { pos: [0, 0, 0.58], outline: false });
    if (weapon === 'swordShield') {
      const sg = new THREE.Group();
      sg.position.set(0.075, -0.17, 0.02);
      j.elbowL.add(sg);
      part(sg, new THREE.SphereGeometry(0.21, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), toon(c.armor ?? 0x3a3f4a, { rim: 1.6 }), { rot: [0, 0, -Math.PI / 2], scale: [1, 0.28, 1], outline: 0.004 });
      part(sg, new THREE.TorusGeometry(0.205, 0.014, 6, 26), trimM, { rot: [0, Math.PI / 2, 0], pos: [0.012, 0, 0], outline: 0.002 });
      part(sg, new THREE.OctahedronGeometry(0.04), edge, { pos: [0.075, 0, 0], scale: [0.5, 1.4, 1], outline: false });
      for (let i = 0; i < 4; i++) {
        const an = (i / 4) * Math.PI * 2 + 0.4;
        part(sg, new THREE.ConeGeometry(0.012, 0.05, 4), trimM, { pos: [0.065, Math.sin(an) * 0.11, Math.cos(an) * 0.11], rot: [0, 0, -Math.PI / 2], outline: false });
      }
    }
  } else if (weapon === 'greatsword') {
    const sw = hiltGroup(j, 0.7);
    part(sw, new THREE.CylinderGeometry(0.02, 0.022, 0.34, 8), grip, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.0], outline: 0.003 });
    part(sw, new THREE.SphereGeometry(0.034, 8, 6), trimM, { pos: [0, 0, -0.18], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.32, 0.03, 0.04), trimM, { pos: [0, 0, 0.18], outline: 0.003 });
    for (const s of [1, -1]) part(sw, new THREE.ConeGeometry(0.016, 0.09, 4), trimM, { pos: [0.17 * s, 0, 0.2], rot: [Math.PI / 2, 0, 0], outline: 0.002 });
    part(sw, new THREE.BoxGeometry(0.1, 0.016, 1.4), dark, { pos: [0, 0, 0.92], outline: 0.004 });
    part(sw, new THREE.ConeGeometry(0.05, 0.14, 4), dark, { pos: [0, 0, 1.69], rot: [Math.PI / 2, Math.PI / 4, 0], scale: [1, 1, 0.2], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.008, 0.02, 1.25), edge, { pos: [0, 0, 0.88], outline: false });
  } else if (weapon === 'katana') {
    const sw = hiltGroup(j, 0.9);
    part(sw, new THREE.CylinderGeometry(0.013, 0.014, 0.26, 8), toon(c.accent, { rim: 0.6 }), { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.02], outline: 0.003 });
    part(sw, new THREE.CylinderGeometry(0.05, 0.05, 0.01, 14), trimM, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.16], outline: 0.003 });
    const bl = bladeGeometry(0.88, 0.034, 0.13, 0.007);
    bl.rotateY(-Math.PI / 2);
    bl.rotateZ(Math.PI / 2);
    part(sw, bl, steel, { pos: [0, 0, 0.17], outline: 0.003 });
  } else if (weapon === 'rapier') {
    const sw = hiltGroup(j, 0.85);
    part(sw, new THREE.CylinderGeometry(0.012, 0.014, 0.18, 8), grip, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.02], outline: 0.003 });
    part(sw, new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), trimM, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.12], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.26, 0.008, 0.012), trimM, { pos: [0, 0, 0.115], outline: false });
    part(sw, new THREE.BoxGeometry(0.016, 0.007, 1.1), steel, { pos: [0, 0, 0.7], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.003, 0.009, 0.95), edge, { pos: [0, 0, 0.66], outline: false });
  } else if (weapon === 'axe') {
    const sw = hiltGroup(j, 0.85);
    part(sw, new THREE.CylinderGeometry(0.02, 0.022, 1.15, 8), haft, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.35], outline: 0.003 });
    part(sw, new THREE.SphereGeometry(0.03, 8, 6), trimM, { pos: [0, 0, -0.24], outline: 0.003 });
    for (const s of [1, -1]) part(sw, axeHead(0.28, 0.36), dark, { pos: [0.02 * s, 0, 0.82], scale: [s, 1, 1], outline: 0.004 });
    part(sw, new THREE.ConeGeometry(0.02, 0.13, 4), trimM, { pos: [0, 0, 0.98], rot: [Math.PI / 2, 0, 0], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.34, 0.006, 0.012), edge, { pos: [0, 0.012, 0.82], outline: false });
  } else if (weapon === 'spear') {
    const sw = hiltGroup(j, 0.5);
    part(sw, new THREE.CylinderGeometry(0.018, 0.02, 1.9, 8), haft, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.45], outline: 0.003 });
    part(sw, new THREE.ConeGeometry(0.04, 0.36, 4), steel, { pos: [0, 0, 1.58], rot: [Math.PI / 2, Math.PI / 4, 0], scale: [1, 1, 0.35], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.2, 0.012, 0.026), trimM, { pos: [0, 0, 1.38], outline: false });
    for (const s of [1, -1]) part(sw, new THREE.ConeGeometry(0.014, 0.1, 4), trimM, { pos: [0.1 * s, 0, 1.38], rot: [Math.PI / 2, 0, 0], outline: false });
    part(sw, strandGeometry([[0, 0, 1.36], [0.03, -0.12, 1.3], [0.05, -0.3, 1.24]], { width: 0.03, thick: 0.2, segments: 6, radial: 4 }), toon(c.accent, { rim: 0.6 }), { outline: false });
    part(sw, new THREE.SphereGeometry(0.025, 8, 6), trimM, { pos: [0, 0, -0.5], outline: 0.003 });
  } else if (weapon === 'scythe') {
    const sw = hiltGroup(j, 0.45);
    part(sw, new THREE.CylinderGeometry(0.018, 0.02, 1.9, 8), haft, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.5], outline: 0.003 });
    part(sw, strandGeometry([[0, 0, 1.4], [0.18, 0, 1.62], [0.5, 0, 1.64], [0.8, 0, 1.32]], { width: 0.05, thick: 0.18, segments: 14, radial: 5, taper: 0.75 }), dark, { outline: 0.003 });
    part(sw, strandGeometry([[0.02, 0.01, 1.4], [0.18, 0.01, 1.62], [0.5, 0.01, 1.64], [0.78, 0.01, 1.33]], { width: 0.007, thick: 1, segments: 14, radial: 4, taper: 0.3 }), edge, { outline: false });
    part(sw, new THREE.SphereGeometry(0.03, 8, 6), trimM, { pos: [0, 0, 1.38], outline: 0.003 });
  } else if (weapon === 'staff') {
    const sw = hiltGroup(j, 0.35);
    part(sw, new THREE.CylinderGeometry(0.017, 0.022, 1.7, 8), haft, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.5], outline: 0.003 });
    part(sw, new THREE.TorusGeometry(0.05, 0.008, 5, 16), trimM, { pos: [0, 0, 1.36], outline: 0.002 });
    part(sw, new THREE.IcosahedronGeometry(0.052, 1), glow(c.accent, 2.8), { pos: [0, 0, 1.46], outline: false });
    for (let i = 0; i < 3; i++) {
      const an = (i / 3) * Math.PI * 2;
      part(sw, strandGeometry([[0, 0, 1.3], [Math.cos(an) * 0.075, Math.sin(an) * 0.075, 1.45], [Math.cos(an) * 0.05, Math.sin(an) * 0.05, 1.62]], { width: 0.012, thick: 0.8, segments: 8, radial: 4, taper: 0.5 }), trimM, { outline: 0.002 });
    }
    for (let i = 0; i < 3; i++) part(sw, new THREE.OctahedronGeometry(0.012), glow(c.accent, 2.0), { pos: [Math.cos(i * 2.1) * 0.045, 0.02, 0.72 + i * 0.17], scale: [0.7, 1.3, 0.7], outline: false });
  } else if (weapon === 'dual' || weapon === 'daggers') {
    for (const side of ['L', 'R']) {
      const g = new THREE.Group();
      g.position.set(0, -0.04, 0);
      g.rotation.x = 1.25;
      j['hand' + side].add(g);
      const len = weapon === 'daggers' ? 0.36 : 0.55;
      const bl = bladeGeometry(len, 0.05, weapon === 'daggers' ? 0.1 : 0.14, 0.009);
      bl.rotateY(-Math.PI / 2);
      bl.rotateZ(Math.PI / 2);
      part(g, bl, weapon === 'daggers' ? dark : steel, { pos: [0, 0, 0.08], outline: 0.0035 });
      if (weapon === 'daggers') {
        part(g, new THREE.BoxGeometry(0.1, 0.014, 0.018), trimM, { pos: [0, 0, 0.075], outline: false });
        part(g, new THREE.BoxGeometry(0.005, 0.01, len * 0.8), edge, { pos: [0, 0, 0.08 + len * 0.45], outline: false });
      }
    }
  } else if (weapon === 'claws') {
    const long = a.archetype === 'ancient';
    const cm = toon(BONE, { rim: 1.6 });
    for (const side of ['L', 'R']) {
      const g = new THREE.Group();
      g.position.set(0, -0.04, 0);
      g.rotation.x = 0.2;
      j['hand' + side].add(g);
      for (let f = 0; f < 4; f++) {
        const x = (f - 1.5) * 0.02, L = (long ? 0.34 : 0.24) - Math.abs(f - 1.5) * 0.03;
        part(g, strandGeometry([[x, -0.03, 0.01], [x * 1.4, -0.03 - L * 0.5, 0.05 + L * 0.1], [x * 1.6, -0.03 - L, 0.12 + L * 0.35]], { width: 0.01, thick: 0.7, segments: 6, radial: 4, taper: 0.85 }), cm, { outline: 0.002 });
        part(g, new THREE.OctahedronGeometry(0.004), edge, { pos: [x * 1.6, -0.03 - L, 0.12 + L * 0.35], outline: false });
      }
    }
  } else if (weapon === 'blades') {
    out.blades = [];
    for (const s of [1, -1]) {
      const holder = new THREE.Group();
      holder.position.set(0.07 * s, -0.08, 0.06);
      holder.rotation.set(1.1, 0, 0);
      (s > 0 ? j.handL : j.handR).add(holder);
      const bm = new THREE.Mesh(bladeGeometry(0.45, 0.07, 0.2, 0.012), toon(c.accent, { emissive: c.accent, emissiveIntensity: 0.9, transparent: true, opacity: 0.92, rim: 2 }));
      bm.rotation.set(0, -Math.PI / 2, Math.PI / 2 + (s > 0 ? 0 : Math.PI));
      bm.position.set(0, 0, 0.03);
      holder.add(bm);
      out.blades.push(holder);
    }
  }
  return out;
}
