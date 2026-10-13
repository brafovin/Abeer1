// Area container: scene content, collision, lights, interactables, triggers, spawn points.
import * as THREE from 'three';
import { CollisionWorld } from './Collision.js';
import { FlameField, FogField, MoteField, Sky } from './Effects3D.js';
import { mergeStatic } from './Props.js';

export class Area {
  constructor(id, opts = {}) {
    this.id = id;
    this.name = opts.name ?? id;
    this.subtitle = opts.subtitle ?? '';
    this.seed = opts.seed ?? 1;
    this.group = new THREE.Group();
    this.group.name = 'area-' + id;
    this.collision = new CollisionWorld();
    this.flames = new FlameField();
    this.flickerLights = [];
    this.updaters = [];
    this.interactables = [];
    this.enemySpawns = [];
    this.triggers = [];
    this.spawns = {};
    this.gates = [];
    this.points = {}; // named positions for objectives / scripting
    this.fogFields = [];
    this.motes = null;
    this.sky = null;
    this.env = {
      fogColor: 0x0b0710,
      fogDensity: 0.035,
      background: 0x050307,
      ambient: 0x3a2a40,
      ambientIntensity: 0.6,
      hemiSky: 0x5a4a70,
      hemiGround: 0x1a0a10,
      hemiIntensity: 0.5,
      moonLight: null, // { color, intensity, dir: [x,y,z] }
      rimColor: 0xc04a60,
      rimStrength: 0.55,
      music: 'explore',
      ambience: 'village',
      surface: 'stone',
      interior: false,
      exposure: 1.05,
      ...opts.env,
    };
    this.heightFn = opts.heightFn ?? null;
    this.time = 0;
    this.horror = opts.horror ?? {};
    this.onEnter = null; // (game, spawnId) => void
    this.onUpdate = null; // (dt, game) => void
    this.disposables = [];
  }

  groundHeight(x, z) {
    return this.heightFn ? this.heightFn(x, z) : 0;
  }

  addFlickerLight(x, y, z, color, intensity = 2, distance = 10, flicker = 0.25) {
    // intensities are authored in 'artist units'; scale to physically based candela
    const light = new THREE.PointLight(color, intensity * 7, distance * 1.25, 1.7);
    light.position.set(x, y, z);
    light.userData = { base: intensity * 7, flicker, seed: Math.random() * 100 };
    this.group.add(light);
    this.flickerLights.push(light);
    return light;
  }

  addInteractable(def) {
    const it = {
      enabled: true,
      radius: 2.2,
      once: false,
      used: false,
      prompt: 'Interact',
      ...def,
    };
    if (!it.position) it.position = new THREE.Vector3();
    this.interactables.push(it);
    return it;
  }

  addTrigger(def) {
    const t = { once: true, fired: false, radius: 3, ...def };
    this.triggers.push(t);
    return t;
  }

  addGate(def) {
    // def: { to, spawn, position: Vector3, label, requires?: (game)=>string|null, tag }
    const gate = this.addInteractable({
      ...def,
      radius: def.radius ?? 3.2,
      prompt: def.label,
      isGate: true,
      onInteract: (game) => {
        const block = def.requires ? def.requires(game) : null;
        if (block) {
          game.ui.toast(block, 'warn');
          game.audio.play('lock');
          return;
        }
        game.travel(def.to, def.spawn);
      },
    });
    this.gates.push(gate);
    return gate;
  }

  /** Finalise construction: merge static meshes, build flame + fog point clouds. */
  finalize(quality) {
    mergeStatic(this.group);
    const flames = this.flames.build();
    if (flames) this.group.add(flames);
    for (const f of this.fogFields) this.group.add(f.points);
    if (this.motes) this.group.add(this.motes.points);
    if (this.sky) this.group.add(this.sky.group);
    // Shadows: only the merged big meshes receive; limit casting to keep shadow pass cheap.
    this.group.traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    });
  }

  update(dt, game) {
    this.time += dt;
    const t = this.time;
    this.flames.update(t);
    for (const f of this.fogFields) f.update(t);
    if (this.motes) this.motes.update(t, game.camera.position);
    if (this.sky) this.sky.update(t, game.camera);
    for (const l of this.flickerLights) {
      const u = l.userData;
      if (u.dead) {
        l.intensity = 0;
        continue;
      }
      const n = Math.sin(t * 11 + u.seed) * Math.sin(t * 7.3 + u.seed * 2) * Math.sin(t * 2.1 + u.seed);
      let k = 1 + n * u.flicker;
      // occasional dropouts for the badly broken lamps
      if (u.flicker > 0.6 && Math.sin(t * 0.7 + u.seed) > 0.93) k *= 0.1;
      l.intensity = u.base * Math.max(0, k);
    }
    for (const fn of this.updaters) fn(dt, t);
    if (this.onUpdate) this.onUpdate(dt, game);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.isShaderMaterial) o.material.dispose();
    });
    for (const d of this.disposables) d();
  }
}

export { FogField, MoteField, Sky };
