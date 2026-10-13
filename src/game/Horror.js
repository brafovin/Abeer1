// Horror director: paces scares. Builds tension with whispers, distant footsteps, flickering lights,
// silhouettes at the edge of vision and (rarely) a sudden but fair scare. Respects safe zones and the
// accessibility settings (reduced flashing / loud sounds).
import * as THREE from 'three';
import { createWatcherModel } from '../entities/models/EnemyModels.js';
import { angleDiff, rand, yawTo } from '../core/utils.js';

export class HorrorDirector {
  constructor(game) {
    this.game = game;
    this.timer = 20;
    this.watcher = null;
    this.tension = 0;
    this.lastScare = -999;
    this.time = 0;
  }

  reset() {
    this.removeWatcher();
    this.timer = rand(15, 25);
    this.tension = 0;
  }

  removeWatcher() {
    if (this.watcher) {
      this.game.scene.remove(this.watcher.model.root);
      this.watcher.model.dispose();
      this.watcher = null;
    }
  }

  onStalkerEmerge() {
    this.lastScare = this.time;
    if (!this.game.settings.get('reduceFlashing')) this.game.renderer.doFlash(0x200008, 0.25, 4);
    this.game.cameraRig.shake(0.25);
  }

  get safe() {
    const g = this.game;
    // shrines are safe havens: no scares nearby
    return g.area.interactables.some((i) => i.isShrine && i.position.distanceTo(g.player.position) < 9) || g.bossActive;
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    const cfg = g.area.horror || {};
    if (this.watcher) this.updateWatcher(dt);
    if (!cfg.enabled || !g.player.alive) return;
    const inCombat = g.enemies.some((e) => e.alive && e.alerted);
    this.tension = Math.min(1, this.tension + dt * (inCombat ? -0.05 : 0.01));
    this.timer -= dt;
    if (this.timer > 0 || this.safe || inCombat) return;
    this.timer = rand(cfg.minGap ?? 18, cfg.maxGap ?? 40);
    const events = cfg.events ?? ['whisper', 'steps', 'flicker'];
    const ev = events[Math.floor(Math.random() * events.length)];
    this.trigger(ev);
  }

  trigger(ev) {
    const g = this.game;
    const p = g.player.position;
    const camYaw = g.cameraRig.yaw;
    const behind = new THREE.Vector3(p.x - Math.sin(camYaw) * 8, 0, p.z - Math.cos(camYaw) * 8);
    switch (ev) {
      case 'whisper':
        g.audio.play('whisper', { pos: behind, volume: 0.8 });
        g.ui.subtitle('(whispering behind you)');
        break;
      case 'steps':
        g.audio.play('distant_steps', { pos: behind });
        g.ui.subtitle('(footsteps… then nothing)');
        break;
      case 'bell':
        g.audio.play('bell', { volume: 0.7 });
        g.ui.subtitle('(a bell tolls, though no one is there to ring it)');
        break;
      case 'crow':
        g.audio.play('crow', { pos: new THREE.Vector3(p.x + rand(-15, 15), 0, p.z + rand(-15, 15)) });
        break;
      case 'heartbeat':
        g.audio.play('heartbeat', { volume: 0.8 });
        break;
      case 'flicker': {
        // nearby lights stutter and die for a moment
        const lights = g.area.flickerLights.filter((l) => l.position.distanceTo(p) < 25);
        for (const l of lights) {
          l.userData.dead = true;
          g.timers.after(rand(1.2, 2.5), () => (l.userData.dead = false));
        }
        if (lights.length) g.audio.play('whisper', { volume: 0.5 });
        break;
      }
      case 'thunder':
        g.audio.play('thunder', { volume: 0.8 });
        if (!g.settings.get('reduceFlashing')) g.renderer.doFlash(0xffd0d8, 0.35, 5);
        break;
      case 'watcher':
        this.spawnWatcher();
        break;
      default:
        break;
    }
  }

  /** A tall silhouette appears at the edge of vision and vanishes when looked at or approached. */
  spawnWatcher() {
    const g = this.game;
    if (this.watcher) return;
    const p = g.player.position;
    const side = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < 10; i++) {
      const yaw = g.cameraRig.yaw + side * rand(0.55, 0.85);
      const d = rand(18, 30);
      const x = p.x + Math.sin(yaw) * d, z = p.z + Math.cos(yaw) * d;
      if (g.area.collision.pointInside(x, z, 1, 0.6)) continue;
      const model = createWatcherModel();
      model.root.position.set(x, g.area.groundHeight(x, z), z);
      model.root.rotation.y = yawTo(x, z, p.x, p.z);
      g.scene.add(model.root);
      this.watcher = { model, t: 0, fading: false, opacity: 0 };
      return;
    }
  }

  updateWatcher(dt) {
    const g = this.game;
    const w = this.watcher;
    w.t += dt;
    const pos = w.model.root.position;
    const p = g.player.position;
    const lookYaw = yawTo(g.camera.position.x, g.camera.position.z, pos.x, pos.z);
    const looking = Math.abs(angleDiff(g.cameraRig.yaw, lookYaw)) < 0.22;
    if (!w.fading && (looking && w.t > 0.6 || pos.distanceTo(p) < 12 || w.t > 9)) {
      w.fading = true;
      if (looking) g.audio.play('whisper', { pos, volume: 0.6 });
    }
    w.opacity = w.fading ? Math.max(0, w.opacity - dt * 3.5) : Math.min(0.92, w.opacity + dt * 0.8);
    w.model.setOpacity(w.opacity);
    w.model.root.rotation.y = yawTo(pos.x, pos.z, p.x, p.z);
    if (w.fading && w.opacity <= 0) this.removeWatcher();
  }
}
