// Bosses: The Veiled Countess (Chapter I finale) and the Twin Sovereigns of Castle Nocturne
// (Dravik Solmere and Nyxara Vael) — the two vampires who can never be befriended.
import * as THREE from 'three';
import { createEnemyModel } from './models/EnemyModels.js';
import { createVampireModel } from './models/VampireModels.js';
import { meleeArc, radialDamage, enemyTargets } from '../combat/Combat.js';
import { clamp, damp, dampAngle, pick, rand, TAU, yawTo } from '../core/utils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

class BossBase {
  constructor(game, x, z, o) {
    this.game = game;
    this.name = o.name;
    this.title = o.title ?? '';
    this.maxHp = o.hp;
    this.hp = o.hp;
    this.radius = o.radius ?? 1;
    this.height = o.height ?? 3;
    this.alive = true;
    this.hostile = true;
    this.isBossFlag = true;
    this.bloodColor = o.bloodColor ?? 0x9a0018;
    this.position = V(x, game.area.groundHeight(x, z), z);
    this.home = this.position.clone();
    this.velocity = V();
    this.yaw = o.yaw ?? Math.PI;
    this.active = false;
    this.state = 'dormant';
    this.stateT = 0;
    this.attackCd = 2;
    this.invuln = 0;
    this.slowT = 0;
    this.slowF = 1;
    this.deadT = 0;
    this.removeMe = false;
    this.phase = 1;
    this.handles = [];
    this.target = null;
    this.damageMult = o.damageMult ?? 1;
  }

  get isBoss() {
    return true;
  }

  applyImpulse() {}
  applyRoot(t) {
    this.applySlow(0.5, t * 0.6);
  }
  applySlow(f, t) {
    this.slowF = Math.min(this.slowF, Math.max(0.5, f));
    this.slowT = Math.max(this.slowT, t);
  }
  stagger() {}

  activate() {
    this.active = true;
    this.state = 'idle';
    this.stateT = 0;
    this.attackCd = 1.2;
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
    this._entered = false;
  }

  /** True exactly once after entering the current state. */
  once() {
    if (this._entered) return false;
    this._entered = true;
    return true;
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive || !this.active || this.invuln > 0 || this.state === 'teleport_out') return { dealt: 0 };
    this.hp -= amount;
    this.model.flashHit(0.8);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.setState('dead');
      for (const h of this.handles) h.cancel?.();
      this.onDeath?.();
      return { dealt: amount, killed: true };
    }
    this.onDamaged?.(amount);
    return { dealt: amount };
  }

  pickTarget() {
    const ts = enemyTargets(this.game);
    let best = null, bd = Infinity;
    for (const t of ts) {
      const d = t.position.distanceTo(this.position) - (t.isPlayer ? 3 : 0);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  telegraphCircle(pos, r, dur, onDone, color = 0xff1030) {
    const h = this.game.effects.telegraph(pos, r, dur, { color, onDone: () => this.alive && onDone() });
    this.handles.push(h);
    return h;
  }

  moveToward(dt, point, speed) {
    const d = point.clone().sub(this.position).setY(0);
    const len = d.length();
    if (len > 0.2) {
      d.normalize();
      this.velocity.x = damp(this.velocity.x, d.x * speed, 4, dt);
      this.velocity.z = damp(this.velocity.z, d.z * speed, 4, dt);
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 6, dt);
      this.velocity.z = damp(this.velocity.z, 0, 6, dt);
    }
  }

  baseUpdate(dt) {
    this.stateT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.slowF = 1;
    }
    const s = this.slowF;
    this.position.x += this.velocity.x * dt * s;
    this.position.z += this.velocity.z * dt * s;
    this.game.area.collision.resolveCircle(this.position, this.radius, this.position.y);
    this.position.y = this.game.area.groundHeight(this.position.x, this.position.z);
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw;
  }

  dispose() {
    for (const h of this.handles) h.cancel?.();
    this.game.scene.remove(this.model.root);
    this.model.dispose();
  }
}

// ───────────────────────────────────────────── The Veiled Countess ──────────────────────────────

export class VeiledCountess extends BossBase {
  constructor(game, x, z) {
    super(game, x, z, { name: 'The Veiled Countess', title: 'Ysolde, Keeper of the Crimson Veil', hp: 1900, radius: 1.0, height: 3.4, bloodColor: 0x9a0018 });
    this.model = createEnemyModel('countess');
    this.model.root.position.copy(this.position);
    game.scene.add(this.model.root);
    this.anim = 'idle';
    this.animT = 0;
    this.summoned75 = false;
    this.attackHistory = [];
  }

  onDamaged() {
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      for (const h of this.handles) h.cancel?.();
      this.handles = [];
      this.setState('shriek');
      this.invuln = 2.4;
    }
  }

  onDeath() {
    const g = this.game;
    g.audio.play('boss_shriek');
    g.renderer.doFlash(0xff2030, 0.6, 1.2);
    g.cameraRig.shake(0.9);
    g.timers.after(2.6, () => g.onBossDefeated('countess', this));
  }

  chooseAttack(dist) {
    const p2 = this.phase === 2;
    const options = [];
    if (dist < 4.5) options.push('claw', 'claw');
    options.push('volley', 'pools');
    if (dist > 12 || Math.random() < 0.25) options.push('teleport');
    if (p2) options.push('spiral', 'rain', 'volley');
    if (p2 && !this.summoned75 && this.hp < this.maxHp * 0.3) return 'summon';
    // avoid repeating the same attack three times
    let choice = pick(options);
    const last = this.attackHistory.slice(-2);
    if (last.length === 2 && last[0] === choice && last[1] === choice) choice = pick(options.filter((o) => o !== choice)) ?? choice;
    this.attackHistory.push(choice);
    return choice;
  }

  update(dt) {
    const g = this.game;
    this.animT += dt;
    if (this.state === 'dead') {
      this.deadT += dt;
      this.model.update(dt, { action: 'dead', t: Math.min(1, this.deadT / 2) });
      if (this.deadT > 1.5) this.model.setOpacity(Math.max(0, 1 - (this.deadT - 1.5) / 1.5));
      if (Math.random() < 0.5) g.effects.disc(this.position, 1.5, { count: 3, color: 0xff1030, up: 3, size: 0.3, life: 1 });
      if (this.deadT > 3.2) this.removeMe = true;
      this.baseUpdate(0);
      return;
    }
    if (!this.active) {
      this.model.update(dt, { action: 'idle', t: 0 });
      this.baseUpdate(dt);
      return;
    }
    const tgt = (this.target = this.target && this.target.alive ? this.target : this.pickTarget());
    const dist = tgt ? tgt.position.distanceTo(this.position) : 20;
    const toYaw = tgt ? yawTo(this.position.x, this.position.z, tgt.position.x, tgt.position.z) : this.yaw;
    const speedMul = this.phase === 2 ? 1.3 : 1;
    let anim = 'idle', animT = 0;

    // ambient blood mist
    if (Math.random() < 0.4) g.effects.disc(this.position, 1.2, { count: 1, color: 0x7a0010, up: 0.6, size: 0.5, life: 1.2 });

    switch (this.state) {
      case 'idle': {
        this.yaw = dampAngle(this.yaw, toYaw, 3, dt);
        // drift to a comfortable distance
        if (tgt) {
          const want = dist < 6 ? this.position.clone().add(this.position.clone().sub(tgt.position).setY(0).normalize().multiplyScalar(3)) : dist > 11 ? tgt.position : this.position;
          this.moveToward(dt, want, 2.2 * speedMul);
        }
        this.attackCd -= dt * speedMul;
        if (this.attackCd <= 0 && tgt) this.setState(this.chooseAttack(dist));
        break;
      }
      case 'volley': {
        anim = 'volley';
        animT = Math.min(1, this.stateT / 1.0);
        this.velocity.multiplyScalar(0.9);
        this.yaw = dampAngle(this.yaw, toYaw, 6, dt);
        if (this.once()) {
          g.audio.play('mage_cast', { pos: this.position, volume: 0.9 });
          g.effects.burst(this.position.clone().setY(this.position.y + 2.4), { count: 20, color: 0xff1030, speed: 2, size: 0.3, life: 0.6, gravity: 0 });
        }
        const waves = this.phase === 2 ? 2 : 1;
        for (let w = 0; w < waves; w++) {
          const fireAt = 0.8 + w * 0.55;
          if (this.stateT >= fireAt && this.stateT - dt < fireAt && tgt) this.fireFan(tgt, this.phase === 2 ? 7 : 5, w * 0.12);
        }
        if (this.stateT > 0.9 + waves * 0.55) this.endAttack(1.4);
        break;
      }
      case 'pools': {
        anim = 'pools';
        animT = Math.min(1, this.stateT / 1.2);
        this.velocity.multiplyScalar(0.9);
        if (this.once() && tgt) {
          g.audio.play('pool_warn');
          const n = this.phase === 2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const off = i === 0 ? V() : V(rand(-4, 4), 0, rand(-4, 4));
            const p = tgt.position.clone().add(off);
            p.y = g.area.groundHeight(p.x, p.z);
            this.telegraphCircle(p, 2.3, 1.35 + i * 0.12, () => {
              g.effects.pillar(p, { color: 0xff1030, radius: 2.0, height: 4, duration: 0.5, spikes: 9 });
              g.effects.burst(p.clone().setY(p.y + 0.5), { count: 20, color: 0xb0001a, speed: 6, size: 0.2, life: 0.6, gravity: 9 });
              g.audio.play('pool_erupt', { pos: p });
              radialDamage(g, p, 2.3, 26 * this.damageMult, { source: 'enemy', attacker: this, unblockable: true, knockback: 4 });
            });
          }
        }
        if (this.stateT > 1.4) this.endAttack(1.2);
        break;
      }
      case 'claw': {
        anim = this.stateT < 0.65 ? 'claw_windup' : 'claw';
        animT = this.stateT < 0.65 ? this.stateT / 0.65 : Math.min(1, (this.stateT - 0.65) / 0.5);
        if (this.stateT < 0.65) this.yaw = dampAngle(this.yaw, toYaw, 8, dt);
        if (this.once()) {
          g.audio.play('enemy_attack', { pos: this.position, pitch: 0.7 });
          const c = this.position.clone().add(V(Math.sin(this.yaw) * 2.2, 0, Math.cos(this.yaw) * 2.2));
          this.handles.push(g.effects.telegraph(c, 2.6, 0.65, { color: 0xff2030 }));
        }
        if (this.stateT >= 0.7 && this.stateT - dt < 0.7) {
          g.effects.slash(this.position.clone().setY(this.position.y + 2), this.yaw, { color: 0xff1030, radius: 4.2, arc: 2.6, width: 1.4, duration: 0.3 });
          g.audio.play('swing_heavy', { pos: this.position, pitch: 0.7 });
          meleeArc(g, this.position, this.yaw, 4.4, 2.4, 30 * this.damageMult, { source: 'enemy', attacker: this, knockback: 7 });
        }
        if (this.stateT > 1.2) this.endAttack(0.9);
        break;
      }
      case 'teleport': {
        anim = 'teleport';
        if (this.once()) {
          g.audio.play('boss_teleport', { pos: this.position });
          g.effects.burst(this.position.clone().setY(this.position.y + 1.6), { count: 40, color: 0x12030a, smoke: true, speed: 3, size: 1.2, life: 1.0, gravity: -0.5, grow: 0.8 });
        }
        const out = clamp(this.stateT / 0.45, 0, 1);
        this.model.setOpacity(1 - out);
        if (this.stateT >= 0.5 && this.stateT - dt < 0.5 && tgt) {
          // reappear at an unpredictable spot near the target, inside the arena
          const a = rand(0, TAU), r = rand(5, 8);
          const dest = tgt.position.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
          const col = g.area.collision;
          if (col.bounds?.circle) {
            const c = col.bounds.circle;
            const d = Math.hypot(dest.x - c.x, dest.z - c.z);
            if (d > c.r - 3) dest.set(c.x + ((dest.x - c.x) / d) * (c.r - 3), 0, c.z + ((dest.z - c.z) / d) * (c.r - 3));
          }
          this.position.copy(dest);
          this.position.y = g.area.groundHeight(dest.x, dest.z);
          this.yaw = yawTo(this.position.x, this.position.z, tgt.position.x, tgt.position.z);
          g.effects.burst(this.position.clone().setY(this.position.y + 1.6), { count: 40, color: 0xff1030, speed: 5, size: 0.25, life: 0.6, gravity: 0 });
        }
        if (this.stateT > 0.5) this.model.setOpacity(clamp((this.stateT - 0.5) / 0.35, 0, 1));
        if (this.stateT > 0.9) {
          this.model.setOpacity(1);
          this.setState(Math.random() < 0.6 ? 'volley' : 'pools');
        }
        break;
      }
      case 'spiral': {
        anim = 'summon';
        animT = Math.min(1, this.stateT / 0.6);
        this.velocity.multiplyScalar(0.9);
        if (this.once()) {
          g.audio.play('boss_laugh');
          g.effects.ring(this.position, { color: 0xff1030, radius: 4, duration: 0.8 });
        }
        if (this.stateT > 0.8 && this.stateT < 3.8) {
          this.spiralAcc = (this.spiralAcc ?? 0) + dt;
          while (this.spiralAcc > 0.22) {
            this.spiralAcc -= 0.22;
            const base = this.stateT * 1.7;
            for (let i = 0; i < 6; i++) {
              const a = base + (i / 6) * TAU;
              const from = this.position.clone().add(V(Math.sin(a) * 1.2, 1.4, Math.cos(a) * 1.2));
              g.projectiles.spawn({ pos: from, dir: V(Math.sin(a), 0, Math.cos(a)), speed: 6.5, damage: 12 * this.damageMult, owner: 'enemy', color: 0xff2040, size: 0.2, life: 4 });
            }
            g.audio.play('projectile', { pos: this.position, volume: 0.4 });
          }
        }
        if (this.stateT > 4.1) this.endAttack(1.4);
        break;
      }
      case 'rain': {
        anim = 'pools';
        animT = Math.min(1, this.stateT / 1.0);
        if (this.once()) {
          g.audio.play('pool_warn');
          const center = this.home;
          for (let i = 0; i < 9; i++) {
            const a = rand(0, TAU), r = rand(2, 15);
            const p = (i < 2 && tgt ? tgt.position.clone().add(V(rand(-1.5, 1.5), 0, rand(-1.5, 1.5))) : center.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r)));
            p.y = g.area.groundHeight(p.x, p.z);
            this.telegraphCircle(p, 1.8, 1.2 + i * 0.1, () => {
              g.effects.pillar(p, { color: 0xff1030, radius: 1.6, height: 7, duration: 0.45, spikes: 5 });
              g.audio.play('pool_erupt', { pos: p, volume: 0.6 });
              radialDamage(g, p, 1.8, 22 * this.damageMult, { source: 'enemy', attacker: this, unblockable: true });
            });
          }
        }
        if (this.stateT > 1.6) this.endAttack(1.0);
        break;
      }
      case 'summon': {
        anim = 'summon';
        animT = Math.min(1, this.stateT / 0.8);
        if (this.once()) {
          this.summoned75 = true;
          g.audio.play('boss_laugh');
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU + rand(-0.3, 0.3);
            const p = this.position.clone().add(V(Math.cos(a) * 4, 0, Math.sin(a) * 4));
            g.effects.disc(p, 1.2, { count: 30, color: 0xff1030, up: 4, size: 0.25, life: 0.7 });
            g.timers.after(0.4, () => g.spawnEnemy('crawler', p.x, p.z, { alerted: true }));
          }
        }
        if (this.stateT > 1.2) this.endAttack(0.8);
        break;
      }
      case 'shriek': {
        anim = 'shriek';
        this.velocity.multiplyScalar(0.85);
        if (this.once()) {
          g.audio.play('boss_shriek');
          g.audio.playMusic('boss2');
          g.cameraRig.shake(0.8);
          g.renderer.doFlash(0xff1030, 0.5, 1.5);
          g.ui.toast('The Countess tears away her restraint — her power surges!', 'boss');
          g.area.sky?.setMoonPulse(1.6);
          g.effects.ring(this.position, { color: 0xff1030, radius: 14, duration: 1.0 });
          // push the player back
          radialDamage(g, this.position, 5, 10, { source: 'enemy', attacker: this, knockback: 10, unblockable: true });
        }
        if (this.stateT > 1.0 && this.stateT - dt <= 1.0) {
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU;
            const p = this.position.clone().add(V(Math.cos(a) * 5, 0, Math.sin(a) * 5));
            g.spawnEnemy('crawler', p.x, p.z, { alerted: true });
          }
        }
        if (this.stateT > 2.4) {
          this.setState('idle');
          this.attackCd = 0.8;
        }
        break;
      }
      default:
        this.setState('idle');
    }
    this.anim = anim;
    this.model.update(dt, { action: anim, t: animT });
    this.baseUpdate(dt);
  }

  fireFan(tgt, n, delay = 0) {
    const g = this.game;
    g.audio.play('boss_volley', { pos: this.position });
    const from = this.position.clone().add(V(Math.sin(this.yaw) * 0.8, 2.4, Math.cos(this.yaw) * 0.8));
    const aim = tgt.position.clone().add(V(0, 1.0, 0)).sub(from).normalize();
    const baseYaw = Math.atan2(aim.x, aim.z);
    for (let i = 0; i < n; i++) {
      const a = baseYaw + (i - (n - 1) / 2) * 0.16;
      const dir = V(Math.sin(a), aim.y, Math.cos(a));
      g.projectiles.spawn({ pos: from.clone(), dir, speed: 13, damage: 15 * this.damageMult, owner: 'enemy', color: 0xff1030, size: 0.26, life: 3.2, homing: this.phase === 2 ? 0.6 : 0, target: tgt });
    }
  }

  endAttack(cd) {
    this.setState('idle');
    this.attackCd = cd * (this.phase === 2 ? 0.75 : 1);
  }
}

// ───────────────────────────────────────────── The Twin Sovereigns ──────────────────────────────

/**
 * A sovereign vampire boss built from the same anime vampire model system as the court.
 * kind: 'dravik' (greatsword bruiser, crimson lightning) | 'nyxara' (bat swarms, blood nova, blinks)
 */
export class Sovereign extends BossBase {
  constructor(game, x, z, kind, appearance) {
    const isDravik = kind === 'dravik';
    super(game, x, z, {
      name: isDravik ? 'Dravik Solmere' : 'Nyxara Vael',
      title: isDravik ? 'The Crimson Sovereign' : 'The Night Empress',
      hp: 2600,
      radius: 0.9,
      height: 2.5,
      damageMult: 1.0,
    });
    this.kind = kind;
    this.model = createVampireModel(appearance, { scale: 1.25 });
    this.model.root.position.copy(this.position);
    game.scene.add(this.model.root);
    this.partner = null;
    this.enraged = false;
    this.combo = 0;
    this.chargeDir = null;
  }

  onDeath() {
    const g = this.game;
    g.audio.play('boss_shriek');
    g.renderer.doFlash(this.kind === 'dravik' ? 0xff2020 : 0x9a40ff, 0.5, 1.5);
    g.cameraRig.shake(0.7);
    if (this.partner && this.partner.alive) {
      this.partner.enrage();
    }
    g.timers.after(2.2, () => g.onSovereignDefeated(this));
  }

  enrage() {
    this.enraged = true;
    this.damageMult = 1.35;
    const g = this.game;
    g.ui.toast(`${this.name} is consumed by grief and fury — ENRAGED!`, 'boss');
    g.audio.play('boss_shriek');
    g.effects.ring(this.position, { color: 0xff1030, radius: 10, duration: 0.8 });
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.15);
  }

  chooseAttack(dist) {
    if (this.kind === 'dravik') {
      const o = [];
      if (dist < 5) o.push('combo', 'combo');
      if (dist > 6) o.push('charge');
      o.push('lightning');
      if (this.hp < this.maxHp * 0.6) o.push('quake');
      return pick(o);
    }
    const o = ['bats', 'nova'];
    if (dist < 5) o.push('blink', 'nova');
    if (dist > 8) o.push('bats', 'lance');
    if (this.hp < this.maxHp * 0.6) o.push('drain');
    return pick(o);
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'dead') {
      this.deadT += dt;
      this.model.update(dt, { speed: 0, grounded: true, action: { type: 'dead', t: Math.min(1, this.deadT / 1.5) } });
      if (this.deadT > 2) this.model.setOpacity?.(Math.max(0, 1 - (this.deadT - 2) / 1.2));
      if (this.deadT > 3.2) this.removeMe = true;
      this.baseUpdate(0);
      return;
    }
    if (!this.active) {
      this.model.update(dt, { speed: 0, grounded: true, action: null });
      this.baseUpdate(dt);
      return;
    }
    const tgt = (this.target = this.target && this.target.alive ? this.target : this.pickTarget());
    const dist = tgt ? tgt.position.distanceTo(this.position) : 20;
    const toYaw = tgt ? yawTo(this.position.x, this.position.z, tgt.position.x, tgt.position.z) : this.yaw;
    const haste = this.enraged ? 1.35 : 1;
    let action = null;
    const aura = this.kind === 'dravik' ? 0xff1a1a : 0x9a40ff;
    if (Math.random() < 0.3) g.effects.disc(this.position, 0.8, { count: 1, color: aura, up: 1.5, size: 0.25, life: 0.8 });

    switch (this.state) {
      case 'idle': {
        this.yaw = dampAngle(this.yaw, toYaw, 6, dt);
        if (tgt) {
          if (this.kind === 'dravik') this.moveToward(dt, dist > 2.5 ? tgt.position : this.position, 4.4 * haste);
          else {
            const want = dist < 7 ? this.position.clone().add(this.position.clone().sub(tgt.position).setY(0).normalize().multiplyScalar(3)) : dist > 12 ? tgt.position : this.position;
            this.moveToward(dt, want, 3.6 * haste);
          }
        }
        this.attackCd -= dt * haste;
        if (this.attackCd <= 0 && tgt) this.setState(this.chooseAttack(dist));
        break;
      }
      // ── Dravik ──
      case 'combo': {
        const step = Math.floor(this.stateT / 0.75);
        const local = (this.stateT % 0.75) / 0.75;
        action = { type: 'attack', index: step % 3, t: local };
        if (local < 0.35) this.yaw = dampAngle(this.yaw, toYaw, 9, dt);
        if (step < 3 && local >= 0.0 && local < dt / 0.75 + 0.001) {
          const c = this.position.clone().add(V(Math.sin(this.yaw) * 2, 0, Math.cos(this.yaw) * 2));
          this.handles.push(g.effects.telegraph(c, 2.7, 0.32, { color: 0xff2020 }));
          g.audio.play('enemy_attack', { pos: this.position, pitch: 0.8 });
        }
        if (step < 3 && local >= 0.45 && local - dt / 0.75 < 0.45) {
          this.velocity.x += Math.sin(this.yaw) * 6;
          this.velocity.z += Math.cos(this.yaw) * 6;
          g.effects.slash(this.position.clone().setY(this.position.y + 1.4), this.yaw, { color: 0xff1a1a, radius: 3.6, arc: 2.6, width: 1.2, sweep: step % 2 ? -1 : 1, duration: 0.25 });
          g.audio.play('swing_heavy', { pos: this.position, pitch: 0.75 });
          meleeArc(g, this.position, this.yaw, 3.8, 2.4, (step === 2 ? 42 : 30) * this.damageMult, { source: 'enemy', attacker: this, knockback: step === 2 ? 9 : 4 });
        }
        this.velocity.multiplyScalar(0.92);
        if (this.stateT > 2.3) this.endAttack(1.6);
        break;
      }
      case 'charge': {
        if (this.stateT < 0.7) {
          action = { type: 'block', t: 0 };
          this.yaw = dampAngle(this.yaw, toYaw, 10, dt);
          if (this.once()) {
            g.audio.play('boss_laugh', { pos: this.position, pitch: 0.8 });
            g.effects.ring(this.position, { color: 0xff2020, radius: 3, duration: 0.7 });
          }
        } else if (this.stateT < 1.25) {
          action = { type: 'dash', t: 0 };
          if (!this.chargeDir) {
            this.chargeDir = V(Math.sin(this.yaw), 0, Math.cos(this.yaw));
            this.chargeHit = new Set();
            g.audio.play('dash', { pos: this.position });
          }
          this.velocity.set(this.chargeDir.x * 22, 0, this.chargeDir.z * 22);
          g.effects.burst(this.position.clone().setY(this.position.y + 1), { count: 3, color: 0xff1a1a, speed: 1, size: 0.4, life: 0.4, gravity: 0 });
          for (const t of enemyTargets(g)) {
            if (!this.chargeHit.has(t) && t.position.distanceTo(this.position) < 1.8) {
              this.chargeHit.add(t);
              meleeArc(g, this.position, this.yaw, 2.2, 6.3, 34 * this.damageMult, { source: 'enemy', attacker: this, knockback: 12, targets: [t] });
            }
          }
        } else {
          this.velocity.multiplyScalar(0.8);
          this.chargeDir = null;
          if (this.stateT > 1.6) this.endAttack(1.4);
        }
        break;
      }
      case 'lightning': {
        action = { type: 'castUp', t: Math.min(1, this.stateT / 1.2) };
        this.velocity.multiplyScalar(0.9);
        if (this.once() && tgt) {
          g.audio.play('pool_warn');
          const n = this.enraged ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const p = tgt.position.clone().add(i === 0 ? V() : V(rand(-5, 5), 0, rand(-5, 5)));
            p.y = g.area.groundHeight(p.x, p.z);
            this.telegraphCircle(p, 2.0, 1.1 + i * 0.15, () => {
              g.effects.pillar(p, { color: 0xff3030, radius: 0.7, height: 30, duration: 0.35, intensity: 4 });
              g.effects.burst(p.clone().setY(p.y + 0.3), { count: 20, color: 0xffa0a0, speed: 7, size: 0.15, life: 0.35, gravity: 2 });
              g.renderer.doFlash(0xff4040, 0.12, 6);
              g.audio.play('thunder', { pos: p, volume: 0.7 });
              radialDamage(g, p, 2.0, 32 * this.damageMult, { source: 'enemy', attacker: this, unblockable: true, knockback: 3 });
            }, 0xff3030);
          }
        }
        if (this.stateT > 1.6) this.endAttack(1.3);
        break;
      }
      case 'quake': {
        action = { type: 'heavy', t: Math.min(1, this.stateT / 1.3) };
        this.velocity.multiplyScalar(0.85);
        if (this.once()) this.handles.push(g.effects.telegraph(this.position.clone(), 7, 0.85, { color: 0xff2020 }));
        if (this.stateT >= 0.85 && this.stateT - dt < 0.85) {
          g.effects.ring(this.position, { color: 0xff2020, radius: 8, duration: 0.5, intensity: 3 });
          g.effects.disc(this.position, 6, { count: 50, color: 0x3a1010, smoke: true, up: 2, size: 1, life: 1 });
          g.cameraRig.shake(0.8);
          g.audio.play('hit_heavy', { pos: this.position });
          radialDamage(g, this.position, 7, 38 * this.damageMult, { source: 'enemy', attacker: this, knockback: 10 });
        }
        if (this.stateT > 1.5) this.endAttack(1.6);
        break;
      }
      // ── Nyxara ──
      case 'bats': {
        action = { type: 'cast', t: Math.min(1, this.stateT / 1.0) };
        this.velocity.multiplyScalar(0.9);
        this.yaw = dampAngle(this.yaw, toYaw, 6, dt);
        const count = this.enraged ? 9 : 6;
        for (let i = 0; i < count; i++) {
          const at = 0.5 + i * 0.12;
          if (this.stateT >= at && this.stateT - dt < at && tgt) {
            const a = this.yaw + (i - count / 2) * 0.35;
            const from = this.position.clone().add(V(Math.sin(a) * 0.8, 2.2, Math.cos(a) * 0.8));
            g.projectiles.spawn({ pos: from, dir: V(Math.sin(a), 0.4, Math.cos(a)), speed: 9, damage: 14 * this.damageMult, owner: 'enemy', color: 0x9a40ff, size: 0.2, life: 4, homing: 1.6, target: tgt });
            if (i === 0) g.audio.play('crow', { pos: this.position });
          }
        }
        if (this.stateT > 0.6 + count * 0.12 + 0.3) this.endAttack(1.2);
        break;
      }
      case 'nova': {
        action = { type: 'castUp', t: Math.min(1, this.stateT / 1.1) };
        this.velocity.multiplyScalar(0.85);
        if (this.once()) {
          g.audio.play('mage_cast', { pos: this.position, pitch: 0.7 });
          this.handles.push(g.effects.telegraph(this.position.clone(), 6.5, 1.0, { color: 0xa040ff }));
        }
        if (this.stateT >= 1.0 && this.stateT - dt < 1.0) {
          g.effects.ring(this.position, { color: 0xa040ff, radius: 7.5, duration: 0.5, intensity: 3 });
          g.effects.sphere(this.position.clone().setY(this.position.y + 1), { color: 0x9a40ff, radius: 6.5, duration: 0.45, opacity: 0.4 });
          g.audio.play('eclipse', { pos: this.position, volume: 0.7 });
          radialDamage(g, this.position, 6.5, 34 * this.damageMult, { source: 'enemy', attacker: this, knockback: 9, unblockable: true });
        }
        if (this.stateT > 1.4) this.endAttack(1.2);
        break;
      }
      case 'blink': {
        if (this.once()) {
          g.effects.burst(this.position.clone().setY(this.position.y + 1.2), { count: 40, color: 0x10051a, smoke: true, speed: 3, size: 1.1, life: 0.9, gravity: -0.5, grow: 0.8 });
          g.audio.play('boss_teleport', { pos: this.position });
          this.model.root.visible = false;
        }
        if (this.stateT >= 0.35 && !this.model.root.visible && tgt) {
          const a = rand(0, TAU);
          const dest = tgt.position.clone().add(V(Math.cos(a) * 9, 0, Math.sin(a) * 9));
          if (!g.area.collision.pointInside(dest.x, dest.z, 1, 0.8)) this.position.copy(dest);
          this.position.y = g.area.groundHeight(this.position.x, this.position.z);
          this.model.root.visible = true;
          g.effects.burst(this.position.clone().setY(this.position.y + 1.2), { count: 30, color: 0xa040ff, speed: 5, size: 0.22, life: 0.5, gravity: 0 });
          this.setState('bats');
        }
        break;
      }
      case 'lance': {
        action = { type: 'heavy', t: Math.min(1, this.stateT / 0.9) };
        this.yaw = dampAngle(this.yaw, toYaw, 8, dt);
        if (this.stateT >= 0.6 && this.stateT - dt < 0.6 && tgt) {
          for (let i = -1; i <= 1; i++) {
            const a = this.yaw + i * 0.12;
            const from = this.position.clone().add(V(Math.sin(a) * 0.8, 1.6, Math.cos(a) * 0.8));
            const aim = tgt.position.clone().add(V(0, 1, 0)).sub(from).normalize();
            g.projectiles.spawn({ pos: from, dir: V(Math.sin(a), aim.y, Math.cos(a)), speed: 24, damage: 26 * this.damageMult, owner: 'enemy', color: 0xc060ff, shape: 'lance', life: 2 });
          }
          g.audio.play('blade_throw', { pos: this.position, pitch: 0.8 });
        }
        if (this.stateT > 1.0) this.endAttack(1.0);
        break;
      }
      case 'drain': {
        action = { type: 'cast', t: 0.5 };
        this.velocity.multiplyScalar(0.85);
        if (this.once()) g.audio.play('soul_drain', { pos: this.position });
        if (tgt && dist < 14) {
          const from = this.position.clone().setY(this.position.y + 2);
          const to = tgt.position.clone().setY(tgt.position.y + 1.2);
          g.effects.stream(to, from, { color: 0xa040ff, count: 2, speed: 2, life: 0.4 });
          this.drainAcc = (this.drainAcc ?? 0) + dt;
          if (this.drainAcc > 0.4) {
            this.drainAcc = 0;
            radialDamage(g, tgt.position, 0.5, 8 * this.damageMult, { source: 'enemy', attacker: this, unblockable: true, targets: [tgt] });
            this.hp = Math.min(this.maxHp, this.hp + 20);
          }
        }
        if (this.stateT > 2.2) this.endAttack(1.3);
        break;
      }
      default:
        this.setState('idle');
    }
    const horiz = Math.hypot(this.velocity.x, this.velocity.z);
    this.model.update(dt, { speed: this.state === 'idle' ? horiz : 0, grounded: true, action, sprint: horiz > 6 });
    this.baseUpdate(dt);
  }

  endAttack(cd) {
    this.setState('idle');
    this.attackCd = cd * (this.enraged ? 0.7 : 1);
  }
}
