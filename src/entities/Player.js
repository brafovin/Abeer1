// The player character: movement, combat input, stats, progression and damage handling.
import * as THREE from 'three';
import { CHARACTERS } from './characters.js';
import { createHeroModel } from './models/CharacterModels.js';
import { ABILITIES, performHeavy } from '../combat/Abilities.js';
import { meleeArc, findTarget, knockback } from '../combat/Combat.js';
import { clamp, damp, dampAngle, angleDiff, yawTo } from '../core/utils.js';

export const EMPTY_MODS = () => ({ damage: 0, maxHp: 0, lifesteal: 0, speed: 0, cdr: 0, bloodRegen: 0, defense: 0, crit: 0, maxBlood: 0, xp: 0 });

export function xpForLevel(level) {
  return Math.round(90 + (level - 1) * 70 + Math.pow(level - 1, 2) * 12);
}

export class Player {
  constructor(game, charId, cosmetic = 'default') {
    this.game = game;
    this.charId = CHARACTERS[charId] ? charId : 'lucien';
    this.def = CHARACTERS[this.charId];
    this.cosmetic = cosmetic;
    this.model = createHeroModel(this.charId, cosmetic);
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.impulse = new THREE.Vector3();
    this.moveInput = new THREE.Vector3();
    this.yaw = 0;
    this.aimYaw = 0;
    this.grounded = true;
    this.radius = 0.42;
    this.height = 1.8;
    this.alive = true;
    this.isPlayer = true;
    this.bloodColor = 0x9a0018;

    // progression
    this.level = 1;
    this.xp = 0;
    this.statPoints = 0;
    this.attributes = { vitality: 0, strength: 0, agility: 0, blood: 0 };
    this.bonusMaxBlood = 0; // permanent upgrades from quests
    this.mods = EMPTY_MODS();

    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.blood = 50;

    // combat state
    this.action = null;
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.attackQueued = false;
    this.cooldowns = { q: 0, e: 0, r: 0, t: 0 };
    this.invulnT = 0;
    this.drT = 0;
    this.drAmount = 0;
    this.guardTimer = 0;
    this.guardFlash = 0;
    this.blocking = false;
    this.blockTime = 0;
    this.staminaDelay = 0;
    this.dash = null;
    this.hurtCooldown = 0;
    this.lastDamageT = 99;
    this.stepDist = 0;
    this.actionIndexOverride = null;
    this.combatTimer = 0;
    this.slashColor = this.charId === 'kairo' ? 0x9fd0ff : this.charId === 'seraphina' ? 0xff1a3a : 0xff1030;
  }

  // ── derived stats ──────────────────────────────────────────────────────────────────────────────
  get maxHp() {
    return Math.round(this.def.base.hp + this.attributes.vitality * 15 + (this.level - 1) * 8 + this.mods.maxHp);
  }
  get maxStamina() {
    return Math.round(this.def.base.stamina + this.attributes.agility * 8);
  }
  get maxBlood() {
    return Math.round(this.def.base.blood + this.attributes.blood * 10 + this.bonusMaxBlood + this.mods.maxBlood);
  }
  get damageMult() {
    return this.def.base.damage * (1 + this.attributes.strength * 0.07 + (this.level - 1) * 0.03) * (1 + this.mods.damage);
  }
  get moveSpeed() {
    return this.def.base.speed * (1 + this.attributes.agility * 0.02 + this.mods.speed);
  }
  get cooldownMult() {
    return Math.max(0.4, 1 - this.mods.cdr - this.attributes.blood * 0.015);
  }
  get guardActive() {
    return this.guardTimer > 0;
  }
  get inCombat() {
    return this.combatTimer > 0;
  }

  refreshMods() {
    const m = EMPTY_MODS();
    const sources = [this.game.inventory?.relicMods?.(), this.game.powers?.mods?.()];
    for (const s of sources) if (s) for (const k in m) m[k] += s[k] ?? 0;
    this.mods = m;
    this.hp = Math.min(this.hp, this.maxHp);
    this.blood = Math.min(this.blood, this.maxBlood);
  }

  spawnAt(x, z, yaw = 0) {
    this.position.set(x, this.game.area.groundHeight(x, z), z);
    this.velocity.set(0, 0, 0);
    this.impulse.set(0, 0, 0);
    this.yaw = yaw;
    this.aimYaw = yaw;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = yaw;
  }

  invulnerable(t) {
    this.invulnT = Math.max(this.invulnT, t);
  }

  damageReduction(t, amount) {
    this.drT = Math.max(this.drT, t);
    this.drAmount = Math.max(this.drAmount, amount);
  }

  setAction(type, duration, opts = {}) {
    this.action = { type, duration, t: 0, fired: false, index: opts.index ?? 0, ...opts };
  }

  lungeImpulse(strength) {
    this.impulse.x += Math.sin(this.yaw) * strength;
    this.impulse.z += Math.cos(this.yaw) * strength;
  }

  applyImpulse(x, z) {
    this.impulse.x += x * 0.6;
    this.impulse.z += z * 0.6;
  }

  heal(amount, silent = false) {
    if (!this.alive) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (!silent && this.hp > before) {
      this.game.ui.damageNumber(this.position.clone().setY(this.position.y + 2), '+' + Math.round(this.hp - before), 'heal');
    }
  }

  gainBlood(n) {
    this.blood = Math.min(this.maxBlood, this.blood + n);
  }

  gainXp(n) {
    n = Math.round(n * (1 + this.mods.xp));
    this.xp += n;
    let leveled = false;
    while (this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      this.statPoints += 2;
      leveled = true;
    }
    if (leveled) {
      this.hp = this.maxHp;
      this.stamina = this.maxStamina;
      this.game.onLevelUp(this.level);
    }
    return n;
  }

  spendPoint(attr) {
    if (this.statPoints <= 0 || !(attr in this.attributes)) return false;
    this.attributes[attr]++;
    this.statPoints--;
    if (attr === 'vitality') this.hp += 15;
    if (attr === 'blood') this.blood += 10;
    return true;
  }

  // ── damage ─────────────────────────────────────────────────────────────────────────────────────
  takeDamage(amount, opts = {}) {
    if (!this.alive) return { dealt: 0 };
    if (this.invulnT > 0) return { dealt: 0, dodged: true };
    let dmg = amount;
    let blocked = false;
    const from = opts.from;
    if (this.blocking && from) {
      const toAttacker = yawTo(this.position.x, this.position.z, from.x, from.z);
      if (Math.abs(angleDiff(this.yaw, toAttacker)) < 1.3) {
        if (this.blockTime < 0.25 && !opts.projectile && !opts.unblockable) {
          // parry!
          this.game.audio.play('block', { pitch: 1.3 });
          this.game.effects.ring(this.position, { color: 0xbfe0ff, radius: 2.4, duration: 0.3 });
          this.game.ui.damageNumber(this.position.clone().setY(this.position.y + 2), 'PARRY', 'crit');
          opts.attacker?.stagger?.(1.2);
          this.gainBlood(15);
          return { dealt: 0, blocked: true };
        }
        dmg *= opts.unblockable ? 0.6 : 0.2;
        this.stamina = Math.max(0, this.stamina - amount * 0.6);
        this.staminaDelay = 0.8;
        blocked = true;
        if (this.stamina <= 0) {
          this.blocking = false;
          this.setAction('hurt', 0.6, { lockMove: true });
        }
      }
    }
    if (this.guardTimer > 0) {
      dmg *= 0.25;
      this.guardFlash = 1;
    }
    if (this.drT > 0) dmg *= 1 - this.drAmount;
    // brief grace window after a hit so multi-hit bursts (volleys, overlapping pools) can't one-shot you
    if (this.graceT > 0) dmg *= 0.35;
    dmg *= 1 - Math.min(0.6, this.mods.defense);
    if (this.game.powers) dmg = this.game.powers.absorb(dmg);
    if (dmg <= 0) {
      this.game.ui.damageNumber(this.position.clone().setY(this.position.y + 2), 'ABSORB', 'heal');
      return { dealt: 0, blocked: true };
    }
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    if (!blocked) this.graceT = 0.35;
    this.lastDamageT = 0;
    this.combatTimer = 6;
    const g = this.game;
    g.onPlayerDamaged(dmg, blocked);
    if (!blocked && dmg > this.maxHp * 0.07 && this.hurtCooldown <= 0 && !(this.action && this.action.lockMove && this.action.type !== 'hurt')) {
      this.setAction('hurt', 0.35);
      this.hurtCooldown = 1.0;
      if (from) knockback(this, from, opts.knockback ?? 3);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return { dealt: dmg, killed: true };
    }
    return { dealt: dmg, blocked };
  }

  die() {
    this.alive = false;
    this.blocking = false;
    this.setAction('dead', 3, { lockMove: true });
    this.game.onPlayerDeath();
  }

  revive() {
    this.alive = true;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.blood = Math.max(this.blood, 40);
    this.action = null;
    this.invulnT = 2;
    this.guardTimer = 0;
    this.cooldowns = { q: 0, e: 0, r: 0, t: 0 };
    this.model.root.visible = true;
  }

  // ── abilities ──────────────────────────────────────────────────────────────────────────────────
  tryAbility(slot) {
    const def = this.def.abilities[slot];
    const g = this.game;
    if (!def || !this.alive) return;
    if (this.action && this.action.lockMove && this.action.type !== 'attack') return;
    if (this.cooldowns[slot] > 0) {
      g.ui.flashSlot(slot, 'cooldown');
      return;
    }
    if (this.blood < def.cost) {
      g.ui.flashSlot(slot, 'blood');
      g.ui.toast('Not enough Blood Energy.', 'warn');
      return;
    }
    const fn = ABILITIES[def.id];
    if (!fn) {
      console.error('[Player] Missing ability implementation:', def.id);
      return;
    }
    this.aimYaw = g.cameraRig.yaw;
    if (fn(g, this)) {
      this.blood -= def.cost;
      this.cooldowns[slot] = def.cooldown * this.cooldownMult;
      this.combatTimer = 6;
      g.ui.flashSlot(slot, 'used');
      g.tutorial?.notify('ability');
    }
  }

  startAttack() {
    const combo = this.def.combo;
    const idx = this.comboTimer > 0 ? (this.comboIndex + 1) % combo.length : 0;
    const atk = combo[idx];
    if (this.stamina < atk.stamina * 0.5) {
      this.game.ui.flashBar('stamina');
      return;
    }
    this.stamina -= atk.stamina;
    this.staminaDelay = 0.6;
    this.comboIndex = idx;
    this.comboTimer = atk.duration + 0.45;
    // aim: auto-assist toward an enemy in front of the camera
    this.aimYaw = this.game.cameraRig.yaw;
    const assist = findTarget(this.game, this.position, this.aimYaw, 5, 0.9);
    this.yaw = assist ? yawTo(this.position.x, this.position.z, assist.position.x, assist.position.z) : this.aimYaw;
    const dist = assist ? assist.position.distanceTo(this.position) : 99;
    this.lungeImpulse(dist > 1.6 ? atk.lunge : atk.lunge * 0.25);
    this.combatTimer = 6;
    this.setAction('attack', atk.duration, {
      index: idx,
      at: atk.active,
      onActive: () => {
        const g = this.game;
        g.audio.play('swing', { pitch: 0.9 + idx * 0.08 });
        const c = this.position.clone().setY(this.position.y + 1.05);
        const sweep = idx % 2 === 0 ? 1 : -1;
        const tilt = this.def.style === 'sword' && idx === 2 ? Math.PI / 2 - 0.2 : sweep * 0.25;
        g.effects.slash(c, this.yaw, { color: this.slashColor, radius: atk.range * 0.9, arc: Math.min(atk.arc, 3.6), sweep, tilt, duration: 0.24 });
        if (atk.arc > 6) g.effects.ring(this.position, { color: this.slashColor, radius: atk.range, duration: 0.3, opacity: 0.6 });
        const hits = meleeArc(g, this.position, this.yaw, atk.range, atk.arc, atk.damage * this.damageMult, { source: 'player', stagger: !!atk.stagger, knockback: atk.knockback ?? 1.5, shake: atk.stagger ? 0.2 : 0.08 });
        for (const h of hits) knockback(h, this.position, atk.knockback ?? 1.2);
        if (hits.length) g.tutorial?.notify('attack');
      },
    });
  }

  useVial() {
    const g = this.game;
    if (!this.alive) return;
    if (this.hp >= this.maxHp) {
      g.ui.toast('You are already at full health.', 'info');
      return;
    }
    if (!g.inventory.consume('blood_vial')) {
      g.ui.toast('No Blood Vials left.', 'warn');
      return;
    }
    const amount = Math.round(this.maxHp * 0.45);
    this.heal(amount);
    g.audio.play('heal');
    g.effects.disc(this.position, 1.2, { count: 30, color: 0xff2040, up: 2.5, size: 0.18, life: 0.9 });
  }

  // ── update ─────────────────────────────────────────────────────────────────────────────────────
  update(dt, input) {
    const g = this.game;
    const area = g.area;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.drT = Math.max(0, this.drT - dt);
    if (this.drT <= 0) this.drAmount = 0;
    this.guardTimer = Math.max(0, this.guardTimer - dt);
    this.guardFlash = Math.max(0, this.guardFlash - dt * 3);
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.graceT = Math.max(0, (this.graceT ?? 0) - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.combatTimer = Math.max(0, this.combatTimer - dt);
    this.lastDamageT += dt;
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);

    // action progression
    const a = this.action;
    if (a) {
      a.t += dt;
      if (a.at !== undefined && !a.fired && a.t >= a.duration * a.at) {
        a.fired = true;
        try {
          a.onActive?.();
        } catch (err) {
          console.error('[Player] action failed', err);
        }
      }
      if (a.t >= a.duration && a.type !== 'dead') this.action = null;
    }

    const alive = this.alive;
    const canControl = alive && input.enabled;
    const locked = this.action && (this.action.lockMove || this.action.type === 'dead');

    // ── movement input relative to camera
    const camYaw = g.cameraRig.yaw;
    let mx = 0, mz = 0;
    if (canControl) {
      if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) mx += 1;
      if (input.down('KeyD') || input.down('ArrowRight')) mx -= 1;
    }
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    this.moveInput.set(0, 0, 0).addScaledVector(fwd, mz).addScaledVector(right, -mx);
    if (this.moveInput.lengthSq() > 1) this.moveInput.normalize();
    const moving = this.moveInput.lengthSq() > 0.01;
    if (moving) g.tutorial?.notify('move');

    // ── blocking (Kairo)
    const blockStyle = this.def.heavy.type === 'block';
    const wantBlock = blockStyle && canControl && input.mouseDown(2) && this.stamina > 1 && (!this.action || this.action.type === 'hurt');
    if (wantBlock && !this.blocking) this.blockTime = 0;
    this.blocking = wantBlock;
    if (this.blocking) {
      this.blockTime += dt;
      this.yaw = dampAngle(this.yaw, camYaw, 18, dt);
    }

    // ── sprint & stamina
    const sprinting = canControl && moving && (input.down('ShiftLeft') || input.down('ShiftRight'));
    const canSprint = sprinting && this.stamina > 2 && !this.blocking && !locked;
    if (canSprint) {
      this.stamina -= 16 * dt;
      this.staminaDelay = 0.5;
    }
    this.staminaDelay = Math.max(0, this.staminaDelay - dt);
    if (this.staminaDelay <= 0 && !this.blocking) this.stamina = Math.min(this.maxStamina, this.stamina + 30 * dt);
    // blood energy slowly regenerates (faster out of combat)
    this.blood = Math.min(this.maxBlood, this.blood + (this.inCombat ? 1.2 : 3) * dt + this.mods.bloodRegen * dt);
    // health regenerates slowly when out of combat
    if (alive && this.lastDamageT > 7 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.015 * dt);

    // ── combat inputs
    if (canControl) {
      const atkPressed = input.mouseJustPressed(0);
      if (atkPressed) this.attackQueued = 0.35;
      if (this.attackQueued > 0) {
        this.attackQueued -= dt;
        const cur = this.action;
        const ready = !cur || (cur.type === 'attack' && cur.t > cur.duration * 0.62 && !cur.loopAttacks);
        if (ready && !this.blocking) {
          this.attackQueued = 0;
          this.startAttack();
        }
      }
      if (!blockStyle && input.mouseJustPressed(2) && (!this.action || (this.action.type === 'attack' && this.action.t > this.action.duration * 0.5))) {
        const def = this.def.heavy;
        if (this.stamina >= def.stamina * 0.6) {
          this.stamina -= def.stamina;
          this.staminaDelay = 0.8;
          this.aimYaw = camYaw;
          const assist = findTarget(g, this.position, camYaw, 6, 0.8);
          this.yaw = assist ? yawTo(this.position.x, this.position.z, assist.position.x, assist.position.z) : camYaw;
          this.combatTimer = 6;
          performHeavy(g, this, def);
        } else g.ui.flashBar('stamina');
      }
      if (input.justPressed('KeyQ')) this.tryAbility('q');
      if (input.justPressed('KeyE')) this.tryAbility('e');
      if (input.justPressed('KeyR')) this.tryAbility('r');
      if (input.justPressed('KeyT')) g.powers?.castActive(this);
      if (input.justPressed('Digit1') || input.justPressed('KeyH')) this.useVial();
    }

    // ── velocity
    const speedMul = this.blocking ? 0.4 : canSprint ? 1.65 : 1;
    let targetSpeed = moving && !locked ? this.moveSpeed * speedMul : 0;
    if (this.action && this.action.type === 'attack') targetSpeed *= 0.25;
    if (this.action && (this.action.type === 'heavy' || this.action.type === 'cast')) targetSpeed *= 0.15;
    const desired = this.moveInput.clone().multiplyScalar(targetSpeed);
    const accel = this.grounded ? 14 : 4;
    this.velocity.x = damp(this.velocity.x, desired.x, accel, dt);
    this.velocity.z = damp(this.velocity.z, desired.z, accel, dt);

    if (this.dash && this.dash.time > 0) {
      this.velocity.x = this.dash.dir.x * this.dash.speed;
      this.velocity.z = this.dash.dir.z * this.dash.speed;
      this.dash.time -= dt;
      if (this.dash.time <= 0) {
        this.dash = null;
        this.velocity.x *= 0.15;
        this.velocity.z *= 0.15;
      }
    }

    // jump
    if (canControl && this.grounded && !locked && input.justPressed('Space') && this.stamina >= 8 && !this.blocking) {
      this.velocity.y = 8.2;
      this.grounded = false;
      this.stamina -= 8;
      this.staminaDelay = 0.4;
      g.audio.play('jump');
    }
    if (this.action && this.action.type === 'levitate') {
      this.velocity.y = 0;
      this.position.y = damp(this.position.y, area.groundHeight(this.position.x, this.position.z) + 1.0, 4, dt);
    } else {
      this.velocity.y -= 24 * dt;
    }

    // integrate
    this.position.x += (this.velocity.x + this.impulse.x) * dt;
    this.position.z += (this.velocity.z + this.impulse.z) * dt;
    this.position.y += this.velocity.y * dt;
    this.impulse.multiplyScalar(Math.max(0, 1 - dt * 7));

    const ground = area.groundHeight(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      if (!this.grounded && this.velocity.y < -6) {
        g.audio.play('land');
        if (this.velocity.y < -14) g.cameraRig.shake(0.2);
      }
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.position.y > ground + 0.05) {
      this.grounded = false;
    }
    area.collision.resolveCircle(this.position, this.radius, this.position.y);

    // facing
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!this.blocking && !(this.action && this.action.type !== 'hurt')) {
      if (horizSpeed > 0.4 && moving) this.yaw = dampAngle(this.yaw, Math.atan2(this.velocity.x, this.velocity.z), 12, dt);
    }

    // footsteps
    if (this.grounded && horizSpeed > 0.5) {
      this.stepDist += horizSpeed * dt;
      const stride = canSprint ? 2.1 : 1.55;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        g.audio.footstep(area.env.surface);
      }
    }

    // ── model
    const m = this.model;
    m.root.position.copy(this.position);
    m.root.rotation.y = this.yaw;
    let animAction = null;
    if (this.action) {
      const t = this.action.t / this.action.duration;
      let idx = this.action.index ?? 0;
      if (this.actionIndexOverride !== null && this.actionIndexOverride !== undefined) idx = this.actionIndexOverride;
      animAction = { type: this.action.type, index: idx, t: this.action.loopAttacks ? (this.action.t * 3) % 1 : t };
    } else if (this.blocking) animAction = { type: 'block', t: 0 };
    m.update(dt, { speed: horizSpeed, sprint: canSprint, grounded: this.grounded, vy: this.velocity.y, action: animAction, dead: !alive });
  }

  serialize() {
    return {
      level: this.level,
      xp: this.xp,
      statPoints: this.statPoints,
      attributes: { ...this.attributes },
      bonusMaxBlood: this.bonusMaxBlood,
      hp: Math.round(this.hp),
      blood: Math.round(this.blood),
    };
  }

  load(data) {
    if (!data) return;
    this.level = data.level ?? 1;
    this.xp = data.xp ?? 0;
    this.statPoints = data.statPoints ?? 0;
    this.attributes = { vitality: 0, strength: 0, agility: 0, blood: 0, ...(data.attributes || {}) };
    this.bonusMaxBlood = data.bonusMaxBlood ?? 0;
    this.refreshMods();
    this.hp = Math.min(this.maxHp, data.hp ?? this.maxHp);
    if (this.hp <= 0) this.hp = this.maxHp;
    this.blood = Math.min(this.maxBlood, data.blood ?? 50);
    this.stamina = this.maxStamina;
  }

  dispose() {
    this.model.dispose();
  }
}
