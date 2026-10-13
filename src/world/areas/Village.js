// AREA 2 — The Ashen Village. Abandoned houses, broken lamps, clues, survivors in hiding,
// a secret walled garden, the road to Castle Nocturne and the north gate to the forest.
import * as THREE from 'three';
import { Area, FogField, MoteField, Sky } from '../Area.js';
import { AreaBuilder } from '../Props.js';
import { Mat } from '../Materials.js';
import { addShrine, addNote, addChest, addSurvivor, addSecretWall, addGateMarker, CursedAltar } from '../Interactables.js';
import { LINES } from '../../game/Story.js';
import { seeded } from '../../core/utils.js';

export function buildVillage(game) {
  const area = new Area('village', {
    name: 'The Ashen Village',
    subtitle: 'Where no bells ring',
    seed: 22,
    env: {
      fogColor: 0x120a12,
      fogDensity: 0.026,
      background: 0x0a0509,
      ambient: 0x2a2030,
      ambientIntensity: 0.5,
      hemiSky: 0x6a4a6a,
      hemiGround: 0x1a0a0c,
      hemiIntensity: 0.5,
      moonLight: { color: 0xff5a6a, intensity: 0.9, dir: [0.4, 0.8, 0.6] },
      rimColor: 0xd04a5a,
      music: 'explore',
      ambience: 'village',
      surface: 'stone',
    },
    horror: { enabled: true, minGap: 20, maxGap: 40, events: ['whisper', 'steps', 'crow', 'flicker', 'watcher', 'heartbeat'] },
  });
  const b = new AreaBuilder(area);
  const rng = seeded(222);
  const col = area.collision;
  col.bounds = { minX: -28, maxX: 30, minZ: -4, maxZ: 101 };
  area.sky = new Sky({ top: 0x05030a, horizon: 0x3a0c18, moonColor: 0xff3030, moonDir: new THREE.Vector3(0.5, 0.35, 1), moonSize: 70 });

  // ground: ash and a cobbled street
  b.floor(-40, 40, -10, 110, Mat.ashGround(), 0, 5);
  b.floor(-4.2, 4.2, -4, 100, Mat.cobble(), 0.02, 3);
  b.floor(-12, 12, 42, 58, Mat.cobble(), 0.025, 3);
  b.floor(4.2, 30, 47.5, 52.5, Mat.cobble(), 0.022, 3);

  // houses: west row faces east (+x), east row faces west (-x)
  const west = [10, 22, 34, 62, 74, 86];
  const east = [10, 22, 34, 62, 74, 86];
  west.forEach((z, i) => {
    const w = rng.range(6, 7.5), d = rng.range(5.5, 6.5), h = rng.range(3.2, 4.2);
    b.house(-8 - d / 2, z, w, d, h, Math.PI / 2, { lit: i === 4, doorX: 0 });
  });
  east.forEach((z, i) => {
    const w = rng.range(6, 7.5), d = rng.range(5.5, 6.5), h = rng.range(3.2, 4.2);
    b.house(8 + d / 2, z, w, d, h, -Math.PI / 2, { lit: i === 1 });
  });
  // outer boundary: broken walls, fences and dead trees
  b.wall(-28, -4, -28, 101, 3, 0.8, Mat.stoneDark());
  b.wall(30, -4, 30, 47, 3, 0.8, Mat.stoneDark());
  b.wall(30, 53, 30, 101, 3, 0.8, Mat.stoneDark());
  b.wall(-28, 101, -3, 101, 3, 0.8, Mat.stoneDark());
  b.wall(3, 101, 30, 101, 3, 0.8, Mat.stoneDark());
  b.wall(-28, -4, -3.5, -4, 3, 0.8, Mat.stoneDark());
  b.wall(3.5, -4, 30, -4, 3, 0.8, Mat.stoneDark());
  for (let i = 0; i < 26; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const x = side < 0 ? rng.range(-27, -16) : rng.range(16, 29);
    const z = rng.range(0, 98);
    if (z > 62 && z < 74 && side > 0) continue; // keep the secret garden clear
    if (z > 26 && z < 32 && side < 0) continue; // hunter yard path
    b.deadTree(x, z, i, rng.range(0.8, 1.2));
  }
  b.fence(-15, 0, -15, 40, 0.3);
  b.fence(15, 0, 15, 44, 0.3);

  // street furniture
  for (let z = 4; z < 98; z += 12) {
    for (const x of [-4.8, 4.8]) {
      const r = rng();
      b.streetLamp(x, z + (x > 0 ? 6 : 0), { lit: r > 0.45, broken: r < 0.3 });
    }
  }
  b.well(0, 50);
  b.cart(7, 55, 0.4);
  for (const [x, z] of [[-6, 44], [-5.2, 43.2], [6.5, 44.5], [-9, 57], [9.5, 38], [-6, 70], [6, 81]]) b.barrel(x, z, rng.range(0.9, 1.1));
  for (const [x, z] of [[-8.5, 56], [-7.6, 56.2], [8.8, 28], [-6.4, 91]]) b.crate(x, z, rng.range(0.7, 0.9), rng.range(0, 1));
  b.crate(-8.1, 56.1, 0.7, 0.3, 0.8);

  // notice board with the royal decree
  b.box(0.15, 2.4, 0.15, Mat.woodDark(), { pos: [4.2, 1.2, 45.2] });
  b.box(0.15, 2.4, 0.15, Mat.woodDark(), { pos: [6.0, 1.2, 45.2] });
  b.box(2.2, 1.3, 0.1, Mat.wood(), { pos: [5.1, 1.8, 45.2] });
  addNote(b, 5.1, 1.9, 45.32, 'clue_decree', { height: 0 });
  area.interactables[area.interactables.length - 1].position.set(5.1, 1.8, 46);

  // ── secret walled garden (between the east houses at z 62 and 74)
  addSecretWall(b, 8.4, 68, 5.6, 3.6, Math.PI / 2, 'secret_garden', { prompt: 'Push the loose, moss-covered stones' });
  b.wall(14, 65, 22, 65, 3.4, 0.6, Mat.stoneDark());
  b.wall(14, 71, 22, 71, 3.4, 0.6, Mat.stoneDark());
  b.wall(22, 65, 22, 71, 3.4, 0.6, Mat.stoneDark());
  b.floor(9, 22, 65, 71, Mat.dirt(), 0.03, 2);
  b.statue(19.5, 69.5, -Math.PI / 2, true, 0.7);
  b.candles(13, 0, 66, 7, 0.4);
  area.addFlickerLight(15, 1.2, 68, 0xff7a40, 1.8, 8, 0.3);
  addChest(b, 19.5, 66.5, -Math.PI / 2, { relic: 'silver_rosary', items: { blood_vial: 1 } }, 'chest_garden');
  addNote(b, 16, null, 69.5, 'record_heartblood', { lectern: true, rotY: Math.PI / 2 });

  // ── hunters' yard (west, behind the houses)
  b.fence(-26, 20, -16, 20, 0.2);
  b.fence(-26, 40, -16, 40, 0.2);
  b.box(2.2, 0.08, 1.2, Mat.wood(), { pos: [-20, 0.9, 30] });
  for (const [x, z] of [[-21, 29.6], [-19, 30.4]]) b.box(0.1, 0.9, 0.1, Mat.woodDark(), { pos: [x, 0.45, z] });
  area.collision.addBox(-20, 30, 1.1, 0.6, 0, -10, 1);
  addNote(b, -20, 0.95, 30, 'clue_ledger', { height: 0 });
  b.candles(-20.7, 0.94, 29.8, 3, 0.2, 1.4);
  for (let i = 0; i < 3; i++) b.crate(-25 + i * 1.1, 34, 0.8);

  // ── graveyard (north-east) with a cursed altar
  for (let i = 0; i < 18; i++) b.gravestone(rng.range(17, 28), rng.range(79, 98), rng.range(-0.3, 0.3) + Math.PI / 2, rng() < 0.3 ? 1 : 0);
  b.fence(16, 78, 29, 78, 0.35);
  area.destructibles = [new CursedAltar(b, 22.5, 89, 'altar_village')];
  area.points.altar_village = new THREE.Vector3(22.5, 0, 89);

  // child's drawing near a doorway
  addNote(b, -6.6, null, 12.5, 'child_drawing', {});

  // ── survivors
  addSurvivor(b, -7.0, 53.5, Math.PI / 2 + 0.4, 'elda', 'survivor_elda', (g) => {
    const lines = [
      { speaker: 'Elda', text: 'Stay back! I— oh. Your eyes. You\'re one of them… but you\'re not hungry. Are you?' },
      {
        speaker: 'Elda',
        text: 'They came on the third night. Walked right through the doors. Took my grandson\'s friends. Please… do you have anything for the pain?',
        choices: [
          {
            text: g.inventory.has('blood_vial') ? 'Give her one of your Blood Vials.' : 'Give her one of your Blood Vials. (you have none)',
            disabled: !g.inventory.has('blood_vial'),
            action: () => {
              g.inventory.consume('blood_vial');
              g.flags.elda_kind = true;
              g.player.gainXp(40);
            },
            next: { speaker: 'Elda', text: 'Bless you, child of the night. Take this — the key to the Marrow house. Little Tomas locked himself inside. He won\'t open for anyone. Maybe for you.' },
          },
          { text: '"Where did they take them?"', next: { speaker: 'Elda', text: 'North. Always north, into the forest. Here — the Marrow house key. Little Tomas is hiding in there. Get him out.' } },
        ],
      },
    ];
    return lines.concat([{ speaker: 'Elda', text: 'Brother Aldric is still out in the hunters\' yard, west behind the houses. Find him, too.', onShow: () => g.inventory.add('rusted_key', 1) }]);
  });
  // Tomas hides inside the locked Marrow house (west, z=74); appears when the door is unlocked
  const tomas = addSurvivor(b, -7.2, 74, Math.PI / 2, 'tomas', 'survivor_tomas', (g) => [
    { speaker: 'Tomas', text: 'You… you opened the door. Grandma Elda sent you? Okay. Okay.' },
    { speaker: 'Tomas', text: 'The nice lady with the black veil said she would take everyone somewhere safe. But they were screaming. Why were they screaming if it was safe?' },
    { speaker: 'Tomas', text: 'She went up the forest path. To the place where the moon is closest. I\'m going to the cathedral now. Grandma said it\'s safe there.' },
  ]);
  tomas.enabled = false;
  area.addInteractable({
    id: 'marrow_door',
    position: new THREE.Vector3(-6.2, 1, 74),
    radius: 2.3,
    prompt: 'Try the door of the Marrow house',
    marker: 'survivor',
    isDone: (g) => g.flags.marrow_open,
    setup: (g) => {
      if (g.flags.marrow_open) tomas.enabled = !g.flags.survivor_tomas;
    },
    onInteract: (g, it) => {
      if (g.flags.marrow_open) return;
      if (!g.inventory.has('rusted_key')) {
        g.audio.play('lock');
        g.ui.toast('Locked. You hear a child holding his breath on the other side.', 'warn');
        return;
      }
      g.inventory.consume('rusted_key');
      g.flags.marrow_open = true;
      g.audio.play('door');
      tomas.enabled = true;
      it.enabled = false;
      g.ui.toast('The lock gives way with a scream of rust.', 'info');
    },
  });
  addSurvivor(b, -21.5, 27.4, 0.2, 'aldric', 'survivor_aldric', (g) => [
    { speaker: 'Brother Aldric', text: 'Hold. I know what you are. I hunted your kind for thirty years.' },
    { speaker: 'Brother Aldric', text: g.player.charId === 'kairo' ? 'Kairo? Draeven? By the Dawn… they said you died on the second night. And your eyes… Oh, boy. What did they do to you?' : 'But you came to save us, and the hollow ones came to eat us. I suppose that makes you the better monster.' },
    { speaker: 'Brother Aldric', text: 'My ledger is on the table there. Read it. And take these — the Order\'s last Blood Vials. Our blood, for your kind. Do not waste them.', onShow: () => g.inventory.add('blood_vial', 2) },
    { speaker: 'Brother Aldric', text: 'East of the square, the old road leads to Castle Nocturne. A thousand of your kind still dance there. Some may even help you. The rest… will want what is in your veins.' },
  ]);

  // ── shrine, gates, enemies
  addShrine(b, -5.5, 47, 'village_shrine');
  area.spawns.village_shrine = { x: -3.5, z: 47, yaw: 0 };
  area.spawns.fromCathedral = { x: 0, z: 1.5, yaw: 0 };
  area.spawns.fromForest = { x: 0, z: 96.5, yaw: Math.PI };
  area.spawns.fromCastle = { x: 26.5, z: 50, yaw: -Math.PI / 2 };

  b.archway(0, -4, 4.4, 5.5, 0, Mat.stoneDark(), 1.0);
  area.addGate({ id: 'gate_cathedral', to: 'cathedral', spawn: 'fromVillage', position: new THREE.Vector3(0, 1, -2.4), label: 'Return to the Forgotten Cathedral' });
  const northGate = b.ironGate(0, 101, 5, 4.5, 0);
  area.addGate({
    id: 'gate_forest',
    to: 'forest',
    spawn: 'fromVillage',
    position: new THREE.Vector3(0, 1, 99),
    label: 'Enter the Whispering Forest',
    marker: 'forest_gate',
    requires: (g) => (g.quests.completed.includes('main_survivors') ? null : 'The north gate is chained shut. The survivors may know another way — find them first.'),
  });
  addGateMarker(b, 0, 103, 0xff3050);
  b.archway(30, 50, 4.4, 5.5, Math.PI / 2, Mat.stoneDark(), 1.0);
  area.addGate({ id: 'gate_castle', to: 'castle', spawn: 'fromVillage', position: new THREE.Vector3(28.4, 1, 50), label: 'The Castle Road — Castle Nocturne (Court of a Thousand Vampires)', marker: 'castle' });
  addGateMarker(b, 31.5, 50, 0xb040ff);
  // the castle looms on the eastern horizon
  b.gothicCastle(190, 60, 1.6, { rotY: -Math.PI / 2, light: false });

  area.points.forest_gate = new THREE.Vector3(0, 0, 99);
  area.points.castle = new THREE.Vector3(28.4, 0, 50);
  area.markerFallback = { main_forest: 'forest_gate', main_countess: 'forest_gate' };

  const E = (type, x, z, extra = {}) => area.enemySpawns.push({ type, x, z, ...extra });
  E('crawler', -12, 27); E('crawler', -12.5, 28.5); E('crawler', -11, 26);
  E('crawler', 12, 79); E('crawler', 11.2, 80.5); E('crawler', 12.8, 81);
  E('stalker', -13, 16);
  E('stalker', 13, 40);
  E('stalker', -12, 80);
  E('mage', 2, 60);
  E('mage', 24, 94);
  E('knight', 0, 92);
  E('crawler', 20, 85); E('crawler', 24, 82);

  area.onEnter = (g, spawn) => {
    if (g.quests.completed.includes('main_survivors')) northGate.setOpenInstant();
    if (spawn === 'fromCathedral' && !g.flags.village_intro) {
      g.flags.village_intro = true;
      g.timers.after(1.2, () => g.dialogue.monologue(LINES[g.player.charId].village));
    }
  };
  area.onQuestComplete = (g, id) => {
    if (id === 'main_survivors') {
      northGate.open();
      g.audio.play('door', { pitch: 0.7 });
      g.ui.toast('Far away, chains fall from the north gate. The forest is open.', 'good');
    }
  };

  area.fogFields.push(new FogField({ count: 70, area: { minX: -26, maxX: 28, minZ: 0, maxZ: 100 }, y: 0.5, size: 12, color: 0x7a5a6a, opacity: 0.17 }));
  area.motes = new MoteField({ count: 260, radius: 18, height: 10, color: 0xb0a0a0, size: 0.07, rise: -0.25 });
  return area;
}
