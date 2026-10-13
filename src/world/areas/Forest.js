// AREA 3 — The Whispering Forest. A winding path through dead trees and thick fog, ambush
// clearings, a hidden grove, two cursed altars and the sealed stair to the Blood Altar.
import * as THREE from 'three';
import { Area, FogField, MoteField, Sky } from '../Area.js';
import { AreaBuilder } from '../Props.js';
import { Mat } from '../Materials.js';
import { addShrine, addNote, addChest, addGateMarker, CursedAltar } from '../Interactables.js';
import { LINES } from '../../game/Story.js';
import { seeded, fbm2D, smoothstep } from '../../core/utils.js';

export const pathX = (z) => Math.sin(z / 22) * 11 + Math.sin(z / 9) * 2;

export function buildForest(game) {
  const heightFn = (x, z) => {
    const h = fbm2D(x * 0.04, z * 0.04, 3, 5) * 1.6;
    const dPath = Math.abs(x - pathX(z));
    return h * smoothstep(3, 9, dPath) + h * 0.25;
  };
  const area = new Area('forest', {
    name: 'The Whispering Forest',
    subtitle: 'Do not stop moving',
    seed: 33,
    heightFn,
    env: {
      fogColor: 0x0c0a10,
      fogDensity: 0.045,
      background: 0x070508,
      ambient: 0x221a28,
      ambientIntensity: 0.7,
      hemiSky: 0x4a4060,
      hemiGround: 0x10080a,
      hemiIntensity: 0.5,
      moonLight: { color: 0xc04a60, intensity: 0.7, dir: [-0.3, 0.9, 0.5] },
      rimColor: 0x9a5aa0,
      music: 'forest',
      ambience: 'forest',
      surface: 'dirt',
    },
    horror: { enabled: true, minGap: 16, maxGap: 34, events: ['whisper', 'steps', 'crow', 'watcher', 'watcher', 'heartbeat'] },
  });
  const b = new AreaBuilder(area);
  const rng = seeded(333);
  const col = area.collision;
  col.bounds = { minX: -42, maxX: 42, minZ: -3, maxZ: 160 };
  area.sky = new Sky({ top: 0x040306, horizon: 0x1a0a14, moonColor: 0xff3040, moonDir: new THREE.Vector3(-0.2, 0.45, 1), moonSize: 55, glow: 0.7 });

  b.terrain(-50, 50, -10, 170, Mat.forestGround(), 70, 5);
  // path ribbon (slightly lighter dirt)
  {
    const pts = [];
    for (let z = -4; z <= 158; z += 2) pts.push(z);
    const pos = [], uv = [], idx = [];
    pts.forEach((z, i) => {
      const x = pathX(z);
      for (const s of [-1, 1]) {
        const px = x + s * 2.6;
        pos.push(px, heightFn(px, z) + 0.04, z);
        uv.push(s < 0 ? 0 : 1, z / 3);
      }
      if (i > 0) {
        const a = (i - 1) * 2, c = i * 2;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.mesh(g, Mat.dirt(), { shadow: false });
  }

  // clearings (no trees)
  const clearings = [
    { x: pathX(40), z: 40, r: 9 },
    { x: pathX(80), z: 80, r: 8 },
    { x: pathX(118), z: 118, r: 10 },
    { x: -30, z: 60, r: 6 }, // hidden grove
    { x: 24, z: 70, r: 5 },
    { x: -22, z: 128, r: 5 },
    { x: pathX(150), z: 150, r: 7 },
  ];
  const inClearing = (x, z) => clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
  // dense dead forest
  let trees = 0;
  for (let i = 0; i < 900 && trees < 260; i++) {
    const x = rng.range(-41, 41), z = rng.range(-2, 158);
    const dPath = Math.abs(x - pathX(z));
    if (dPath < 4.2 || inClearing(x, z)) continue;
    // keep a faint trail to the hidden grove
    if (z > 55 && z < 65 && x < pathX(z) && x > -30 && Math.abs(z - 60) < 1.6) continue;
    b.deadTree(x, z, i, rng.range(0.75, 1.35), true);
    trees++;
  }
  // border wall of trees and rocks
  for (let z = -2; z < 160; z += 5) {
    b.deadTree(-43 + rng.range(-1, 1), z, z | 0, 1.3, false);
    b.deadTree(43 + rng.range(-1, 1), z, (z | 0) + 3, 1.3, false);
  }
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-40, 40), z = rng.range(0, 158);
    if (Math.abs(x - pathX(z)) < 3.5) continue;
    b.rock(x, z, rng.range(0.4, 1.4));
  }
  // old gravestones & a broken statue along the way
  for (let i = 0; i < 12; i++) {
    const z = rng.range(20, 140);
    const x = pathX(z) + (rng() < 0.5 ? -1 : 1) * rng.range(4.5, 7);
    b.gravestone(x, z, rng.range(0, 6), rng() < 0.4 ? 1 : 0);
  }
  b.statue(pathX(80) + 5, 83, -1.2, true, 0.9);

  // hanging lanterns along the path (few, flickering)
  for (const z of [12, 34, 58, 96, 132]) {
    const x = pathX(z) + 3.4;
    b.streetLamp(x, z, { lit: true, broken: z === 58 });
  }

  // ── content
  addNote(b, pathX(20) + 2.6, null, 20, 'forest_warning', {});
  // the dead hunter with the third clue, near the shrine clearing
  const hx = pathX(80) - 3.5;
  b.box(1.8, 0.35, 0.6, Mat.cloth(0x2a2228), { pos: [hx, heightFn(hx, 77) + 0.18, 77], rot: [0, 0.4, 0] });
  addNote(b, hx + 0.7, null, 77.8, 'clue_journal', { marker: 'clue' });
  addShrine(b, pathX(80) + 3, 81, 'forest_shrine');
  area.spawns.forest_shrine = { x: pathX(80) + 1, z: 79, yaw: 0 };
  // hidden grove
  addChest(b, -31, 61, 0.6, { relic: 'moonstone_locket', items: { blood_vial: 1 } }, 'chest_grove');
  addNote(b, -28.5, null, 58.5, 'record_hollow', { lectern: true, rotY: 0.6 });
  b.candles(-29.5, heightFn(-29.5, 62.5), 62.5, 8, 0.5, 1.6);
  b.runeCircle(-30, 60, 3, '#b080ff', 0.35, 0.05);
  // cursed altars
  area.destructibles = [new CursedAltar(b, 24, 70, 'altar_forest_1'), new CursedAltar(b, -22, 128, 'altar_forest_2')];
  area.points.altar_forest_1 = new THREE.Vector3(24, 0, 70);
  area.points.altar_forest_2 = new THREE.Vector3(-22, 0, 128);

  // ── the sealed stair to the Blood Altar
  const ex = pathX(152);
  b.archway(ex, 156, 5, 7, 0, Mat.stoneDark(), 1.4);
  for (const s of [-1, 1]) b.pillar(ex + s * 5.5, 154, 5, 0.45, Mat.stoneDark(), { broken: 0.6 });
  b.runeCircle(ex, 152, 3.2, '#ff2a3a', 0.6, 0.12);
  addGateMarker(b, ex, 157.5, 0xff3050);
  area.addGate({
    id: 'gate_altar',
    to: 'altar',
    spawn: 'fromForest',
    position: new THREE.Vector3(ex, 1, 154.5),
    label: 'Climb the stair to the Blood Altar',
    marker: 'altar_gate',
    requires: (g) => {
      const n = g.quests.count('clue');
      return n >= 3 ? null : `A seal of blood bars the stair. It answers only to one who knows the truth. (Clues found: ${n}/3)`;
    },
  });
  area.addTrigger({ x: ex, z: 148, radius: 7, once: true, onEnter: (g) => {
    g.quests.notify('reach_altar');
    g.dialogue.monologue(LINES[g.player.charId].altar);
  } });
  area.points.altar_gate = new THREE.Vector3(ex, 0, 154);
  b.archway(pathX(-2), -3, 4.6, 6, 0, Mat.stoneDark(), 1.0);
  area.addGate({ id: 'gate_village_back', to: 'village', spawn: 'fromForest', position: new THREE.Vector3(pathX(-1), 1, -1.5), label: 'Return to the Ashen Village' });

  area.spawns.fromVillage = { x: pathX(2), z: 2, yaw: 0 };
  area.spawns.fromAltar = { x: pathX(146), z: 146, yaw: Math.PI };

  // ── enemies: ambush clearings and stalkers in the trees
  const E = (type, x, z, extra = {}) => area.enemySpawns.push({ type, x, z, ...extra });
  E('stalker', pathX(26) + 7, 26);
  E('crawler', pathX(40) - 3, 41, { group: 'ambush1', dormant: true });
  E('crawler', pathX(40) + 3, 43, { group: 'ambush1', dormant: true });
  E('crawler', pathX(40), 46, { group: 'ambush1', dormant: true });
  E('stalker', pathX(40) + 6, 38, { group: 'ambush1', dormant: true });
  E('mage', 24, 75);
  E('crawler', 22, 67);
  E('crawler', 26, 67.5);
  E('stalker', pathX(100) - 6, 100);
  E('knight', pathX(118) - 3, 120, { group: 'ambush2', dormant: true });
  E('knight', pathX(118) + 3, 116, { group: 'ambush2', dormant: true });
  E('mage', pathX(118), 126, { group: 'ambush2', dormant: true });
  E('crawler', -20, 124);
  E('crawler', -23, 125);
  E('stalker', pathX(138) + 6, 138);
  area.addTrigger({ x: pathX(36), z: 36, radius: 6, onEnter: (g) => {
    g.audio.play('stinger', { volume: 0.7 });
    g.ui.subtitle('(something was waiting in the clearing)');
    g.spawnGroup('ambush1', { alerted: true, effect: true });
  } });
  area.addTrigger({ x: pathX(112), z: 112, radius: 6, onEnter: (g) => {
    g.audio.play('stinger', { volume: 0.6 });
    g.spawnGroup('ambush2', { alerted: true, effect: true });
  } });

  area.onEnter = (g, spawn) => {
    if (spawn === 'fromVillage' && !g.flags.forest_intro) {
      g.flags.forest_intro = true;
      g.timers.after(1.5, () => g.dialogue.monologue(LINES[g.player.charId].forest));
    }
  };

  area.fogFields.push(new FogField({ count: 120, area: { minX: -40, maxX: 40, minZ: 0, maxZ: 158 }, y: 0.7, size: 14, color: 0x6a6070, opacity: 0.2, heightFn }));
  area.motes = new MoteField({ count: 200, radius: 16, height: 8, color: 0x9ab0ff, size: 0.05, rise: 0.1 });
  return area;
}
