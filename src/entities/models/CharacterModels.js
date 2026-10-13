// Procedural cel-shaded anime characters: Lucien Noctis, Seraphina Vex, Kairo Draeven + villagers.
import * as THREE from 'three';
import { toon, glow, flat, part, limb, lathe, strandGeometry, bladeGeometry, optimiseRig, disposeObject } from './Toon.js';
import { buildSkeleton, headGeometry, buildFace, buildEars, buildLegs, buildArms, HumanoidAnimator } from './Humanoid.js';
import { seeded } from '../../core/utils.js';

// ───────────────────────────────────────────── palettes / cosmetics ─────────────────────────────

export const COSMETICS = {
  lucien: {
    default: {
      name: 'Nocturne Regalia',
      desc: 'Black gothic coat lined in blood-red silk, silver clasps.',
      colors: {
        coat: 0x131118, lining: 0x7d0c1d, trim: 0xb9bfcb, shirt: 0x1d1b23, pants: 0x17151c, boots: 0x0d0b10,
        gloves: 0x0f0e13, hairRoot: 0x121217, hairTip: 0x4a4e5c, hairStreak: 0x9fa6b8, eye: 0xff1f3a, skin: 0xf4dfd8,
        blade: 0x18161f, bladeGlow: 0xff1030, gem: 0xff1030,
      },
    },
    silver_moon: {
      name: 'Silver Moon',
      desc: 'A moon-white coat of a forgotten royal guard. Unlocked by recovering every hidden relic.',
      colors: {
        coat: 0xd3d6df, lining: 0x283453, trim: 0x8a93a9, shirt: 0x24212d, pants: 0x2a2833, boots: 0x15131a,
        gloves: 0xe4e6ec, hairRoot: 0x1a1b22, hairTip: 0x9ba2b5, hairStreak: 0xdfe3ee, eye: 0xff2a48, skin: 0xf4dfd8,
        blade: 0x2b2f3d, bladeGlow: 0x8fb4ff, gem: 0x8fb4ff,
      },
    },
    crimson_regalia: {
      name: 'Crimson Regalia',
      desc: 'The colours of a king who never was. Unlocked by defeating the Veiled Countess.',
      colors: {
        coat: 0x5c0915, lining: 0x120f15, trim: 0xd3a65a, shirt: 0x15131a, pants: 0x140f13, boots: 0x0c0a0d,
        gloves: 0x120e12, hairRoot: 0x101014, hairTip: 0x3b2a33, hairStreak: 0x8a2a3c, eye: 0xff2828, skin: 0xf4dfd8,
        blade: 0x1a0d10, bladeGlow: 0xff2a1a, gem: 0xffb040,
      },
    },
  },
  seraphina: {
    default: {
      name: 'Crimson Rose',
      desc: 'Ribbed crimson velvet, black lace and a spider-lily in her hair.',
      colors: {
        dress: 0x9a1529, dressDark: 0x5a0a17, black: 0x111015, lace: 0x0d0c10, trim: 0xc0c4cf, skin: 0xf6e3dd,
        hairRoot: 0x0c0b0f, hairTip: 0x1d1520, hairHighlight: 0x5c1426, eye: 0xff1b3d, lips: 0x8e1428, lily: 0xd0142e,
        stockings: 0x121015, boots: 0x0c0b0e, bladeGlow: 0xd0102c,
      },
    },
    midnight_violet: {
      name: 'Midnight Violet',
      desc: 'Violet silk worn at the court of the old Queen. Unlocked by discovering every secret room.',
      colors: {
        dress: 0x4b2a7a, dressDark: 0x26163f, black: 0x110f17, lace: 0x0f0d14, trim: 0xc8bfe0, skin: 0xf6e3dd,
        hairRoot: 0x0d0b12, hairTip: 0x221830, hairHighlight: 0x4c2c78, eye: 0xc04cff, lips: 0x6a1a52, lily: 0xa25cff,
        stockings: 0x14111a, boots: 0x0d0b10, bladeGlow: 0xa04cff,
      },
    },
    crimson_regalia: {
      name: 'Queen of Thorns',
      desc: 'Black and gold, fit for the Crimson Moon. Unlocked by defeating the Veiled Countess.',
      colors: {
        dress: 0x15121a, dressDark: 0x2a0710, black: 0x0c0b0f, lace: 0x0a090c, trim: 0xd4a95c, skin: 0xf6e3dd,
        hairRoot: 0x0b0a0d, hairTip: 0x1a1216, hairHighlight: 0x7a1020, eye: 0xff2a2a, lips: 0x7a0d1c, lily: 0xd4a95c,
        stockings: 0x0f0d10, boots: 0x0b0a0c, bladeGlow: 0xff3a20,
      },
    },
  },
  kairo: {
    default: {
      name: 'Hunter\'s Oath',
      desc: 'Black combat leathers and silver plate of the Order of the Pale Dawn.',
      colors: {
        suit: 0x16171d, armor: 0x9ea7b8, armorDark: 0x4f5668, scarf: 0x1e2c48, belt: 0x2c2420, skin: 0xebc8b4,
        hairRoot: 0x15151b, hairTip: 0x2b2b35, hairStreak: 0xf0f2f7, eye: 0x3f8cff, bladeGlow: 0x4f9dff, gloves: 0x1b1b21, boots: 0x111116,
      },
    },
    frost_hunter: {
      name: 'Frost Hunter',
      desc: 'Pale winter armour of the northern chapter. Unlocked by destroying every cursed altar.',
      colors: {
        suit: 0x1c2533, armor: 0xe3eaf4, armorDark: 0x7d8ca3, scarf: 0x8db2d8, belt: 0x3a3f4a, skin: 0xebc8b4,
        hairRoot: 0x17181f, hairTip: 0x353a48, hairStreak: 0xffffff, eye: 0x7fd8ff, bladeGlow: 0x8fe0ff, gloves: 0x242c3a, boots: 0x161b24,
      },
    },
    crimson_regalia: {
      name: 'Oathbreaker',
      desc: 'Black and gold of a hunter who has seen the truth. Unlocked by defeating the Veiled Countess.',
      colors: {
        suit: 0x1a0d10, armor: 0xb98f4c, armorDark: 0x5a3f22, scarf: 0x6e0d1b, belt: 0x241812, skin: 0xebc8b4,
        hairRoot: 0x141217, hairTip: 0x2a2026, hairStreak: 0xf0e6dc, eye: 0x4f9dff, bladeGlow: 0xffb04a, gloves: 0x170f12, boots: 0x100b0d,
      },
    },
  },
};

export function getCosmetic(charId, cosmeticId) {
  const set = COSMETICS[charId] || COSMETICS.lucien;
  return set[cosmeticId] || set.default;
}

// ───────────────────────────────────────────── hair helpers ─────────────────────────────────────

/** Point on the hair cap (theta: 0 = front, around Y; phi: 0 = top). */
export function capPoint(R, theta, phi, yScale = 1.08) {
  return [R * Math.sin(phi) * Math.sin(theta), R * Math.cos(phi) * yScale, R * Math.sin(phi) * Math.cos(theta)];
}

export function addStrand(group, points, o) {
  const mat = toon(0xffffff, { vertexColors: true, rim: 1.4 });
  return part(group, strandGeometry(points, { center: [0, 0.0, 0], segments: 9, radial: 6, ...o }), mat, { outline: o.outline ?? 0.004 });
}

export function hairCap(group, R, color, opts = {}) {
  const g = new THREE.SphereGeometry(R, 28, 18, 0, Math.PI * 2, 0, Math.PI * (opts.cover ?? 0.6));
  g.scale(opts.sx ?? 0.95, 1.08, opts.sz ?? 1.02);
  part(group, g, toon(color, { rim: 1.4 }), { rot: [opts.tilt ?? -0.38, 0, 0], pos: [0, opts.y ?? 0.005, opts.z ?? -0.008], outline: 0.004 });
}

/** Messy anime spikes distributed over a region of the scalp. */
export function spikes(group, rng, o) {
  for (let i = 0; i < o.count; i++) {
    const theta = rng.range(o.theta[0], o.theta[1]);
    const phi = rng.range(o.phi[0], o.phi[1]);
    const root = capPoint(o.R, theta, phi);
    const outv = [Math.sin(theta) * Math.sin(phi), Math.cos(phi), Math.cos(theta) * Math.sin(phi)];
    const len = rng.range(o.len[0], o.len[1]);
    const droop = o.droop ?? 0.6;
    const out = o.out ?? 0.55;
    const mid = [
      root[0] + outv[0] * len * out * 0.5,
      root[1] + outv[1] * len * out * 0.4 - len * droop * 0.35,
      root[2] + outv[2] * len * out * 0.5,
    ];
    const tip = [
      root[0] + outv[0] * len * out + rng.range(-0.015, 0.015),
      root[1] + outv[1] * len * out * 0.3 - len * droop + rng.range(-0.01, 0.01),
      root[2] + outv[2] * len * out + (o.back ?? 0) * len,
    ];
    const streak = o.streakChance && rng() < o.streakChance;
    addStrand(group, [root, mid, tip], {
      width: rng.range(o.width[0], o.width[1]),
      rootColor: streak ? o.streakRoot ?? o.root : o.root,
      tipColor: streak ? o.streak : o.tip,
      thick: 0.45,
    });
  }
}

// ───────────────────────────────────────────── LUCIEN ───────────────────────────────────────────

function buildLucien(c) {
  const dims = { hipY: 0.97, thigh: 0.46, shin: 0.45, torso: 0.5, shoulderW: 0.2, hipW: 0.088, upperArm: 0.29, forearm: 0.26, neck: 0.06, headR: 0.112 };
  const j = buildSkeleton(dims);
  const R = dims.headR;

  // torso: shirt core + coat shell open at the front (red lining shows on the inside)
  part(j.spine, lathe([[0.125, -0.06], [0.12, 0.05], [0.13, 0.16], [0.14, 0.25]], { scaleZ: 0.7 }), toon(c.shirt));
  part(j.chest, lathe([[0.135, -0.1], [0.155, 0.0], [0.168, 0.1], [0.178, 0.2], [0.15, 0.265], [0.07, 0.295], [0.05, 0.31]], { scaleZ: 0.66 }), toon(c.shirt));
  const coatTorso = [[0.14, -0.14], [0.145, -0.05], [0.165, 0.05], [0.18, 0.15], [0.19, 0.22], [0.16, 0.275], [0.09, 0.3]];
  part(j.chest, lathe(coatTorso, { scaleZ: 0.7, gap: 0.75 }), toon(c.coat), { scale: [1.04, 1, 1.06] });
  part(j.chest, lathe(coatTorso, { scaleZ: 0.7, gap: 0.75 }), toon(c.lining, { side: THREE.BackSide }), { scale: [1.035, 1, 1.05], outline: false });
  part(j.spine, lathe([[0.14, -0.05], [0.135, 0.06], [0.14, 0.2]], { scaleZ: 0.72, gap: 0.6 }), toon(c.coat), { scale: [1.05, 1, 1.06] });
  // high collar: black outside, crimson inside — frames the face
  const collar = [[0.075, 0.25], [0.088, 0.31], [0.11, 0.38], [0.13, 0.42]];
  part(j.chest, lathe(collar, { scaleZ: 0.85, gap: 1.25, segments: 20 }), toon(c.coat), { pos: [0, 0, -0.012] });
  part(j.chest, lathe(collar, { scaleZ: 0.85, gap: 1.25, segments: 20 }), toon(c.lining, { side: THREE.BackSide, rim: 0.4 }), { pos: [0, 0, -0.012], scale: [0.985, 1, 0.985], outline: false });
  // zipper / inner shirt line, buttons and silver clasps
  part(j.chest, new THREE.BoxGeometry(0.006, 0.26, 0.006), toon(c.trim), { pos: [0, 0.08, 0.112], outline: false });
  for (let i = 0; i < 3; i++) {
    for (const s of [1, -1]) {
      part(j.chest, new THREE.SphereGeometry(0.009, 8, 6), toon(c.trim), { pos: [0.07 * s, 0.17 - i * 0.075, 0.108 - i * 0.004], outline: false });
    }
  }
  part(j.chest, new THREE.BoxGeometry(0.1, 0.008, 0.008), toon(c.trim), { pos: [0, 0.17, 0.118], outline: false }); // chain clasp
  // choker + silver cross pendant (reference: black choker, silver cross)
  part(j.neck, new THREE.TorusGeometry(0.047, 0.009, 8, 20), toon(0x0b0a0d), { pos: [0, 0.035, 0.0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.95, 1], outline: false });
  part(j.neck, new THREE.BoxGeometry(0.008, 0.034, 0.005), toon(c.trim), { pos: [0, -0.0, 0.05], outline: false });
  part(j.neck, new THREE.BoxGeometry(0.022, 0.007, 0.005), toon(c.trim), { pos: [0, 0.006, 0.05], outline: false });
  // neck
  part(j.chest, new THREE.CylinderGeometry(0.042, 0.048, 0.1, 10).translate(0, 0.3, 0), toon(c.skin), { outline: false });
  // epaulettes
  for (const s of [1, -1]) {
    const sh = s > 0 ? j.shoulderL : j.shoulderR;
    part(sh, new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(c.coat), { pos: [0.01 * s, 0.015, 0], scale: [1.15, 0.6, 1.0] });
    part(sh, new THREE.TorusGeometry(0.083, 0.006, 6, 18), toon(c.trim), { pos: [0.01 * s, 0.012, 0], rot: [Math.PI / 2, 0, 0], scale: [1.15, 1, 1], outline: false });
  }
  // belt
  part(j.spine, new THREE.TorusGeometry(0.128, 0.016, 6, 24), toon(0x0d0b0f), { pos: [0, 0.0, 0.0], rot: [Math.PI / 2, 0, 0], scale: [1.05, 0.74, 1], outline: false });
  part(j.spine, new THREE.BoxGeometry(0.045, 0.035, 0.012), toon(c.trim), { pos: [0, 0.0, 0.098], outline: false });
  // pelvis
  part(j.hips, lathe([[0.125, 0.08], [0.145, 0.0], [0.15, -0.06], [0.09, -0.11]], { scaleZ: 0.75 }), toon(c.pants));
  // long coat skirt, open at the front, lined in red
  const skirt = [[0.155, 0.08], [0.165, -0.04], [0.2, -0.28], [0.245, -0.55], [0.28, -0.76]];
  part(j.skirt, lathe(skirt, { gap: 0.95, scaleZ: 0.85, segments: 28 }), toon(c.coat, { side: THREE.FrontSide }));
  part(j.skirt, lathe(skirt, { gap: 0.95, scaleZ: 0.85, segments: 28 }), toon(c.lining, { side: THREE.BackSide, rim: 0.3 }), { scale: [0.99, 1, 0.99], outline: false });
  part(j.skirt, lathe([[0.282, -0.745], [0.286, -0.775]], { gap: 0.95, scaleZ: 0.85, segments: 28 }), toon(c.trim), { outline: false });

  buildLegs(j, dims, { pants: c.pants, boots: c.boots, bootTrim: c.trim }, { thighR: 0.07, bootHeight: 0.36, bootBuckle: c.trim });
  buildArms(j, dims, { coat: c.coat, cuff: c.lining, cuffTrim: c.trim, gloves: c.gloves }, { armR: 0.05 });

  // head
  part(j.head, headGeometry(R, { jaw: 0.4 }), toon(c.skin, { rim: 0.6 }), { outline: 0.0035 });
  buildEars(j.head, R, c.skin, 0.55);
  const face = buildFace(j.head, R, { eyeColor: c.eye, skin: c.skin, eyeTilt: 0.18, browAngle: -0.22, browY: 0.026, lidHeavy: 1.1, slit: true, fangs: true, smirk: 0.25, eyeW: 0.023, eyeH: 0.0145 });

  // hair: messy silver-black, bangs falling between the eyes
  const hair = j.hair;
  const rng = seeded(1337);
  hairCap(hair, R * 1.06, c.hairRoot, { cover: 0.58, tilt: -0.42 });
  const bangs = [
    [-0.085, 0.03, 0.4], [-0.058, -0.015, 0.25], [-0.03, 0.025, 0.1], [-0.006, -0.05, -0.05], [0.018, -0.03, 0.05],
    [0.042, 0.02, -0.12], [0.066, -0.01, -0.2], [0.09, 0.035, -0.4],
  ];
  for (const [x, tipY, sweep] of bangs) {
    addStrand(hair, [
      [x * 0.4, 0.125, 0.03],
      [x * 0.95, 0.09, 0.115],
      [x * 1.05 + sweep * 0.02, (0.09 + tipY) / 2, 0.135],
      [x * 1.1 + sweep * 0.04, tipY, 0.127],
    ], { width: 0.024, rootColor: c.hairRoot, tipColor: c.hairTip, thick: 0.4 });
  }
  // side locks covering the ears
  for (const s of [1, -1]) {
    addStrand(hair, [[0.08 * s, 0.09, 0.05], [0.115 * s, 0.02, 0.07], [0.12 * s, -0.06, 0.07], [0.11 * s, -0.105, 0.075]], { width: 0.028, rootColor: c.hairRoot, tipColor: c.hairTip });
    addStrand(hair, [[0.09 * s, 0.08, 0.0], [0.128 * s, 0.0, 0.02], [0.13 * s, -0.07, 0.01]], { width: 0.03, rootColor: c.hairRoot, tipColor: c.hairTip });
  }
  spikes(hair, rng, { R: R * 1.06, count: 26, theta: [Math.PI * 0.35, Math.PI * 1.65], phi: [0.35, 1.45], len: [0.09, 0.15], width: [0.026, 0.036], droop: 0.75, out: 0.55, root: c.hairRoot, tip: c.hairTip, streak: c.hairStreak, streakChance: 0.18 });
  spikes(hair, rng, { R: R * 1.08, count: 10, theta: [-0.9, 0.9], phi: [0.2, 0.6], len: [0.07, 0.11], width: [0.026, 0.032], droop: 0.45, out: 0.55, back: -0.25, root: c.hairRoot, tip: c.hairTip, streak: c.hairStreak, streakChance: 0.2 });

  // ── Weapon: supernatural black longsword (right hand, blade along +Z)
  const sword = new THREE.Group();
  sword.position.set(0, -0.04, 0.0);
  sword.rotation.x = 0.8;
  j.handR.add(sword);
  const metal = toon(c.blade, { rim: 1.6 });
  part(sword, new THREE.CylinderGeometry(0.016, 0.018, 0.2, 8), toon(0x0c0a0e), { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.02], outline: 0.003 });
  part(sword, new THREE.BoxGeometry(0.22, 0.026, 0.03), toon(c.trim), { pos: [0, 0, 0.125], outline: 0.003 });
  for (const s of [1, -1]) part(sword, new THREE.SphereGeometry(0.02, 8, 6), toon(c.trim), { pos: [0.11 * s, 0.0, 0.13], outline: false });
  part(sword, new THREE.OctahedronGeometry(0.026), glow(c.gem, 2.2), { pos: [0, 0, -0.095], outline: false });
  part(sword, new THREE.OctahedronGeometry(0.018), glow(c.gem, 2.0), { pos: [0, 0.0, 0.125], scale: [1, 1, 0.6], outline: false });
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.03, 0);
  bladeShape.lineTo(0.03, 0);
  bladeShape.lineTo(0.026, 0.86);
  bladeShape.lineTo(0, 1.02);
  bladeShape.lineTo(-0.026, 0.86);
  bladeShape.lineTo(-0.03, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 1 });
  bladeGeo.translate(0, 0, -0.006);
  bladeGeo.rotateX(Math.PI / 2);
  bladeGeo.rotateZ(Math.PI / 2);
  part(sword, bladeGeo, metal, { pos: [0, 0, 0.135], outline: 0.004 });
  part(sword, new THREE.BoxGeometry(0.004, 0.014, 0.82), glow(c.bladeGlow, 2.6), { pos: [0, 0, 0.56], outline: false });

  return { j, dims, face, style: 'sword', female: false, weapon: sword, height: 1.9 };
}

// ───────────────────────────────────────────── SERAPHINA ────────────────────────────────────────

let ribTexCache = new Map();
export function ribTexture(color) {
  if (ribTexCache.has(color)) return ribTexCache.get(color);
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 8;
  const ctx = cv.getContext('2d');
  const base = new THREE.Color(color);
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, 64, 8);
  const dark = base.clone().multiplyScalar(0.62);
  ctx.fillStyle = '#' + dark.getHexString();
  for (let x = 0; x < 64; x += 4) ctx.fillRect(x, 0, 1.4, 8);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  ribTexCache.set(color, tex);
  return tex;
}

function buildSeraphina(c) {
  const dims = { hipY: 0.93, thigh: 0.45, shin: 0.43, torso: 0.46, shoulderW: 0.162, hipW: 0.082, upperArm: 0.27, forearm: 0.24, neck: 0.066, headR: 0.106 };
  const j = buildSkeleton(dims);
  const R = dims.headR;
  const skin = toon(c.skin, { rim: 0.6 });
  const ribbed = toon(0xffffff, { map: ribTexture(c.dress) });

  // bodice (ribbed crimson) + bare shoulders + black ruffle trim
  part(j.spine, lathe([[0.1, -0.05], [0.098, 0.06], [0.106, 0.16], [0.12, 0.24]], { scaleZ: 0.72 }), ribbed);
  part(j.chest, lathe([[0.112, -0.1], [0.125, -0.02], [0.142, 0.07], [0.148, 0.13], [0.142, 0.17]], { scaleZ: 0.74 }), ribbed);
  part(j.chest, lathe([[0.136, 0.15], [0.142, 0.19], [0.13, 0.235], [0.07, 0.262], [0.045, 0.27]], { scaleZ: 0.7 }), skin);
  for (const s of [1, -1]) {
    part(j.chest, new THREE.SphereGeometry(0.058, 14, 10), ribbed, { pos: [0.052 * s, 0.085, 0.052], scale: [1, 0.92, 0.8] });
  }
  part(j.chest, new THREE.TorusGeometry(0.142, 0.014, 6, 30), toon(c.black), { pos: [0, 0.165, 0.008], rot: [Math.PI / 2 - 0.12, 0, 0], scale: [1.02, 0.78, 1], outline: 0.003 });
  // ruffles along the neckline
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    part(j.chest, new THREE.SphereGeometry(0.02, 6, 5), toon(c.black), { pos: [Math.sin(a) * 0.15, 0.17 + Math.cos(a) * 0.012, Math.cos(a) * 0.11 + 0.008], scale: [1.2, 0.7, 0.8], outline: false });
  }
  // necklace and choker with ruby
  part(j.chest, new THREE.TorusGeometry(0.075, 0.0025, 4, 24, Math.PI), toon(c.trim), { pos: [0, 0.255, 0.035], rot: [-0.55, 0, Math.PI], scale: [1, 1.15, 1], outline: false });
  part(j.chest, new THREE.OctahedronGeometry(0.012), glow(c.lily, 2.0), { pos: [0, 0.18, 0.1], scale: [0.8, 1.3, 0.6], outline: false });
  part(j.neck, new THREE.TorusGeometry(0.043, 0.008, 8, 20), toon(c.dressDark), { pos: [0, 0.035, 0], rot: [Math.PI / 2, 0, 0], outline: false });
  part(j.neck, new THREE.OctahedronGeometry(0.009), glow(c.lily, 2.2), { pos: [0, 0.03, 0.048], outline: false });
  part(j.chest, new THREE.CylinderGeometry(0.036, 0.042, 0.11, 10).translate(0, 0.29, 0), skin, { outline: false });
  // corset cincher with silver lacing
  part(j.spine, lathe([[0.104, -0.02], [0.101, 0.05], [0.108, 0.13]], { scaleZ: 0.73 }), toon(c.black), { scale: [1.06, 1, 1.08] });
  for (let i = 0; i < 4; i++) {
    for (const s of [1, -1]) {
      part(j.spine, new THREE.BoxGeometry(0.045, 0.0035, 0.004), toon(c.trim), { pos: [0, 0.0 + i * 0.033, 0.083], rot: [0, 0, 0.5 * s], outline: false });
    }
  }
  // hips + layered skirt: crimson underskirt, black overskirt open at the front
  part(j.hips, lathe([[0.11, 0.08], [0.14, 0.0], [0.145, -0.06], [0.08, -0.11]], { scaleZ: 0.78 }), toon(c.dressDark));
  const under = [[0.13, 0.08], [0.15, -0.04], [0.2, -0.28], [0.25, -0.52]];
  part(j.skirt, lathe(under, { segments: 30, scaleZ: 0.85 }), ribbed);
  part(j.skirt, lathe(under, { segments: 30, scaleZ: 0.85 }), toon(c.dressDark, { side: THREE.BackSide }), { scale: [0.99, 1, 0.99], outline: false });
  const over = [[0.135, 0.09], [0.158, -0.04], [0.22, -0.32], [0.285, -0.6], [0.32, -0.78]];
  part(j.skirt, lathe(over, { gap: 1.1, segments: 30, scaleZ: 0.86 }), toon(c.black));
  part(j.skirt, lathe(over, { gap: 1.1, segments: 30, scaleZ: 0.86 }), toon(c.dressDark, { side: THREE.BackSide, rim: 0.3 }), { scale: [0.99, 1, 0.99], outline: false });
  part(j.skirt, lathe([[0.322, -0.76], [0.326, -0.79]], { gap: 1.1, segments: 30, scaleZ: 0.86 }), toon(c.trim), { outline: false });

  buildLegs(j, dims, { pants: c.stockings, boots: c.boots, bootTrim: c.dressDark }, { thighR: 0.064, bootHeight: 0.4 });
  // arms: puffed crimson sleeves + long black lace gloves
  buildArms(j, dims, { sleeve: c.dress, forearm: c.lace, gloves: c.lace, cuff: c.black, cuffTrim: c.trim }, { armR: 0.04, female: true });
  for (const s of [1, -1]) {
    const sh = s > 0 ? j.shoulderL : j.shoulderR;
    part(sh, new THREE.SphereGeometry(0.068, 14, 10), ribbed, { pos: [0.008 * s, -0.04, 0], scale: [1, 1.2, 1] });
    part(sh, new THREE.TorusGeometry(0.05, 0.01, 6, 16), toon(c.black), { pos: [0, -0.12, 0], rot: [Math.PI / 2, 0, 0], outline: false });
  }

  // head + face
  part(j.head, headGeometry(R, { jaw: 0.42, width: 0.88 }), skin, { outline: 0.0035 });
  buildEars(j.head, R, c.skin, 1.25);
  const face = buildFace(j.head, R, { eyeColor: c.eye, skin: c.skin, eyeTilt: 0.14, browAngle: 0.05, browY: 0.03, browThick: 0.0024, lidHeavy: 1.15, wing: true, slit: true, lips: c.lips, fangs: false, eyeW: 0.025, eyeH: 0.0165, eyeX: 0.039 });
  // dangling ruby earrings
  for (const s of [1, -1]) {
    part(j.head, new THREE.CylinderGeometry(0.0015, 0.0015, 0.04, 4), toon(c.trim), { pos: [s * R * 0.9, -0.045, -0.005], outline: false });
    part(j.head, new THREE.OctahedronGeometry(0.009), glow(c.lily, 2.0), { pos: [s * R * 0.9, -0.07, -0.005], scale: [0.8, 1.5, 0.8], outline: false });
  }

  // hair: long, straight, black with burgundy highlights
  const hair = j.hair;
  const rng = seeded(4242);
  hairCap(hair, R * 1.07, c.hairRoot, { cover: 0.62, tilt: -0.35 });
  // side-swept bangs
  const bangs = [[-0.08, 0.0, 0.5], [-0.055, 0.01, 0.6], [-0.03, -0.005, 0.7], [-0.005, 0.0, 0.8], [0.022, 0.02, 0.8], [0.048, 0.028, 0.6], [0.075, 0.03, 0.4]];
  for (const [x, tipY, sweep] of bangs) {
    addStrand(hair, [[x * 0.3 - 0.02, 0.12, 0.04], [x * 0.8 - 0.01, 0.095, 0.11], [x + sweep * 0.03, (0.08 + tipY) / 2, 0.128], [x + sweep * 0.05, tipY, 0.12]], { width: 0.024, rootColor: c.hairRoot, tipColor: c.hairTip, thick: 0.38 });
  }
  // long face-framing locks falling over the chest
  for (const s of [1, -1]) {
    for (let k = 0; k < 2; k++) {
      const off = k * 0.018;
      addStrand(hair, [
        [0.075 * s, 0.085, 0.06 - off],
        [0.112 * s, 0.0, 0.07 - off],
        [(0.125 + off) * s, -0.15, 0.065 - off],
        [(0.14 + off) * s, -0.32, 0.06 - off],
        [(0.135 + off) * s, -0.45 + k * 0.05, 0.05 - off],
      ], { width: 0.03, rootColor: c.hairRoot, tipColor: k === 1 ? c.hairHighlight : c.hairTip, thick: 0.4, segments: 12 });
    }
  }
  // long back hair down to the waist
  const backCount = 18;
  for (let i = 0; i < backCount; i++) {
    const u = i / (backCount - 1);
    const theta = Math.PI * (0.55 + u * 0.9);
    const phi = rng.range(0.55, 1.1);
    const root = capPoint(R * 1.05, theta, phi);
    const spread = Math.sin(theta);
    const len = rng.range(0.6, 0.74);
    const highlight = i % 4 === 1;
    addStrand(hair, [
      root,
      [root[0] * 1.25, root[1] - 0.08, root[2] * 1.15 - 0.02],
      [spread * 0.16, -0.2, -0.13 - Math.abs(Math.cos(theta)) * 0.02],
      [spread * 0.17, -0.42, -0.155],
      [spread * 0.15 + rng.range(-0.02, 0.02), -len, -0.16],
    ], { width: rng.range(0.042, 0.055), rootColor: c.hairRoot, tipColor: highlight ? c.hairHighlight : c.hairTip, thick: 0.35, segments: 14, outline: 0.004 });
  }
  // spider-lily ornament on her right side
  const lily = new THREE.Group();
  lily.position.set(-0.105, 0.06, -0.01);
  lily.rotation.set(0.2, -0.6, 0.4);
  hair.add(lily);
  const lilyMat = toon(c.lily, { emissive: c.lily, emissiveIntensity: 0.25, rim: 1.2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    part(lily, strandGeometry([[0, 0, 0], [ca * 0.025, sa * 0.025, 0.012], [ca * 0.05, sa * 0.05 + 0.006, 0.0], [ca * 0.052, sa * 0.052 + 0.012, -0.018]], { width: 0.009, thick: 0.3, center: [0, 0, -0.05], segments: 6, radial: 5 }), lilyMat, { outline: 0.002 });
    part(lily, strandGeometry([[0, 0, 0], [ca * 0.03, sa * 0.03, 0.025], [ca * 0.055, sa * 0.06, 0.03]], { width: 0.0018, thick: 1, center: [0, 0, -0.05], segments: 4, radial: 4, taper: 0.2 }), lilyMat, { outline: false });
  }
  part(lily, new THREE.SphereGeometry(0.008, 8, 6), toon(c.trim), { outline: false });

  // ── Weapon: two floating blood blades orbiting her hands
  const blades = [];
  for (const s of [1, -1]) {
    const holder = new THREE.Group();
    const hand = s > 0 ? j.handL : j.handR;
    holder.position.set(0.07 * s, -0.08, 0.06);
    holder.rotation.set(1.1, 0, 0);
    hand.add(holder);
    const bladeMesh = new THREE.Mesh(bladeGeometry(0.5, 0.075, 0.2, 0.012), toon(c.bladeGlow, { emissive: c.bladeGlow, emissiveIntensity: 0.9, transparent: true, opacity: 0.92, rim: 2 }));
    bladeMesh.rotation.set(0, -Math.PI / 2, Math.PI / 2 + (s > 0 ? 0.0 : Math.PI));
    bladeMesh.position.set(0, 0, 0.03);
    holder.add(bladeMesh);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), glow(c.bladeGlow, 3.0));
    core.scale.set(0.7, 0.7, 1.4);
    holder.add(core);
    blades.push(holder);
  }

  return { j, dims, face, style: 'blades', female: true, weapon: null, blades, height: 1.8 };
}

// ───────────────────────────────────────────── KAIRO ────────────────────────────────────────────

function sabreGroup(c, metalColor) {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.016, 0.017, 0.16, 8), toon(0x15131a), { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.0], outline: 0.003 });
  part(g, new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), toon(metalColor), { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.085], outline: 0.003 });
  const L = 0.66, W = 0.055, curve = 0.14;
  const blade = bladeGeometry(L, W, curve, 0.009);
  blade.rotateY(-Math.PI / 2);
  blade.rotateZ(Math.PI / 2);
  part(g, blade, toon(metalColor, { rim: 1.8 }), { pos: [0, 0, 0.09], outline: 0.0035 });
  // glowing edge following the curved blade
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = 2 * (1 - t) * t * (L * 0.55) + t * t * L;
    const y = (1 - t) * (1 - t) * (-W * 0.5) + 2 * (1 - t) * t * (-W * 0.5 - curve * L * 0.3) + t * t * (curve * L);
    pts.push([0, -y - 0.004, x + 0.09]);
  }
  part(g, strandGeometry(pts, { width: 0.005, thick: 1, radial: 4, segments: 10, taper: 0.4 }), glow(c.bladeGlow, 2.6), { outline: false });
  return g;
}

function buildKairo(c) {
  const dims = { hipY: 0.96, thigh: 0.46, shin: 0.44, torso: 0.5, shoulderW: 0.21, hipW: 0.095, upperArm: 0.3, forearm: 0.26, neck: 0.058, headR: 0.112 };
  const j = buildSkeleton(dims);
  const R = dims.headR;
  const suit = toon(c.suit);
  const armor = toon(c.armor, { rim: 2.0 });
  const armorDark = toon(c.armorDark, { rim: 1.5 });

  part(j.spine, lathe([[0.13, -0.06], [0.125, 0.05], [0.135, 0.16], [0.148, 0.25]], { scaleZ: 0.72 }), suit);
  part(j.chest, lathe([[0.142, -0.1], [0.162, 0.0], [0.176, 0.1], [0.188, 0.2], [0.16, 0.265], [0.075, 0.3], [0.052, 0.31]], { scaleZ: 0.68 }), suit);
  // chest plate (front arc) with dark trim
  const plate = new THREE.LatheGeometry([[0.15, -0.02], [0.175, 0.06], [0.19, 0.15], [0.185, 0.22], [0.15, 0.26]].map(([r, y]) => new THREE.Vector2(r, y)), 18, -1.0, 2.0);
  plate.scale(1.04, 1, 0.74);
  part(j.chest, plate, armor, { scale: [1.0, 1, 1.05] });
  part(j.chest, new THREE.BoxGeometry(0.012, 0.22, 0.01), armorDark, { pos: [0, 0.12, 0.142], outline: false });
  part(j.chest, new THREE.OctahedronGeometry(0.018), glow(c.bladeGlow, 2.0), { pos: [0, 0.16, 0.148], scale: [1, 1.3, 0.5], outline: false });
  // scarf
  part(j.neck, new THREE.TorusGeometry(0.06, 0.026, 8, 18), toon(c.scarf), { pos: [0, 0.01, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.9, 1.1] });
  for (const s of [1, -1]) {
    part(j.cape, strandGeometry([[0.03 * s, 0.0, 0.08], [0.05 * s, -0.1, 0.0], [0.07 * s, -0.3, -0.03], [0.09 * s, -0.48, -0.06]], { width: 0.045, thick: 0.18, radial: 6, segments: 8, center: [0, -0.2, 0.3], taper: 0.3 }), toon(c.scarf, { side: THREE.DoubleSide }), { outline: 0.003 });
  }
  part(j.chest, new THREE.CylinderGeometry(0.044, 0.05, 0.1, 10).translate(0, 0.3, 0), toon(c.skin), { outline: false });
  // pauldrons (layered plates)
  for (const s of [1, -1]) {
    const sh = s > 0 ? j.shoulderL : j.shoulderR;
    for (let k = 0; k < 3; k++) {
      part(sh, new THREE.SphereGeometry(0.085 - k * 0.008, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), k === 0 ? armor : armorDark, {
        pos: [0.02 * s, 0.03 - k * 0.04, 0],
        rot: [0, 0, -0.35 * s],
        scale: [1.1, 0.55, 1.05],
      });
    }
  }
  // left-shoulder half cape
  const capeGeo = new THREE.LatheGeometry([[0.2, 0.04], [0.22, -0.1], [0.26, -0.45], [0.3, -0.78]].map(([r, y]) => new THREE.Vector2(r, y)), 14, Math.PI * 0.62, Math.PI * 0.62);
  capeGeo.scale(1, 1, 0.75);
  part(j.cape, capeGeo, toon(c.scarf, { side: THREE.DoubleSide }), { pos: [0, 0, 0.1] });
  // belt + pouches
  part(j.spine, new THREE.TorusGeometry(0.135, 0.02, 6, 24), toon(c.belt), { rot: [Math.PI / 2, 0, 0], scale: [1.05, 0.74, 1], outline: false });
  part(j.spine, new THREE.BoxGeometry(0.05, 0.04, 0.014), armor, { pos: [0, 0.0, 0.102], outline: false });
  for (const s of [1, -1]) part(j.spine, new THREE.BoxGeometry(0.06, 0.07, 0.04), toon(c.belt), { pos: [0.12 * s, -0.03, 0.04], rot: [0, 0.5 * s, 0] });
  part(j.hips, lathe([[0.13, 0.08], [0.15, 0.0], [0.155, -0.06], [0.095, -0.11]], { scaleZ: 0.76 }), suit);
  // tasset plates
  for (const s of [1, -1]) part(j.hips, new THREE.BoxGeometry(0.11, 0.14, 0.02), armorDark, { pos: [0.09 * s, -0.04, 0.1], rot: [-0.15, 0.25 * s, 0] });

  buildLegs(j, dims, { pants: c.suit, boots: c.boots, bootTrim: c.armorDark }, { thighR: 0.074, bootHeight: 0.3 });
  buildArms(j, dims, { coat: c.suit, gloves: c.gloves }, { armR: 0.053 });
  for (const side of ['L', 'R']) {
    part(j['elbow' + side], limb(0.06, 0.055, 0.16, 12), armor, { pos: [0, -0.06, 0] });
    part(j['knee' + side], new THREE.SphereGeometry(0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), armor, { pos: [0, 0.0, 0.04], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.6] });
  }

  part(j.head, headGeometry(R, { jaw: 0.36, width: 0.92 }), toon(c.skin, { rim: 0.6 }), { outline: 0.0035 });
  buildEars(j.head, R, c.skin, 0);
  const face = buildFace(j.head, R, { eyeColor: c.eye, skin: c.skin, eyeTilt: 0.1, browAngle: -0.16, browY: 0.028, browThick: 0.0042, lidHeavy: 1.0, smirk: -0.35, eyeW: 0.023, eyeH: 0.0145, sclera: 0xf2eeee });

  // hair: dark messy spikes + a single white streak
  const hair = j.hair;
  const rng = seeded(9001);
  hairCap(hair, R * 1.06, c.hairRoot, { cover: 0.56, tilt: -0.3 });
  spikes(hair, rng, { R: R * 1.06, count: 16, theta: [-1.1, 1.1], phi: [0.2, 0.7], len: [0.08, 0.12], width: [0.03, 0.04], droop: 0.15, out: 0.7, back: -0.35, root: c.hairRoot, tip: c.hairTip });
  spikes(hair, rng, { R: R * 1.06, count: 24, theta: [Math.PI * 0.3, Math.PI * 1.7], phi: [0.3, 1.35], len: [0.08, 0.13], width: [0.03, 0.04], droop: 0.45, out: 0.75, root: c.hairRoot, tip: c.hairTip });
  const bangs = [[-0.07, 0.04], [-0.04, 0.02], [-0.012, 0.035], [0.02, 0.018], [0.05, 0.04], [0.078, 0.05]];
  for (const [x, tipY] of bangs) {
    addStrand(hair, [[x * 0.4, 0.125, 0.04], [x * 0.95, 0.09, 0.115], [x * 1.12, tipY, 0.125]], { width: 0.026, rootColor: c.hairRoot, tipColor: c.hairTip, thick: 0.4 });
  }
  // the white streak (front right)
  addStrand(hair, [[-0.03, 0.128, 0.04], [-0.06, 0.1, 0.11], [-0.075, 0.04, 0.13], [-0.082, -0.01, 0.125]], { width: 0.028, rootColor: c.hairStreak, tipColor: c.hairStreak, thick: 0.4 });
  addStrand(hair, [[-0.045, 0.125, 0.03], [-0.085, 0.09, 0.09], [-0.1, 0.03, 0.11]], { width: 0.022, rootColor: c.hairStreak, tipColor: c.hairStreak, thick: 0.4 });
  for (const s of [1, -1]) {
    addStrand(hair, [[0.085 * s, 0.08, 0.04], [0.118 * s, 0.01, 0.06], [0.12 * s, -0.05, 0.06]], { width: 0.026, rootColor: c.hairRoot, tipColor: c.hairTip });
  }

  // dual sabres
  const right = sabreGroup(c, c.armor);
  right.position.set(0, -0.04, 0);
  right.rotation.set(1.25, 0, 0);
  j.handR.add(right);
  const left = sabreGroup(c, c.armor);
  left.position.set(0, -0.04, 0);
  left.rotation.set(1.25, 0, 0);
  j.handL.add(left);

  return { j, dims, face, style: 'dual', female: false, weapon: right, weapon2: left, height: 1.9 };
}

// ───────────────────────────────────────────── public API ───────────────────────────────────────

const BUILDERS = { lucien: buildLucien, seraphina: buildSeraphina, kairo: buildKairo };

/**
 * Create a hero model.
 * @returns {{root:THREE.Group, joints:object, update:(dt:number, state:object)=>void, setGlow:(v:number)=>void, dispose:()=>void, height:number}}
 */
export function createHeroModel(charId, cosmeticId = 'default', opts = {}) {
  const cos = getCosmetic(charId, cosmeticId);
  const builder = BUILDERS[charId] || buildLucien;
  const built = builder(cos.colors);
  optimiseRig(built.j.root, { outlines: opts.outlines !== false });
  const animator = new HumanoidAnimator(built.j, built.style, { female: built.female });
  let time = 0;
  const model = {
    id: charId,
    root: built.j.root,
    joints: built.j,
    height: built.height,
    style: built.style,
    weapon: built.weapon,
    blades: built.blades || null,
    update(dt, state = {}) {
      time += dt;
      animator.update(dt, state);
      if (built.blades) {
        // blood blades bob and tilt as if alive
        built.blades.forEach((b, i) => {
          b.position.y = -0.08 + Math.sin(time * 2.6 + i * 1.7) * 0.02;
          b.rotation.z = Math.sin(time * 1.9 + i) * 0.15;
        });
      }
    },
    dispose() {
      disposeObject(built.j.root);
    },
  };
  model.root.traverse((o) => {
    if (o.isMesh) o.castShadow = !o.userData.isOutline;
  });
  return model;
}

// ───────────────────────────────────────────── villagers (survivors) ────────────────────────────

/** Simple humans for the village survivors. variant: 'elda' | 'tomas' | 'aldric' */
export function createVillagerModel(variant = 'elda') {
  const female = variant === 'elda';
  const dims = female
    ? { hipY: 0.86, thigh: 0.42, shin: 0.4, torso: 0.44, shoulderW: 0.16, hipW: 0.08, upperArm: 0.26, forearm: 0.23, neck: 0.05, headR: 0.105 }
    : { hipY: 0.95, thigh: 0.46, shin: 0.44, torso: 0.5, shoulderW: 0.2, hipW: 0.09, upperArm: 0.29, forearm: 0.26, neck: 0.06, headR: 0.11 };
  const j = buildSkeleton(dims);
  const R = dims.headR;
  const pal = {
    elda: { cloth: 0x3d3430, shawl: 0x5a2f2a, skin: 0xe2bfa8, hair: 0x9a958f, eye: 0x6c7a8a },
    tomas: { cloth: 0x4a4035, shawl: 0x2f3a45, skin: 0xeccab2, hair: 0x5a3a24, eye: 0x7a6040 },
    aldric: { cloth: 0x1f1d22, shawl: 0x3a3438, skin: 0xd9b49c, hair: 0x2a2420, eye: 0x6a7f99 },
  }[variant] || {};
  const cloth = toon(pal.cloth);
  part(j.spine, lathe([[0.13, -0.06], [0.125, 0.05], [0.135, 0.16], [0.145, 0.25]], { scaleZ: 0.72 }), cloth);
  part(j.chest, lathe([[0.14, -0.1], [0.155, 0.0], [0.165, 0.1], [0.172, 0.2], [0.14, 0.26], [0.06, 0.29]], { scaleZ: 0.7 }), cloth);
  part(j.chest, new THREE.CylinderGeometry(0.04, 0.046, 0.1, 10).translate(0, 0.29, 0), toon(pal.skin), { outline: false });
  part(j.hips, lathe([[0.13, 0.08], [0.15, 0.0], [0.15, -0.06], [0.09, -0.11]], { scaleZ: 0.76 }), cloth);
  if (female || variant === 'aldric') {
    part(j.skirt, lathe([[0.14, 0.08], [0.17, -0.1], [0.22, -0.4], [0.27, -0.75]], { scaleZ: 0.85 }), toon(pal.cloth));
  }
  part(j.chest, lathe([[0.17, 0.1], [0.19, 0.2], [0.15, 0.27], [0.07, 0.3]], { scaleZ: 0.75 }), toon(pal.shawl), { scale: [1.05, 1, 1.05] });
  buildLegs(j, dims, { pants: pal.cloth, boots: 0x231c18 }, { thighR: 0.066, bootHeight: 0.18 });
  buildArms(j, dims, { coat: pal.cloth, gloves: pal.skin }, { armR: 0.046, female });
  part(j.head, headGeometry(R, { jaw: 0.3 }), toon(pal.skin, { rim: 0.4 }), { outline: 0.0035 });
  buildEars(j.head, R, pal.skin, 0);
  buildFace(j.head, R, { eyeColor: pal.eye, eyeGlow: 0.9, skin: pal.skin, eyeTilt: -0.05, browAngle: 0.15, slit: false, eyeW: 0.02, eyeH: 0.013 });
  const rng = seeded(variant.length * 77);
  if (variant === 'aldric') {
    // hunter-priest hood
    const hood = new THREE.SphereGeometry(R * 1.35, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
    part(j.head, hood, toon(pal.shawl, { side: THREE.DoubleSide }), { rot: [-0.55, 0, 0], pos: [0, 0.01, -0.02] });
  } else {
    hairCap(j.hair, R * 1.06, pal.hair, { cover: 0.6 });
    spikes(j.hair, rng, { R: R * 1.05, count: female ? 16 : 18, theta: [Math.PI * 0.35, Math.PI * 1.65], phi: [0.4, 1.4], len: female ? [0.15, 0.25] : [0.06, 0.1], width: [0.03, 0.04], droop: 0.8, out: 0.4, root: pal.hair, tip: pal.hair });
    if (female) part(j.head, new THREE.SphereGeometry(R * 1.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(pal.shawl, { side: THREE.DoubleSide }), { rot: [-0.6, 0, 0], pos: [0, 0.0, -0.02] });
  }
  optimiseRig(j.root);
  const animator = new HumanoidAnimator(j, 'sword', { female });
  const scale = variant === 'tomas' ? 0.78 : 1;
  j.root.scale.setScalar(scale);
  return {
    root: j.root,
    joints: j,
    update(dt, state = {}) {
      animator.update(dt, state.action ? state : { ...state, action: { type: 'cower', t: 0 } });
    },
    dispose() {
      disposeObject(j.root);
    },
  };
}
