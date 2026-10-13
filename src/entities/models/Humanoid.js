// Shared humanoid rig + anime head/face construction + procedural animator.
import * as THREE from 'three';
import { toon, glow, flat, part, limb, lathe, strandGeometry } from './Toon.js';
import { clamp, damp, dampAngle, sampleTrack } from '../../core/utils.js';

const J = (name, parent, x = 0, y = 0, z = 0) => {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
};

/**
 * Builds the joint hierarchy. Model faces +Z; character's right side is -X.
 * dims: { hipY, thigh, shin, torso, shoulderW, hipW, upperArm, forearm, neck, headR }
 */
export function buildSkeleton(dims) {
  const root = new THREE.Group();
  root.name = 'character-root';
  const j = {};
  j.root = root;
  j.body = J('body', root); // used for whole-body lean / falls
  j.hips = J('hips', j.body, 0, dims.hipY, 0);
  j.thighL = J('thighL', j.hips, dims.hipW, -0.02, 0);
  j.kneeL = J('kneeL', j.thighL, 0, -dims.thigh, 0);
  j.footL = J('footL', j.kneeL, 0, -dims.shin, 0);
  j.thighR = J('thighR', j.hips, -dims.hipW, -0.02, 0);
  j.kneeR = J('kneeR', j.thighR, 0, -dims.thigh, 0);
  j.footR = J('footR', j.kneeR, 0, -dims.shin, 0);
  j.skirt = J('skirt', j.hips, 0, 0.02, 0);
  j.spine = J('spine', j.hips, 0, 0.08, 0);
  j.chest = J('chest', j.spine, 0, dims.torso * 0.45, 0);
  const shoulderY = dims.torso * 0.5;
  j.neck = J('neck', j.chest, 0, dims.torso * 0.58, 0);
  j.head = J('head', j.neck, 0, dims.neck + dims.headR * 0.95, 0.005);
  j.hair = J('hairSway', j.head, 0, 0.02, -0.02);
  j.shoulderL = J('shoulderL', j.chest, dims.shoulderW, shoulderY, 0);
  j.elbowL = J('elbowL', j.shoulderL, 0, -dims.upperArm, 0);
  j.handL = J('handL', j.elbowL, 0, -dims.forearm, 0);
  j.shoulderR = J('shoulderR', j.chest, -dims.shoulderW, shoulderY, 0);
  j.elbowR = J('elbowR', j.shoulderR, 0, -dims.upperArm, 0);
  j.handR = J('handR', j.elbowR, 0, -dims.forearm, 0);
  j.cape = J('cape', j.chest, 0, shoulderY + 0.02, -0.1);
  return j;
}

/** Deformed sphere with an anime V-shaped jaw. */
export function headGeometry(r, { jaw = 0.38, chin = 0.012, width = 0.9, height = 1.12 } = {}) {
  const g = new THREE.SphereGeometry(r, 32, 24);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.x *= width;
    v.y *= height;
    if (v.y < 0) {
      const f = Math.pow(-v.y / (r * height), 1.25);
      v.x *= 1 - jaw * f;
      if (v.z > 0) v.z += chin * f * (v.z / r);
      else v.z *= 1 - 0.35 * f;
    }
    // flatten the face slightly for a cleaner anime profile
    if (v.z > r * 0.55 && v.y > -r * 0.2) v.z = r * 0.55 + (v.z - r * 0.55) * 0.75;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Builds anime eyes, brows, nose and mouth on a head joint. */
export function buildFace(head, r, f) {
  const eyeY = f.eyeY ?? -0.012;
  const eyeX = f.eyeX ?? 0.04;
  const eyeZ = r * 0.93;
  const vamp = !!(f.fangs || f.vampire);
  // vampires: hotter eye glow and faintly bloodshot sclera
  const irisMat = glow(f.eyeColor, (f.eyeGlow ?? 2.6) * (vamp ? 1.3 : 1));
  const whiteMat = flat(f.sclera ?? (vamp ? 0xf0d2d6 : 0xefe2e6));
  const shadowMat = vamp ? flat(f.shadow ?? 0x5b2a3c) : null;
  const lashMat = flat(f.lash ?? 0x0b0709);
  const pupilMat = flat(0x1a0508);
  const hiMat = glow(0xffffff, 1.4);
  const eyeW = f.eyeW ?? 0.024;
  const eyeH = f.eyeH ?? 0.017;
  for (const side of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(eyeX * side, eyeY, eyeZ - 0.004);
    eye.rotation.y = 0.32 * side;
    eye.rotation.z = (f.eyeTilt ?? 0.12) * side;
    head.add(eye);
    const white = new THREE.Mesh(new THREE.CircleGeometry(1, 20), whiteMat);
    white.scale.set(eyeW, eyeH, 1);
    eye.add(white);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(1, 20), irisMat);
    iris.scale.set(eyeH * 0.62, eyeH * 0.86, 1);
    iris.position.set(-0.002 * side, -0.001, 0.0008);
    eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(1, 12), pupilMat);
    pupil.scale.set(eyeH * (f.slit ? 0.13 : 0.3), eyeH * 0.55, 1);
    pupil.position.set(-0.002 * side, -0.0005, 0.0012);
    eye.add(pupil);
    const hi = new THREE.Mesh(new THREE.CircleGeometry(1, 10), hiMat);
    hi.scale.setScalar(eyeH * 0.17);
    hi.position.set((-0.002 - eyeH * 0.22) * side, eyeH * 0.3, 0.0016);
    eye.add(hi);
    // heavy upper lash line (half torus, flattened)
    const lash = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 4, 16, Math.PI), lashMat);
    lash.scale.set(eyeW * 1.06, eyeH * (f.lidHeavy ?? 0.95), 0.012);
    lash.position.set(0, -eyeH * 0.08, 0.0018);
    eye.add(lash);
    if (f.wing) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.014, 4), lashMat);
      wing.rotation.z = (Math.PI / 2 + 0.5) * side;
      wing.position.set(eyeW * 1.0 * side, eyeH * 0.25, 0.002);
      eye.add(wing);
    }
    // lower lash hint
    const low = new THREE.Mesh(new THREE.BoxGeometry(eyeW * 1.1, 0.0012, 0.001), lashMat);
    low.position.set(0, -eyeH * 0.82, 0.0015);
    eye.add(low);
    if (shadowMat) {
      // sunken, sleepless under-eye shadow and a dark crease above the lid
      const under = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 4, 14, Math.PI), shadowMat);
      under.rotation.z = Math.PI;
      under.scale.set(eyeW * 0.95, eyeH * 0.55, 0.01);
      under.position.set(0.001 * side, -eyeH * 0.62, 0.0006);
      eye.add(under);
      const crease = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 4, 14, Math.PI * 0.8), shadowMat);
      crease.rotation.z = Math.PI * 0.1;
      crease.scale.set(eyeW * 1.0, eyeH * 1.25, 0.01);
      crease.position.set(0, eyeH * 0.1, 0.0005);
      eye.add(crease);
    }
    // brow
    const brow = new THREE.Mesh(new THREE.BoxGeometry(eyeW * 1.6, f.browThick ?? 0.0032, 0.004), lashMat);
    brow.position.set(eyeX * side * 1.02, eyeY + (f.browY ?? 0.03), eyeZ - 0.005);
    brow.rotation.set(0, 0.32 * side, (f.browAngle ?? -0.12) * side);
    head.add(brow);
  }
  // nose: tiny soft wedge
  if (!f.noNose) {
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.0065, 0.022, 4), toon(f.skin));
    nose.position.set(0, eyeY - 0.03, r * 0.98);
    nose.rotation.x = 0.35;
    head.add(nose);
  }
  // mouth
  const mouthY = eyeY - (f.mouthDrop ?? 0.062);
  if (f.lips) {
    const lipMat = toon(f.lips);
    const upper = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), lipMat);
    upper.scale.set(0.012, 0.0032, 0.004);
    upper.position.set(0, mouthY + 0.002, r * 0.86);
    head.add(upper);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), lipMat);
    lower.scale.set(0.01, 0.0042, 0.0045);
    lower.position.set(0, mouthY - 0.004, r * 0.855);
    head.add(lower);
  } else if (!f.noMouth) {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0016, 4, 10, Math.PI * 0.8), lashMat);
    mouth.rotation.set(0, 0, Math.PI + 0.3 + (f.smirk ?? 0));
    mouth.position.set(0.002, mouthY + 0.006, r * 0.865);
    head.add(mouth);
  }
  if (f.fangs) {
    // long, needle-sharp canines that hang past the lower lip, with a hint of blood at the tips
    const fangMat = flat(0xfbf6f2);
    const tipMat = glow(0x9a0a1a, 0.6);
    const len = f.fangLen ?? 0.017;
    const top = f.lips ? mouthY - 0.001 : mouthY + 0.002;
    for (const s of [1, -1]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.0028, len, 6), fangMat);
      fang.rotation.x = Math.PI - 0.12;
      fang.rotation.z = 0.08 * s;
      fang.position.set(0.0068 * s, top - len * 0.5, r * 0.874);
      head.add(fang);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0009, 0.0035, 5), tipMat);
      tip.rotation.x = Math.PI - 0.12;
      tip.position.set(0.0068 * s + 0.0008 * s, top - len + 0.0012, r * 0.876);
      head.add(tip);
    }
  }
  return { irisMat };
}

/** Pointed vampire ears (or human ears when pointed = 0). */
export function buildEars(head, r, skin, pointed = 1) {
  const mat = toon(skin);
  for (const s of [1, -1]) {
    const pts = [
      [s * r * 0.86, -0.015, 0.0],
      [s * (r * 0.95 + 0.012 * pointed), 0.01 + 0.012 * pointed, -0.012],
      [s * (r * 1.0 + 0.04 * pointed), 0.025 + 0.035 * pointed, -0.028 - 0.015 * pointed],
    ];
    part(head, strandGeometry(pts, { width: 0.018, thick: 0.35, segments: 6, radial: 6, center: [0, 0, 0], bulge: 0.0, taper: 0.7 }), mat, { outline: 0.003 });
  }
}

/** Gloved/bare hand (fist). */
export function buildHand(joint, color, female = false) {
  const m = toon(color);
  const s = female ? 0.85 : 1;
  part(joint, new THREE.SphereGeometry(0.042 * s, 12, 10), m, { pos: [0, -0.035, 0.005], scale: [0.8, 1.15, 0.95], outline: 0.004 });
  part(joint, new THREE.SphereGeometry(0.018 * s, 8, 6), m, { pos: [0.025 * s, -0.03, 0.03], outline: 0.003 }); // thumb
}

/** Generic leg + boot builder. */
export function buildLegs(j, dims, c, o = {}) {
  const pants = toon(c.pants);
  const boot = toon(c.boots);
  const thighR = o.thighR ?? 0.07;
  for (const side of ['L', 'R']) {
    const thigh = j['thigh' + side];
    const knee = j['knee' + side];
    const foot = j['foot' + side];
    part(thigh, limb(thighR, thighR * 0.72, dims.thigh, 12), pants, { outline: 0.005 });
    part(knee, new THREE.SphereGeometry(thighR * 0.74, 10, 8), pants, { outline: 0.004 });
    const bootTop = o.bootHeight ?? dims.shin * 0.75;
    part(knee, limb(thighR * 0.68, thighR * 0.5, dims.shin - bootTop + 0.02, 10), pants, { outline: 0.005 });
    part(knee, limb(thighR * 0.78, thighR * 0.62, bootTop, 12), boot, { pos: [0, -(dims.shin - bootTop), 0], outline: 0.006 });
    // boot cuff
    part(knee, new THREE.TorusGeometry(thighR * 0.8, 0.012, 6, 14), toon(c.bootTrim ?? c.boots), { pos: [0, -(dims.shin - bootTop) - 0.01, 0], rot: [Math.PI / 2, 0, 0], outline: 0.003 });
    // foot
    part(foot, new THREE.SphereGeometry(0.05, 12, 8), boot, { pos: [0, -0.03, 0.06], scale: [0.85, 0.65, 1.9], outline: 0.005 });
    part(foot, new THREE.BoxGeometry(0.075, 0.02, 0.2), toon(0x0b0a0d), { pos: [0, -0.06, 0.05], outline: false });
    if (o.bootBuckle) {
      part(knee, new THREE.BoxGeometry(0.03, 0.02, 0.01), toon(o.bootBuckle), { pos: [0, -(dims.shin - bootTop) - 0.08, thighR * 0.66], outline: false });
    }
  }
}

/** Arms: sleeves + cuffs + hands. */
export function buildArms(j, dims, c, o = {}) {
  const sleeve = toon(c.sleeve ?? c.coat);
  const fore = toon(c.forearm ?? c.sleeve ?? c.coat);
  const r = o.armR ?? 0.05;
  for (const side of ['L', 'R']) {
    const sh = j['shoulder' + side];
    const el = j['elbow' + side];
    part(sh, new THREE.SphereGeometry(r * 1.25, 12, 10), sleeve, { pos: [0, -0.01, 0], outline: 0.005 });
    part(sh, limb(r * 1.05, r * 0.85, dims.upperArm, 10), sleeve, { outline: 0.005 });
    part(el, new THREE.SphereGeometry(r * 0.86, 10, 8), fore, { outline: 0.004 });
    part(el, limb(r * 0.85, r * 0.68, dims.forearm, 10), fore, { outline: 0.005 });
    if (c.cuff) {
      part(el, limb(r * 0.95, r * 1.18, 0.07, 12), toon(c.cuff), { pos: [0, -dims.forearm + 0.075, 0], outline: 0.004 });
      if (c.cuffTrim) part(el, new THREE.TorusGeometry(r * 1.17, 0.006, 6, 16), toon(c.cuffTrim), { pos: [0, -dims.forearm + 0.005, 0], rot: [Math.PI / 2, 0, 0], outline: false });
    }
    buildHand(j['hand' + side], c.gloves, o.female);
  }
}

// ───────────────────────────────────────────── Animation ──────────────────────────────────────────

const JOINT_KEYS = [
  'body', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR', 'skirt', 'hair', 'cape',
];

function emptyPose() {
  const p = {};
  for (const k of JOINT_KEYS) p[k] = [0, 0, 0];
  p.hipsY = 0;
  p.bodyY = 0;
  return p;
}

function addRot(pose, key, x = 0, y = 0, z = 0, w = 1) {
  const r = pose[key];
  r[0] += x * w;
  r[1] += y * w;
  r[2] += z * w;
}

/** Evaluate a keyframed action: tracks = { joint: { x:[[t,v]...], y:..., z:... } } */
function applyTracks(pose, tracks, t, w = 1) {
  for (const key in tracks) {
    const tr = tracks[key];
    if (key === 'hipsY') {
      pose.hipsY += sampleTrack(tr, t) * w;
      continue;
    }
    if (key === 'bodyY') {
      pose.bodyY += sampleTrack(tr, t) * w;
      continue;
    }
    if (tr.x) pose[key][0] += sampleTrack(tr.x, t) * w;
    if (tr.y) pose[key][1] += sampleTrack(tr.y, t) * w;
    if (tr.z) pose[key][2] += sampleTrack(tr.z, t) * w;
  }
}

// Weapon styles define idle arm placement + attack keyframes.
const T = (...pairs) => pairs; // readability helper

export const ACTION_LIBRARY = {
  sword: {
    idleArms(p, br) {
      addRot(p, 'shoulderR', -0.35 + br * 0.02, 0.1, -0.18);
      addRot(p, 'elbowR', -0.55);
      addRot(p, 'handR', 0.25, 0, 0);
      addRot(p, 'shoulderL', 0.05, 0, 0.16);
      addRot(p, 'elbowL', -0.25);
    },
    attacks: [
      // 1: horizontal slash right -> left
      {
        chest: { y: T([0, 0], [0.28, -0.85], [0.48, 0.75], [1, 0]) },
        shoulderR: { x: T([0, -0.35], [0.28, -1.35], [0.48, -1.45], [1, -0.35]), z: T([0, -0.18], [0.28, -1.15], [0.48, 0.35], [1, -0.18]) },
        elbowR: { x: T([0, -0.55], [0.28, -0.9], [0.48, -0.15], [1, -0.55]) },
        handR: { x: T([0, 0.25], [0.3, 0.6], [0.5, 0.2], [1, 0.25]) },
        hipsY: T([0, 0], [0.4, -0.06], [1, 0]),
        thighL: { x: T([0, 0], [0.4, -0.4], [1, 0]) },
        kneeL: { x: T([0, 0], [0.4, 0.4], [1, 0]) },
        thighR: { x: T([0, 0], [0.4, 0.25], [1, 0]) },
      },
      // 2: rising backhand diagonal
      {
        chest: { y: T([0, 0], [0.28, 0.8], [0.5, -0.7], [1, 0]), z: T([0, 0], [0.3, 0.12], [0.5, -0.1], [1, 0]) },
        shoulderR: { x: T([0, -0.35], [0.28, -0.6], [0.5, -2.1], [1, -0.35]), z: T([0, -0.18], [0.28, 0.45], [0.5, -0.9], [1, -0.18]) },
        elbowR: { x: T([0, -0.55], [0.28, -1.3], [0.5, -0.25], [1, -0.55]) },
        handR: { x: T([0, 0.25], [0.3, -0.3], [0.5, 0.5], [1, 0.25]) },
        hipsY: T([0, 0], [0.4, -0.05], [1, 0]),
        thighR: { x: T([0, 0], [0.4, -0.35], [1, 0]) },
        kneeR: { x: T([0, 0], [0.4, 0.35], [1, 0]) },
      },
      // 3: overhead crushing strike
      {
        chest: { x: T([0, 0], [0.3, -0.25], [0.5, 0.45], [1, 0]) },
        spine: { x: T([0, 0], [0.3, -0.12], [0.5, 0.2], [1, 0]) },
        shoulderR: { x: T([0, -0.35], [0.3, -2.9], [0.5, -0.75], [1, -0.35]), z: T([0, -0.18], [0.3, -0.1], [0.5, 0.05], [1, -0.18]) },
        elbowR: { x: T([0, -0.55], [0.3, -0.6], [0.5, -0.1], [1, -0.55]) },
        shoulderL: { x: T([0, 0.05], [0.3, -2.6], [0.5, -0.9], [1, 0.05]), z: T([0, 0.16], [0.3, 0.1], [0.5, -0.25], [1, 0.16]) },
        elbowL: { x: T([0, -0.25], [0.3, -0.6], [0.5, -0.3], [1, -0.25]) },
        hipsY: T([0, 0], [0.3, 0.04], [0.52, -0.16], [1, 0]),
        thighL: { x: T([0, 0], [0.5, -0.65], [1, 0]) },
        kneeL: { x: T([0, 0], [0.5, 0.8], [1, 0]) },
        thighR: { x: T([0, 0], [0.5, 0.45], [1, 0]) },
        kneeR: { x: T([0, 0], [0.5, 0.5], [1, 0]) },
      },
    ],
    heavy: {
      chest: { y: T([0, 0], [0.45, -1.1], [0.62, 0.9], [1, 0]), x: T([0, 0], [0.45, -0.15], [0.62, 0.3], [1, 0]) },
      shoulderR: { x: T([0, -0.35], [0.45, -2.3], [0.62, -1.0], [1, -0.35]), z: T([0, -0.18], [0.45, -1.2], [0.62, 0.5], [1, -0.18]) },
      elbowR: { x: T([0, -0.55], [0.45, -0.9], [0.62, -0.1], [1, -0.55]) },
      shoulderL: { x: T([0, 0.05], [0.45, -1.2], [0.62, -0.4], [1, 0.05]), z: T([0, 0.16], [0.45, 0.6], [1, 0.16]) },
      hipsY: T([0, 0], [0.45, -0.12], [0.62, -0.18], [1, 0]),
      thighL: { x: T([0, 0], [0.62, -0.7], [1, 0]) },
      kneeL: { x: T([0, 0], [0.62, 0.9], [1, 0]) },
      thighR: { x: T([0, 0], [0.62, 0.5], [1, 0]) },
      kneeR: { x: T([0, 0], [0.62, 0.6], [1, 0]) },
    },
  },
  blades: {
    // Seraphina: hands conduct floating blood blades
    idleArms(p, br) {
      addRot(p, 'shoulderR', -0.12, 0, -0.32 - br * 0.03);
      addRot(p, 'elbowR', -0.55);
      addRot(p, 'handR', 0.1, 0.0, -0.3);
      addRot(p, 'shoulderL', -0.12, 0, 0.32 + br * 0.03);
      addRot(p, 'elbowL', -0.55);
      addRot(p, 'handL', 0.1, 0.0, 0.3);
    },
    attacks: [
      {
        chest: { y: T([0, 0], [0.3, -0.7], [0.5, 0.6], [1, 0]) },
        shoulderR: { x: T([0, -0.12], [0.3, -1.2], [0.5, -1.5], [1, -0.12]), z: T([0, -0.32], [0.3, -1.3], [0.5, 0.4], [1, -0.32]) },
        elbowR: { x: T([0, -0.55], [0.3, -0.8], [0.5, -0.1], [1, -0.55]) },
        hipsY: T([0, 0], [0.45, -0.04], [1, 0]),
      },
      {
        chest: { y: T([0, 0], [0.3, 0.7], [0.5, -0.6], [1, 0]) },
        shoulderL: { x: T([0, -0.12], [0.3, -1.2], [0.5, -1.5], [1, -0.12]), z: T([0, 0.32], [0.3, 1.3], [0.5, -0.4], [1, 0.32]) },
        elbowL: { x: T([0, -0.55], [0.3, -0.8], [0.5, -0.1], [1, -0.55]) },
        hipsY: T([0, 0], [0.45, -0.04], [1, 0]),
      },
      {
        spine: { x: T([0, 0], [0.3, -0.15], [0.5, 0.2], [1, 0]) },
        shoulderR: { x: T([0, -0.12], [0.3, -2.4], [0.5, -1.4], [1, -0.12]), z: T([0, -0.32], [0.3, -0.5], [0.5, 0.2], [1, -0.32]) },
        shoulderL: { x: T([0, -0.12], [0.3, -2.4], [0.5, -1.4], [1, -0.12]), z: T([0, 0.32], [0.3, 0.5], [0.5, -0.2], [1, 0.32]) },
        elbowR: { x: T([0, -0.55], [0.5, -0.05], [1, -0.55]) },
        elbowL: { x: T([0, -0.55], [0.5, -0.05], [1, -0.55]) },
        hipsY: T([0, 0], [0.3, 0.05], [0.5, -0.1], [1, 0]),
        thighL: { x: T([0, 0], [0.5, -0.5], [1, 0]) },
        kneeL: { x: T([0, 0], [0.5, 0.55], [1, 0]) },
      },
    ],
    heavy: {
      // blood lance throw
      chest: { y: T([0, 0], [0.45, -0.9], [0.6, 0.5], [1, 0]) },
      shoulderR: { x: T([0, -0.12], [0.45, -2.6], [0.6, -1.3], [1, -0.12]), z: T([0, -0.32], [0.45, -0.6], [0.6, 0.1], [1, -0.32]) },
      elbowR: { x: T([0, -0.55], [0.45, -1.5], [0.6, -0.05], [1, -0.55]) },
      shoulderL: { x: T([0, -0.12], [0.45, -1.4], [0.6, -0.4], [1, -0.12]) },
      hipsY: T([0, 0], [0.45, -0.06], [1, 0]),
      thighR: { x: T([0, 0], [0.45, 0.35], [0.6, -0.2], [1, 0]) },
    },
  },
  dual: {
    idleArms(p, br) {
      addRot(p, 'shoulderR', -0.45 + br * 0.02, 0.2, -0.25);
      addRot(p, 'elbowR', -0.7);
      addRot(p, 'handR', 0.2, 0, 0);
      addRot(p, 'shoulderL', -0.45 + br * 0.02, -0.2, 0.25);
      addRot(p, 'elbowL', -0.7);
      addRot(p, 'handL', 0.2, 0, 0);
    },
    attacks: [
      {
        chest: { y: T([0, 0], [0.25, -0.7], [0.45, 0.6], [1, 0]) },
        shoulderR: { x: T([0, -0.45], [0.25, -1.3], [0.45, -1.4], [1, -0.45]), z: T([0, -0.25], [0.25, -1.1], [0.45, 0.4], [1, -0.25]) },
        elbowR: { x: T([0, -0.7], [0.25, -0.9], [0.45, -0.1], [1, -0.7]) },
      },
      {
        chest: { y: T([0, 0], [0.25, 0.7], [0.45, -0.6], [1, 0]) },
        shoulderL: { x: T([0, -0.45], [0.25, -1.3], [0.45, -1.4], [1, -0.45]), z: T([0, 0.25], [0.25, 1.1], [0.45, -0.4], [1, 0.25]) },
        elbowL: { x: T([0, -0.7], [0.25, -0.9], [0.45, -0.1], [1, -0.7]) },
      },
      {
        shoulderR: { x: T([0, -0.45], [0.25, -2.4], [0.45, -0.9], [1, -0.45]), z: T([0, -0.25], [0.25, -0.6], [0.45, 0.5], [1, -0.25]) },
        shoulderL: { x: T([0, -0.45], [0.25, -2.4], [0.45, -0.9], [1, -0.45]), z: T([0, 0.25], [0.25, 0.6], [0.45, -0.5], [1, 0.25]) },
        elbowR: { x: T([0, -0.7], [0.45, -0.1], [1, -0.7]) },
        elbowL: { x: T([0, -0.7], [0.45, -0.1], [1, -0.7]) },
        chest: { x: T([0, 0], [0.25, -0.2], [0.45, 0.3], [1, 0]) },
        hipsY: T([0, 0], [0.45, -0.1], [1, 0]),
      },
      {
        // spinning finisher (body yaw handled by "spin" flag)
        shoulderR: { x: T([0, -0.45], [0.3, -1.5], [0.7, -1.5], [1, -0.45]), z: T([0, -0.25], [0.3, -1.4], [0.7, -1.4], [1, -0.25]) },
        shoulderL: { x: T([0, -0.45], [0.3, -1.5], [0.7, -1.5], [1, -0.45]), z: T([0, 0.25], [0.3, 1.4], [0.7, 1.4], [1, 0.25]) },
        elbowR: { x: T([0, -0.7], [0.3, -0.1], [0.7, -0.1], [1, -0.7]) },
        elbowL: { x: T([0, -0.7], [0.3, -0.1], [0.7, -0.1], [1, -0.7]) },
        hipsY: T([0, 0], [0.3, -0.1], [0.7, -0.1], [1, 0]),
        body: { y: T([0, 0], [0.25, 0], [0.75, Math.PI * 2], [1, Math.PI * 2]) },
      },
    ],
    heavy: null,
  },
};

const CAST = {
  chest: { x: T([0, 0], [0.3, -0.2], [0.55, 0.15], [1, 0]) },
  shoulderR: { x: T([0, 0], [0.3, -1.6], [0.55, -1.5], [1, 0]), z: T([0, 0], [0.3, -0.3], [1, 0]) },
  shoulderL: { x: T([0, 0], [0.3, -1.6], [0.55, -1.5], [1, 0]), z: T([0, 0], [0.3, 0.3], [1, 0]) },
  elbowR: { x: T([0, 0], [0.4, -0.2], [1, 0]) },
  elbowL: { x: T([0, 0], [0.4, -0.2], [1, 0]) },
};

const CAST_UP = {
  chest: { x: T([0, 0], [0.4, -0.35], [0.8, -0.3], [1, 0]) },
  head: { x: T([0, 0], [0.4, -0.4], [0.8, -0.3], [1, 0]) },
  shoulderR: { x: T([0, 0], [0.4, -2.9], [0.8, -2.8], [1, 0]), z: T([0, 0], [0.4, -0.5], [1, 0]) },
  shoulderL: { x: T([0, 0], [0.4, -2.9], [0.8, -2.8], [1, 0]), z: T([0, 0], [0.4, 0.5], [1, 0]) },
};

/**
 * Procedural animator: builds a target pose from the character's movement/action state each frame,
 * then damps the joints toward it.
 */
export class HumanoidAnimator {
  constructor(joints, style = 'sword', opts = {}) {
    this.j = joints;
    this.style = ACTION_LIBRARY[style] ? style : 'sword';
    this.lib = ACTION_LIBRARY[this.style];
    this.time = Math.random() * 10;
    this.phase = 0;
    this.baseHipsY = joints.hips.position.y;
    this.female = !!opts.female;
    this.predator = !!opts.vampire;
    this.stance = opts.stance ?? null;
    this.gait = { stride: 1, bounce: 1, sway: 1, ...(opts.gait ?? {}) };
    this.sway = 0;
    this.prevYaw = 0;
  }

  update(dt, s) {
    this.time += dt;
    const p = emptyPose();
    const speed = s.speed ?? 0; // m/s
    const moveW = clamp(speed / 5, 0, 1.6);
    const br = Math.sin(this.time * 1.8); // breathing

    // ── base idle
    addRot(p, 'chest', 0.02 + br * 0.015, 0, 0);
    addRot(p, 'head', -0.04 + br * 0.01, Math.sin(this.time * 0.37) * 0.06, 0);
    if (this.female) {
      addRot(p, 'hips', 0, 0, 0.04);
      addRot(p, 'chest', 0, 0, -0.03);
      addRot(p, 'thighL', 0.0, 0, 0.02);
      addRot(p, 'thighR', -0.08, 0, 0.04);
      addRot(p, 'kneeR', 0.14);
    } else {
      addRot(p, 'thighL', 0, 0, 0.06);
      addRot(p, 'thighR', 0, 0, -0.06);
    }
    this.lib.idleArms(p, br);
    const st = this.stance;
    if (st) {
      // archetype posture: hunched ancients, proud lords, wide-stanced warriors, crouching assassins
      addRot(p, 'chest', st.chest ?? 0, 0, 0);
      addRot(p, 'spine', (st.chest ?? 0) * 0.5, 0, 0);
      addRot(p, 'head', (st.head ?? 0) - (st.chest ?? 0) * 0.6, 0, 0);
      if (st.crouch) {
        const c = st.crouch;
        p.hipsY -= c * 0.7;
        addRot(p, 'thighL', -c * 4);
        addRot(p, 'thighR', -c * 4);
        addRot(p, 'kneeL', c * 8);
        addRot(p, 'kneeR', c * 8);
      }
      if (st.wide) {
        addRot(p, 'shoulderL', 0, 0, st.wide);
        addRot(p, 'shoulderR', 0, 0, -st.wide);
        addRot(p, 'thighL', 0, 0, st.wide * 0.4);
        addRot(p, 'thighR', 0, 0, -st.wide * 0.4);
      }
      if (st.dangle) {
        addRot(p, 'shoulderL', 0.28 + Math.sin(this.time * 0.8) * 0.03, 0, 0.1);
        addRot(p, 'shoulderR', 0.28 + Math.sin(this.time * 0.8 + 1) * 0.03, 0, -0.1);
        addRot(p, 'elbowL', -0.3);
        addRot(p, 'elbowR', -0.3);
        addRot(p, 'handL', -0.35 + Math.sin(this.time * 1.6) * 0.1);
        addRot(p, 'handR', -0.35 + Math.sin(this.time * 1.6 + 2) * 0.1);
      }
      if (st.casting) {
        addRot(p, 'shoulderL', -0.45 + br * 0.03, 0, 0.1);
        addRot(p, 'elbowL', -0.8);
        addRot(p, 'handL', -0.3, 0, 0);
      }
    }
    if (this.predator) {
      // stalking stance: head low and forward, slow uneven tilt with an occasional twitch
      const tw = Math.sin(this.time * 0.9) > 0.985 ? Math.sin(this.time * 40) * 0.08 : 0;
      addRot(p, 'chest', 0.05, 0, 0);
      addRot(p, 'head', 0.08, Math.sin(this.time * 0.23) * 0.1, Math.sin(this.time * 0.31 + 1.3) * 0.12 + tw);
      addRot(p, 'shoulderL', 0.05, 0, 0.04);
      addRot(p, 'shoulderR', 0.05, 0, -0.04);
    }

    // ── locomotion
    if (s.grounded !== false && speed > 0.15) {
      const sprint = s.sprint ? 1 : 0;
      this.phase += dt * (3.0 + speed * 1.05);
      const ph = this.phase;
      const gt = this.gait;
      const stride = (0.45 + 0.25 * sprint) * gt.stride;
      const w = Math.min(1, moveW);
      addRot(p, 'thighL', -Math.sin(ph) * stride * w, 0, 0);
      addRot(p, 'thighR', Math.sin(ph) * stride * w, 0, 0);
      addRot(p, 'kneeL', Math.max(0, Math.sin(ph + 1.4)) * (0.8 + 0.5 * sprint) * w, 0, 0);
      addRot(p, 'kneeR', Math.max(0, Math.sin(ph + Math.PI + 1.4)) * (0.8 + 0.5 * sprint) * w, 0, 0);
      addRot(p, 'shoulderL', Math.sin(ph) * (0.35 + 0.3 * sprint) * w, 0, 0);
      addRot(p, 'shoulderR', -Math.sin(ph) * (0.25 + 0.2 * sprint) * w, 0, 0);
      addRot(p, 'elbowL', -0.3 * w * sprint);
      addRot(p, 'spine', 0.08 * w + 0.18 * sprint, Math.sin(ph) * 0.08 * w, 0);
      addRot(p, 'hips', 0, -Math.sin(ph) * 0.1 * w, 0);
      p.hipsY += -Math.abs(Math.cos(ph)) * 0.035 * w * gt.bounce - 0.02 * sprint;
      if (gt.sway !== 1) {
        // heavy stomp or lurching gait
        addRot(p, 'body', 0, 0, Math.sin(ph) * 0.045 * (gt.sway - 1) * w);
        addRot(p, 'spine', 0, Math.sin(ph) * 0.06 * (gt.sway - 1) * w, 0);
      }
      addRot(p, 'skirt', 0.1 * w + 0.12 * sprint, 0, Math.sin(ph) * 0.05);
      addRot(p, 'cape', 0.35 * w + 0.4 * sprint, 0, Math.sin(ph * 0.5) * 0.08);
      addRot(p, 'hair', 0.12 * w + 0.15 * sprint, 0, 0);
    } else {
      addRot(p, 'cape', 0.05 + Math.sin(this.time * 1.3) * 0.03, 0, Math.sin(this.time * 0.9) * 0.03);
      addRot(p, 'skirt', Math.sin(this.time * 1.1) * 0.015, 0, 0);
      addRot(p, 'hair', Math.sin(this.time * 1.2) * 0.02, 0, Math.sin(this.time * 0.8) * 0.02);
    }
    // airborne
    if (s.grounded === false && !s.dead) {
      const up = clamp((s.vy ?? 0) / 8, -1, 1);
      addRot(p, 'thighL', -0.6, 0, 0.05);
      addRot(p, 'kneeL', 1.0);
      addRot(p, 'thighR', 0.15 - up * 0.2, 0, -0.05);
      addRot(p, 'kneeR', 0.5);
      addRot(p, 'shoulderL', -0.3, 0, 0.5);
      addRot(p, 'shoulderR', -0.2, 0, -0.4);
      addRot(p, 'cape', -0.2 + up * -0.4, 0, 0);
      addRot(p, 'hair', -up * 0.25, 0, 0);
      addRot(p, 'skirt', -up * 0.15, 0, 0);
    }

    let lambda = 14;
    const a = s.action;
    if (a) {
      const t = clamp(a.t ?? 0, 0, 1);
      if (a.type === 'attack') {
        const atk = this.lib.attacks[a.index % this.lib.attacks.length];
        applyTracks(p, atk, t);
        if (this.predator) {
          // bite lunge: the head snaps forward and down through the strike, then recoils
          const k = Math.sin(clamp((t - 0.15) / 0.55, 0, 1) * Math.PI);
          addRot(p, 'chest', 0.18 * k, 0, 0);
          addRot(p, 'head', 0.3 * k, 0, 0.1 * k);
        }
        // cancel locomotion arm swing a bit for readability
        lambda = 26;
      } else if (a.type === 'heavy' && this.lib.heavy) {
        applyTracks(p, this.lib.heavy, t);
        lambda = 22;
      } else if (a.type === 'cast') {
        applyTracks(p, CAST, t);
        lambda = 18;
      } else if (a.type === 'castUp') {
        applyTracks(p, CAST_UP, t);
        lambda = 14;
      } else if (a.type === 'block') {
        addRot(p, 'shoulderR', -1.25, 0, 0.55);
        addRot(p, 'elbowR', -0.9);
        addRot(p, 'shoulderL', -1.25, 0, -0.55);
        addRot(p, 'elbowL', -0.9);
        addRot(p, 'spine', 0.15);
        p.hipsY -= 0.08;
        addRot(p, 'thighL', -0.35);
        addRot(p, 'kneeL', 0.45);
        addRot(p, 'thighR', 0.2);
        addRot(p, 'kneeR', 0.3);
        lambda = 24;
      } else if (a.type === 'dash') {
        addRot(p, 'spine', 0.55);
        addRot(p, 'shoulderR', 0.9, 0, -0.4);
        addRot(p, 'shoulderL', 0.9, 0, 0.4);
        addRot(p, 'thighL', -0.8);
        addRot(p, 'kneeL', 1.1);
        addRot(p, 'thighR', 0.6);
        addRot(p, 'kneeR', 0.4);
        addRot(p, 'cape', 1.0);
        addRot(p, 'hair', 0.5);
        p.hipsY -= 0.12;
        lambda = 30;
      } else if (a.type === 'hurt') {
        const k = Math.sin(t * Math.PI);
        addRot(p, 'spine', -0.35 * k, 0, 0.1 * k);
        addRot(p, 'head', -0.3 * k);
        addRot(p, 'shoulderL', 0.3 * k, 0, 0.4 * k);
        addRot(p, 'shoulderR', 0.3 * k, 0, -0.4 * k);
        lambda = 30;
      } else if (a.type === 'dead' || a.type === 'getup') {
        const k = a.type === 'dead' ? clamp(t * 1.6, 0, 1) : 1 - clamp(t * 1.4, 0, 1);
        const ease = k * k * (3 - 2 * k);
        // fall backward onto the ground
        addRot(p, 'body', -1.45 * ease, 0, 0.1 * ease);
        p.bodyY += 0.12 * ease;
        addRot(p, 'thighL', -0.3 * ease, 0, 0.15 * ease);
        addRot(p, 'kneeL', 0.4 * ease);
        addRot(p, 'thighR', -0.1 * ease, 0, -0.1 * ease);
        addRot(p, 'shoulderL', -0.4 * ease, 0, 1.1 * ease);
        addRot(p, 'shoulderR', -0.2 * ease, 0, -1.2 * ease);
        addRot(p, 'head', -0.3 * ease, 0.4 * ease, 0);
        lambda = a.type === 'dead' ? 9 : 6;
      } else if (a.type === 'cower') {
        addRot(p, 'head', 0.35, 0, 0);
        addRot(p, 'spine', 0.25);
        addRot(p, 'shoulderR', -0.55, 0, 0.35);
        addRot(p, 'elbowR', -1.6);
        addRot(p, 'shoulderL', -0.55, 0, -0.35);
        addRot(p, 'elbowL', -1.6);
        p.hipsY -= 0.05;
        addRot(p, 'kneeL', 0.25);
        addRot(p, 'kneeR', 0.25);
        addRot(p, 'thighL', -0.15);
        addRot(p, 'thighR', -0.15);
      } else if (a.type === 'levitate') {
        p.bodyY += 0.35 + Math.sin(this.time * 2) * 0.05;
        addRot(p, 'thighL', -0.2);
        addRot(p, 'kneeL', 0.5);
        addRot(p, 'thighR', 0.1);
        addRot(p, 'kneeR', 0.7);
        addRot(p, 'shoulderR', -0.4, 0, -1.2);
        addRot(p, 'shoulderL', -0.4, 0, 1.2);
        addRot(p, 'head', -0.25);
        addRot(p, 'hair', -0.2);
        addRot(p, 'skirt', 0.15);
      }
    }

    if (s.poseHook) s.poseHook(p, addRot, this.time);

    // ── apply
    const j = this.j;
    for (const key of JOINT_KEYS) {
      const joint = j[key];
      if (!joint) continue;
      const r = p[key];
      joint.rotation.x = damp(joint.rotation.x, r[0], lambda, dt);
      joint.rotation.y = key === 'body' ? dampAngle(joint.rotation.y, r[1], lambda, dt) : damp(joint.rotation.y, r[1], lambda, dt);
      joint.rotation.z = damp(joint.rotation.z, r[2], lambda, dt);
    }
    j.hips.position.y = damp(j.hips.position.y, this.baseHipsY + p.hipsY, lambda, dt);
    j.body.position.y = damp(j.body.position.y, p.bodyY, lambda * 0.6, dt);
  }
}
