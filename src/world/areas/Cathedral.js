// AREA 1 — The Forgotten Cathedral. The player awakens before the altar. Reading the note on the
// altar seals the doors with blood and wakes the things in the nave.
import * as THREE from 'three';
import { Area, FogField, MoteField } from '../Area.js';
import { AreaBuilder } from '../Props.js';
import { Mat, Tex } from '../Materials.js';
import { addShrine, addNote, addRelicPickup, addSecretWall, addGateMarker, addChest } from '../Interactables.js';
import { LINES } from '../../game/Story.js';
import { seeded } from '../../core/utils.js';

export function buildCathedral(game) {
  const area = new Area('cathedral', {
    name: 'The Forgotten Cathedral',
    subtitle: 'Saint Veyra\'s, abandoned for seven nights',
    seed: 11,
    heightFn: (x, z) => (Math.abs(x) < 6 && z > 17.5 && z < 24.5 ? 0.4 : 0),
    env: {
      fogColor: 0x0d0810,
      fogDensity: 0.032,
      background: 0x050307,
      ambient: 0x2a1e30,
      ambientIntensity: 0.55,
      hemiSky: 0x4a3a60,
      hemiGround: 0x1a080e,
      hemiIntensity: 0.45,
      rimColor: 0xc04a60,
      music: 'cathedral',
      ambience: 'cathedral',
      surface: 'stone',
      interior: true,
      ceiling: 13.5,
    },
    horror: { enabled: true, minGap: 22, maxGap: 45, events: ['whisper', 'steps', 'bell', 'flicker', 'watcher', 'heartbeat'] },
  });
  const b = new AreaBuilder(area);
  const rng = seeded(77);
  const col = area.collision;
  col.bounds = { minX: -23, maxX: 15, minZ: -31, maxZ: 26 };
  col.ceiling = 13.5;

  // ── shell
  b.floor(-15, 15, -30, 26, Mat.floor(), 0, 4);
  b.floor(-23.5, -15, 8, 16, Mat.stoneDark(), 0.0, 3);
  const ceil = new THREE.PlaneGeometry(30, 56);
  ceil.rotateX(Math.PI / 2);
  b.mesh(ceil, Mat.stoneDark(), { pos: [0, 14, -2], shadow: false });
  // walls (west wall split around the secret passage)
  b.wall(-15, -30, -15, 10, 14, 1);
  b.wall(-15, 14, -15, 26, 14, 1);
  b.wall(-15, 10, -15, 14, 8, 1, Mat.stone(), { y: 6, collide: false });
  b.wall(15, -30, 15, 26, 14, 1);
  b.wall(-15, 26, 15, 26, 14, 1);
  b.wall(-15, -30, -2.6, -30, 14, 1);
  b.wall(2.6, -30, 15, -30, 14, 1);
  b.wall(-2.6, -30, 2.6, -30, 5, 1, Mat.stone(), { y: 9, collide: false });
  // vaulted ribs across the ceiling
  for (let z = -24; z <= 20; z += 8) {
    const rib = new THREE.TorusGeometry(9, 0.25, 6, 24, Math.PI);
    b.mesh(rib, Mat.stoneWarm(), { pos: [0, 5.2, z], rot: [0, 0, 0], scale: [1, 0.9, 1] });
  }
  // pillars
  for (const x of [-9, 9]) for (let z = -24; z <= 16; z += 8) b.pillar(x, z, 13, 0.5);
  // stained glass along both sides + light shafts
  for (let z = -22; z <= 18; z += 10) {
    b.stainedWindow(-14.45, 4.5, z, 2.6, 7, 'x', z % 20 === 0 ? 'violet' : 'crimson', { color: 0xff4060, opacity: 0.08, length: 13 });
    b.stainedWindow(14.45, 4.5, z, 2.6, 7, '-x', z % 20 === 0 ? 'crimson' : 'violet', { color: 0x8060ff, opacity: 0.07, length: 13 });
  }
  b.roseWindow(0, 9.5, 25.45, 3.6, Math.PI);

  // ── apse: altar, candles, statues
  b.box(12, 0.4, 7, Mat.stoneWarm(), { pos: [0, 0.2, 21] });
  b.altar(0, 21);
  b.candelabra(-3.2, 20, 2.0, 2.4);
  b.candelabra(3.2, 20, 2.0, 2.4);
  b.candles(-1.2, 1.63, 21.3, 6, 0.3);
  b.candles(1.3, 1.63, 21.2, 5, 0.3);
  b.candles(-5, 0.4, 23, 9, 0.6);
  b.candles(5, 0.4, 23, 9, 0.6);
  b.statue(-6.5, 23.5, Math.PI, true);
  b.statue(6.5, 23.5, Math.PI, false);
  // hanging banners
  for (const x of [-11, 11]) b.box(1.4, 5, 0.05, Mat.cloth(0x4a0812), { pos: [x, 8, 25.4], shadow: false });

  // ── nave: ruined pews, candles, rubble under the broken roof
  for (const side of [-1, 1]) {
    for (let z = -22; z <= 8; z += 2.6) {
      const r = rng();
      if (r < 0.12) continue;
      const broken = r > 0.82;
      const rot = broken ? rng.range(-0.6, 0.6) : rng.range(-0.06, 0.06);
      b.pew(side * 4.3 + (broken ? rng.range(-0.8, 0.8) : 0), z, Math.PI + rot, broken);
    }
  }
  for (let z = -20; z <= 14; z += 8) {
    b.candles(-7.5, 0, z + 1.5, 7, 0.5);
    b.candles(7.5, 0, z - 1.5, 6, 0.5);
  }
  area.addFlickerLight(-7.5, 1.0, -4.5, 0xff8a40, 1.8, 8, 0.3);
  area.addFlickerLight(7.5, 1.0, 9.5, 0xff8a40, 1.8, 8, 0.3);
  area.addFlickerLight(-7.5, 1.0, -20, 0xff8a40, 1.6, 8, 0.4);
  // broken ceiling: crimson moonlight pours in
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.5, 14, 24, 1, true), Mat.additive(0xff3048, 0.06, Tex.shaft()));
  shaft.position.set(2, 7, -4);
  shaft.rotation.z = 0.1;
  shaft.userData.static = false;
  shaft.renderOrder = 4;
  area.group.add(shaft);
  const moonSpot = new THREE.SpotLight(0xff3a4a, 60, 22, 0.45, 0.6, 1.4);
  moonSpot.position.set(2.5, 14, -4);
  moonSpot.target.position.set(1.5, 0, -4);
  area.group.add(moonSpot, moonSpot.target);
  for (let i = 0; i < 9; i++) b.rock(2 + rng.range(-2.5, 2.5), -4 + rng.range(-2.5, 2.5), rng.range(0.25, 0.7), i < 3);
  // fallen statue + scattered debris
  b.statue(-12, -14, 1.2, true, 0.9);
  b.statue(12, 2, -1.4, true, 0.9);
  b.coffin(-12.2, 18, 0.2, true);

  // ── the hidden crypt behind the west wall
  b.wall(-23.5, 8, -15.5, 8, 6, 0.8);
  b.wall(-23.5, 16, -15.5, 16, 6, 0.8);
  b.wall(-23.5, 8, -23.5, 16, 6, 0.8);
  b.box(8.5, 0.3, 8.5, Mat.stoneDark(), { pos: [-19.5, 6.1, 12], shadow: false });
  b.coffin(-21.5, 10.5, Math.PI / 2, false);
  b.coffin(-21.5, 13.8, Math.PI / 2, true);
  b.candles(-17, 0, 9.2, 6, 0.4);
  b.candles(-22.4, 0, 15, 6, 0.4);
  area.addFlickerLight(-19, 1.5, 12, 0xff4040, 2.0, 9, 0.3);
  addSecretWall(b, -15, 12, 4, 6, Math.PI / 2, 'secret_crypt', { prompt: 'Press on the hollow-sounding stones' });
  b.box(0.8, 1.0, 0.8, Mat.stoneWarm(), { pos: [-19.5, 0.5, 12] });
  col.addCircle(-19.5, 12, 0.5, -10, 1);
  addRelicPickup(b, -19.5, 1.6, 12, 'fang_first_night');
  addNote(b, -17.2, null, 14.8, 'record_treaty', { lectern: true, rotY: Math.PI / 2 });

  // ── notes & shrine
  const testament = addNote(b, 0, 1.64, 20.6, 'testament', {
    marker: 'testament',
    onRead: (g) => {
      g.quests.notify('read_testament');
      g.dialogue.monologue(LINES[g.player.charId].note);
      g.timers.after(2.2, () => startAmbush(g));
    },
  });
  testament.prompt = 'Examine the note on the altar';
  addNote(b, 12, null, 12, 'sermon', { lectern: true, rotY: -Math.PI / 2 });
  addShrine(b, 6.5, 16.5, 'cathedral_shrine');
  addChest(b, 13, -27.5, Math.PI, { items: { blood_vial: 1 }, xp: 20 }, 'chest_cath_1');

  // ── doors (sealed by a blood sigil until the ambush is survived)
  const doors = b.greatDoor(0, -30, 5, 8, 0);
  const sigilMat = new THREE.MeshBasicMaterial({ map: Tex.rune('#ff1a2a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(2, 2, 2) });
  const sigil = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), sigilMat);
  sigil.position.set(0, 3.3, -29.6);
  area.group.add(sigil);
  area.updaters.push((dt, t) => {
    sigil.rotation.z = t * 0.2;
    sigilMat.opacity = 0.6 + Math.sin(t * 3) * 0.3;
  });
  area.points.ambush = new THREE.Vector3(0, 0, -4);
  area.points.exit = new THREE.Vector3(0, 0, -28);
  area.spawns.start = { x: 0, z: 17.2, yaw: Math.PI };
  area.spawns.fromVillage = { x: 0, z: -26, yaw: 0 };
  area.spawns.cathedral_shrine = { x: 6.5, z: 14.4, yaw: Math.PI };

  const exitGate = area.addGate({
    id: 'gate_village',
    to: 'village',
    spawn: 'fromCathedral',
    position: new THREE.Vector3(0, 1, -28.6),
    label: 'Leave the cathedral — The Ashen Village',
    marker: 'exit',
    requires: (g) => (g.flags.ambush_cleared ? null : 'The doors are sealed by a pulsing blood sigil.'),
  });
  addGateMarker(b, 0, -31.5, 0xff3050);

  // ambush: crawlers burst out of the floor, a Hollow Knight guards the doors
  for (const [x, z] of [[-3, -2], [3, -6], [-1, -10], [4, 0], [-4, -7]]) area.enemySpawns.push({ type: 'crawler', x, z, group: 'ambush', dormant: true });
  area.enemySpawns.push({ type: 'knight', x: 0, z: -22, group: 'ambush', dormant: true });

  function startAmbush(g) {
    if (g.flags.ambush_started && g.enemies.some((e) => e.group === 'ambush' && e.alive)) return;
    g.flags.ambush_started = true;
    g.audio.play('stinger', { volume: 0.8 });
    g.cameraRig.shake(0.4);
    g.ui.toast('The cathedral doors slam shut. Something crawls up through the floor!', 'boss');
    g.dialogue.monologue(LINES[g.player.charId].ambush);
    g.spawnGroup('ambush', { alerted: true, effect: true });
    g.tutorial?.show('combat');
  }

  area.onGroupCleared = (g, group) => {
    if (group !== 'ambush' || g.flags.ambush_cleared) return;
    g.flags.ambush_cleared = true;
    g.quests.notify('ambush_cleared');
    doors.open();
    sigil.visible = false;
    g.audio.play('door');
    g.ui.toast('The blood sigil shatters. The doors grind open.', 'good');
    g.saveSoon();
  };

  area.onEnter = (g, spawnId) => {
    if (g.flags.ambush_cleared) {
      doors.setOpenInstant();
      sigil.visible = false;
    } else if (g.flags.ambush_started) {
      // died mid-ambush: the creatures are waiting
      g.spawnGroup('ambush', { alerted: false });
    }
    if (!g.flags.awakened) {
      g.flags.awakened = true;
      g.playAwakening();
    }
  };
  area.onTravel = (g, to) => {
    if (to === 'village') g.quests.notify('cathedral_exit');
  };

  area.fogFields.push(new FogField({ count: 26, area: { minX: -14, maxX: 14, minZ: -28, maxZ: 24 }, y: 0.4, size: 8, color: 0x6a5870, opacity: 0.16 }));
  area.motes = new MoteField({ count: 220, radius: 14, height: 9, color: 0xe0c0c8, size: 0.05, rise: 0.05 });
  return area;
}
