// Parametric anime vampire generator used for the 1,024 members of the court of Castle Nocturne,
// the twin sovereigns, and the lightweight instanced "crowd" silhouettes for distant vampires.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, glow, part, limb, lathe, strandGeometry, bladeGeometry, optimiseRig, disposeObject } from './Toon.js';
import { buildSkeleton, headGeometry, buildFace, buildEars, buildLegs, buildArms, HumanoidAnimator } from './Humanoid.js';
import { capPoint, addStrand, hairCap, spikes, ribTexture } from './CharacterModels.js';
import { seeded } from '../../core/utils.js';

// ───────────────────────────────────────────── hair styles ──────────────────────────────────────

function bangs(hair, c, list, opts = {}) {
  for (const [x, tipY, sweep] of list) {
    addStrand(hair, [
      [x * 0.4 + (opts.shift ?? 0), 0.122, 0.035],
      [x * 0.95, 0.09, 0.112],
      [x * 1.05 + (sweep ?? 0) * 0.03, (0.09 + tipY) / 2, 0.13],
      [x * 1.1 + (sweep ?? 0) * 0.05, tipY, 0.124],
    ], { width: opts.width ?? 0.024, rootColor: c.hairRoot, tipColor: c.hairTip, thick: 0.4 });
  }
}

function longBack(hair, c, rng, R, { count = 16, length = [0.55, 0.72], wave = 0, highlightEvery = 4 } = {}) {
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const theta = Math.PI * (0.55 + u * 0.9);
    const phi = rng.range(0.55, 1.1);
    const root = capPoint(R * 1.05, theta, phi);
    const spread = Math.sin(theta);
    const len = rng.range(length[0], length[1]);
    const w = (k) => Math.sin(k * 9 + i) * wave;
    addStrand(hair, [
      root,
      [root[0] * 1.25, root[1] - 0.08, root[2] * 1.15 - 0.02],
      [spread * 0.16 + w(1), -0.2, -0.13],
      [spread * 0.17 - w(2), -0.2 - (len - 0.2) * 0.5, -0.15],
      [spread * 0.15 + w(3), -len, -0.16],
    ], { width: rng.range(0.042, 0.055), rootColor: c.hairRoot, tipColor: i % highlightEvery === 1 ? c.hairHighlight : c.hairTip, thick: 0.35, segments: 12 });
  }
}

function sideLocks(hair, c, len = 0.42, spread = 0.13) {
  for (const s of [1, -1]) {
    addStrand(hair, [
      [0.075 * s, 0.085, 0.06],
      [0.112 * s, 0.0, 0.07],
      [spread * s, -len * 0.4, 0.065],
      [(spread + 0.01) * s, -len, 0.05],
    ], { width: 0.03, rootColor: c.hairRoot, tipColor: c.hairHighlight ?? c.hairTip, thick: 0.4, segments: 10 });
  }
}

const HAIR = {
  messy(hair, c, R, rng) {
    hairCap(hair, R * 1.06, c.hairRoot, { cover: 0.58, tilt: -0.42 });
    bangs(hair, c, [[-0.085, 0.03, 0.4], [-0.058, -0.015, 0.25], [-0.03, 0.025, 0.1], [-0.006, -0.05, -0.05], [0.018, -0.03, 0.05], [0.042, 0.02, -0.12], [0.066, -0.01, -0.2], [0.09, 0.035, -0.4]]);
    for (const s of [1, -1]) addStrand(hair, [[0.08 * s, 0.09, 0.05], [0.115 * s, 0.02, 0.07], [0.12 * s, -0.06, 0.07], [0.11 * s, -0.105, 0.075]], { width: 0.028, rootColor: c.hairRoot, tipColor: c.hairTip });
    spikes(hair, rng, { R: R * 1.06, count: 22, theta: [Math.PI * 0.35, Math.PI * 1.65], phi: [0.35, 1.45], len: [0.09, 0.15], width: [0.026, 0.036], droop: 0.75, out: 0.55, root: c.hairRoot, tip: c.hairTip, streak: c.hairHighlight, streakChance: 0.15 });
  },
  slick(hair, c, R, rng) {
    hairCap(hair, R * 1.05, c.hairRoot, { cover: 0.55, tilt: -0.2 });
    for (let i = 0; i < 9; i++) {
      const x = (i - 4) * 0.022;
      addStrand(hair, [[x, 0.1, 0.1], [x * 1.1, 0.15, 0.02], [x * 1.2, 0.12, -0.08], [x * 1.3, 0.02, -0.14]], { width: 0.03, rootColor: c.hairRoot, tipColor: c.hairTip, thick: 0.35 });
    }
    spikes(hair, rng, { R: R * 1.05, count: 12, theta: [Math.PI * 0.6, Math.PI * 1.4], phi: [0.7, 1.4], len: [0.07, 0.11], width: [0.03, 0.036], droop: 0.8, out: 0.4, root: c.hairRoot, tip: c.hairTip });
    addStrand(hair, [[-0.04, 0.12, 0.09], [-0.07, 0.07, 0.125], [-0.075, 0.0, 0.122]], { width: 0.016, rootColor: c.hairRoot, tipColor: c.hairTip });
  },
  wolf(hair, c, R, rng) {
    hairCap(hair, R * 1.06, c.hairRoot, { cover: 0.58, tilt: -0.35 });
    bangs(hair, c, [[-0.07, 0.04, 0.2], [-0.035, 0.0, 0], [0.0, 0.02, 0], [0.035, -0.005, 0], [0.07, 0.04, -0.2]], { width: 0.028 });
    spikes(hair, rng, { R: R * 1.06, count: 14, theta: [-1.0, 1.0], phi: [0.2, 0.7], len: [0.09, 0.13], width: [0.03, 0.04], droop: 0.1, out: 0.8, back: -0.4, root: c.hairRoot, tip: c.hairTip });
    spikes(hair, rng, { R: R * 1.06, count: 26, theta: [Math.PI * 0.3, Math.PI * 1.7], phi: [0.3, 1.5], len: [0.12, 0.22], width: [0.03, 0.04], droop: 0.8, out: 0.6, root: c.hairRoot, tip: c.hairTip, streak: c.hairHighlight, streakChance: 0.2 });
  },
  longMale(hair, c, R, rng) {
    hairCap(hair, R * 1.06, c.hairRoot, { cover: 0.6, tilt: -0.35 });
    bangs(hair, c, [[-0.075, 0.0, 0.3], [-0.045, -0.03, 0.1], [-0.012, 0.0, 0], [0.02, -0.035, -0.05], [0.05, 0.0, -0.15], [0.08, 0.02, -0.3]]);
    sideLocks(hair, c, 0.3, 0.125);
    longBack(hair, c, rng, R, { count: 12, length: [0.42, 0.55] });
  },
  long(hair, c, R, rng) {
    hairCap(hair, R * 1.07, c.hairRoot, { cover: 0.62, tilt: -0.35 });
    bangs(hair, c, [[-0.08, 0.0, 0.5], [-0.055, 0.01, 0.6], [-0.03, -0.005, 0.7], [-0.005, 0.0, 0.8], [0.022, 0.02, 0.8], [0.048, 0.028, 0.6], [0.075, 0.03, 0.4]], { shift: -0.02 });
    sideLocks(hair, c, 0.45, 0.135);
    longBack(hair, c, rng, R, { count: 18 });
  },
  wavy(hair, c, R, rng) {
    hairCap(hair, R * 1.08, c.hairRoot, { cover: 0.62, tilt: -0.35 });
    bangs(hair, c, [[-0.07, 0.03, 0.2], [-0.04, 0.0, 0.1], [-0.01, 0.02, 0], [0.02, 0.0, -0.1], [0.05, 0.03, -0.2], [0.078, 0.05, -0.3]]);
    sideLocks(hair, c, 0.4, 0.145);
    longBack(hair, c, rng, R, { count: 18, length: [0.5, 0.66], wave: 0.035 });
  },
  ponytail(hair, c, R, rng) {
    hairCap(hair, R * 1.06, c.hairRoot, { cover: 0.62, tilt: -0.3 });
    bangs(hair, c, [[-0.075, 0.02, 0.3], [-0.045, -0.01, 0.2], [-0.015, 0.01, 0], [0.015, -0.01, 0], [0.045, 0.015, -0.2], [0.075, 0.03, -0.3]]);
    sideLocks(hair, c, 0.22, 0.12);
    const tie = [0, 0.1, -0.11];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const off = [Math.cos(a) * 0.02, Math.sin(a) * 0.02];
      addStrand(hair, [tie, [off[0], 0.12 + off[1], -0.17], [off[0] * 2, 0.0, -0.22], [off[0] * 3, -0.25, -0.2], [off[0] * 2, -0.48 + rng.range(-0.04, 0.04), -0.17]], { width: 0.034, rootColor: c.hairRoot, tipColor: i % 3 === 0 ? c.hairHighlight : c.hairTip, thick: 0.6, segments: 12, center: [0, 0.1, -0.1] });
    }
    part(hair, new THREE.TorusGeometry(0.022, 0.008, 6, 12), toon(c.accent ?? 0x8a0a1c), { pos: tie, rot: [0.3, 0, 0], outline: false });
  },
  bob(hair, c, R, rng) {
    hairCap(hair, R * 1.08, c.hairRoot, { cover: 0.62, tilt: -0.3 });
    bangs(hair, c, [[-0.075, 0.035, 0], [-0.05, 0.03, 0], [-0.025, 0.03, 0], [0.0, 0.03, 0], [0.025, 0.03, 0], [0.05, 0.03, 0], [0.075, 0.035, 0]]);
    for (let i = 0; i < 18; i++) {
      const theta = Math.PI * (0.3 + (i / 17) * 1.4);
      const root = capPoint(R * 1.06, theta, 0.75);
      const sx = Math.sin(theta), cz = Math.cos(theta);
      addStrand(hair, [root, [sx * 0.135, -0.02, cz * 0.13], [sx * 0.14, -0.1, cz * 0.13], [sx * 0.12, -0.15 + rng.range(-0.01, 0.01), cz * 0.115]], { width: 0.045, rootColor: c.hairRoot, tipColor: c.hairTip, thick: 0.35 });
    }
  },
};

export const HAIR_STYLES = { m: ['messy', 'slick', 'wolf', 'longMale'], f: ['long', 'wavy', 'ponytail', 'bob'] };

// ───────────────────────────────────────────── outfits ──────────────────────────────────────────

function maleOutfit(j, c, outfit) {
  const coat = toon(c.main);
  const lining = toon(c.accent, { side: THREE.BackSide, rim: 0.4 });
  part(j.spine, lathe([[0.125, -0.06], [0.12, 0.05], [0.13, 0.16], [0.14, 0.25]], { scaleZ: 0.7 }), toon(c.shirt));
  part(j.chest, lathe([[0.135, -0.1], [0.155, 0.0], [0.168, 0.1], [0.178, 0.2], [0.15, 0.265], [0.07, 0.295], [0.05, 0.31]], { scaleZ: 0.66 }), toon(c.shirt));
  part(j.chest, new THREE.CylinderGeometry(0.042, 0.048, 0.1, 10).translate(0, 0.3, 0), toon(c.skin), { outline: false });
  part(j.hips, lathe([[0.125, 0.08], [0.145, 0.0], [0.15, -0.06], [0.09, -0.11]], { scaleZ: 0.75 }), toon(c.pants));
  part(j.spine, new THREE.TorusGeometry(0.128, 0.016, 6, 24), toon(0x0d0b0f), { rot: [Math.PI / 2, 0, 0], scale: [1.05, 0.74, 1], outline: false });
  part(j.spine, new THREE.BoxGeometry(0.045, 0.035, 0.012), toon(c.trim), { pos: [0, 0, 0.098], outline: false });
  if (outfit === 'vest') {
    // fitted vest over a pale shirt + cravat
    const vest = [[0.14, -0.12], [0.155, 0.0], [0.17, 0.12], [0.175, 0.2], [0.14, 0.26]];
    part(j.chest, lathe(vest, { scaleZ: 0.7, gap: 0.6 }), coat, { scale: [1.03, 1, 1.05] });
    for (let i = 0; i < 4; i++) part(j.chest, new THREE.SphereGeometry(0.008, 6, 5), toon(c.trim), { pos: [0.045, 0.15 - i * 0.06, 0.105], outline: false });
    part(j.chest, new THREE.ConeGeometry(0.03, 0.09, 6), toon(c.accent), { pos: [0, 0.22, 0.1], rot: [Math.PI, 0, 0], outline: 0.003 });
    return;
  }
  const coatTorso = [[0.14, -0.14], [0.145, -0.05], [0.165, 0.05], [0.18, 0.15], [0.19, 0.22], [0.16, 0.275], [0.09, 0.3]];
  part(j.chest, lathe(coatTorso, { scaleZ: 0.7, gap: 0.75 }), coat, { scale: [1.04, 1, 1.06] });
  part(j.chest, lathe(coatTorso, { scaleZ: 0.7, gap: 0.75 }), lining, { scale: [1.035, 1, 1.05], outline: false });
  part(j.spine, lathe([[0.14, -0.05], [0.135, 0.06], [0.14, 0.2]], { scaleZ: 0.72, gap: 0.6 }), coat, { scale: [1.05, 1, 1.06] });
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) part(j.chest, new THREE.SphereGeometry(0.009, 8, 6), toon(c.trim), { pos: [0.07 * s, 0.17 - i * 0.075, 0.108], outline: false });
  const collar = [[0.075, 0.25], [0.088, 0.31], [0.11, 0.38], [0.13, 0.42]];
  part(j.chest, lathe(collar, { scaleZ: 0.85, gap: 1.25, segments: 20 }), coat, { pos: [0, 0, -0.012] });
  part(j.chest, lathe(collar, { scaleZ: 0.85, gap: 1.25, segments: 20 }), lining, { pos: [0, 0, -0.012], scale: [0.985, 1, 0.985], outline: false });
  if (outfit === 'coat') {
    const skirt = [[0.155, 0.08], [0.165, -0.04], [0.2, -0.28], [0.245, -0.55], [0.28, -0.76]];
    part(j.skirt, lathe(skirt, { gap: 0.95, scaleZ: 0.85, segments: 26 }), coat);
    part(j.skirt, lathe(skirt, { gap: 0.95, scaleZ: 0.85, segments: 26 }), lining, { scale: [0.99, 1, 0.99], outline: false });
  } else if (outfit === 'cape') {
    const capeGeo = new THREE.LatheGeometry([[0.4, -1.25], [0.32, -0.7], [0.24, -0.15], [0.2, 0.06]].map(([r, y]) => new THREE.Vector2(r, y)), 22, Math.PI * 0.42, Math.PI * 1.16);
    capeGeo.scale(1, 1, 0.75);
    part(j.cape, capeGeo, toon(c.main, { side: THREE.FrontSide }), { pos: [0, 0, 0.1] });
    part(j.cape, capeGeo.clone(), toon(c.accent, { side: THREE.BackSide, rim: 0.3 }), { pos: [0, 0, 0.1], scale: [0.98, 1, 0.98], outline: false });
  }
}

function femaleOutfit(j, c, outfit) {
  const skin = toon(c.skin, { rim: 0.6 });
  const ribbed = toon(0xffffff, { map: ribTexture(c.main) });
  const dark = toon(c.dark);
  part(j.spine, lathe([[0.1, -0.05], [0.098, 0.06], [0.106, 0.16], [0.12, 0.24]], { scaleZ: 0.72 }), ribbed);
  part(j.chest, lathe([[0.112, -0.1], [0.125, -0.02], [0.142, 0.07], [0.148, 0.13], [0.142, 0.17]], { scaleZ: 0.74 }), ribbed);
  part(j.chest, lathe([[0.136, 0.15], [0.142, 0.19], [0.13, 0.235], [0.07, 0.262], [0.045, 0.27]], { scaleZ: 0.7 }), skin);
  for (const s of [1, -1]) part(j.chest, new THREE.SphereGeometry(0.056, 14, 10), ribbed, { pos: [0.052 * s, 0.085, 0.052], scale: [1, 0.92, 0.8] });
  part(j.chest, new THREE.TorusGeometry(0.142, 0.013, 6, 30), dark, { pos: [0, 0.165, 0.008], rot: [Math.PI / 2 - 0.12, 0, 0], scale: [1.02, 0.78, 1], outline: 0.003 });
  part(j.chest, new THREE.CylinderGeometry(0.036, 0.042, 0.11, 10).translate(0, 0.29, 0), skin, { outline: false });
  part(j.spine, lathe([[0.104, -0.02], [0.101, 0.05], [0.108, 0.13]], { scaleZ: 0.73 }), dark, { scale: [1.06, 1, 1.08] });
  part(j.hips, lathe([[0.11, 0.08], [0.14, 0.0], [0.145, -0.06], [0.08, -0.11]], { scaleZ: 0.78 }), dark);
  if (outfit === 'gown') {
    const g = [[0.13, 0.08], [0.17, -0.1], [0.26, -0.45], [0.36, -0.86], [0.38, -0.9]];
    part(j.skirt, lathe(g, { segments: 30, scaleZ: 0.9 }), ribbed);
    part(j.skirt, lathe(g, { segments: 30, scaleZ: 0.9 }), toon(c.dark, { side: THREE.BackSide }), { scale: [0.99, 1, 0.99], outline: false });
    part(j.skirt, new THREE.TorusGeometry(0.36, 0.012, 4, 36), toon(c.trim), { pos: [0, -0.85, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.9, 1], outline: false });
  } else if (outfit === 'corset') {
    const s1 = [[0.13, 0.08], [0.16, -0.05], [0.22, -0.25], [0.26, -0.36]];
    part(j.skirt, lathe(s1, { segments: 28, scaleZ: 0.85 }), dark);
    part(j.skirt, lathe(s1, { segments: 28, scaleZ: 0.85 }), toon(c.main, { side: THREE.BackSide }), { scale: [0.99, 1, 0.99], outline: false });
    const train = [[0.14, 0.08], [0.18, -0.1], [0.27, -0.5], [0.34, -0.82]];
    part(j.skirt, lathe(train, { gap: 2.4, segments: 24, scaleZ: 0.9 }), toon(c.main));
  } else {
    // long coat over a dress
    const under = [[0.13, 0.08], [0.15, -0.04], [0.2, -0.28], [0.24, -0.5]];
    part(j.skirt, lathe(under, { segments: 28, scaleZ: 0.85 }), ribbed);
    const over = [[0.135, 0.09], [0.158, -0.04], [0.22, -0.32], [0.285, -0.6], [0.31, -0.78]];
    part(j.skirt, lathe(over, { gap: 1.1, segments: 28, scaleZ: 0.86 }), toon(c.dark));
    part(j.skirt, lathe(over, { gap: 1.1, segments: 28, scaleZ: 0.86 }), toon(c.main, { side: THREE.BackSide, rim: 0.3 }), { scale: [0.99, 1, 0.99], outline: false });
  }
}

// ───────────────────────────────────────────── public API ───────────────────────────────────────

/**
 * appearance: { seed, gender: 'm'|'f', hair, hairRoot, hairTip, hairHighlight, eye, skin, outfit, main, accent, dark, trim, shirt,
 *               pants, accessory: 'none'|'lily'|'crown'|'choker'|'earrings', weapon: 'sword'|'blades'|'dual'|'claws', heightScale }
 */
export function createVampireModel(a, opts = {}) {
  const female = a.gender === 'f';
  const dims = female
    ? { hipY: 0.93, thigh: 0.45, shin: 0.43, torso: 0.46, shoulderW: 0.162, hipW: 0.082, upperArm: 0.27, forearm: 0.24, neck: 0.066, headR: 0.106 }
    : { hipY: 0.97, thigh: 0.46, shin: 0.45, torso: 0.5, shoulderW: 0.2, hipW: 0.088, upperArm: 0.29, forearm: 0.26, neck: 0.06, headR: 0.112 };
  const j = buildSkeleton(dims);
  const R = dims.headR;
  const rng = seeded(a.seed ?? 1);
  const c = {
    main: a.main, accent: a.accent, dark: a.dark ?? 0x111015, trim: a.trim ?? 0xc0c4cf, shirt: a.shirt ?? 0x1d1b23, pants: a.pants ?? 0x17151c,
    skin: a.skin ?? 0xe9e4ec, hairRoot: a.hairRoot, hairTip: a.hairTip, hairHighlight: a.hairHighlight ?? a.hairTip, eye: a.eye,
  };
  if (female) femaleOutfit(j, c, a.outfit);
  else maleOutfit(j, c, a.outfit);
  buildLegs(j, dims, { pants: female ? 0x121015 : c.pants, boots: 0x0d0b10, bootTrim: c.trim }, { thighR: female ? 0.064 : 0.07, bootHeight: female ? 0.4 : 0.36 });
  if (female) {
    buildArms(j, dims, { sleeve: c.main, forearm: 0x0d0c10, gloves: 0x0d0c10, cuff: c.dark, cuffTrim: c.trim }, { armR: 0.04, female: true });
    for (const s of [1, -1]) part(s > 0 ? j.shoulderL : j.shoulderR, new THREE.SphereGeometry(0.066, 12, 10), toon(c.main), { pos: [0.008 * s, -0.04, 0], scale: [1, 1.2, 1] });
  } else {
    buildArms(j, dims, { coat: a.outfit === 'vest' ? 0xd8d2d4 : c.main, cuff: a.outfit === 'vest' ? null : c.accent, cuffTrim: c.trim, gloves: 0x0f0e13 }, { armR: 0.05 });
  }
  part(j.head, headGeometry(R, { jaw: female ? 0.42 : 0.4, width: female ? 0.88 : 0.9 }), toon(c.skin, { rim: 0.6 }), { outline: 0.0035 });
  buildEars(j.head, R, c.skin, female ? 1.2 : 0.6);
  buildFace(j.head, R, female
    ? { eyeColor: c.eye, skin: c.skin, eyeTilt: 0.14, browAngle: 0.05, browY: 0.03, browThick: 0.0024, lidHeavy: 1.15, wing: true, slit: true, lips: a.lips ?? 0x5e0a1c, fangs: a.fangs !== false, fangLen: 0.014, eyeW: 0.025, eyeH: 0.0165, eyeX: 0.039 }
    : { eyeColor: c.eye, skin: c.skin, eyeTilt: 0.18, browAngle: -0.28, browY: 0.024, browThick: 0.0038, lidHeavy: 1.1, slit: true, fangs: a.fangs !== false, smirk: rng.range(-0.2, 0.3), eyeW: 0.023, eyeH: 0.0145 });
  const style = HAIR[a.hair] ? a.hair : female ? 'long' : 'messy';
  HAIR[style](j.hair, c, R, rng);
  // accessories
  if (a.accessory === 'choker' || !female) {
    part(j.neck, new THREE.TorusGeometry(female ? 0.043 : 0.047, 0.008, 8, 20), toon(female ? c.dark : 0x0b0a0d), { pos: [0, 0.035, 0], rot: [Math.PI / 2, 0, 0], outline: false });
    if (!female) {
      part(j.neck, new THREE.BoxGeometry(0.008, 0.034, 0.005), toon(c.trim), { pos: [0, 0, 0.05], outline: false });
      part(j.neck, new THREE.BoxGeometry(0.022, 0.007, 0.005), toon(c.trim), { pos: [0, 0.006, 0.05], outline: false });
    } else part(j.neck, new THREE.OctahedronGeometry(0.009), glow(c.accent, 2.2), { pos: [0, 0.03, 0.048], outline: false });
  }
  if (a.accessory === 'earrings' || (female && a.accessory === 'lily')) {
    for (const s of [1, -1]) part(j.head, new THREE.OctahedronGeometry(0.009), glow(c.accent, 2.0), { pos: [s * R * 0.9, -0.07, -0.005], scale: [0.8, 1.5, 0.8], outline: false });
  }
  if (a.accessory === 'lily') {
    const lily = new THREE.Group();
    lily.position.set(-0.105, 0.06, -0.01);
    lily.rotation.set(0.2, -0.6, 0.4);
    j.hair.add(lily);
    const lm = toon(c.accent, { emissive: c.accent, emissiveIntensity: 0.25, rim: 1.2 });
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
      part(lily, strandGeometry([[0, 0, 0], [ca * 0.025, sa * 0.025, 0.012], [ca * 0.05, sa * 0.05 + 0.006, 0], [ca * 0.052, sa * 0.052 + 0.012, -0.018]], { width: 0.009, thick: 0.3, center: [0, 0, -0.05], segments: 6, radial: 5 }), lm, { outline: 0.002 });
    }
  }
  if (a.accessory === 'crown') {
    const crown = new THREE.Group();
    crown.position.set(0, 0.105, -0.01);
    j.head.add(crown);
    const gold = toon(a.crownColor ?? 0xc9a050, { rim: 1.8 });
    part(crown, new THREE.CylinderGeometry(0.098, 0.105, 0.035, 16, 1, true), gold, { outline: 0.003 });
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2, h = i % 2 ? 0.05 : 0.09;
      part(crown, new THREE.ConeGeometry(0.014, h, 4), gold, { pos: [Math.sin(an) * 0.1, h / 2 + 0.015, Math.cos(an) * 0.1], outline: 0.002 });
    }
    part(crown, new THREE.OctahedronGeometry(0.018), glow(c.accent, 2.5), { pos: [0, 0.04, 0.105], scale: [0.8, 1.3, 0.5], outline: false });
  }
  // weapon
  const weapon = a.weapon ?? (female ? 'blades' : 'sword');
  const style2 = weapon === 'blades' ? 'blades' : weapon === 'dual' || weapon === 'claws' ? 'dual' : 'sword';
  let blades = null;
  if (weapon === 'sword') {
    const sw = new THREE.Group();
    sw.position.set(0, -0.04, 0);
    sw.rotation.x = 0.8;
    j.handR.add(sw);
    part(sw, new THREE.CylinderGeometry(0.016, 0.018, 0.2, 8), toon(0x0c0a0e), { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.02], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.2, 0.024, 0.03), toon(c.trim), { pos: [0, 0, 0.125], outline: 0.003 });
    part(sw, new THREE.BoxGeometry(0.05, 0.012, 0.95), toon(0x1a1820, { rim: 1.6 }), { pos: [0, 0, 0.6], outline: 0.004 });
    part(sw, new THREE.BoxGeometry(0.006, 0.016, 0.85), glow(c.accent, 2.4), { pos: [0, 0, 0.58], outline: false });
  } else if (weapon === 'dual' || weapon === 'claws') {
    for (const side of ['L', 'R']) {
      const g = new THREE.Group();
      g.position.set(0, -0.04, 0);
      g.rotation.x = weapon === 'claws' ? 0.2 : 1.25;
      j['hand' + side].add(g);
      if (weapon === 'claws') {
        for (let f = 0; f < 3; f++) part(g, strandGeometry([[(f - 1) * 0.02, -0.03, 0], [(f - 1) * 0.03, -0.12, 0.04], [(f - 1) * 0.035, -0.22, 0.12]], { width: 0.012, thick: 0.6, segments: 6, radial: 4 }), glow(c.accent, 1.6), { outline: 0.002 });
      } else {
        const bl = bladeGeometry(0.55, 0.05, 0.14, 0.009);
        bl.rotateY(-Math.PI / 2);
        bl.rotateZ(Math.PI / 2);
        part(g, bl, toon(0xa8b0c0, { rim: 1.8 }), { pos: [0, 0, 0.08], outline: 0.0035 });
      }
    }
  } else {
    blades = [];
    for (const s of [1, -1]) {
      const holder = new THREE.Group();
      holder.position.set(0.07 * s, -0.08, 0.06);
      holder.rotation.set(1.1, 0, 0);
      (s > 0 ? j.handL : j.handR).add(holder);
      const bm = new THREE.Mesh(bladeGeometry(0.45, 0.07, 0.2, 0.012), toon(c.accent, { emissive: c.accent, emissiveIntensity: 0.9, transparent: true, opacity: 0.92, rim: 2 }));
      bm.rotation.set(0, -Math.PI / 2, Math.PI / 2 + (s > 0 ? 0 : Math.PI));
      bm.position.set(0, 0, 0.03);
      holder.add(bm);
      blades.push(holder);
    }
  }
  optimiseRig(j.root, { outlines: opts.outlines !== false });
  const scale = (opts.scale ?? 1) * (a.heightScale ?? 1);
  j.root.scale.setScalar(scale);
  const animator = new HumanoidAnimator(j, style2, { female, vampire: true });
  const mats = [];
  j.root.traverse((o) => {
    if (o.isMesh) o.castShadow = !o.userData.isOutline;
  });
  let time = 0;
  return {
    root: j.root,
    joints: j,
    style: style2,
    height: 1.85 * scale,
    update(dt, state = {}) {
      time += dt;
      animator.update(dt, state);
      if (blades) blades.forEach((b, i) => (b.position.y = -0.08 + Math.sin(time * 2.6 + i * 1.7) * 0.02));
    },
    flashHit() {},
    setOpacity(v) {
      j.root.visible = v > 0.05;
    },
    dispose() {
      disposeObject(j.root);
      mats.forEach((m) => m.dispose());
    },
  };
}

// ───────────────────────────────────────────── instanced crowd ──────────────────────────────────

/**
 * Low-poly silhouettes rendered with InstancedMesh: 4 draw calls per gender for any number of
 * distant vampires. Each part gets per-instance colours (outfit, hair).
 */
export function createCrowdGeometry(gender) {
  const female = gender === 'f';
  const parts = {};
  if (female) {
    parts.body = mergeGeometries([
      new THREE.LatheGeometry([[0.02, 0.0], [0.38, 0.0], [0.3, 0.45], [0.18, 0.92], [0.11, 1.05], [0.13, 1.25], [0.15, 1.38], [0.11, 1.5], [0.05, 1.52]].map(([r, y]) => new THREE.Vector2(r, y)), 8),
      new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5).rotateZ(0.2).translate(0.2, 1.2, 0),
      new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5).rotateZ(-0.2).translate(-0.2, 1.2, 0),
    ].map((g) => (g.index ? g.toNonIndexed() : g)));
    parts.head = new THREE.SphereGeometry(0.105, 8, 6).scale(0.88, 1.12, 0.95).translate(0, 1.66, 0);
    parts.hair = mergeGeometries([
      new THREE.SphereGeometry(0.118, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(0, 1.67, -0.01),
      new THREE.CylinderGeometry(0.13, 0.17, 0.62, 6, 1, true, Math.PI * 0.5, Math.PI).translate(0, 1.36, -0.03),
    ].map((g) => (g.index ? g.toNonIndexed() : g)));
  } else {
    parts.body = mergeGeometries([
      new THREE.LatheGeometry([[0.02, 0.0], [0.14, 0.02], [0.16, 0.25], [0.26, 0.26], [0.2, 0.95], [0.16, 1.05], [0.19, 1.35], [0.22, 1.5], [0.06, 1.58]].map(([r, y]) => new THREE.Vector2(r, y)), 8),
      new THREE.CylinderGeometry(0.045, 0.04, 0.58, 5).rotateZ(0.12).translate(0.24, 1.2, 0),
      new THREE.CylinderGeometry(0.045, 0.04, 0.58, 5).rotateZ(-0.12).translate(-0.24, 1.2, 0),
    ].map((g) => (g.index ? g.toNonIndexed() : g)));
    parts.head = new THREE.SphereGeometry(0.112, 8, 6).scale(0.9, 1.12, 0.95).translate(0, 1.74, 0);
    parts.hair = new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62).translate(0, 1.76, -0.015);
  }
  parts.eyes = mergeGeometries([
    new THREE.SphereGeometry(0.016, 4, 3).translate(0.038, female ? 1.655 : 1.73, 0.095),
    new THREE.SphereGeometry(0.016, 4, 3).translate(-0.038, female ? 1.655 : 1.73, 0.095),
  ]);
  for (const k in parts) parts[k].computeVertexNormals();
  return parts;
}
