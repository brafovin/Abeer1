// Animated 3D backdrop for the main menu and character selection: a cliff beneath the moon,
// Castle Nocturne with burning red windows, bats, fog, and the chosen hero in the moonlight.
import * as THREE from 'three';
import { Area, FogField, MoteField, Sky } from './Area.js';
import { AreaBuilder } from './Props.js';
import { Mat } from './Materials.js';
import { createHeroModel } from '../entities/models/CharacterModels.js';
import { RIM } from '../entities/models/Toon.js';
import { damp, seeded, TAU } from '../core/utils.js';

export class MenuScene {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 700);
    this.built = false;
    this.model = null;
    this.modelKey = '';
    this.charSelect = false;
    this.yaw = -0.35;
    this.time = 0;
    this.dragging = false;
    window.addEventListener('pointerdown', (e) => {
      if (this.game.state === 'menu' && e.target === this.game.canvas) this.dragging = true;
    });
    window.addEventListener('pointerup', () => (this.dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (this.dragging && this.game.state === 'menu') this.yaw += e.movementX * 0.008;
    });
  }

  build() {
    const area = new Area('menu', { seed: 9 });
    this.area = area;
    const b = new AreaBuilder(area);
    const rng = seeded(99);
    this.scene.fog = new THREE.FogExp2(0x0c0610, 0.018);
    this.scene.background = new THREE.Color(0x050307);
    area.sky = new Sky({ top: 0x040208, horizon: 0x1c0610, moonColor: 0xff3a3a, moonDir: new THREE.Vector3(0.12, 0.3, -1), moonSize: 95, glow: 0.75 });
    // cliff top
    const cliff = new THREE.CylinderGeometry(9, 14, 20, 20, 1);
    b.mesh(cliff, Mat.stoneDark(), { pos: [0, -10, 0], shadow: false });
    const top = new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2);
    b.mesh(top, Mat.ashGround(), { pos: [0, 0.01, 0], shadow: false });
    for (let i = 0; i < 9; i++) b.rock(rng.range(-7, 7), rng.range(-7, 7), rng.range(0.3, 0.9), false);
    b.deadTree(-7.5, -6, 2, 1.2, false);
    b.deadTree(6.5, -7, 4, 1.1, false);
    b.gravestone(-3, 2.5, 0.4, 1);
    b.gravestone(3.4, 3.2, -0.3, 0);
    b.gravestone(4.6, 1.5, -0.6, 0);
    b.candles(-1.2, 0, 2.6, 7, 0.35);
    b.candles(2.4, 0, 3.0, 5, 0.3);
    // the castle across the abyss (from the player's reference painting)
    b.gothicCastle(38, -210, 1.7, { rotY: -0.15, light: false, y: -34 });
    b.mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), Mat.black(), { pos: [0, -34, -250], shadow: false });
    for (let i = 0; i < 12; i++) {
      const a = rng.range(-1.2, 1.2), d = rng.range(150, 260);
      if (Math.abs(Math.sin(a) * d - 20) < 60) continue;
      b.mesh(new THREE.ConeGeometry(rng.range(18, 40), rng.range(40, 90), 5), Mat.black(), { pos: [Math.sin(a) * d + 10, -30, -Math.cos(a) * d], shadow: false });
    }
    area.fogFields.push(new FogField({ count: 50, area: { minX: -80, maxX: 60, minZ: -160, maxZ: 10 }, y: -4, size: 30, color: 0x7a3a50, opacity: 0.22 }));
    area.motes = new MoteField({ count: 160, radius: 12, height: 8, color: 0xff8090, size: 0.05, rise: 0.25 });
    area.finalize();
    this.scene.add(area.group);
    // bats
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, 0.2, -0.3, -0.3, 0, 0.3, 0, 0, 0, 0.3, 0, 0.3, 1, 0.2, -0.3], 3));
    this.bats = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x050205, side: THREE.DoubleSide }), 40);
    this.bats.frustumCulled = false;
    this.batData = Array.from({ length: 40 }, () => ({ r: rng.range(18, 50), h: rng.range(20, 50), s: rng.range(0.1, 0.3), p: rng() * TAU, f: rng() * 10 }));
    this.scene.add(this.bats);
    // lights
    this.scene.add(new THREE.HemisphereLight(0x6a4a7a, 0x1a0508, 1.8));
    this.scene.add(new THREE.AmbientLight(0x2a1a2a, 1.2));
    const moon = new THREE.DirectionalLight(0xff4050, 3.2);
    moon.position.set(4, 10, -30);
    this.scene.add(moon);
    const key = new THREE.DirectionalLight(0xb8c4ff, 1.4);
    key.position.set(6, 8, 10);
    this.scene.add(key);
    const candle = new THREE.PointLight(0xff8a40, 9, 9, 1.6);
    candle.position.set(0, 1.2, 2.2);
    this.scene.add(candle);
    this.candle = candle;
    this.built = true;
  }

  enter() {
    if (!this.built) this.build();
    this.game.renderer.setScene(this.scene, this.camera);
    this.game.renderer.resize();
    RIM.color.value.set(0xff4a5a);
    RIM.strength.value = 0.5;
    this.game.renderer.renderer.toneMappingExposure = 1.1;
    this.active = true;
  }

  exit() {
    this.active = false;
  }

  setCharSelect(on) {
    this.charSelect = on;
  }

  showCharacter(id, cosmetic = 'default') {
    if (!this.built) this.build();
    const key = id + ':' + cosmetic;
    if (key === this.modelKey) return;
    this.modelKey = key;
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.dispose();
    }
    this.model = createHeroModel(id, cosmetic);
    this.model.root.position.set(0.5, 0, 1.4);
    this.scene.add(this.model.root);
    this.swapT = 0;
  }

  update(dt) {
    if (!this.built) return;
    this.time += dt;
    const t = this.time;
    this.area.update(dt, { camera: this.camera });
    if (this.model) {
      this.swapT = (this.swapT ?? 1) + dt;
      if (!this.dragging) this.yaw = damp(this.yaw, this.charSelect ? this.yaw : -0.35 + Math.sin(t * 0.2) * 0.25, 1.5, dt);
      this.model.root.rotation.y = this.yaw;
      const pose = this.swapT < 1.3 ? { type: 'attack', index: 2, t: Math.min(1, this.swapT / 1.3) } : null;
      this.model.update(dt, { speed: 0, grounded: true, action: pose });
    }
    // camera: wide establishing shot on the menu, closer portrait in character selection
    const cs = this.charSelect;
    const want = cs ? new THREE.Vector3(-1.5 + Math.sin(t * 0.3) * 0.05, 1.45, 4.4) : new THREE.Vector3(-2.6 + Math.sin(t * 0.07) * 0.3, 1.7 + Math.sin(t * 0.11) * 0.1, 5.6);
    const look = cs ? new THREE.Vector3(-0.9, 1.1, 0) : new THREE.Vector3(-1.1, 2.6, -4.4);
    this.camera.position.lerp(want, 1 - Math.exp(-2.5 * dt));
    this.lookAt = this.lookAt ?? look.clone();
    this.lookAt.lerp(look, 1 - Math.exp(-2.5 * dt));
    this.camera.lookAt(this.lookAt);
    if (Math.abs(this.camera.aspect - window.innerWidth / window.innerHeight) > 0.001) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }
    this.candle.intensity = 9 + Math.sin(t * 13) * Math.sin(t * 7) * 2;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
    this.batData.forEach((b, i) => {
      const a = b.p + t * b.s;
      p.set(38 + Math.cos(a) * b.r, b.h + 30 + Math.sin(t + i) * 2, -200 + Math.sin(a) * b.r);
      e.set(0, -a, Math.sin(t * 14 + b.f) * 0.5);
      q.setFromEuler(e);
      s.setScalar(1.2);
      m4.compose(p, q, s);
      this.bats.setMatrixAt(i, m4);
    });
    this.bats.instanceMatrix.needsUpdate = true;
  }
}
