// AREA 4 — The Blood Altar. A ring of broken pillars on a cliff beneath the crimson moon,
// where the Veiled Countess waits.
import * as THREE from 'three';
import { Area, FogField, MoteField, Sky } from '../Area.js';
import { AreaBuilder } from '../Props.js';
import { Mat } from '../Materials.js';
import { addShrine, addNote, addGateMarker } from '../Interactables.js';
import { seeded, TAU } from '../../core/utils.js';

export function buildAltar(game) {
  const R = 23;
  const heightFn = (x, z) => {
    // the approach stair rises from the south to the plateau
    if (z < -R + 1) return Math.max(0, Math.min(2.4, (z + 46) * 0.12));
    return 2.4;
  };
  const area = new Area('altar', {
    name: 'The Blood Altar',
    subtitle: 'Where the moon is closest',
    seed: 44,
    heightFn,
    env: {
      fogColor: 0x1a060c,
      fogDensity: 0.016,
      background: 0x0a0306,
      ambient: 0x3a1a24,
      ambientIntensity: 0.6,
      hemiSky: 0x8a3040,
      hemiGround: 0x1a0508,
      hemiIntensity: 0.55,
      moonLight: { color: 0xff3040, intensity: 1.4, dir: [0.0, 0.6, 1] },
      rimColor: 0xff3a4a,
      rimStrength: 0.75,
      music: 'explore',
      ambience: 'altar',
      surface: 'stone',
    },
    horror: { enabled: true, minGap: 30, maxGap: 50, events: ['thunder', 'whisper', 'heartbeat'] },
  });
  const b = new AreaBuilder(area);
  const rng = seeded(444);
  const col = area.collision;
  col.bounds = { circle: { x: 0, z: 0, r: R } };
  area.sky = new Sky({ top: 0x0a0206, horizon: 0x5a0a18, moonColor: 0xff2a2a, moonDir: new THREE.Vector3(0, 0.22, 1), moonSize: 150, glow: 1.4 });

  // plateau and cliff
  const plat = new THREE.CylinderGeometry(R + 1, R - 2, 30, 48, 1);
  b.mesh(plat, Mat.stoneDark(), { pos: [0, 2.4 - 15, 0], shadow: false });
  const top = new THREE.CircleGeometry(R + 1, 64);
  top.rotateX(-Math.PI / 2);
  b.mesh(top, Mat.floor(), { pos: [0, 2.401, 0], shadow: false });
  // inner ritual circle rings
  for (const r of [7, 12]) b.mesh(new THREE.RingGeometry(r - 0.3, r, 64).rotateX(-Math.PI / 2), Mat.stoneWarm(), { pos: [0, 2.42, 0], shadow: false });
  // approach stair (south) — a corridor carved into the cliff
  for (let i = 0; i < 20; i++) {
    const z = -46 + i * 1.2;
    const y = heightFn(0, z);
    b.box(7, 0.25, 1.25, Mat.stoneWarm(), { pos: [0, y - 0.12, z], shadow: false });
  }
  b.wall(-3.8, -47, -3.8, -22.5, 4, 0.6, Mat.stoneDark(), { y: 0 });
  b.wall(3.8, -47, 3.8, -22.5, 4, 0.6, Mat.stoneDark(), { y: 0 });
  col.bounds = { circle: { x: 0, z: 0, r: R }, stair: true };
  // allow the corridor: custom bounds check (circle OR corridor)
  col.clampToBounds = function (pos, radius = 0) {
    const inCorr = pos.z < -R + 3 && pos.z > -47.5;
    if (inCorr) {
      let hit = false;
      if (pos.x < -3.4 + radius) { pos.x = -3.4 + radius; hit = true; }
      if (pos.x > 3.4 - radius) { pos.x = 3.4 - radius; hit = true; }
      if (pos.z < -47 + radius) { pos.z = -47 + radius; hit = true; }
      return hit;
    }
    const d = Math.hypot(pos.x, pos.z);
    const max = R - radius;
    if (d > max) {
      pos.x = (pos.x / d) * max;
      pos.z = (pos.z / d) * max;
      return true;
    }
    return false;
  };
  const baseInside = col.pointInside.bind(col);
  col.pointInside = (x, z, y = 1, pad = 0) => {
    const savedBounds = col.bounds;
    col.bounds = null;
    const res = baseInside(x, z, y, pad);
    col.bounds = savedBounds;
    if (res) return res;
    const inCorr = z < -R + 3 && z > -47.5 && Math.abs(x) < 3.4;
    if (!inCorr && Math.hypot(x, z) > R) return { bounds: true };
    return null;
  };

  // ring of gothic pillars (some broken)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + TAU / 24;
    const x = Math.sin(a) * 19.5, z = Math.cos(a) * 19.5;
    if (z < -17 && Math.abs(x) < 6) continue; // leave the entrance open
    const broken = i % 3 === 1 ? rng.range(0.35, 0.6) : null;
    b.pillar(x, z, 11, 0.55, Mat.stoneWarm(), broken ? { broken } : {});
  }
  // arches crowning the north side
  b.archway(0, 21.5, 8, 12, Math.PI, Mat.stoneWarm(), 1.4);
  // the altar and the pool of blood
  b.box(4.4, 1.2, 2.2, Mat.stoneWarm(), { pos: [0, 3.0, 9.5] });
  col.addBox(0, 9.5, 2.2, 1.1, 0, -10, 3.6);
  b.box(1.6, 0.03, 2.25, Mat.cloth(0x6a0a18), { pos: [0, 3.62, 9.5] });
  b.candles(-1.6, 3.6, 9.3, 4, 0.3);
  b.candles(1.6, 3.6, 9.7, 4, 0.3);
  b.bloodPool(0, 0, 4);
  b.runeCircle(0, 0, 6.5, '#ff1a2a', 0.5, 0.06);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.brazier(Math.sin(a) * 15, Math.cos(a) * 15, 0xff2a20, i % 2 === 0);
  }
  // distant silhouettes: the castle across the valley, jagged peaks
  b.gothicCastle(-160, 230, 1.8, { rotY: Math.PI * 0.85 });
  for (let i = 0; i < 14; i++) {
    const a = rng.range(0, TAU), d = rng.range(140, 220);
    const peak = new THREE.ConeGeometry(rng.range(20, 45), rng.range(40, 90), 5);
    b.mesh(peak, Mat.black(), { pos: [Math.sin(a) * d, -20, Math.cos(a) * d], shadow: false });
  }

  addShrine(b, 2.6, -40, 'altar_shrine');
  area.spawns.altar_shrine = { x: 0, z: -38, yaw: 0 };
  area.spawns.fromForest = { x: 0, z: -44, yaw: 0 };
  area.spawns.arena = { x: 0, z: -16, yaw: 0 };
  addNote(b, -2.6, null, -36, 'record_court', { lectern: true, rotY: 0.4 });
  area.addGate({ id: 'gate_forest_back', to: 'forest', spawn: 'fromAltar', position: new THREE.Vector3(0, 1, -46), label: 'Descend to the Whispering Forest' });
  addGateMarker(b, 0, -47.5, 0xff3050);
  area.points.boss = new THREE.Vector3(0, 2.4, 0);
  // after the Countess falls, a red road opens toward the castle
  const castleGate = area.addGate({
    id: 'gate_castle_altar',
    to: 'castle',
    spawn: 'fromVillage',
    position: new THREE.Vector3(0, 3, 19.5),
    label: 'Follow the red road to Castle Nocturne',
    requires: (g) => (g.flags.boss_defeated ? null : 'An invisible force holds you back.'),
  });

  // boss trigger
  area.addTrigger({ x: 0, z: -8, radius: 11, once: true, onEnter: (g) => {
    if (!g.flags.boss_defeated) g.startCountessFight();
  } });
  area.onEnter = (g) => {
    if (!g.flags.boss_defeated) g.spawnCountess(0, 5);
  };

  area.fogFields.push(new FogField({ count: 40, area: { minX: -24, maxX: 24, minZ: -40, maxZ: 24 }, y: 2.8, size: 12, color: 0x8a3040, opacity: 0.14 }));
  area.motes = new MoteField({ count: 300, radius: 18, height: 12, color: 0xff6070, size: 0.06, rise: 0.4 });
  return area;
}
