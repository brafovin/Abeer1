// Stolen vampire powers: every vampire of the court carries one. Kill them to take it.
// Passives stack (with diminishing returns); one power can be equipped as an active on [T].
// Dying makes you lose EVERY stolen power.
import * as THREE from 'three';
import { radialDamage, playerTargets, enemyTargets, dealDamage, meleeArc } from '../combat/Combat.js';
import { rand, TAU } from '../core/utils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const POWERS = {
  blood_bolt: { name: 'Blood Bolt', color: '#ff2a3a', passive: { damage: 0.05 }, cd: 9, desc: 'Fire three homing bolts of blood.', passiveText: '+5% damage' },
  mist_step: { name: 'Mist Step', color: '#c8c8e0', passive: { speed: 0.05 }, cd: 14, desc: 'Become mist: invulnerable and swift for 2.5s.', passiveText: '+5% move speed' },
  bat_swarm: { name: 'Bat Swarm', color: '#9a40ff', passive: { lifesteal: 0.025 }, cd: 16, desc: 'A storm of bats shreds everything around you for 4s.', passiveText: '+2.5% lifesteal' },
  frost_fang: { name: 'Frost Fang', color: '#7fd8ff', passive: { defense: 0.05 }, cd: 15, desc: 'Frost nova: damages and slows all enemies within 6m.', passiveText: '+5% damage reduction' },
  hellfire: { name: 'Hellfire', color: '#ff7a1a', passive: { damage: 0.06 }, cd: 18, desc: 'A ring of hellfire erupts around you.', passiveText: '+6% damage' },
  shadow_claw: { name: 'Shadow Claw', color: '#6a40a0', passive: { crit: 0.04 }, cd: 8, desc: 'Three shadow claws rake the area in front of you.', passiveText: '+4% critical chance' },
  iron_blood: { name: 'Iron Blood', color: '#a0a8b8', passive: { maxHp: 20 }, cd: 20, desc: 'Harden your blood: take 60% less damage for 5s.', passiveText: '+20 max health' },
  crimson_hunger: { name: 'Crimson Hunger', color: '#d0102a', passive: { bloodRegen: 1.2 }, cd: 18, desc: 'Drain every enemy within 7m and heal from it.', passiveText: '+1.2 blood energy/s' },
  moon_veil: { name: 'Moon Veil', color: '#b0c8ff', passive: { cdr: 0.04 }, cd: 50, desc: 'Instantly refresh your Q, E and R cooldowns.', passiveText: '-4% ability cooldowns' },
  thunder_vein: { name: 'Thunder Vein', color: '#ffe060', passive: { damage: 0.03, speed: 0.03 }, cd: 14, desc: 'Call five lightning strikes down on nearby enemies.', passiveText: '+3% damage, +3% speed' },
  beast_rage: { name: 'Beast Rage', color: '#ff4040', passive: { crit: 0.03, damage: 0.03 }, cd: 24, desc: 'Frenzy: +40% damage and +20% speed for 6s.', passiveText: '+3% crit, +3% damage' },
  blood_shield: { name: 'Blood Shield', color: '#ff6080', passive: { defense: 0.03, maxBlood: 8 }, cd: 16, desc: 'A shield of blood that absorbs the next 70 damage.', passiveText: '+3% defence, +8 max blood' },
  // the Sovereigns' unique gifts
  sovereign_wrath: { name: 'Sovereign\'s Wrath', color: '#ff1010', passive: { damage: 0.25, maxHp: 60 }, cd: 20, desc: 'Crimson lightning storms the battlefield around you.', passiveText: '+25% damage, +60 max health', unique: true },
  empress_night: { name: 'Empress of Night', color: '#b040ff', passive: { lifesteal: 0.08, cdr: 0.12 }, cd: 22, desc: 'A blood nova that heals you for every enemy struck.', passiveText: '+8% lifesteal, -12% cooldowns', unique: true },
};

export const POWER_ORDER = ['blood_bolt', 'mist_step', 'bat_swarm', 'frost_fang', 'hellfire', 'shadow_claw', 'iron_blood', 'crimson_hunger', 'moon_veil', 'thunder_vein', 'beast_rage', 'blood_shield'];

const CAPS = { damage: 1.5, maxHp: 400, lifesteal: 0.25, speed: 0.4, cdr: 0.35, bloodRegen: 8, defense: 0.5, crit: 0.4, maxBlood: 80, xp: 1 };

export const tierOf = (level) => 1 + Math.min(3, Math.floor((level ?? 1) / 10));

export class PowerSystem {
  constructor(game) {
    this.game = game;
    this.stolen = []; // { power, from, level }
    this.equipped = -1;
    this.cooldown = 0;
    this.rageT = 0;
    this.shield = 0;
    this._mods = null;
  }

  get count() {
    return this.stolen.length;
  }

  add(power, from, level) {
    if (!POWERS[power]) return;
    this.stolen.push({ power, from, level });
    this.equipped = this.stolen.length - 1;
    this._mods = null;
    this.game.player?.refreshMods();
  }

  clearAll() {
    const n = this.stolen.length;
    this.stolen = [];
    this.equipped = -1;
    this.cooldown = 0;
    this.rageT = 0;
    this.shield = 0;
    this._mods = null;
    this.game.player?.refreshMods();
    return n;
  }

  equip(index) {
    if (index >= -1 && index < this.stolen.length) this.equipped = index;
  }

  get active() {
    return this.equipped >= 0 ? this.stolen[this.equipped] : null;
  }

  /** Aggregated passive modifiers with diminishing returns. */
  mods() {
    if (!this._mods) {
      const raw = {};
      for (const s of this.stolen) {
        const def = POWERS[s.power];
        const tier = def.unique ? 1 : tierOf(s.level);
        for (const k in def.passive) raw[k] = (raw[k] ?? 0) + def.passive[k] * (def.unique ? 1 : 0.6 + tier * 0.4);
      }
      const out = {};
      for (const k in raw) {
        const cap = CAPS[k] ?? 1;
        out[k] = cap * (1 - Math.exp(-raw[k] / cap));
      }
      this._mods = out;
    }
    const m = { ...this._mods };
    if (this.rageT > 0) {
      m.damage = (m.damage ?? 0) + 0.4;
      m.speed = (m.speed ?? 0) + 0.2;
    }
    return m;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.rageT > 0) {
      this.rageT -= dt;
      if (this.rageT <= 0) this.game.player?.refreshMods();
    }
  }

  /** Called by the player when damage would be taken; returns remaining damage. */
  absorb(dmg) {
    if (this.shield <= 0) return dmg;
    const used = Math.min(this.shield, dmg);
    this.shield -= used;
    return dmg - used;
  }

  castActive(player) {
    const g = this.game;
    const s = this.active;
    if (!s) {
      g.ui.toast(this.stolen.length ? 'Equip a stolen power in the Powers tab.' : 'You have not stolen any vampire powers yet. Defeat a vampire of the court to take theirs.', 'info');
      return;
    }
    if (this.cooldown > 0) {
      g.ui.flashSlot('t', 'cooldown');
      return;
    }
    const def = POWERS[s.power];
    const tier = def.unique ? 4 : tierOf(s.level);
    const mult = player.damageMult * (0.8 + tier * 0.2);
    const ok = this.cast(s.power, player, mult, def);
    if (ok !== false) {
      this.cooldown = def.cd * player.cooldownMult;
      g.ui.flashSlot('t', 'used');
    }
  }

  /** Power effects — also used by allied court vampires (caster = ally entity). */
  cast(power, caster, mult, def = POWERS[power], opts = {}) {
    const g = this.game;
    const source = opts.source ?? 'player';
    const pos = caster.position;
    const color = new THREE.Color(def.color).getHex();
    const isPlayer = source === 'player';
    const foesOf = () => (source === 'enemy' ? enemyTargets(g) : playerTargets(g));
    if (isPlayer) caster.setAction?.('cast', 0.45);
    g.audio.play('mage_cast', { pos, pitch: 1.2 });
    switch (power) {
      case 'blood_bolt': {
        const targets = foesOf().filter((t) => t.position.distanceTo(pos) < 20);
        for (let i = 0; i < 3; i++) {
          const a = caster.yaw + (i - 1) * 0.3;
          g.projectiles.spawn({ pos: pos.clone().add(V(Math.sin(a) * 0.6, 1.5, Math.cos(a) * 0.6)), dir: V(Math.sin(a), 0.1, Math.cos(a)), speed: 16, damage: 30 * mult, owner: source, color, homing: 3, target: targets[i % Math.max(1, targets.length)] ?? null, life: 2.5 });
        }
        g.audio.play('blade_throw', { pos });
        break;
      }
      case 'mist_step':
        if (isPlayer) {
          caster.invulnerable(2.5);
          caster.damageReduction(2.5, 1);
          this.rageT = Math.max(this.rageT, 0.01);
          caster.mistT = 2.5;
        }
        g.effects.burst(pos.clone().setY(pos.y + 1), { count: 50, color: 0xc8c8e0, smoke: true, speed: 3, size: 1, life: 1.2, gravity: -0.3, grow: 1 });
        g.audio.play('blink', { pos });
        break;
      case 'bat_swarm': {
        g.audio.play('crow', { pos });
        let ticks = 0;
        g.timers.during(4, (t) => {
          const c = caster.position;
          for (let i = 0; i < 3; i++) {
            const a = rand(0, TAU), r = rand(1, 4.5);
            g.effects.burst(c.clone().add(V(Math.cos(a) * r, rand(0.8, 2.5), Math.sin(a) * r)), { count: 1, color: 0x2a1040, smoke: true, speed: 4, size: 0.35, life: 0.4, gravity: 0 });
          }
          const want = Math.floor(t * 8);
          while (ticks < want) {
            ticks++;
            const hits = radialDamage(g, c, 4.5, 9 * mult, { source, kind: 'ability', noHitStop: true, silent: ticks % 2 === 0 });
            if (isPlayer && hits.length) caster.heal(hits.length * 2, true);
          }
        });
        break;
      }
      case 'frost_fang': {
        g.effects.ring(pos, { color: 0x7fd8ff, radius: 6.5, duration: 0.5, intensity: 2.5 });
        g.effects.disc(pos, 6, { count: 60, color: 0xbfefff, up: 2, size: 0.18, life: 0.8 });
        g.audio.play('guard', { pos, pitch: 1.4 });
        const hits = radialDamage(g, pos, 6, 40 * mult, { source, kind: 'ability', stagger: true });
        for (const h of hits) h.applySlow?.(0.4, 3);
        break;
      }
      case 'hellfire': {
        g.audio.play('eclipse', { pos, pitch: 1.3, volume: 0.7 });
        for (let k = 0; k < 2; k++) {
          g.timers.after(k * 0.35, () => {
            const c = caster.position.clone();
            g.effects.ring(c, { color: 0xff7a1a, radius: 7, duration: 0.5, intensity: 3 });
            for (let i = 0; i < 14; i++) {
              const a = (i / 14) * TAU;
              g.effects.pillar(c.clone().add(V(Math.cos(a) * (3 + k * 2.5), 0, Math.sin(a) * (3 + k * 2.5))), { color: 0xff6a10, radius: 0.5, height: 3, duration: 0.5 });
            }
            radialDamage(g, c, 7, 34 * mult, { source, kind: 'ability', knockback: 4 });
          });
        }
        break;
      }
      case 'shadow_claw': {
        for (let i = 0; i < 3; i++) {
          g.timers.after(i * 0.15, () => {
            const c = caster.position.clone().setY(caster.position.y + 1);
            g.effects.slash(c, caster.yaw, { color: 0x8a50d0, radius: 4.2, arc: 1.8, width: 1.4, tilt: (i - 1) * 0.5, duration: 0.25 });
            g.audio.play('swing', { pos, pitch: 0.7 });
            meleeArc(g, caster.position, caster.yaw, 4.5, 1.9, 32 * mult, { source, kind: 'ability', stagger: i === 2 });
          });
        }
        break;
      }
      case 'iron_blood':
        if (isPlayer) caster.damageReduction(5, 0.6);
        g.effects.sphere(pos.clone().setY(pos.y + 1), { color: 0xa0a8b8, radius: 1.6, duration: 0.6, opacity: 0.5 });
        g.audio.play('block', { pos });
        break;
      case 'crimson_hunger': {
        const hits = foesOf().filter((t) => t.position.distanceTo(pos) < 7);
        for (const h of hits) {
          g.effects.beam(() => h.position.clone().setY(h.position.y + 1), () => caster.position.clone().setY(caster.position.y + 1.2), 0.6, { color: 0xd0102a });
          const res = dealDamage(g, h, 26 * mult, { source, kind: 'ability' });
          if (isPlayer && res.dealt) caster.heal(res.dealt * 0.5, true);
        }
        g.audio.play('soul_drain', { pos });
        break;
      }
      case 'moon_veil':
        if (isPlayer) {
          caster.cooldowns.q = caster.cooldowns.e = caster.cooldowns.r = 0;
          g.ui.toast('Moon Veil: your abilities are refreshed.', 'good');
        }
        g.effects.ring(pos, { color: 0xb0c8ff, radius: 4, duration: 0.5 });
        g.audio.play('levelup', { pos, volume: 0.5 });
        break;
      case 'thunder_vein':
      case 'sovereign_wrath': {
        const n = power === 'sovereign_wrath' ? 10 : 5;
        const col = power === 'sovereign_wrath' ? 0xff2020 : 0xffe060;
        const targets = foesOf().filter((t) => t.position.distanceTo(pos) < 16);
        for (let i = 0; i < n; i++) {
          g.timers.after(i * 0.14, () => {
            const t = targets.length ? targets[i % targets.length] : null;
            const p = t && t.alive ? t.position.clone() : caster.position.clone().add(V(rand(-7, 7), 0, rand(-7, 7)));
            g.effects.pillar(p, { color: col, radius: 0.6, height: 25, duration: 0.3, intensity: 4 });
            g.effects.burst(p.clone().setY(p.y + 0.4), { count: 16, color: col, speed: 6, size: 0.15, life: 0.3, gravity: 2 });
            g.audio.play('thunder', { pos: p, volume: 0.6 });
            radialDamage(g, p, 2.2, (power === 'sovereign_wrath' ? 60 : 40) * mult, { source, kind: 'ability', stagger: true, noHitStop: true });
          });
        }
        break;
      }
      case 'beast_rage':
        if (isPlayer) {
          this.rageT = 6;
          caster.refreshMods();
          g.ui.toast('BEAST RAGE: +40% damage, +20% speed!', 'good');
        }
        g.effects.burst(pos.clone().setY(pos.y + 1.2), { count: 40, color: 0xff4040, speed: 6, size: 0.25, life: 0.6, gravity: 0 });
        g.audio.play('boss_shriek', { pos, volume: 0.4, pitch: 1.5 });
        break;
      case 'blood_shield':
        if (isPlayer) this.shield = 70 + (tierOfPower(this.active) - 1) * 20;
        g.effects.sphere(pos.clone().setY(pos.y + 1), { color: 0xff6080, radius: 1.5, duration: 0.6, opacity: 0.5 });
        g.audio.play('guard', { pos });
        break;
      case 'empress_night': {
        g.effects.ring(pos, { color: 0xb040ff, radius: 8, duration: 0.6, intensity: 3 });
        g.effects.sphere(pos.clone().setY(pos.y + 1), { color: 0xb040ff, radius: 7, duration: 0.5, opacity: 0.35 });
        g.audio.play('eclipse', { pos, volume: 0.8 });
        const hits = radialDamage(g, pos, 7.5, 70 * mult, { source, kind: 'ability', knockback: 7, stagger: true });
        if (isPlayer) caster.heal(hits.length * 25, false);
        break;
      }
      default:
        return false;
    }
    return true;
  }

  serialize() {
    return { stolen: this.stolen.map((s) => ({ ...s })), equipped: this.equipped };
  }

  load(data) {
    this.stolen = Array.isArray(data?.stolen) ? data.stolen.filter((s) => POWERS[s.power]) : [];
    this.equipped = Math.min(data?.equipped ?? -1, this.stolen.length - 1);
    this._mods = null;
  }
}

function tierOfPower(s) {
  return s ? (POWERS[s.power]?.unique ? 4 : tierOf(s.level)) : 1;
}
