// Procedural monster models: Blood Crawler, Hollow Knight, Night Stalker, Blood Mage,
// the Veiled Countess (boss) and the horror "Watcher" silhouette.
import * as THREE from 'three';
import { toon, glow, flat, part, limb, lathe, strandGeometry, bladeGeometry, optimiseRig, disposeObject } from './Toon.js';
import { buildSkeleton, headGeometry, HumanoidAnimator } from './Humanoid.js';
import { clamp, damp, seeded } from '../../core/utils.js';
import { createVampireModel } from './VampireModels.js';
import { rollFace } from './archetypes.js';

/** Per-instance material registry so hit flashes / fades affect only one enemy. */
class MatSet {
  constructor() {
    this.list = [];
  }
  toon(color, opts = {}) {
    const m = toon(color, { ...opts, noCache: true });
    m.userData.baseEmissive = new THREE.Color(opts.emissive ?? 0x000000);
    m.userData.baseEmissiveIntensity = opts.emissiveIntensity ?? 1;
    this.list.push(m);
    return m;
  }
  glow(color, intensity, opts = {}) {
    const m = glow(color, intensity, { ...opts, noCache: true });
    m.userData.isGlow = true;
    this.list.push(m);
    return m;
  }
}

function makeController(root, mats, extra = {}) {
  let flash = 0;
  let opacity = 1;
  const outlines = [];
  root.traverse((o) => {
    if (o.userData?.isOutline) outlines.push(o);
    if (o.isMesh && !o.userData?.isOutline) o.castShadow = true;
  });
  return {
    root,
    mats,
    flashHit(strength = 1) {
      flash = Math.max(flash, strength);
    },
    setOpacity(a) {
      if (Math.abs(a - opacity) < 0.001) return;
      opacity = a;
      const transparent = a < 0.999;
      for (const m of mats.list) {
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
        if (m.transparent !== transparent && !m.userData.isGlow) {
          m.transparent = transparent;
          m.needsUpdate = true;
        }
        m.opacity = m.userData.baseOpacity * a;
        if (m.userData.isGlow) m.transparent = true;
      }
      for (const o of outlines) o.visible = a > 0.95;
    },
    tickFlash(dt) {
      if (flash <= 0) return;
      flash = Math.max(0, flash - dt * 6);
      for (const m of mats.list) {
        if (m.userData.isGlow || !m.emissive) continue;
        m.emissive.copy(m.userData.baseEmissive).lerp(new THREE.Color(1, 0.85, 0.85), flash);
        m.emissiveIntensity = Math.max(m.userData.baseEmissiveIntensity, flash * 1.2);
      }
    },
    dispose() {
      disposeObject(root);
      for (const m of mats.list) m.dispose();
    },
    ...extra,
  };
}

// ───────────────────────────────────────────── Blood Crawler ────────────────────────────────────

function createCrawler(variant = 0) {
  const M = new MatSet();
  const chitin = M.toon(0x2a080e, { rim: 1.6 });
  const flesh = M.toon(0x6e1220, { emissive: 0x3a0008, emissiveIntensity: 0.6 });
  const eye = M.glow(0xff3a1a, 3.2);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.42;
  root.add(body);
  part(body, new THREE.SphereGeometry(0.26, 16, 12), flesh, { pos: [0, 0.02, -0.28], scale: [1, 0.8, 1.3], outline: 0.012 });
  part(body, new THREE.SphereGeometry(0.2, 14, 10), chitin, { pos: [0, 0.05, 0.02], scale: [1, 0.75, 1.1], outline: 0.012 });
  // dorsal spikes
  for (let i = 0; i < 6; i++) {
    part(body, new THREE.ConeGeometry(0.03, 0.16, 5), chitin, { pos: [(i % 2 ? 0.06 : -0.06), 0.2 - i * 0.012, -0.1 - i * 0.07], rot: [-0.6, 0, (i % 2 ? -0.3 : 0.3)], outline: 0.006 });
  }
  // pulsing veins on the abdomen
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI - Math.PI / 2;
    part(body, strandGeometry([[Math.sin(a) * 0.2, 0.15, -0.15], [Math.sin(a) * 0.25, 0.08, -0.32], [Math.sin(a) * 0.18, 0.0, -0.5]], { width: 0.01, thick: 1, radial: 4, segments: 6, taper: 0.3 }), M.glow(0xff1a2a, 1.6), { outline: false });
  }
  const head = new THREE.Group();
  head.position.set(0, 0.04, 0.22);
  body.add(head);
  part(head, new THREE.SphereGeometry(0.13, 14, 10), chitin, { scale: [1, 0.8, 1.15], outline: 0.01 });
  for (const [x, y] of [[0.05, 0.05], [-0.05, 0.05], [0.085, 0.015], [-0.085, 0.015]]) {
    part(head, new THREE.SphereGeometry(0.022, 8, 6), eye, { pos: [x, y, 0.11], outline: false });
  }
  const mandibles = [];
  for (const s of [1, -1]) {
    const m = new THREE.Group();
    m.position.set(0.05 * s, -0.04, 0.12);
    head.add(m);
    part(m, strandGeometry([[0, 0, 0], [0.04 * s, -0.02, 0.08], [0.0, -0.03, 0.15]], { width: 0.022, thick: 0.6, segments: 6, radial: 5 }), M.toon(0xd8c8b8), { outline: 0.004 });
    mandibles.push(m);
  }
  // six legs, two segments each
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1;
    const k = i % 3;
    const hip = new THREE.Group();
    hip.position.set(0.14 * side, 0.0, 0.12 - k * 0.17);
    hip.rotation.y = side * (0.5 + k * 0.5) - (side > 0 ? 0 : 0);
    body.add(hip);
    const upper = new THREE.Group();
    hip.add(upper);
    upper.rotation.z = side * 0.9;
    part(upper, limb(0.03, 0.022, 0.34, 6), chitin, { rot: [0, 0, 0], outline: 0.006 });
    const knee = new THREE.Group();
    knee.position.y = -0.34;
    upper.add(knee);
    knee.rotation.z = -side * 2.1;
    part(knee, limb(0.022, 0.006, 0.42, 6), chitin, { outline: 0.006 });
    legs.push({ hip, upper, knee, side, phase: (i % 2 === 0 ? 0 : Math.PI) + (k % 2) * Math.PI });
  }
  optimiseRig(root);
  const scale = 1 + variant * 0.15;
  root.scale.setScalar(scale);
  let phase = 0;
  const ctrl = makeController(root, M, {
    height: 0.7 * scale,
    eyeMat: eye,
    update(dt, s) {
      ctrl.tickFlash(dt);
      const speed = s.speed ?? 0;
      phase += dt * (4 + speed * 3.2);
      const moving = speed > 0.2;
      for (const L of legs) {
        const sw = moving ? Math.sin(phase + L.phase) : Math.sin(phase * 0.2 + L.phase) * 0.1;
        L.hip.rotation.x = sw * 0.35;
        L.upper.rotation.z = L.side * (0.9 + Math.max(0, Math.cos(phase + L.phase)) * (moving ? 0.35 : 0.05));
      }
      let pitch = 0, lunge = 0, bob = moving ? Math.abs(Math.sin(phase * 2)) * 0.03 : Math.sin(phase * 0.5) * 0.01;
      const t = s.t ?? 0;
      let roll = 0;
      if (s.action === 'windup') {
        pitch = -0.5 * t;
        lunge = -0.08 * t;
      } else if (s.action === 'attack') {
        pitch = -0.5 + t * 0.8;
        lunge = 0.3 * Math.sin(t * Math.PI);
      } else if (s.action === 'hurt') {
        pitch = -0.2 * Math.sin(t * Math.PI);
      } else if (s.action === 'dead') {
        roll = Math.min(1, t * 2) * Math.PI;
        for (const L of legs) L.upper.rotation.z = L.side * (1.6 - t * 0.5);
      }
      body.rotation.x = damp(body.rotation.x, pitch, 18, dt);
      body.rotation.z = damp(body.rotation.z, roll, 8, dt);
      body.position.z = damp(body.position.z, lunge, 18, dt);
      body.position.y = 0.42 + bob - (s.action === 'dead' ? Math.min(1, t * 2) * 0.25 : 0);
      for (const m of mandibles) m.rotation.y = Math.sin(phase * (s.action === 'windup' ? 3 : 0.6)) * 0.3 * (m.position.x > 0 ? 1 : -1);
    },
  });
  return ctrl;
}

// ───────────────────────────────────────────── Vampire thralls ──────────────────────────────────
// The Hollow Knight, Night Stalker and Blood Mage are fallen vampires. They are built with the same
// archetype kit as the court (pale skin, burning red eyes, fangs, gothic gear) so the whole cast shares
// one art style, but with per-instance materials so hit flashes and fades stay per enemy.

/** Clone the shared toon/glow materials so this one enemy can flash and fade on its own. */
function instanceMaterials(vm, M) {
  const map = new Map();
  vm.root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    let c = map.get(o.material);
    if (!c) {
      const m = o.material;
      c = m.clone();
      c.onBeforeCompile = m.onBeforeCompile;
      c.customProgramCacheKey = m.customProgramCacheKey;
      c.userData = { ...m.userData };
      if (m.isMeshBasicMaterial) c.userData.isGlow = true;
      else {
        c.userData.baseEmissive = (m.emissive ?? new THREE.Color(0)).clone();
        c.userData.baseEmissiveIntensity = m.emissiveIntensity ?? 1;
      }
      M.list.push(c);
      map.set(m, c);
    }
    o.material = c;
  });
  return map;
}

function buildThrall(appearance, opts = {}) {
  const M = new MatSet();
  const vm = createVampireModel(appearance, opts);
  const mats = instanceMaterials(vm, M);
  return { M, vm, eyeMat: mats.get(vm.eyeMat) ?? null };
}

const KNIGHT_LOOK = {
  seed: 4101, gender: 'm', archetype: 'warrior', outfit: 'vest', hair: 'capOnly', hairRoot: 0x1a1416, hairTip: 0x3a3032, hairHighlight: 0x5a5052,
  eye: 0xff2a2a, skin: 0xb9b3bd, main: 0x1a1a20, accent: 0x7a0a18, dark: 0x0c0c10, trim: 0x8a909c, armor: 0x474c58, accessory: 'none', fangs: true,
  weapon: 'swordShield', headgear: 'hornedHelm', back: 'cloak', shoulders: 'spikes', marks: ['scar'],
  build: { h: 1.14, b: 1.34, l: 1.3, r: 1.02, leg: 0.98, hd: 1.05 }, heightScale: 1.14, face: rollFace('warrior', false, seeded(4101)),
};
const STALKER_LOOK = {
  seed: 4102, gender: 'm', archetype: 'ancient', outfit: 'rags', hair: 'lank', hairRoot: 0x6a6a72, hairTip: 0xa8a8b4, hairHighlight: 0xdcdce6,
  eye: 0xff1a30, skin: 0x9d9ba8, main: 0x141218, accent: 0x6a0a1c, dark: 0x060508, trim: 0xb0aab8, armor: 0x2a2630, accessory: 'none', fangs: true,
  weapon: 'claws', headgear: 'none', back: 'cloak', shoulders: 'bone', marks: ['veins', 'hollow', 'maw'],
  build: { h: 1.25, b: 0.72, l: 0.66, r: 1.36, leg: 1.08, hd: 0.94 }, heightScale: 1.25, face: rollFace('ancient', false, seeded(4102)),
};
const MAGE_LOOK = {
  seed: 4103, gender: 'm', archetype: 'sorcerer', outfit: 'coat', hair: 'slick', hairRoot: 0x120a10, hairTip: 0x3a1a26, hairHighlight: 0x6a2a3c,
  eye: 0xff2640, skin: 0xe2d6dc, main: 0x2a0a14, accent: 0xff1638, dark: 0x120608, trim: 0xb89a7a, armor: 0x2a0a16, accessory: 'none', fangs: true,
  weapon: 'none', headgear: 'hood', back: 'cloak', shoulders: 'mantle', marks: ['runes'],
  build: { h: 1.04, b: 0.94, l: 0.92, r: 1.02, leg: 1.02, hd: 1.0 }, heightScale: 1.04, face: rollFace('sorcerer', false, seeded(4103)),
};

// ───────────────────────────────────────────── Hollow Knight ────────────────────────────────────

function createHollowKnight() {
  const { M, vm, eyeMat } = buildThrall(KNIGHT_LOOK);
  const ctrl = makeController(vm.root, M, {
    height: 2.1,
    eyeMat,
    update(dt, s) {
      ctrl.tickFlash(dt);
      const t = s.t ?? 0;
      let action = null;
      if (s.action === 'windup') action = { type: 'attack', index: 2, t: t * 0.3 };
      else if (s.action === 'attack') action = { type: 'attack', index: 2, t: 0.3 + t * 0.25 };
      else if (s.action === 'recover') action = { type: 'attack', index: 2, t: 0.55 + t * 0.45 };
      else if (s.action === 'block') action = null;
      else if (s.action === 'hurt') action = { type: 'hurt', t };
      else if (s.action === 'dead') action = { type: 'dead', t };
      vm.update(dt, {
        speed: (s.speed ?? 0) * 1.5,
        grounded: true,
        action,
        poseHook: (p, add) => {
          add(p, 'spine', 0.08, 0, 0);
          if (s.action === 'block' || s.blocking) {
            add(p, 'shoulderL', -1.35, 0.4, -0.3);
            add(p, 'elbowL', -1.0, 0, 0);
          } else {
            add(p, 'shoulderL', -0.25, 0, 0.1);
            add(p, 'elbowL', -0.9, 0, 0);
          }
        },
      });
    },
  });
  return ctrl;
}

// ───────────────────────────────────────────── Night Stalker ────────────────────────────────────

function createNightStalker() {
  const { M, vm, eyeMat } = buildThrall(STALKER_LOOK, { stance: {}, gait: { stride: 1, bounce: 1, sway: 1 } });
  const ctrl = makeController(vm.root, M, {
    height: 2.4,
    eyeMat,
    update(dt, s) {
      ctrl.tickFlash(dt);
      const t = s.t ?? 0;
      let action = null;
      if (s.action === 'windup') action = { type: 'attack', index: 2, t: t * 0.25 };
      else if (s.action === 'attack') action = { type: 'attack', index: 2, t: 0.25 + t * 0.25 };
      else if (s.action === 'recover') action = { type: 'attack', index: 2, t: 0.5 + t * 0.5 };
      else if (s.action === 'hurt') action = { type: 'hurt', t };
      else if (s.action === 'dead') action = { type: 'dead', t };
      else if (s.action === 'lunge') action = { type: 'dash', t };
      vm.update(dt, {
        speed: (s.speed ?? 0) * 0.9,
        sprint: (s.speed ?? 0) > 5,
        grounded: true,
        action,
        poseHook: (p, add, time) => {
          // hunched, twitching posture
          add(p, 'spine', 0.5, 0, 0);
          add(p, 'chest', 0.2, 0, Math.sin(time * 7.3) * 0.03);
          add(p, 'neck', -0.45, 0, 0);
          add(p, 'head', -0.2, Math.sin(time * 3.1) * 0.15, Math.sin(time * 11) * 0.06);
          add(p, 'shoulderL', 0.25, 0, 0.12);
          add(p, 'shoulderR', 0.25, 0, -0.12);
          add(p, 'kneeL', 0.35);
          add(p, 'kneeR', 0.35);
          add(p, 'thighL', -0.2);
          add(p, 'thighR', -0.2);
          p.hipsY -= 0.08;
          if (s.action === 'emerge') {
            add(p, 'head', -0.6 * (1 - t), 0, 0);
            add(p, 'shoulderL', -1.5 * (1 - t), 0, 0.6);
            add(p, 'shoulderR', -1.5 * (1 - t), 0, -0.6);
          }
        },
      });
    },
  });
  return ctrl;
}

// ───────────────────────────────────────────── Blood Mage ───────────────────────────────────────

function createBloodMage() {
  const { M, vm, eyeMat } = buildThrall(MAGE_LOOK);
  const orbGlow = M.glow(0xff1638, 3.0);
  // orbs in the hands + three orbiting blood orbs
  const handOrbs = [];
  for (const side of ['L', 'R']) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), orbGlow);
    o.position.set(0, -0.09, 0.03);
    vm.joints['hand' + side].add(o);
    handOrbs.push(o);
  }
  const orbit = new THREE.Group();
  orbit.position.y = 1.2;
  vm.root.add(orbit);
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), orbGlow);
    const a = (i / 3) * Math.PI * 2;
    o.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
    orbit.add(o);
  }
  let time = 0;
  const ctrl = makeController(vm.root, M, {
    height: 2.0,
    eyeMat,
    update(dt, s) {
      time += dt;
      ctrl.tickFlash(dt);
      const t = s.t ?? 0;
      let action = null;
      let charge = 0;
      if (s.action === 'windup') {
        action = { type: 'castUp', t: t * 0.45 };
        charge = t;
      } else if (s.action === 'attack') action = { type: 'cast', t: 0.3 + t * 0.3 };
      else if (s.action === 'recover') action = { type: 'cast', t: 0.6 + t * 0.4 };
      else if (s.action === 'hurt') action = { type: 'hurt', t };
      else if (s.action === 'dead') action = { type: 'dead', t };
      vm.update(dt, {
        speed: 0,
        grounded: true,
        action,
        poseHook: (p) => {
          p.bodyY += 0.18 + Math.sin(time * 1.7) * 0.06;
        },
      });
      orbit.rotation.y += dt * (1.2 + charge * 6);
      const sc = 1 + charge * 1.5;
      for (const o of handOrbs) o.scale.setScalar(sc);
      orbit.visible = s.action !== 'dead';
    },
  });
  return ctrl;
}

// ───────────────────────────────────────────── The Veiled Countess ──────────────────────────────

function createCountess() {
  const M = new MatSet();
  const dims = { hipY: 1.0, thigh: 0.45, shin: 0.45, torso: 0.48, shoulderW: 0.17, hipW: 0.08, upperArm: 0.3, forearm: 0.28, neck: 0.08, headR: 0.105 };
  const j = buildSkeleton(dims);
  const gown = M.toon(0x0f0b12, { rim: 2.0 });
  const crimson = M.toon(0x7a0a1c, { emissive: 0x2a0008, emissiveIntensity: 0.5, rim: 1.6 });
  const gold = M.toon(0x9a7a44, { rim: 1.8 });
  const skin = M.toon(0xe9e2e6, { rim: 0.8 });
  const eye = M.glow(0xff1a2e, 4.0);
  const claw = M.toon(0x2a0408, { rim: 2.0 });
  // corset + bodice
  part(j.spine, lathe([[0.098, -0.05], [0.094, 0.06], [0.104, 0.16], [0.118, 0.24]], { scaleZ: 0.72 }), crimson);
  part(j.chest, lathe([[0.11, -0.1], [0.125, -0.02], [0.14, 0.08], [0.14, 0.17], [0.12, 0.23], [0.06, 0.27]], { scaleZ: 0.72 }), gown, { outline: 0.006 });
  part(j.chest, new THREE.CylinderGeometry(0.035, 0.04, 0.14, 10).translate(0, 0.3, 0), skin, { outline: false });
  // towering ruffled collar
  const collar = lathe([[0.06, 0.25], [0.1, 0.32], [0.18, 0.45], [0.24, 0.55]], { gap: 1.4, segments: 22, scaleZ: 0.9 });
  part(j.chest, collar, crimson, { pos: [0, 0, -0.02] });
  part(j.chest, collar, gown, { pos: [0, 0, -0.025], scale: [1.02, 1, 1.02] });
  // enormous layered gown with a torn hem
  const layers = [
    { prof: [[0.12, 0.1], [0.2, -0.1], [0.36, -0.45], [0.55, -0.8], [0.7, -1.0]], mat: gown, s: 1 },
    { prof: [[0.11, 0.06], [0.18, -0.1], [0.32, -0.42], [0.48, -0.7], [0.6, -0.92]], mat: crimson, s: 1.0 },
  ];
  const rng = seeded(666);
  for (const L of layers) {
    const g = lathe(L.prof, { segments: 36, scaleZ: 0.9 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < L.prof[L.prof.length - 1][1] + 0.05) p.setY(i, p.getY(i) + rng.range(0, 0.25));
    g.computeVertexNormals();
    part(j.skirt, g, L.mat, { outline: 0.01 });
    part(j.skirt, g, M.toon(0x060306, { side: THREE.BackSide }), { scale: [0.985, 1, 0.985], outline: false });
  }
  for (let i = 0; i < 3; i++) part(j.skirt, new THREE.TorusGeometry(0.25 + i * 0.12, 0.008, 4, 40), gold, { pos: [0, -0.3 - i * 0.2, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.9, 1], outline: false });
  // sleeves flaring into bells, long red claws
  for (const side of ['L', 'R']) {
    part(j['shoulder' + side], new THREE.SphereGeometry(0.07, 10, 8), gown, { outline: 0.006 });
    part(j['shoulder' + side], limb(0.05, 0.045, dims.upperArm, 10), gown, { outline: 0.006 });
    part(j['elbow' + side], lathe([[0.045, 0], [0.06, -0.12], [0.11, -0.26], [0.13, -0.3]], { segments: 16 }), crimson, { outline: 0.006 });
    part(j['elbow' + side], lathe([[0.045, 0], [0.06, -0.12], [0.11, -0.26], [0.13, -0.3]], { segments: 16 }), M.toon(0x080408, { side: THREE.BackSide }), { scale: 0.98, outline: false });
    const hand = j['hand' + side];
    part(hand, new THREE.SphereGeometry(0.035, 10, 8), skin, { pos: [0, -0.02, 0], scale: [0.8, 1.2, 0.9], outline: 0.003 });
    for (let f = 0; f < 4; f++) {
      const x = (f - 1.5) * 0.016;
      part(hand, strandGeometry([[x, -0.04, 0.0], [x * 1.3, -0.13, 0.03], [x * 1.4, -0.22, 0.09]], { width: 0.008, thick: 0.8, segments: 6, radial: 4 }), claw, { outline: 0.002 });
    }
  }
  // face (pale, mostly hidden by the veil), crown and veil
  part(j.head, headGeometry(0.105, { jaw: 0.42, width: 0.88 }), skin, { outline: 0.004 });
  for (const s of [1, -1]) part(j.head, new THREE.SphereGeometry(0.012, 8, 6), eye, { pos: [0.038 * s, -0.005, 0.095], scale: [1.5, 0.7, 0.5], outline: false });
  part(j.head, new THREE.TorusGeometry(0.011, 0.002, 4, 10, Math.PI), M.toon(0x8a0a1e), { pos: [0, -0.06, 0.092], rot: [0, 0, Math.PI], outline: false });
  // long silver-white hair beneath the veil
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (0.5 + (i / 11) * 1.0);
    const sx = Math.sin(a), cz = Math.cos(a);
    part(j.hair, strandGeometry([[sx * 0.1, 0.06, cz * 0.1], [sx * 0.15, -0.2, cz * 0.14 - 0.02], [sx * 0.18, -0.6, -0.12], [sx * 0.2, -0.9, -0.15]], { width: 0.045, thick: 0.35, segments: 12, rootColor: 0xd8d4e0, tipColor: 0x8a8296 }), M.toon(0xffffff, { vertexColors: true, rim: 1.2 }), { outline: 0.004 });
  }
  const crown = new THREE.Group();
  crown.position.set(0, 0.1, -0.01);
  j.head.add(crown);
  part(crown, new THREE.CylinderGeometry(0.1, 0.11, 0.05, 16, 1, true), gold, { outline: 0.004 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const h = i % 2 ? 0.12 : 0.22;
    part(crown, new THREE.ConeGeometry(0.018, h, 4), gold, { pos: [Math.sin(a) * 0.1, h / 2 + 0.02, Math.cos(a) * 0.1], outline: 0.003 });
  }
  part(crown, new THREE.OctahedronGeometry(0.025), M.glow(0xff2040, 2.6), { pos: [0, 0.07, 0.11], scale: [0.8, 1.3, 0.5], outline: false });
  const veilGeo = lathe([[0.03, 0.14], [0.13, 0.08], [0.16, -0.08], [0.18, -0.22], [0.2, -0.3]], { segments: 24 });
  const veilMat = new THREE.MeshToonMaterial({ color: 0x0a0408, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
  M.list.push(veilMat);
  veilMat.userData.baseEmissive = new THREE.Color(0);
  veilMat.userData.baseEmissiveIntensity = 1;
  const veil = new THREE.Mesh(veilGeo, veilMat);
  veil.renderOrder = 2;
  j.head.add(veil);
  optimiseRig(j.root);
  j.root.scale.setScalar(1.38);
  const animator = new HumanoidAnimator(j, 'blades', { female: true, vampire: true });
  let time = 0;
  const ctrl = makeController(j.root, M, {
    height: 2.7,
    eyeMat: eye,
    update(dt, s) {
      time += dt;
      ctrl.tickFlash(dt);
      const t = s.t ?? 0;
      let action = null;
      const a = s.action;
      if (a === 'cast' || a === 'volley') action = { type: 'cast', t };
      else if (a === 'summon' || a === 'pools') action = { type: 'castUp', t };
      else if (a === 'claw_windup') action = { type: 'attack', index: 0, t: t * 0.3 };
      else if (a === 'claw') action = { type: 'attack', index: 0, t: 0.3 + t * 0.7 };
      else if (a === 'hurt') action = { type: 'hurt', t };
      else if (a === 'dead') action = { type: 'dead', t: t * 0.6 };
      animator.update(dt, {
        speed: 0,
        grounded: true,
        action,
        poseHook: (p, add) => {
          p.bodyY += 0.35 + Math.sin(time * 1.3) * 0.08;
          add(p, 'skirt', Math.sin(time * 0.9) * 0.03, 0, Math.sin(time * 0.7) * 0.03);
          if (a === 'shriek') {
            add(p, 'head', -0.6, 0, 0);
            add(p, 'chest', -0.3, 0, 0);
            add(p, 'shoulderL', -0.6, 0, 1.4);
            add(p, 'shoulderR', -0.6, 0, -1.4);
          }
          if (!action && a !== 'shriek') {
            // elegant, arms lowered with claws spread
            add(p, 'shoulderL', 0.1, 0, -0.12);
            add(p, 'shoulderR', 0.1, 0, 0.12);
            add(p, 'elbowL', 0.25);
            add(p, 'elbowR', 0.25);
            add(p, 'handL', 0, 0, 0.3);
            add(p, 'handR', 0, 0, -0.3);
          }
        },
      });
    },
  });
  return ctrl;
}

// ───────────────────────────────────────────── Watcher silhouette ───────────────────────────────

export function createWatcherModel() {
  const root = new THREE.Group();
  const black = new THREE.MeshBasicMaterial({ color: 0x020103, transparent: true, opacity: 1 });
  const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(2.5), toneMapped: false, transparent: true });
  const body = new THREE.Mesh(lathe([[0.05, 2.35], [0.14, 2.15], [0.1, 1.95], [0.22, 1.75], [0.2, 1.2], [0.3, 0.4], [0.38, 0]], { segments: 10 }), black);
  root.add(body);
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(limb(0.05, 0.03, 1.3, 6), black);
    arm.position.set(0.24 * s, 1.75, 0);
    arm.rotation.z = 0.08 * s;
    root.add(arm);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), eye);
    e.position.set(0.04 * s, 2.15, 0.11);
    root.add(e);
  }
  return {
    root,
    setOpacity(a) {
      black.opacity = a;
      eye.opacity = a;
    },
    dispose() {
      disposeObject(root);
      black.dispose();
      eye.dispose();
    },
  };
}

const FACTORIES = {
  crawler: () => createCrawler(0),
  crawler_big: () => createCrawler(1),
  knight: createHollowKnight,
  stalker: createNightStalker,
  mage: createBloodMage,
  countess: createCountess,
};

export function createEnemyModel(type) {
  const f = FACTORIES[type];
  if (!f) throw new Error(`Unknown enemy model type "${type}"`);
  return f();
}
