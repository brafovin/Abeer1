// AREA 5 — Castle Nocturne. The grounds where the Court of a Thousand Vampires (1,024 of them)
// gathers beneath the moon, and (AREA 6) the Throne Hall of the Twin Sovereigns.
import * as THREE from 'three';
import { Area, FogField, MoteField, Sky } from '../Area.js';
import { AreaBuilder } from '../Props.js';
import { Mat, Tex } from '../Materials.js';
import { addShrine, addGateMarker, addNote } from '../Interactables.js';
import { generateCourtSlots } from '../../game/Court.js';
import { LINES } from '../../game/Story.js';
import { seeded, TAU } from '../../core/utils.js';

/** Flock of bats circling the towers (one instanced draw call). */
function addBats(area, center, count = 60, radius = 40, height = 45) {
  const geo = new THREE.BufferGeometry();
  // two triangles (wings) around a tiny body
  const v = [0, 0, 0, -0.9, 0.15, -0.2, -0.3, 0, 0.25, 0, 0, 0, 0.3, 0, 0.25, 0.9, 0.15, -0.2];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x050205, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  area.group.add(mesh);
  const bats = Array.from({ length: count }, (_, i) => ({ r: radius * (0.4 + Math.random() * 0.8), h: height * (0.5 + Math.random() * 0.6), speed: 0.15 + Math.random() * 0.3, phase: Math.random() * TAU, flap: Math.random() * 10, s: 0.8 + Math.random() * 1.2 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  area.updaters.push((dt, t) => {
    bats.forEach((b, i) => {
      const a = b.phase + t * b.speed;
      p.set(center.x + Math.cos(a) * b.r, center.y + b.h + Math.sin(t * 0.7 + i) * 3, center.z + Math.sin(a) * b.r);
      const flap = Math.sin(t * 14 + b.flap);
      e.set(0, -a, flap * 0.3);
      q.setFromEuler(e);
      s.set(b.s, b.s * (0.6 + flap * 0.4), b.s);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

export function buildCastle(game) {
  const area = new Area('castle', {
    name: 'Castle Nocturne',
    subtitle: 'The Court of a Thousand Vampires',
    seed: 55,
    env: {
      fogColor: 0x0c0a14,
      fogDensity: 0.012,
      background: 0x06050a,
      ambient: 0x2a2840,
      ambientIntensity: 0.65,
      hemiSky: 0x5a6a9a,
      hemiGround: 0x1a0a10,
      hemiIntensity: 0.55,
      moonLight: { color: 0xb8c8ff, intensity: 1.1, dir: [0.3, 0.9, 0.7] },
      rimColor: 0x9ab0ff,
      rimStrength: 0.6,
      music: 'castle',
      ambience: 'menu',
      surface: 'stone',
    },
    horror: { enabled: false },
  });
  const b = new AreaBuilder(area);
  const rng = seeded(555);
  const col = area.collision;
  col.bounds = { minX: -88, maxX: 88, minZ: -58, maxZ: 70 };
  // pale moon like the reference image, red-lit castle beneath it
  area.sky = new Sky({ top: 0x04060c, horizon: 0x18202e, moonColor: 0xc8e0e8, moonDir: new THREE.Vector3(0.1, 0.42, 1), moonSize: 120, glow: 1.0 });

  b.floor(-100, 100, -70, 130, Mat.ashGround(), 0, 6);
  b.floor(-5, 5, -58, 70, Mat.cobble(), 0.02, 3);
  b.floor(-30, 30, 40, 70, Mat.cobble(), 0.025, 3);

  // the castle (from the reference painting): towering keep, needle spires, red windows
  b.gothicCastle(0, 95, 1.25, { near: true, light: true });
  col.addBox(0, 95, 46, 22, 0, -10, 100);
  col.addBox(0, 74, 12, 2, 0, -10, 100);
  b.box(14, 10, 3, Mat.stoneDark(), { pos: [0, 5, 74] });
  b.archway(0, 72.2, 6, 9, 0, Mat.stoneDark(), 1.5);
  b.box(6, 8, 0.4, Mat.basic(0x120306), { pos: [0, 4, 72.8], shadow: false });
  addGateMarker(b, 0, 71, 0xff2040);
  area.addGate({
    id: 'gate_throne',
    to: 'throne',
    spawn: 'fromCastle',
    position: new THREE.Vector3(0, 1, 69.5),
    label: 'Enter the Throne Hall of the Twin Sovereigns',
    marker: 'throne',
  });
  area.points.throne = new THREE.Vector3(0, 0, 69.5);
  // outer wall and gate
  b.wall(-88, -58, -6, -58, 5, 1.2, Mat.stoneDark());
  b.wall(6, -58, 88, -58, 5, 1.2, Mat.stoneDark());
  b.wall(-88, -58, -88, 70, 5, 1.2, Mat.stoneDark());
  b.wall(88, -58, 88, 70, 5, 1.2, Mat.stoneDark());
  b.wall(-88, 70, -12, 70, 5, 1.2, Mat.stoneDark());
  b.wall(12, 70, 88, 70, 5, 1.2, Mat.stoneDark());
  for (const [x, z] of [[-88, -58], [88, -58], [-88, 70], [88, 70], [-6, -58], [6, -58]]) {
    b.mesh(new THREE.CylinderGeometry(2, 2.2, 9, 10), Mat.stoneDark(), { pos: [x, 4.5, z] });
    b.mesh(new THREE.ConeGeometry(2.6, 7, 10), Mat.roof(), { pos: [x, 12.5, z] });
    col.addCircle(x, z, 2.2, -10, 20);
  }
  b.archway(0, -58, 5, 7, 0, Mat.stoneDark(), 1.4);
  area.addGate({ id: 'gate_village_road', to: 'village', spawn: 'fromCastle', position: new THREE.Vector3(0, 1, -56.5), label: 'Return along the Castle Road to the Ashen Village' });
  addGateMarker(b, 0, -59.5, 0xb040ff);

  // grand avenue: lamps, braziers, statues, a blood fountain
  for (let z = -50; z < 66; z += 9) {
    b.streetLamp(-5.6, z, { lit: true });
    b.streetLamp(5.6, z + 4.5, { lit: z % 2 === 0 });
  }
  const fountain = (x, z) => {
    b.mesh(new THREE.CylinderGeometry(4, 4.3, 0.8, 24), Mat.stoneWarm(), { pos: [x, 0.4, z] });
    b.bloodPool(x, z, 3.6).position.y = 0.82;
    b.mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.6, 10), Mat.stoneWarm(), { pos: [x, 1.6, z] });
    b.mesh(new THREE.CylinderGeometry(1.6, 0.4, 0.5, 14), Mat.stoneWarm(), { pos: [x, 3.0, z] });
    b.mesh(new THREE.OctahedronGeometry(0.6), Mat.emissive(0xff2030, 2), { pos: [x, 4.1, z], scale: [0.8, 1.4, 0.8] });
    col.addCircle(x, z, 4.3, -10, 1.2);
    area.addFlickerLight(x, 4, z, 0xff3040, 3, 14, 0.15);
  };
  fountain(0, 10);
  fountain(-40, 20);
  fountain(40, 20);
  for (const [x, z] of [[-14, -40], [14, -40], [-14, 40], [14, 40], [-50, -20], [50, -20], [-60, 50], [60, 50]]) b.brazier(x, z, 0xff3020, Math.abs(x) < 20);
  for (const [x, z, r] of [[-20, -10, 0.3], [20, -10, -0.3], [-30, 55, 0.4], [30, 55, -0.4], [-70, 0, 1.2], [70, 0, -1.2]]) b.statue(x, z, r, rng() < 0.5, 1.1);
  // gardens: hedges of black roses (dark boxes) and gravestones at the edges
  for (let i = 0; i < 30; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * rng.range(70, 85), z = rng.range(-50, 64);
    b.gravestone(x, z, rng.range(0, 6), rng() < 0.3 ? 1 : 0);
  }
  for (let i = 0; i < 16; i++) b.deadTree((i % 2 ? 1 : -1) * rng.range(78, 86), rng.range(-50, 66), i, 1.2);
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x0c1410, roughness: 1 });
  for (const [x, z, w, d] of [[-25, -30, 14, 1.4], [25, -30, 14, 1.4], [-25, 30, 14, 1.4], [25, 30, 14, 1.4], [-55, 0, 1.4, 20], [55, 0, 1.4, 20]]) {
    b.box(w, 1.3, d, hedgeMat, { pos: [x, 0.65, z] });
    col.addBox(x, z, w / 2, d / 2, 0, -10, 1.3);
  }

  addShrine(b, -7.5, -48, 'castle_shrine');
  area.spawns.castle_shrine = { x: -5, z: -47, yaw: 0 };
  area.spawns.fromVillage = { x: 0, z: -54, yaw: 0 };
  area.spawns.fromThrone = { x: 0, z: 66, yaw: Math.PI };
  addNote(b, 7.6, null, -50, 'record_court', { lectern: true, rotY: -0.4 });

  // the court: 1,024 slots in mingling circles all over the grounds
  const avoid = [
    { x: 0, z: 0, r: 0 },
    ...Array.from({ length: 30 }, (_, i) => ({ x: 0, z: -58 + i * 4.4, r: 7 })), // the avenue
    { x: 0, z: 10, r: 6.5 }, { x: -40, z: 20, r: 6.5 }, { x: 40, z: 20, r: 6.5 },
    { x: -7.5, z: -48, r: 6 }, { x: 0, z: 60, r: 12 },
    { x: -25, z: -30, r: 8 }, { x: 25, z: -30, r: 8 }, { x: -25, z: 30, r: 8 }, { x: 25, z: 30, r: 8 },
    { x: -55, z: 0, r: 11 }, { x: 55, z: 0, r: 11 },
    { x: -20, z: -10, r: 2.5 }, { x: 20, z: -10, r: 2.5 }, { x: -70, z: 0, r: 2.5 }, { x: 70, z: 0, r: 2.5 }, { x: -30, z: 55, r: 2.5 }, { x: 30, z: 55, r: 2.5 },
  ];
  area.courtSlots = generateCourtSlots(() => 0, { minX: -82, maxX: 82, minZ: -52, maxZ: 64 }, avoid);
  addBats(area, new THREE.Vector3(0, 0, 95), 70, 55, 40);

  area.onEnter = (g) => {
    if (!g.flags.castle_intro) {
      g.flags.castle_intro = true;
      g.timers.after(1.4, () => {
        g.dialogue.monologue(LINES[g.player.charId].castle);
        g.ui.toast('1,024 vampires hold court here. Walk up to one and press [F]: befriend them or challenge them to a duel.', 'info');
      });
    }
  };

  area.fogFields.push(new FogField({ count: 80, area: { minX: -85, maxX: 85, minZ: -55, maxZ: 68 }, y: 0.5, size: 16, color: 0x8a9ab0, opacity: 0.14 }));
  area.motes = new MoteField({ count: 240, radius: 20, height: 12, color: 0xd8e0ff, size: 0.06, rise: 0.1 });
  return area;
}

export function buildThrone(game) {
  const area = new Area('throne', {
    name: 'The Throne Hall',
    subtitle: 'Seat of the Twin Sovereigns',
    seed: 66,
    env: {
      fogColor: 0x100610,
      fogDensity: 0.02,
      background: 0x060306,
      ambient: 0x3a2030,
      ambientIntensity: 0.6,
      hemiSky: 0x7a3a6a,
      hemiGround: 0x1a0508,
      hemiIntensity: 0.5,
      rimColor: 0xd04a8a,
      rimStrength: 0.65,
      music: 'castle',
      ambience: 'cathedral',
      surface: 'stone',
      interior: true,
      ceiling: 17.5,
    },
    horror: { enabled: false },
  });
  const b = new AreaBuilder(area);
  const col = area.collision;
  col.bounds = { minX: -16, maxX: 16, minZ: -34, maxZ: 31 };
  col.ceiling = 17.5;
  b.floor(-17, 17, -35, 32, Mat.floor(), 0, 3.5);
  b.floor(-2.2, 2.2, -33, 24, Mat.cloth(0x6a0a18), 0.02, 2);
  const ceil = new THREE.PlaneGeometry(34, 68).rotateX(Math.PI / 2);
  b.mesh(ceil, Mat.stoneDark(), { pos: [0, 18, -1.5], shadow: false });
  b.wall(-17, -35, -17, 32, 18, 1);
  b.wall(17, -35, 17, 32, 18, 1);
  b.wall(-17, 32, 17, 32, 18, 1);
  b.wall(-17, -35, -3, -35, 18, 1);
  b.wall(3, -35, 17, -35, 18, 1);
  b.wall(-3, -35, 3, -35, 10, 1, Mat.stone(), { y: 8, collide: false });
  for (const x of [-10, 10]) for (let z = -28; z <= 20; z += 8) b.pillar(x, z, 17, 0.6);
  for (let z = -26; z <= 18; z += 11) {
    b.stainedWindow(-16.45, 5, z, 3, 9, 'x', 'crimson', { color: 0xff3060, opacity: 0.08, length: 16 });
    b.stainedWindow(16.45, 5, z, 3, 9, '-x', 'violet', { color: 0xa060ff, opacity: 0.08, length: 16 });
  }
  b.roseWindow(0, 12, 31.45, 4.5, Math.PI);
  // dais and twin thrones
  b.box(16, 0.6, 7, Mat.stoneWarm(), { pos: [0, 0.3, 27] });
  col.addBox(0, 27, 8, 3.5, 0, -10, 0.6);
  for (const s of [-1, 1]) {
    const x = s * 3;
    b.box(2.2, 0.8, 1.8, Mat.cloth(0x4a0812), { pos: [x, 1.0, 28.5] });
    b.box(2.4, 4.5, 0.4, Mat.gold(), { pos: [x, 3.0, 29.5] });
    b.mesh(new THREE.ConeGeometry(0.9, 1.6, 4), Mat.gold(), { pos: [x, 6.0, 29.5], rot: [0, Math.PI / 4, 0] });
    b.box(2.0, 3.8, 0.1, Mat.cloth(s < 0 ? 0x7a0a18 : 0x3a0a5a), { pos: [x, 3.0, 29.25], shadow: false });
    col.addBox(x, 28.8, 1.2, 1.0, 0, -10, 5);
  }
  for (const s of [-1, 1]) {
    b.candelabra(s * 7, 24, 2.4, 2.5);
    b.candelabra(s * 7, 10, 2.4, false);
    b.candelabra(s * 7, -6, 2.4, 2.0);
    b.candelabra(s * 7, -22, 2.4, false);
  }
  // chandeliers
  for (const z of [-18, 0, 16]) {
    const ring = new THREE.TorusGeometry(2.4, 0.08, 6, 24);
    b.mesh(ring, Mat.iron(), { pos: [0, 12, z], rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      area.flames.add(Math.cos(a) * 2.4, 12.3, z + Math.sin(a) * 2.4, 0.2, 0xff9a40);
    }
    area.addFlickerLight(0, 11.5, z, 0xff9050, 2.6, 16, 0.15);
  }
  b.runeCircle(0, 8, 8, '#ff2a3a', 0.25, 0.04);

  area.spawns.fromCastle = { x: 0, z: -30, yaw: 0 };
  area.spawns.throne_shrine = { x: 6, z: -28, yaw: 0 };
  addShrine(b, 8, -30, 'throne_shrine');
  b.archway(0, -35, 5, 8, 0);
  area.addGate({ id: 'gate_castle_back', to: 'castle', spawn: 'fromThrone', position: new THREE.Vector3(0, 1, -33), label: 'Leave the Throne Hall' });
  addGateMarker(b, 0, -36.5, 0xb040ff);
  area.points.throne = new THREE.Vector3(0, 0, 22);

  area.addTrigger({ x: 0, z: 0, radius: 9, once: false, cooldown: 4, onEnter: (g) => g.startSovereignEncounter() });
  area.onEnter = (g) => g.spawnSovereigns();

  area.fogFields.push(new FogField({ count: 30, area: { minX: -15, maxX: 15, minZ: -32, maxZ: 28 }, y: 0.4, size: 9, color: 0x7a4a6a, opacity: 0.13 }));
  area.motes = new MoteField({ count: 200, radius: 15, height: 12, color: 0xffc0d0, size: 0.05, rise: 0.06 });
  return area;
}
