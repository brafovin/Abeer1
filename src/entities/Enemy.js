// Standard enemies with simple but readable AI: detect → pursue → telegraphed attack → recover.
import * as THREE from 'three';
import { createEnemyModel } from './models/EnemyModels.js';
import { meleeArc, enemyTargets } from '../combat/Combat.js';
import { angleDiff, clamp, damp, dampAngle, rand, yawTo } from '../core/utils.js';

export const ENEMY_TYPES = {
  crawler: {
    name: 'Blood Crawler', model: 'crawler', hp: 42, damage: 8, speed: 6.0, detect: 15, attackRange: 1.6, cooldown: 1.3,
    windup: 0.4, strike: 0.22, recover: 0.45, radius: 0.55, height: 0.7, xp: 14, poise: 0, lunge: 7, arc: 1.6, orb: 0.5,
    sound: 'crawler_screech', bloodColor: 0x6a0010,
  },
  knight: {
    name: 'Hollow Knight', model: 'knight', hp: 170, damage: 22, speed: 2.5, detect: 13, attackRange: 2.9, cooldown: 2.3,
    windup: 0.85, strike: 0.3, recover: 0.75, radius: 0.72, height: 2.1, xp: 45, poise: 30, arc: 1.8, blocks: true, blockChance: 0.55,
    orb: 0.8, sound: 'knight_clank', telegraph: true, bloodColor: 0x3a4a6a,
  },
  stalker: {
    name: 'Night Stalker', model: 'stalker', hp: 85, damage: 16, speed: 6.6, detect: 19, attackRange: 2.4, cooldown: 2.0,
    windup: 0.5, strike: 0.28, recover: 0.6, radius: 0.55, height: 2.4, xp: 35, poise: 12, lunge: 13, arc: 1.7, hidden: true,
    orb: 0.7, sound: 'stalker_shriek', telegraph: true, bloodColor: 0x20101a,
  },
  mage: {
    name: 'Blood Mage', model: 'mage', hp: 70, damage: 13, speed: 3.0, detect: 22, attackRange: 15, preferred: [7, 12], cooldown: 2.6,
    windup: 0.9, strike: 0.2, recover: 0.5, radius: 0.5, height: 2.0, xp: 35, poise: 8, ranged: true, blink: true, orb: 0.7,
    sound: 'mage_cast', bloodColor: 0x8a0018,
  },
};

let nextId = 1;

export class Enemy {
  constructor(game, type, x, z, opts = {}) {
    const def = ENEMY_TYPES[type];
    if (!def) throw new Error('Unknown enemy type ' + type);
    this.id = nextId++;
    this.game = game;
    this.type = type;
    this.def = def;
    this.name = opts.name ?? def.name;
    const lvl = opts.levelScale ?? 1;
    this.maxHp = Math.round(def.hp * lvl);
    this.hp = this.maxHp;
    this.damage = def.damage * (opts.damageScale ?? lvl);
    this.radius = def.radius;
    this.height = def.height;
    this.bloodColor = def.bloodColor;
    this.alive = true;
    this.hostile = true;
    this.model = createEnemyModel(opts.model ?? def.model);
    this.position = new THREE.Vector3(x, game.area.groundHeight(x, z), z);
    this.home = this.position.clone();
    this.velocity = new THREE.Vector3();
    this.impulse = new THREE.Vector3();
    this.yaw = opts.yaw ?? rand(0, Math.PI * 2);
    this.state = def.hidden ? 'hidden' : 'idle';
    this.stateT = 0;
    this.cooldown = rand(0.3, 1.2);
    this.target = null;
    this.alerted = !!opts.alerted;
    this.wanderTarget = null;
    this.wanderT = rand(1, 4);
    this.slowT = 0;
    this.slowF = 1;
    this.rootT = 0;
    this.blockT = 0;
    this.blinkCd = 0;
    this.losTimer = 0;
    this.deadT = 0;
    this.removeMe = false;
    this.group = opts.group ?? null;
    this.lungeDir = null;
    this.telegraphHandle = null;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw;
    if (def.hidden) this.model.setOpacity(0);
    game.scene.add(this.model.root);
  }

  get isBoss() {
    return false;
  }

  applyImpulse(x, z) {
    const resist = this.def.poise > 20 ? 0.35 : 1;
    this.impulse.x += x * resist;
    this.impulse.z += z * resist;
  }

  applySlow(factor, t) {
    this.slowF = Math.min(this.slowF, factor);
    this.slowT = Math.max(this.slowT, t);
  }

  applyRoot(t) {
    this.rootT = Math.max(this.rootT, t);
    if (this.state === 'windup') this.setState('recover');
  }

  stagger(t = 0.8) {
    if (!this.alive) return;
    this.setState('hurt');
    this.stateT = -t + 0.5;
    this.telegraphHandle?.cancel();
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  alert(target) {
    if (!this.alive) return;
    if (!this.alerted) {
      this.alerted = true;
      if (this.state === 'idle') this.game.audio.play(this.def.sound, { pos: this.position });
    }
    if (target) this.target = target;
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive || this.state === 'hidden') return { dealt: 0 };
    const from = opts.from;
    // Hollow Knights raise their shields against frontal blows
    if (this.def.blocks && from && !opts.guardBreak && ['idle', 'chase', 'block', 'recover'].includes(this.state)) {
      const toAttacker = yawTo(this.position.x, this.position.z, from.x, from.z);
      const facing = Math.abs(angleDiff(this.yaw, toAttacker)) < 1.1;
      if (facing && (this.blockT > 0 || Math.random() < this.def.blockChance)) {
        this.blockT = 1.2;
        this.yaw = toAttacker;
        amount = Math.round(amount * 0.15);
        this.hp -= amount;
        this.model.flashHit(0.3);
        this.alert(this.game.player);
        if (this.hp <= 0) return this.kill(opts, amount);
        return { dealt: amount, blocked: true };
      }
    }
    this.hp -= amount;
    this.model.flashHit(1);
    this.alert(opts.source === 'ally' && opts.attacker ? opts.attacker : this.game.player);
    if (this.hp <= 0) return this.kill(opts, amount);
    const poiseBreak = opts.stagger || amount > this.def.poise + 12;
    if (poiseBreak && this.state !== 'hurt' && (this.def.poise < 25 || opts.stagger)) {
      this.telegraphHandle?.cancel();
      this.setState('hurt');
    } else if (this.def.poise < 5 && this.state !== 'attack') {
      this.telegraphHandle?.cancel();
      this.setState('hurt');
      this.stateT = 0.2;
    }
    if (this.state !== 'hurt' && this.def.poise < 5) this.game.audio.play('enemy_hurt', { pos: this.position, volume: 0.6 });
    return { dealt: amount };
  }

  kill(opts, amount) {
    this.hp = 0;
    this.alive = false;
    this.setState('dead');
    this.telegraphHandle?.cancel();
    const g = this.game;
    g.audio.play('enemy_death', { pos: this.position });
    const c = this.position.clone().setY(this.position.y + this.height * 0.5);
    g.effects.burst(c, { count: 40, color: this.bloodColor ?? 0x8a0018, speed: 6, size: 0.22, life: 0.8, gravity: 8, colorVar: 0.3 });
    g.effects.burst(c, { count: 16, color: 0x150508, smoke: true, speed: 2, size: 0.9, life: 1.1, gravity: -0.5, grow: 0.8 });
    return { dealt: amount, killed: true };
  }

  /** Choose the nearest living target (player or ally) within detection range. */
  pickTarget() {
    const targets = enemyTargets(this.game);
    let best = null, bestD = Infinity;
    const range = this.alerted ? this.def.detect * 1.8 : this.def.detect;
    for (const t of targets) {
      const d = t.position.distanceTo(this.position) - (t.isPlayer ? 1.5 : 0);
      if (d < range && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    const def = this.def;
    this.stateT += dt;
    this.cooldown -= dt;
    this.blockT = Math.max(0, this.blockT - dt);
    this.blinkCd -= dt;
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.slowF = 1;
    }
    if (this.rootT > 0) this.rootT -= dt;

    let moveSpeed = 0;
    let moveDir = null;
    let action = this.state;
    let actionT = 0;

    if (this.state === 'dead') {
      this.deadT += dt;
      action = 'dead';
      actionT = Math.min(1, this.deadT / 1.2);
      if (this.deadT > 1.3) this.model.setOpacity(Math.max(0, 1 - (this.deadT - 1.3) / 0.8));
      if (this.deadT > 1.3) this.model.root.position.y -= dt * 0.6;
      if (this.deadT > 2.2) this.removeMe = true;
      this.model.update(dt, { speed: 0, action, t: actionT });
      return;
    }

    // perception (throttled)
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.25;
      const t = this.pickTarget();
      if (t) {
        const visible = this.alerted || g.area.collision.hasLineOfSight(this.position.x, this.position.z, t.position.x, t.position.z, 1.2);
        if (visible) {
          if (!this.alerted && this.state !== 'hidden') g.audio.play(def.sound, { pos: this.position, volume: 0.8 });
          this.alerted = true;
          this.target = t;
        }
      } else if (this.alerted && this.target && this.target.position.distanceTo(this.position) > def.detect * 2.2) {
        this.alerted = false;
        this.target = null;
      }
      if (this.target && !this.target.alive) this.target = this.pickTarget();
    }
    const tgt = this.target;
    const dist = tgt ? Math.hypot(tgt.position.x - this.position.x, tgt.position.z - this.position.z) : Infinity;
    const toYaw = tgt ? yawTo(this.position.x, this.position.z, tgt.position.x, tgt.position.z) : this.yaw;

    switch (this.state) {
      case 'hidden': {
        // Night Stalkers lurk invisible until something comes close, then emerge from the dark
        const p = g.player;
        if (p.alive && p.position.distanceTo(this.position) < 11) {
          this.setState('emerge');
          this.target = p;
          this.alerted = true;
          this.yaw = yawTo(this.position.x, this.position.z, p.position.x, p.position.z);
          g.audio.play('stalker_shriek', { pos: this.position });
          g.horror?.onStalkerEmerge(this);
          g.effects.burst(this.position.clone().setY(this.position.y + 1.2), { count: 30, color: 0x050208, smoke: true, speed: 2, size: 1.3, life: 1.2, gravity: -0.4, grow: 0.6 });
        }
        break;
      }
      case 'emerge':
        this.model.setOpacity(Math.min(1, this.stateT / 0.8));
        actionT = Math.min(1, this.stateT / 0.9);
        if (this.stateT > 0.9) {
          this.model.setOpacity(1);
          this.setState('chase');
          this.cooldown = 0.3;
        }
        break;
      case 'idle': {
        if (this.alerted && tgt) {
          this.setState('chase');
          break;
        }
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(2.5, 6);
          const a = rand(0, Math.PI * 2), r = rand(1, 4.5);
          this.wanderTarget = this.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        }
        if (this.wanderTarget && this.wanderTarget.distanceTo(this.position) > 0.6) {
          moveDir = this.wanderTarget.clone().sub(this.position).setY(0).normalize();
          moveSpeed = def.speed * 0.3;
        }
        break;
      }
      case 'chase': {
        if (!tgt) {
          this.setState('idle');
          this.wanderTarget = this.home.clone();
          break;
        }
        if (def.ranged) {
          const [near, far] = def.preferred;
          if (dist > far) {
            moveDir = new THREE.Vector3(Math.sin(toYaw), 0, Math.cos(toYaw));
            moveSpeed = def.speed;
          } else if (dist < near) {
            if (def.blink && this.blinkCd <= 0 && dist < 4) {
              this.blinkAway(tgt);
              break;
            }
            moveDir = new THREE.Vector3(-Math.sin(toYaw), 0, -Math.cos(toYaw));
            moveSpeed = def.speed * 0.8;
          } else {
            // strafe around the target
            const s = Math.sin(this.stateT * 0.8 + this.id) > 0 ? 1 : -1;
            moveDir = new THREE.Vector3(Math.cos(toYaw) * s, 0, -Math.sin(toYaw) * s);
            moveSpeed = def.speed * 0.5;
          }
          if (this.cooldown <= 0 && dist < def.attackRange && g.area.collision.hasLineOfSight(this.position.x, this.position.z, tgt.position.x, tgt.position.z, 1.4)) this.beginWindup();
        } else {
          if (dist > def.attackRange * 0.85) {
            moveDir = new THREE.Vector3(Math.sin(toYaw), 0, Math.cos(toYaw));
            moveSpeed = def.speed * (this.blockT > 0 ? 0.5 : 1);
          }
          const lungeRange = def.lunge ? def.attackRange + def.lunge * 0.3 : def.attackRange;
          if (this.cooldown <= 0 && dist < lungeRange) this.beginWindup();
        }
        this.yaw = dampAngle(this.yaw, toYaw, 8, dt);
        break;
      }
      case 'windup':
        if (tgt) this.yaw = dampAngle(this.yaw, toYaw, 10, dt);
        actionT = Math.min(1, this.stateT / def.windup);
        if (this.model.eyeMat) this.model.eyeMat.color.setScalar(1).multiplyScalar(1 + actionT * 3).multiply(new THREE.Color(1, 0.25, 0.3));
        if (this.stateT >= def.windup) {
          this.setState('attack');
          this.performAttack(tgt);
        }
        break;
      case 'attack':
        actionT = Math.min(1, this.stateT / def.strike);
        if (this.lungeDir) {
          moveDir = this.lungeDir;
          moveSpeed = def.lunge * (1 - actionT);
        }
        if (this.stateT >= def.strike) {
          this.lungeDir = null;
          this.setState('recover');
        }
        break;
      case 'recover':
        actionT = Math.min(1, this.stateT / def.recover);
        if (this.stateT >= def.recover) {
          this.cooldown = def.cooldown * rand(0.8, 1.25);
          this.setState(this.alerted ? 'chase' : 'idle');
          this.resetEyes();
        }
        break;
      case 'hurt':
        actionT = clamp(this.stateT / 0.45, 0, 1);
        if (this.stateT > 0.45) {
          this.setState('chase');
          this.cooldown = Math.max(this.cooldown, 0.4);
          this.resetEyes();
        }
        break;
      default:
        break;
    }

    // movement
    const rooted = this.rootT > 0;
    const spd = rooted ? 0 : moveSpeed * this.slowF;
    if (moveDir && spd > 0) {
      this.velocity.x = damp(this.velocity.x, moveDir.x * spd, 8, dt);
      this.velocity.z = damp(this.velocity.z, moveDir.z * spd, 8, dt);
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 10, dt);
      this.velocity.z = damp(this.velocity.z, 0, 10, dt);
    }
    // separation from other enemies
    for (const o of g.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z;
      const d2 = dx * dx + dz * dz;
      const rr = this.radius + o.radius;
      if (d2 < rr * rr && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        this.position.x += (dx / d) * (rr - d) * 0.5;
        this.position.z += (dz / d) * (rr - d) * 0.5;
      }
    }
    // keep a little distance from the player's body
    const p = g.player;
    if (p.alive) {
      const dx = this.position.x - p.position.x, dz = this.position.z - p.position.z;
      const d = Math.hypot(dx, dz);
      const rr = this.radius + p.radius;
      if (d < rr && d > 1e-4) {
        this.position.x += (dx / d) * (rr - d);
        this.position.z += (dz / d) * (rr - d);
      }
    }
    this.position.x += (this.velocity.x + this.impulse.x) * dt;
    this.position.z += (this.velocity.z + this.impulse.z) * dt;
    this.impulse.multiplyScalar(Math.max(0, 1 - dt * 6));
    g.area.collision.resolveCircle(this.position, this.radius, this.position.y);
    this.position.y = g.area.groundHeight(this.position.x, this.position.z);

    // model
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw;
    const horiz = Math.hypot(this.velocity.x, this.velocity.z);
    this.model.update(dt, { speed: horiz, action: action === 'chase' || action === 'idle' ? null : action, t: actionT, blocking: this.blockT > 0 });
  }

  resetEyes() {
    if (this.model.eyeMat && this.model.eyeMat.userData.base) this.model.eyeMat.color.copy(this.model.eyeMat.userData.base);
  }

  beginWindup() {
    const def = this.def;
    this.setState('windup');
    if (this.model.eyeMat && !this.model.eyeMat.userData.base) this.model.eyeMat.userData.base = this.model.eyeMat.color.clone();
    this.game.audio.play(def.ranged ? 'mage_cast' : this.type === 'knight' ? 'knight_clank' : 'enemy_attack', { pos: this.position, volume: 0.8 });
    if (def.telegraph) {
      const c = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * def.attackRange * 0.55, 0, Math.cos(this.yaw) * def.attackRange * 0.55));
      this.telegraphHandle = this.game.effects.telegraph(c, def.attackRange * 0.7, def.windup, { color: 0xff2030 });
    }
  }

  performAttack(tgt) {
    const def = this.def;
    const g = this.game;
    this.telegraphHandle = null;
    if (def.ranged) {
      if (!tgt) return;
      const from = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 0.6, 1.6, Math.cos(this.yaw) * 0.6));
      // lead the target slightly so standing still is punished but moving sideways dodges
      const aim = tgt.position.clone().add(new THREE.Vector3(0, 1.1, 0));
      const dir = aim.sub(from).normalize();
      g.projectiles.spawn({ pos: from, dir, speed: 13, damage: this.damage, owner: 'enemy', color: 0xff1a35, size: 0.24, life: 3 });
      g.audio.play('projectile', { pos: this.position });
      return;
    }
    if (def.lunge && tgt) {
      const d = tgt.position.clone().sub(this.position).setY(0);
      this.lungeDir = d.lengthSq() > 0.001 ? d.normalize() : null;
    }
    g.audio.play('enemy_attack', { pos: this.position, pitch: this.type === 'crawler' ? 1.4 : 0.9 });
    // the actual hit lands slightly into the strike so lunges can connect
    g.timers.after(def.strike * 0.5, () => {
      if (!this.alive || this.state === 'hurt') return;
      const hits = meleeArc(g, this.position, this.yaw, def.attackRange + 0.3, def.arc, this.damage, { source: 'enemy', attacker: this, knockback: this.type === 'knight' ? 6 : 3 });
      if (this.type === 'knight') {
        g.effects.ring(this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 1.6, 0, Math.cos(this.yaw) * 1.6)), { color: 0x8fb0ff, radius: 2.2, duration: 0.3 });
        if (hits.length) g.cameraRig.shake(0.35);
      }
    });
  }

  blinkAway(tgt) {
    const g = this.game;
    this.blinkCd = 5;
    const away = this.position.clone().sub(tgt.position).setY(0).normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(rand(-1, 1));
    const dest = this.position.clone().addScaledVector(away.add(side).normalize(), 7);
    if (g.area.collision.pointInside(dest.x, dest.z, 1, 0.5)) return;
    g.effects.burst(this.position.clone().setY(this.position.y + 1), { count: 24, color: 0xff1a35, speed: 4, size: 0.2, life: 0.4, gravity: 0 });
    this.position.copy(dest);
    g.effects.burst(this.position.clone().setY(this.position.y + 1), { count: 24, color: 0xff1a35, speed: 4, size: 0.2, life: 0.4, gravity: 0 });
    g.audio.play('boss_teleport', { pos: this.position, volume: 0.5 });
    this.cooldown = Math.min(this.cooldown, 0.6);
  }

  dispose() {
    this.telegraphHandle?.cancel();
    this.game.scene.remove(this.model.root);
    this.model.dispose();
  }
}
