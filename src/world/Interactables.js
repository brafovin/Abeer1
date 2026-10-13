// Reusable interactive objects: Moonlit Shrines, notes & clues, chests, relics, survivors,
// cursed altars (destructible), secret walls and travel gates.
import * as THREE from 'three';
import { Mat, Tex } from './Materials.js';
import { createVillagerModel } from '../entities/models/CharacterModels.js';
import { NOTES } from '../game/Story.js';
import { rand, TAU } from '../core/utils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Checkpoint: heals, refills a vial, saves the game. */
export function addShrine(b, x, z, spawnId) {
  const area = b.area;
  const y = b.y(x, z);
  b.box(1.2, 0.3, 1.2, Mat.stoneWarm(), { pos: [x, y + 0.15, z] });
  b.mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.0, 8), Mat.stoneWarm(), { pos: [x, y + 0.8, z] });
  b.mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.18, 8), Mat.stoneWarm(), { pos: [x, y + 1.38, z] });
  const crystal = new THREE.Group();
  crystal.position.set(x, y + 2.1, z);
  const moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fc8ff).multiplyScalar(2.2), toneMapped: false });
  const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 24, Math.PI * 1.3), moonMat);
  crescent.rotation.z = -0.4;
  crystal.add(crescent);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.soft(), color: new THREE.Color(0x6fa8ff).multiplyScalar(1.5), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  halo.scale.setScalar(2.2);
  crystal.add(halo);
  area.group.add(crystal);
  b.runeCircle(x, z, 1.8, '#7fb8ff', 0.6, 0.15);
  const light = area.addFlickerLight(x, y + 2.2, z, 0x7fb0ff, 2.2, 10, 0.05);
  area.updaters.push((dt, t) => {
    crystal.rotation.y = t * 0.8;
    crystal.position.y = y + 2.1 + Math.sin(t * 1.5) * 0.08;
  });
  b.col.addCircle(x, z, 0.6, -10, y + 1.5);
  area.spawns[spawnId] = area.spawns[spawnId] ?? { x: x, z: z + 2.2, yaw: Math.PI };
  return area.addInteractable({
    id: 'shrine_' + spawnId,
    isShrine: true,
    position: V(x, y + 1, z),
    radius: 2.8,
    prompt: 'Rest at the Moonlit Shrine',
    subtitle: 'Restore health, refill a Blood Vial and save',
    onInteract: (game) => game.restAtShrine(spawnId, light),
  });
}

/** Parchment on a lectern / table / the ground with a guiding mote. */
export function addNote(b, x, y, z, noteId, o = {}) {
  const area = b.area;
  const gy = y ?? b.y(x, z);
  if (o.lectern) {
    b.box(0.5, 1.0, 0.4, Mat.woodDark(), { pos: [x, gy + 0.5, z], rot: [0, o.rotY ?? 0, 0] });
    b.box(0.7, 0.06, 0.5, Mat.woodDark(), { pos: [x, gy + 1.05, z], rot: [-0.35, o.rotY ?? 0, 0] });
    b.col.addCircle(x, z, 0.4, -10, gy + 1.1);
  }
  const py = o.lectern ? gy + 1.1 : gy + (o.height ?? 0.03);
  const paper = b.mesh(new THREE.PlaneGeometry(0.32, 0.42), Mat.basic(0xd8ccb0), { pos: [x, py, z], rot: [-Math.PI / 2 + (o.lectern ? 0.35 : 0), 0, rand(-0.4, 0.4)], shadow: false, static: false });
  const kind = NOTES[noteId]?.kind ?? 'note';
  const moteColor = kind === 'clue' ? 0xffb050 : kind === 'record' ? 0xb080ff : 0xffe0c0;
  const mote = b.glowMote(x, py + 0.6, z, moteColor, 0.55);
  const flag = 'read_' + noteId;
  return area.addInteractable({
    id: 'note_' + noteId,
    position: V(x, py, z),
    radius: 2.2,
    marker: o.marker ?? (kind === 'clue' ? 'clue' : kind === 'record' ? 'record' : null),
    prompt: kind === 'clue' ? 'Examine the clue' : kind === 'record' ? 'Read the lost record' : 'Read',
    enabled: true,
    isDone: (game) => game.flags[flag],
    setup: (game) => {
      if (game.flags[flag]) mote.visible = false;
    },
    onInteract: (game, it) => {
      game.readNote(noteId, () => {
        const first = !game.flags[flag];
        game.flags[flag] = true;
        mote.visible = false;
        if (first) {
          if (kind === 'clue') game.quests.notify('clue');
          if (kind === 'record') {
            game.inventory.addRecord(noteId);
            game.quests.notify('record');
          }
          game.player.gainXp(kind === 'note' ? 10 : 30);
          o.onRead?.(game);
        }
      });
    },
  });
}

export function addChest(b, x, z, rotY, loot, flag) {
  const area = b.area;
  const y = b.y(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  area.group.add(g);
  b.box(1.0, 0.55, 0.6, Mat.wood(), { pos: [0, 0.28, 0], parent: g, static: false });
  for (const sx of [-0.4, 0.4]) b.box(0.06, 0.58, 0.64, Mat.iron(), { pos: [sx, 0.28, 0], parent: g, static: false });
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.56, -0.3);
  g.add(lidPivot);
  b.box(1.02, 0.18, 0.62, Mat.wood(), { pos: [0, 0.09, 0.3], parent: lidPivot, static: false });
  const glowS = b.glowMote(x, y + 0.9, z, 0xffc070, 0.7);
  b.col.addBox(x, z, 0.5, 0.32, rotY, -10, y + 0.7);
  let opening = 0;
  area.updaters.push((dt) => {
    if (opening > 0 && opening < 1) {
      opening = Math.min(1, opening + dt * 2);
      lidPivot.rotation.x = -opening * 1.9;
    }
  });
  return area.addInteractable({
    id: 'chest_' + flag,
    position: V(x, y + 0.5, z),
    radius: 2.2,
    marker: loot.relic ? 'relic' : null,
    prompt: 'Open the chest',
    isDone: (game) => game.flags[flag],
    setup: (game) => {
      if (game.flags[flag]) {
        lidPivot.rotation.x = -1.9;
        glowS.visible = false;
      }
    },
    onInteract: (game, it) => {
      if (game.flags[flag]) {
        game.ui.toast('It is empty.', 'info');
        return;
      }
      game.flags[flag] = true;
      opening = 0.01;
      glowS.visible = false;
      game.audio.play('door', { pitch: 1.6, volume: 0.6 });
      game.timers.after(0.4, () => {
        for (const [k, n] of Object.entries(loot.items ?? {})) game.inventory.add(k, n);
        if (loot.relic && game.inventory.addRelic(loot.relic)) game.quests.notify('relic');
        if (loot.xp) game.player.gainXp(loot.xp);
        game.effects.burst(V(x, y + 0.8, z), { count: 30, color: 0xffc070, speed: 3, size: 0.15, life: 0.8, gravity: -1 });
        game.saveSoon();
      });
    },
  });
}

/** Floating relic pickup. */
export function addRelicPickup(b, x, y, z, relicId) {
  const area = b.area;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  area.group.add(g);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3050).multiplyScalar(2.2), toneMapped: false }));
  gem.scale.set(0.8, 1.3, 0.8);
  g.add(gem);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 24), Mat.gold());
  g.add(ring);
  const mote = b.glowMote(x, y, z, 0xff6080, 1.2);
  area.updaters.push((dt, t) => {
    g.rotation.y = t * 1.2;
    ring.rotation.x = t * 0.7;
    g.position.y = y + Math.sin(t * 2) * 0.1;
  });
  const flag = 'relic_' + relicId;
  return area.addInteractable({
    id: flag,
    position: V(x, y, z),
    radius: 2.0,
    marker: 'relic',
    prompt: 'Take the relic',
    isDone: (game) => game.flags[flag],
    setup: (game) => {
      if (game.flags[flag]) g.visible = mote.visible = false;
    },
    onInteract: (game, it) => {
      if (game.flags[flag]) return;
      game.flags[flag] = true;
      g.visible = mote.visible = false;
      if (game.inventory.addRelic(relicId)) game.quests.notify('relic');
      game.effects.burst(V(x, y, z), { count: 40, color: 0xff3050, speed: 3, size: 0.18, life: 0.9, gravity: -1 });
      game.saveSoon();
    },
  });
}

/** A frightened villager hiding somewhere. dialogueFn(game) returns dialogue lines. */
export function addSurvivor(b, x, z, rotY, variant, flag, dialogueFn) {
  const area = b.area;
  const model = createVillagerModel(variant);
  model.root.position.set(x, b.y(x, z), z);
  model.root.rotation.y = rotY;
  area.group.add(model.root);
  let fading = -1;
  area.updaters.push((dt) => {
    model.update(dt, {});
    if (fading >= 0) {
      fading += dt;
      model.root.position.y += dt * 0.2;
      model.root.visible = Math.floor(fading * 10) % 2 === 0;
      if (fading > 1.2) {
        model.root.visible = false;
        fading = -2;
      }
    }
  });
  area.disposables.push(() => model.dispose());
  return area.addInteractable({
    id: 'survivor_' + flag,
    position: V(x, b.y(x, z) + 1, z),
    radius: 2.6,
    marker: 'survivor',
    prompt: 'Speak to the survivor',
    isDone: (game) => game.flags[flag],
    setup: (game) => {
      if (game.flags[flag]) model.root.visible = false;
    },
    onInteract: (game, it) => {
      if (game.flags[flag]) return;
      game.dialogue.start(dialogueFn(game), () => {
        if (game.flags[flag]) return;
        game.flags[flag] = true;
        game.quests.notify('survivor');
        game.player.gainXp(40);
        game.ui.toast('The survivor flees toward the cathedral.', 'info');
        game.effects.burst(model.root.position.clone().setY(model.root.position.y + 1), { count: 20, color: 0xffe0b0, speed: 2, size: 0.2, life: 0.8, gravity: -1 });
        fading = 0;
        game.saveSoon();
      });
    },
  });
}

/** Destructible cursed altar: obelisk + pulsing crystal + rune circle. Must be destroyed in combat. */
export class CursedAltar {
  constructor(b, x, z, flag) {
    this.area = b.area;
    this.flag = flag;
    this.position = V(x, b.y(x, z), z);
    this.radius = 1.0;
    this.height = 2.4;
    this.maxHp = 150;
    this.hp = this.maxHp;
    this.alive = true;
    this.hostile = true;
    this.isDestructible = true;
    this.name = 'Cursed Altar';
    this.bloodColor = 0x6a0010;
    const y = this.position.y;
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    b.area.group.add(this.group);
    const stone = Mat.stoneDark();
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 2.0, 5), stone);
    ob.position.y = 1.0;
    this.group.add(ob);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.0, 4), stone);
      spike.position.set(Math.cos(a) * 0.7, 0.4, Math.sin(a) * 0.7);
      spike.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      this.group.add(spike);
    }
    this.crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1030).multiplyScalar(2.5), toneMapped: false });
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), this.crystalMat);
    this.crystal.position.y = 2.45;
    this.crystal.scale.set(0.8, 1.5, 0.8);
    this.group.add(this.crystal);
    this.rune = b.runeCircle(x, z, 2.4, '#ff2a3a', 0.7, 0.2);
    this.light = b.area.addFlickerLight(x, y + 2.5, z, 0xff1030, 2.2, 9, 0.2);
    this.collider = b.col.addCircle(x, z, 0.7, -10, y + 2.2);
    this.flash = 0;
    b.area.updaters.push((dt, t) => {
      if (!this.alive) return;
      this.crystal.rotation.y = t * 1.5;
      this.crystal.position.y = 2.45 + Math.sin(t * 2) * 0.08;
      const pulse = 2 + Math.sin(t * 4) * 0.6 + this.flash * 4;
      this.crystalMat.color.setRGB(pulse, pulse * 0.1, pulse * 0.15);
      this.flash = Math.max(0, this.flash - dt * 4);
    });
  }

  setup(game) {
    this.game = game;
    if (game.flags[this.flag]) this.destroyVisual(true);
  }

  applySlow() {}
  applyRoot() {}
  applyImpulse() {}
  stagger() {}

  takeDamage(amount) {
    if (!this.alive) return { dealt: 0 };
    this.hp -= amount;
    this.flash = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      const g = this.game;
      g.flags[this.flag] = true;
      g.audio.play('altar_break', { pos: this.position });
      g.effects.burst(this.position.clone().setY(this.position.y + 2.4), { count: 60, color: 0xff1030, speed: 7, size: 0.22, life: 1, gravity: 6 });
      g.effects.ring(this.position, { color: 0xff1030, radius: 6, duration: 0.6 });
      g.cameraRig.shake(0.4);
      this.destroyVisual(false);
      g.quests.notify('altar');
      g.player.gainXp(60);
      g.ui.toast('The cursed altar shatters. The moon dims, just slightly.', 'good');
      g.saveSoon();
      return { dealt: amount };
    }
    return { dealt: amount };
  }

  destroyVisual(instant) {
    this.alive = false;
    this.crystal.visible = false;
    this.rune.visible = false;
    this.light.userData.dead = true;
    this.area.collision.remove(this.collider);
    if (instant) this.group.children[0].scale.y = 0.5;
    else this.game.timers.after(0.1, () => (this.group.children[0].scale.y = 0.5));
    this.group.children[0].position.y = 0.5;
  }
}

/** A hollow-sounding wall that slides away to reveal a secret room. */
export function addSecretWall(b, x, z, w, h, rotY, flag, opts = {}) {
  const area = b.area;
  const y = b.y(x, z);
  const wall = b.box(w, h, 0.9, Mat.stone(), { pos: [x, y + h / 2, z], rot: [0, rotY, 0], static: false });
  // subtle crack hints
  const crack = b.mesh(new THREE.PlaneGeometry(w * 0.6, h * 0.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }), { pos: [x + Math.sin(rotY) * 0.46, y + h * 0.4, z + Math.cos(rotY) * 0.46], rot: [0, rotY, 0.3], static: false, shadow: false });
  const col = b.col.addBox(x, z, w / 2, 0.45, rotY, -10, y + h);
  let t = -1;
  area.updaters.push((dt) => {
    if (t >= 0 && t < 1) {
      t = Math.min(1, t + dt * 0.45);
      wall.position.y = y + h / 2 - t * (h + 0.1);
      if (Math.random() < 0.5) area._shakeHint = true;
    }
  });
  return area.addInteractable({
    id: 'secret_' + flag,
    position: V(x, y + 1.2, z),
    radius: 2.6,
    marker: 'secret',
    hiddenMarker: true,
    prompt: opts.prompt ?? 'Examine the hollow-sounding wall',
    isDone: (game) => game.flags[flag],
    setup: (game) => {
      if (game.flags[flag]) {
        wall.visible = false;
        crack.visible = false;
        b.col.remove(col);
      }
    },
    onInteract: (game) => {
      if (game.flags[flag]) return;
      game.flags[flag] = true;
      t = 0;
      crack.visible = false;
      b.col.remove(col);
      game.audio.play('secret');
      game.cameraRig.shake(0.3);
      game.effects.burst(V(x, y + 1, z), { count: 40, color: 0x3a3030, smoke: true, speed: 2, size: 1, life: 1.5, gravity: -0.2 });
      game.quests.notify('secret');
      game.player.gainXp(50);
      game.ui.toast('A secret passage opens!', 'good');
      game.saveSoon();
    },
  });
}

/** Glowing travel gate marker (the actual collision is the archway/doors built by the area). */
export function addGateMarker(b, x, z, color = 0xff3050) {
  const y = b.y(x, z);
  const mat = new THREE.MeshBasicMaterial({ map: Tex.shaft(), color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 5, 24, 1, true), mat);
  m.geometry.translate(0, 2.5, 0);
  m.rotation.x = Math.PI;
  m.position.set(x, y + 5, z);
  b.area.group.add(m);
  b.area.updaters.push((dt, t) => (mat.opacity = 0.35 + Math.sin(t * 2) * 0.15));
  return m;
}
