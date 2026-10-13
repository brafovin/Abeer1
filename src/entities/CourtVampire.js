// A member of the vampire court rendered as a full anime model. Three modes:
//   neutral — idles / mingles at the court, can be spoken to
//   ally    — follows the player between areas and fights beside them
//   hostile — duels the player (and their allies); killing it steals its power
import * as THREE from 'three';
import { createVampireModel } from './models/VampireModels.js';
import { ARCHETYPES } from './models/archetypes.js';
import { meleeArc, playerTargets, enemyTargets } from '../combat/Combat.js';
import { POWERS } from '../game/Powers.js';
import { angleDiff, clamp, damp, dampAngle, rand, yawTo } from '../core/utils.js';

export class CourtVampire {
  constructor(game, data, mode, x, z, yaw = 0) {
    this.game = game;
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    this.level = data.level;
    this.mode = mode;
    this.isCourt = true;
    this.model = createVampireModel(data.appearance);
    this.position = new THREE.Vector3(x, game.area.groundHeight(x, z), z);
    this.home = this.position.clone();
    this.homeYaw = yaw;
    this.velocity = new THREE.Vector3();
    this.impulse = new THREE.Vector3();
    this.yaw = yaw;
    this.radius = 0.45;
    this.height = 1.85;
    // archetype modifiers: warriors and ancients are tougher, assassins hit hard and move fast, lords are slow bruisers
    const arch = (ARCHETYPES[data.archetype] ?? ARCHETYPES.noble).stats;
    this.maxHp = Math.round((150 + data.level * 24) * arch.hp);
    this.hp = this.maxHp;
    this.damage = (9 + data.level * 1.5) * arch.dmg;
    this.spdMul = arch.spd;
    this.reach = this.model.reach ?? 1;
    this.alive = true;
    this.hostile = mode === 'hostile';
    this.state = 'idle';
    this.stateT = 0;
    this.cooldown = rand(0.5, 1.5);
    this.powerCd = rand(4, 8);
    this.comboStep = 0;
    this.target = null;
    this.slowT = 0;
    this.slowF = 1;
    this.rootT = 0;
    this.deadT = 0;
    this.removeMe = false;
    this.flash = 0;
    this.slot = 0; // follower slot
    this.bloodColor = 0x9a0018;
    this.idleTimer = rand(2, 6);
    this.lookYaw = yaw;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = yaw;
    game.scene.add(this.model.root);
    this.ranged = !!this.model.ranged;
    this.telegraph = null;
  }

  get isBoss() {
    return false;
  }

  setMode(mode) {
    this.mode = mode;
    this.hostile = mode === 'hostile';
    this.state = 'idle';
    this.target = null;
    if (mode === 'hostile') {
      this.hp = this.maxHp;
      this.cooldown = 1.0;
    }
  }

  applyImpulse(x, z) {
    this.impulse.x += x * 0.6;
    this.impulse.z += z * 0.6;
  }
  applySlow(f, t) {
    this.slowF = Math.min(this.slowF, f);
    this.slowT = Math.max(this.slowT, t);
  }
  applyRoot(t) {
    this.rootT = Math.max(this.rootT, t);
  }
  stagger(t = 0.8) {
    if (!this.alive) return;
    this.state = 'hurt';
    this.stateT = -t + 0.45;
    this.telegraph?.cancel();
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive || this.mode === 'neutral') return { dealt: 0 };
    this.hp -= amount;
    this.flash = 1;
    if (this.mode === 'hostile' && opts.source !== 'enemy') this.target = opts.source === 'ally' && opts.attacker ? opts.attacker : this.game.player;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.state = 'dead';
      this.stateT = 0;
      this.telegraph?.cancel();
      const c = this.position.clone().setY(this.position.y + 1);
      this.game.effects.burst(c, { count: 40, color: 0xb0001a, speed: 6, size: 0.22, life: 0.8, gravity: 8 });
      this.game.audio.play('player_death', { pos: this.position, volume: 0.6, pitch: this.data.female ? 1.3 : 0.9 });
      if (this.mode === 'ally') this.game.court.onAllyDowned(this);
      return { dealt: amount, killed: this.mode === 'hostile' };
    }
    if ((opts.stagger || amount > this.maxHp * 0.12) && this.state !== 'hurt') {
      this.telegraph?.cancel();
      this.state = 'hurt';
      this.stateT = 0;
    }
    return { dealt: amount };
  }

  foes() {
    return this.mode === 'hostile' ? enemyTargets(this.game) : playerTargets(this.game).filter((e) => !e.isCourt || e.mode === 'hostile');
  }

  nearestFoe(maxD) {
    let best = null, bd = maxD;
    const center = this.mode === 'ally' ? this.game.player.position : this.position;
    for (const f of this.foes()) {
      if (!f.alive || f === this) continue;
      const d = f.position.distanceTo(center);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    this.stateT += dt;
    this.cooldown -= dt;
    this.powerCd -= dt;
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.slowF = 1;
    }
    if (this.rootT > 0) this.rootT -= dt;
    let action = null;
    let moveDir = null, speed = 0;

    if (this.state === 'dead') {
      this.deadT += dt;
      this.model.update(dt, { speed: 0, grounded: true, action: { type: 'dead', t: Math.min(1, this.deadT / 1.4) } });
      if (this.deadT > 2.0) this.model.root.visible = Math.floor(this.deadT * 12) % 2 === 0;
      if (this.deadT > 2.6) this.removeMe = true;
      this.syncModel();
      return;
    }

    if (this.mode === 'neutral') {
      // mingle: idle, glance at the player when close, small wanders around the home spot
      const p = g.player;
      const dp = p.position.distanceTo(this.position);
      this.idleTimer -= dt;
      if (dp < 4.5 && p.alive) this.lookYaw = yawTo(this.position.x, this.position.z, p.position.x, p.position.z);
      else if (this.idleTimer <= 0) {
        this.idleTimer = rand(3, 8);
        this.lookYaw = this.homeYaw + rand(-1.2, 1.2);
        if (Math.random() < 0.3) this.wander = this.home.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5)));
      }
      if (this.wander && this.wander.distanceTo(this.position) > 0.3) {
        moveDir = this.wander.clone().sub(this.position).setY(0).normalize();
        speed = 1.1;
        this.lookYaw = Math.atan2(moveDir.x, moveDir.z);
      } else this.wander = null;
      this.yaw = dampAngle(this.yaw, this.lookYaw, 3, dt);
    } else if (this.mode === 'ally') {
      ({ action, moveDir, speed } = this.allyThink(dt));
    } else {
      ({ action, moveDir, speed } = this.hostileThink(dt));
    }

    // movement
    const s = this.rootT > 0 ? 0 : speed * this.slowF * this.spdMul;
    if (moveDir && s > 0) {
      this.velocity.x = damp(this.velocity.x, moveDir.x * s, 9, dt);
      this.velocity.z = damp(this.velocity.z, moveDir.z * s, 9, dt);
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 10, dt);
      this.velocity.z = damp(this.velocity.z, 0, 10, dt);
    }
    this.position.x += (this.velocity.x + this.impulse.x) * dt;
    this.position.z += (this.velocity.z + this.impulse.z) * dt;
    this.impulse.multiplyScalar(Math.max(0, 1 - dt * 6));
    g.area.collision.resolveCircle(this.position, this.radius, this.position.y);
    // don't stand inside the player
    const p = g.player;
    const dx = this.position.x - p.position.x, dz = this.position.z - p.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.85 && d > 1e-4) {
      this.position.x += (dx / d) * (0.85 - d);
      this.position.z += (dz / d) * (0.85 - d);
    }
    this.position.y = g.area.groundHeight(this.position.x, this.position.z);
    const horiz = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.state === 'hurt') action = { type: 'hurt', t: clamp(this.stateT / 0.45, 0, 1) };
    this.model.update(dt, { speed: horiz, sprint: horiz > 6, grounded: true, action });
    this.syncModel();
  }

  syncModel() {
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw;
    this.flash = Math.max(0, this.flash - 0.1);
  }

  // ── ally AI ────────────────────────────────────────────────────────────────────────────────────
  allyThink(dt) {
    const g = this.game;
    const p = g.player;
    let action = null, moveDir = null, speed = 0;
    if (this.state === 'hurt') {
      if (this.stateT > 0.45) this.state = 'idle';
      return { action, moveDir, speed };
    }
    // teleport back if left far behind
    if (p.position.distanceTo(this.position) > 30) this.warpNear(p.position);

    if (!this.target || !this.target.alive || this.target.position.distanceTo(p.position) > 20) this.target = this.nearestFoe(16);
    const tgt = this.target;
    if (this.state === 'windup' || this.state === 'strike') return this.meleeStep(dt, tgt, 'ally');
    if (tgt) {
      const dist = tgt.position.distanceTo(this.position);
      const toYaw = yawTo(this.position.x, this.position.z, tgt.position.x, tgt.position.z);
      this.yaw = dampAngle(this.yaw, toYaw, 8, dt);
      if (this.powerCd <= 0 && dist < 9) {
        this.powerCd = rand(9, 14);
        this.castPower('ally');
        action = { type: 'cast', t: 0.5 };
      } else if (this.ranged) {
        if (dist > 8) {
          moveDir = new THREE.Vector3(Math.sin(toYaw), 0, Math.cos(toYaw));
          speed = 5.5;
        } else if (this.cooldown <= 0) {
          this.cooldown = rand(1.4, 2.2);
          const from = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 0.5, 1.4, Math.cos(this.yaw) * 0.5));
          const dir = tgt.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(from).normalize();
          g.projectiles.spawn({ pos: from, dir, speed: 18, damage: this.damage * 1.1, owner: 'ally', color: new THREE.Color(this.data.appearance.accent).getHex(), size: 0.18, life: 2, kind: 'ally' });
          g.audio.play('blade_throw', { pos: this.position, volume: 0.5 });
          action = { type: 'cast', t: 0.4 };
        }
      } else if (dist > 2.2 * this.reach) {
        moveDir = new THREE.Vector3(Math.sin(toYaw), 0, Math.cos(toYaw));
        speed = 6;
      } else if (this.cooldown <= 0) {
        this.state = 'windup';
        this.stateT = 0;
      }
    } else {
      // follow formation behind the player
      const back = p.yaw + Math.PI + (this.slot - 1) * 0.7;
      const want = p.position.clone().add(new THREE.Vector3(Math.sin(back) * 2.8, 0, Math.cos(back) * 2.8));
      const d = want.distanceTo(this.position);
      if (d > 0.6) {
        moveDir = want.sub(this.position).setY(0).normalize();
        speed = d > 6 ? 8.5 : d > 2.5 ? 5.5 : 2.5;
        this.yaw = dampAngle(this.yaw, Math.atan2(moveDir.x, moveDir.z), 8, dt);
      } else this.yaw = dampAngle(this.yaw, p.yaw, 4, dt);
    }
    return { action, moveDir, speed };
  }

  warpNear(pos) {
    const g = this.game;
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const x = pos.x + Math.cos(a) * 2.5, z = pos.z + Math.sin(a) * 2.5;
      if (!g.area.collision.pointInside(x, z, 1, 0.5)) {
        this.position.set(x, g.area.groundHeight(x, z), z);
        g.effects.burst(this.position.clone().setY(this.position.y + 1), { count: 16, color: 0x2a0a18, smoke: true, speed: 2, size: 0.8, life: 0.7, gravity: -0.3 });
        return;
      }
    }
    this.position.copy(pos);
  }

  castPower(source) {
    const g = this.game;
    const def = POWERS[this.data.power];
    const mult = (0.5 + this.level * 0.035) * (source === 'enemy' ? 0.55 : 0.7);
    g.powers.cast(this.data.power, this, mult, def, { source });
    g.ui.floatText(this.position.clone().setY(this.position.y + 2.4), def.name, def.color);
  }

  // ── hostile AI ─────────────────────────────────────────────────────────────────────────────────
  hostileThink(dt) {
    const g = this.game;
    let action = null, moveDir = null, speed = 0;
    if (this.state === 'hurt') {
      if (this.stateT > 0.45) this.state = 'idle';
      return { action, moveDir, speed };
    }
    if (!this.target || !this.target.alive) {
      const cand = this.nearestFoe(30);
      this.target = cand;
    }
    const tgt = this.target;
    if (!tgt) {
      const d = this.home.distanceTo(this.position);
      if (d > 0.5) {
        moveDir = this.home.clone().sub(this.position).setY(0).normalize();
        speed = 3;
      }
      return { action, moveDir, speed };
    }
    if (this.state === 'windup' || this.state === 'strike') return this.meleeStep(dt, tgt, 'enemy');
    const dist = tgt.position.distanceTo(this.position);
    const toYaw = yawTo(this.position.x, this.position.z, tgt.position.x, tgt.position.z);
    this.yaw = dampAngle(this.yaw, toYaw, 7, dt);
    if (this.powerCd <= 0 && dist < 10) {
      this.powerCd = rand(7, 11);
      action = { type: 'castUp', t: 0.6 };
      g.ui.floatText(this.position.clone().setY(this.position.y + 2.4), POWERS[this.data.power].name + '!', POWERS[this.data.power].color);
      const c = this.position.clone();
      this.telegraph = g.effects.telegraph(c, 3.5, 0.7, { color: 0xff2a3a, onDone: () => this.alive && this.castPower('enemy') });
      this.cooldown = 1.2;
    } else if (this.ranged && dist > 5) {
      if (dist > 11) {
        moveDir = new THREE.Vector3(Math.sin(toYaw), 0, Math.cos(toYaw));
        speed = 5;
      } else if (this.cooldown <= 0) {
        this.cooldown = rand(1.6, 2.4);
        const from = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 0.5, 1.4, Math.cos(this.yaw) * 0.5));
        const dir = tgt.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(from).normalize();
        g.projectiles.spawn({ pos: from, dir, speed: 15, damage: this.damage, owner: 'enemy', color: new THREE.Color(this.data.appearance.accent).getHex(), size: 0.2, life: 2.5 });
        g.audio.play('projectile', { pos: this.position });
        action = { type: 'cast', t: 0.4 };
      } else {
        const sgn = Math.sin(this.stateT + this.id) > 0 ? 1 : -1;
        moveDir = new THREE.Vector3(Math.cos(toYaw) * sgn, 0, -Math.sin(toYaw) * sgn);
        speed = 3;
      }
    } else if (dist > 2.3 * this.reach) {
      moveDir = new THREE.Vector3(Math.sin(toYaw), 0, Math.cos(toYaw));
      speed = 5.8;
    } else if (this.cooldown <= 0) {
      this.state = 'windup';
      this.stateT = 0;
      const c = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 1.3 * this.reach, 0, Math.cos(this.yaw) * 1.3 * this.reach));
      this.telegraph = g.effects.telegraph(c, 1.9, 0.45, { color: 0xff2a3a });
      g.audio.play('enemy_attack', { pos: this.position, pitch: this.data.female ? 1.25 : 0.95, volume: 0.7 });
    }
    return { action, moveDir, speed };
  }

  meleeStep(dt, tgt, source) {
    const g = this.game;
    const windup = source === 'enemy' ? 0.45 : 0.3;
    let action;
    if (this.state === 'windup') {
      if (tgt) this.yaw = dampAngle(this.yaw, yawTo(this.position.x, this.position.z, tgt.position.x, tgt.position.z), 10, dt);
      action = { type: 'attack', index: this.comboStep % 3, t: (this.stateT / windup) * 0.42 };
      if (this.stateT >= windup) {
        this.state = 'strike';
        this.stateT = 0;
        g.audio.play('swing', { pos: this.position, pitch: 0.9 + Math.random() * 0.2 });
        g.effects.slash(this.position.clone().setY(this.position.y + 1.05), this.yaw, { color: new THREE.Color(this.data.appearance.accent).getHex(), radius: 2.4 * this.reach, arc: 2.2, duration: 0.22, sweep: this.comboStep % 2 ? -1 : 1 });
        const targets = source === 'enemy' ? enemyTargets(g) : this.foes();
        meleeArc(g, this.position, this.yaw, 2.6 * this.reach, 2.2, this.damage * (source === 'ally' ? 0.9 : 1), { source, attacker: this, targets, knockback: 3, noHitStop: true });
        this.velocity.x += Math.sin(this.yaw) * 3;
        this.velocity.z += Math.cos(this.yaw) * 3;
      }
    } else {
      action = { type: 'attack', index: this.comboStep % 3, t: 0.42 + (this.stateT / 0.4) * 0.58 };
      if (this.stateT >= 0.4) {
        this.comboStep++;
        this.state = 'idle';
        this.cooldown = this.comboStep % 3 === 0 ? rand(1.2, 1.8) : 0.15;
      }
    }
    return { action, moveDir: null, speed: 0 };
  }

  dispose() {
    this.telegraph?.cancel();
    this.game.scene.remove(this.model.root);
    this.model.dispose();
  }
}
