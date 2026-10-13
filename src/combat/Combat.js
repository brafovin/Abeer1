// Shared combat helpers: target queries, damage application with feedback, area/arc attacks.
import * as THREE from 'three';
import { angleDiff, yawTo } from '../core/utils.js';

const _v = new THREE.Vector3();

/** Everything the player (and allies) may hit. */
export function playerTargets(game) {
  const out = [];
  for (const e of game.enemies) if (e.alive && e.hostile !== false) out.push(e);
  for (const d of game.destructibles) if (d.alive) out.push(d);
  return out;
}

/** Everything an enemy may hit: the player and any summoned allies. */
export function enemyTargets(game) {
  const out = [];
  if (game.player && game.player.alive) out.push(game.player);
  for (const a of game.allies) if (a.alive) out.push(a);
  return out;
}

/**
 * Apply damage to a target with all feedback (numbers, sparks, sound, hit-stop, blood energy).
 * opts: { source: 'player'|'ally'|'enemy', knockback, stagger, guardBreak, from: Vector3, color, kind, silent }
 */
export function dealDamage(game, target, amount, opts = {}) {
  if (!target || !target.alive) return { dealt: 0 };
  let crit = false;
  if (opts.source === 'player') {
    const mods = game.player.mods;
    if (mods.crit > 0 && Math.random() < mods.crit) {
      amount *= 1.75;
      crit = true;
    }
  }
  amount = Math.round(amount);
  const res = target.takeDamage(amount, opts) || { dealt: 0 };
  const dealt = res.dealt ?? 0;
  const hitPos = _v.copy(target.position);
  hitPos.y += (target.height ?? 1.6) * 0.6;
  if (!opts.silent) {
    if (res.blocked) {
      game.effects.burst(hitPos, { count: 10, color: 0xdde6ff, speed: 5, size: 0.12, life: 0.3, gravity: 4 });
      game.audio.play('block', { pos: target.position });
    } else if (dealt > 0) {
      const big = dealt >= 40 || opts.stagger;
      game.effects.burst(hitPos, { count: big ? 22 : 12, color: target.bloodColor ?? 0xb3001b, speed: big ? 6 : 4.5, size: 0.16, life: 0.55, gravity: 9, colorVar: 0.3 });
      if (opts.color) game.effects.burst(hitPos, { count: 8, color: opts.color, speed: 3, size: 0.25, life: 0.3, gravity: 0 });
      game.audio.play(big ? 'hit_heavy' : 'hit', { pos: target.position, pitch: 0.9 + Math.random() * 0.2 });
    }
    if (dealt > 0 || res.blocked) {
      game.ui.damageNumber(hitPos, res.blocked ? 'BLOCK' : dealt, crit ? 'crit' : opts.source === 'enemy' ? 'player' : opts.kind || 'normal');
    }
  }
  if (opts.source === 'player' && dealt > 0) {
    const p = game.player;
    p.gainBlood(opts.bloodGain ?? (opts.kind === 'ability' ? 2 : 5));
    if (p.mods.lifesteal > 0) p.heal(dealt * p.mods.lifesteal, true);
    if (!opts.noHitStop) game.hitStop(opts.stagger ? 0.07 : 0.035);
    if (opts.shake) game.cameraRig.shake(opts.shake);
  }
  if (res.killed && opts.source !== 'enemy') game.onEnemyKilled(target, opts);
  return res;
}

/** Hit every target inside an arc in front of `origin`. Returns hit targets. */
export function meleeArc(game, origin, yaw, range, arc, damage, opts = {}) {
  const targets = opts.targets ?? (opts.source === 'enemy' ? enemyTargets(game) : playerTargets(game));
  const hits = [];
  for (const t of targets) {
    const dx = t.position.x - origin.x, dz = t.position.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > range + (t.radius ?? 0.5)) continue;
    if (Math.abs((t.position.y ?? 0) - origin.y) > 3) continue;
    const ang = Math.abs(angleDiff(yaw, Math.atan2(dx, dz)));
    if (d > 0.8 && ang > arc / 2) continue;
    if (opts.exclude && opts.exclude.has(t)) continue;
    dealDamage(game, t, damage, { ...opts, from: origin });
    hits.push(t);
  }
  return hits;
}

/** Damage everything within radius of center. */
export function radialDamage(game, center, radius, damage, opts = {}) {
  const targets = opts.targets ?? (opts.source === 'enemy' ? enemyTargets(game) : playerTargets(game));
  const hits = [];
  for (const t of targets) {
    const d = Math.hypot(t.position.x - center.x, t.position.z - center.z);
    if (d > radius + (t.radius ?? 0.5)) continue;
    if (Math.abs((t.position.y ?? 0) - center.y) > (opts.vertical ?? 3)) continue;
    const falloff = opts.falloff ? 1 - (d / (radius + 0.5)) * 0.5 : 1;
    dealDamage(game, t, damage * falloff, { ...opts, from: center });
    hits.push(t);
  }
  return hits;
}

/** Nearest valid target within range and a view cone (falls back to nearest in range). */
export function findTarget(game, origin, yaw, range = 12, maxAngle = 0.8, list = null) {
  const targets = list ?? playerTargets(game);
  let best = null, bestScore = Infinity;
  for (const t of targets) {
    if (!t.alive) continue;
    const d = Math.hypot(t.position.x - origin.x, t.position.z - origin.z);
    if (d > range) continue;
    const ang = Math.abs(angleDiff(yaw, yawTo(origin.x, origin.z, t.position.x, t.position.z)));
    if (ang > maxAngle) continue;
    const score = d + ang * 4;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** Apply a knockback impulse to a target that supports it. */
export function knockback(target, from, strength) {
  if (!target.applyImpulse) return;
  const dx = target.position.x - from.x, dz = target.position.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  target.applyImpulse((dx / d) * strength, (dz / d) * strength);
}
