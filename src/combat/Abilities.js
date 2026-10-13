// Character ability implementations. Each returns true when the ability was actually used
// (so resource cost + cooldown are only spent on success).
import * as THREE from 'three';
import { radialDamage, findTarget, dealDamage, meleeArc, playerTargets, knockback } from './Combat.js';
import { rand, TAU, yawTo } from '../core/utils.js';
import { toon } from '../entities/models/Toon.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Furthest free point along a direction (stops before walls). */
function castPath(game, from, dir, maxDist, y = 0.8) {
  const col = game.area.collision;
  let best = from.clone();
  for (let d = 0.3; d <= maxDist; d += 0.3) {
    const p = from.clone().addScaledVector(dir, d);
    if (col.pointInside(p.x, p.z, from.y + y, 0.35)) break;
    best = p;
  }
  return best;
}

function aimDir(player) {
  const mv = player.moveInput;
  if (mv && mv.lengthSq() > 0.01) return mv.clone().normalize();
  return new THREE.Vector3(Math.sin(player.aimYaw), 0, Math.cos(player.aimYaw));
}

const roseMat = () => toon(0xb3102a, { emissive: 0x500010, emissiveIntensity: 0.8, rim: 1.5 });
const stemMat = () => toon(0x1a0a0c);

function makeRose(scale = 1) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.6, 5), stemMat());
  stem.position.y = 0.3;
  stem.userData.sharedMat = true;
  g.add(stem);
  const bloom = new THREE.Group();
  bloom.position.y = 0.62;
  g.add(bloom);
  for (let i = 0; i < 7; i++) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6, 0, Math.PI), roseMat());
    petal.userData.sharedMat = true;
    const a = (i / 7) * TAU;
    const r = i < 3 ? 0.03 : 0.08;
    petal.position.set(Math.cos(a) * r, i < 3 ? 0.05 : 0, Math.sin(a) * r);
    petal.rotation.set(0.5, a, 0);
    petal.scale.set(1, 1.2, 0.6);
    bloom.add(petal);
  }
  g.scale.setScalar(scale);
  return g;
}

export const ABILITIES = {
  // ───────────── LUCIEN ─────────────
  shadow_blink(game, p) {
    const dir = aimDir(p);
    const from = p.position.clone();
    const to = castPath(game, from, dir, 8);
    if (to.distanceTo(from) < 1.2) return false;
    game.effects.burst(from.clone().setY(from.y + 1), { count: 30, color: 0x1a0612, smoke: true, speed: 3, size: 0.8, life: 0.8, gravity: -1, grow: 0.8 });
    game.effects.burst(from.clone().setY(from.y + 1), { count: 18, color: 0xb0103a, speed: 5, size: 0.2, life: 0.4, gravity: 0 });
    game.audio.play('blink');
    p.invulnerable(0.4);
    p.setAction('cast', 0.32);
    p.model.root.visible = false;
    game.timers.after(0.1, () => {
      p.position.copy(to);
      p.position.y = game.area.groundHeight(to.x, to.z);
      p.yaw = Math.atan2(dir.x, dir.z);
      p.model.root.visible = true;
      const c = p.position.clone().setY(p.position.y + 0.5);
      game.effects.burst(c, { count: 36, color: 0x12040c, smoke: true, speed: 5, size: 0.9, life: 0.9, gravity: -1, grow: 1 });
      game.effects.ring(p.position, { color: 0xc0103a, radius: 3.4, duration: 0.4 });
      game.effects.burst(c, { count: 26, color: 0xff2a4a, speed: 7, size: 0.18, life: 0.5, gravity: 2 });
      radialDamage(game, p.position, 3.2, 34 * p.damageMult, { source: 'player', stagger: true, kind: 'ability', knockback: 4, shake: 0.25 });
    });
    return true;
  },

  soul_drain(game, p) {
    const target = findTarget(game, p.position, p.aimYaw, 13, 1.0);
    if (!target) {
      game.ui.toast('No target in sight.', 'warn');
      return false;
    }
    p.yaw = yawTo(p.position.x, p.position.z, target.position.x, target.position.z);
    p.setAction('cast', 1.15, { lockMove: true });
    game.audio.play('soul_drain');
    const handPos = () => p.position.clone().add(V(Math.sin(p.yaw) * 0.6, 1.3, Math.cos(p.yaw) * 0.6));
    const tgtPos = () => target.position.clone().add(V(0, (target.height ?? 1.6) * 0.6, 0));
    game.effects.beam(handPos, tgtPos, 1.1, { color: 0xc0102a, width: 0.07 });
    let ticks = 0;
    game.timers.during(1.1, (t) => {
      if (Math.random() < 0.7) game.effects.stream(tgtPos(), handPos(), { color: 0xff2040, count: 3, speed: 2.2, life: 0.4 });
      const want = Math.floor(t * 5);
      while (ticks < want && target.alive) {
        ticks++;
        const res = dealDamage(game, target, 13 * p.damageMult, { source: 'player', kind: 'ability', bloodGain: 0, noHitStop: true });
        if (res.dealt) p.heal(res.dealt * 0.4 + 2, true);
      }
    });
    return true;
  },

  crimson_eclipse(game, p) {
    p.setAction('castUp', 1.1, { lockMove: true });
    p.invulnerable(1.3);
    p.velocity.y = 8.5;
    p.grounded = false;
    game.audio.play('eclipse');
    game.darkenPulse(1.2, 0.45);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0x050002 });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), sunMat);
    const corona = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1030).multiplyScalar(3), side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const g = new THREE.Group();
    g.add(sun, corona);
    game.effects.animate(g, 0.95, (t) => {
      g.position.copy(p.position).add(V(0, 4.5, 0));
      g.scale.setScalar(0.2 + t * 1.6);
      corona.lookAt(game.camera.position);
      corona.material.opacity = t < 0.85 ? 1 : (1 - t) / 0.15;
    });
    game.timers.after(0.8, () => {
      p.velocity.y = -20;
    });
    game.timers.after(0.95, () => {
      const c = p.position.clone();
      game.effects.ring(c, { color: 0xff1030, radius: 9.5, duration: 0.6, intensity: 3 });
      game.effects.ring(c, { color: 0x400010, radius: 7, duration: 0.8 });
      game.effects.pillar(c, { color: 0xff1030, radius: 2.5, height: 10, duration: 0.7 });
      game.effects.disc(c, 8, { count: 90, color: 0xff1a3a, up: 6, size: 0.25, life: 0.9, gravity: 4 });
      game.effects.disc(c, 8, { count: 40, color: 0x0a0306, smoke: true, up: 2, size: 1.2, life: 1.2, grow: 1 });
      game.cameraRig.shake(1.0);
      game.renderer.doFlash(0xff1030, 0.55, 2.5);
      game.audio.play('hit_heavy');
      radialDamage(game, c, 9, 170 * p.damageMult, { source: 'player', stagger: true, guardBreak: true, kind: 'ability', knockback: 9, falloff: true, noHitStop: true });
      game.hitStop(0.12);
    });
    return true;
  },

  // ───────────── SERAPHINA ─────────────
  blood_roses(game, p) {
    const target = findTarget(game, p.position, p.aimYaw, 15, 0.9);
    let center;
    if (target) center = target.position.clone();
    else center = castPath(game, p.position, V(Math.sin(p.aimYaw), 0, Math.cos(p.aimYaw)), 7);
    center.y = game.area.groundHeight(center.x, center.z);
    p.setAction('cast', 0.5);
    game.audio.play('roses');
    const R = 3.6;
    const garden = new THREE.Group();
    garden.position.copy(center);
    const roses = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + rand(-0.2, 0.2), r = i === 0 ? 0 : rand(1, R);
      const rose = makeRose(rand(0.9, 1.4));
      rose.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      rose.rotation.y = rand(0, TAU);
      rose.scale.multiplyScalar(0.01);
      rose.userData.target = rand(0.9, 1.4);
      garden.add(rose);
      roses.push(rose);
    }
    game.effects.ring(center, { color: 0xff2040, radius: R + 0.4, duration: 0.5 });
    let ticks = 0;
    game.effects.animate(garden, 3.2, (t) => {
      for (const r of roses) {
        const grow = Math.min(1, t * 6) * (t > 0.9 ? (1 - t) * 10 : 1);
        r.scale.setScalar(Math.max(0.01, r.userData.target * grow));
        r.rotation.y += 0.02;
      }
      if (Math.random() < 0.5) game.effects.disc(center, R, { count: 2, color: 0xff1a3a, up: 1.5, size: 0.14, life: 0.8, gravity: -0.5 });
      const want = Math.floor(t * 6);
      while (ticks < want) {
        ticks++;
        const hits = radialDamage(game, center, R, 12 * p.damageMult, { source: 'player', kind: 'ability', bloodGain: 1, noHitStop: true, silent: false });
        for (const h of hits) h.applySlow?.(0.45, 1.0);
      }
    });
    return true;
  },

  crimson_chains(game, p) {
    const target = findTarget(game, p.position, p.aimYaw, 15, 0.9);
    if (!target) {
      game.ui.toast('No target in sight.', 'warn');
      return false;
    }
    p.yaw = yawTo(p.position.x, p.position.z, target.position.x, target.position.z);
    p.setAction('cast', 0.5);
    game.audio.play('chains');
    dealDamage(game, target, 26 * p.damageMult, { source: 'player', kind: 'ability', stagger: true });
    const dur = target.isBoss ? 2.2 : 3.6;
    if (target.isBoss || target.rootImmune) target.applySlow?.(0.45, dur);
    else target.applyRoot?.(dur);
    const chainMat = toon(0x8a0a1c, { emissive: 0x6a0010, emissiveIntensity: 1.2, rim: 2 });
    const g = new THREE.Group();
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 12; i++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 5, 10), chainMat);
        link.userData.sharedMat = true;
        const a = (i / 12) * TAU;
        link.position.set(Math.cos(a) * 0.75, 0.4 + ring * 0.55, Math.sin(a) * 0.75);
        link.rotation.set(Math.PI / 2, a + (i % 2 ? Math.PI / 2 : 0), 0);
        g.add(link);
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 5), chainMat);
      pole.userData.sharedMat = true;
      pole.position.set(Math.cos(a) * 1.1, 0.8, Math.sin(a) * 1.1);
      pole.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
      g.add(pole);
    }
    game.effects.animate(g, dur, (t) => {
      g.position.copy(target.position);
      g.rotation.y += 0.03;
      const s = Math.min(1, t * 8) * (t > 0.92 ? (1 - t) * 12 : 1);
      g.scale.set(s * (target.radius ?? 0.5) * 1.6 + 0.2, Math.max(0.01, s) * ((target.height ?? 1.8) / 2), s * (target.radius ?? 0.5) * 1.6 + 0.2);
      if (!target.alive) g.visible = false;
    });
    return true;
  },

  queen_crimson_moon(game, p) {
    p.setAction('levitate', 3.4, { lockMove: true });
    p.invulnerable(0.6);
    p.damageReduction(3.4, 0.5);
    game.audio.play('queen');
    game.renderer.doFlash(0xff1030, 0.3, 2);
    const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1030).multiplyScalar(2.6), side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.5, 64), haloMat);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a0010).multiplyScalar(1.2), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const hg = new THREE.Group();
    hg.add(halo, moon);
    game.effects.animate(hg, 3.4, (t) => {
      hg.position.copy(p.position).add(V(-Math.sin(p.yaw) * 0.5, 2.3, -Math.cos(p.yaw) * 0.5));
      hg.lookAt(game.camera.position);
      const s = Math.min(1, t * 5) * (t > 0.9 ? (1 - t) * 10 : 1);
      hg.scale.setScalar(Math.max(0.01, s * 1.4));
    });
    const bladeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1a30).multiplyScalar(2.4), toneMapped: false });
    let strikes = 0;
    game.timers.during(3.2, (t) => {
      const want = Math.floor(t * 20);
      while (strikes < want) {
        strikes++;
        const near = playerTargets(game).filter((e) => e.position.distanceTo(p.position) < 13);
        let pt;
        if (near.length) {
          const e = near[strikes % near.length];
          pt = e.position.clone().add(V(rand(-0.6, 0.6), 0, rand(-0.6, 0.6)));
        } else {
          const a = rand(0, TAU), r = rand(2, 8);
          pt = p.position.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
        }
        pt.y = game.area.groundHeight(pt.x, pt.z);
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.6, 4), bladeMat);
        blade.userData.sharedMat = true;
        blade.rotation.x = Math.PI;
        const startY = pt.y + 9;
        game.effects.animate(blade, 0.22, (k) => {
          blade.position.set(pt.x, startY - k * 8.4, pt.z);
        }, () => {
          game.effects.burst(pt.clone().setY(pt.y + 0.3), { count: 10, color: 0xff1a30, speed: 4, size: 0.16, life: 0.4, gravity: 6 });
          radialDamage(game, pt, 1.6, 24 * p.damageMult, { source: 'player', kind: 'ability', bloodGain: 1, noHitStop: true });
        });
      }
    }, () => bladeMat.dispose());
    return true;
  },

  // ───────────── KAIRO ─────────────
  spectral_dash(game, p) {
    const dir = aimDir(p);
    p.yaw = Math.atan2(dir.x, dir.z);
    p.invulnerable(0.35);
    p.setAction('dash', 0.26, { lockMove: true });
    game.audio.play('spectral_dash');
    const hitSet = new Set();
    p.dash = { dir, speed: 36, time: 0.25 };
    game.timers.during(0.26, () => {
      game.effects.burst(p.position.clone().setY(p.position.y + 1), { count: 4, color: 0x7fb8ff, speed: 1, size: 0.35, life: 0.35, gravity: 0 });
      for (const e of playerTargets(game)) {
        if (hitSet.has(e)) continue;
        if (e.position.distanceTo(p.position) < 1.7 + (e.radius ?? 0.5)) {
          hitSet.add(e);
          dealDamage(game, e, 38 * p.damageMult, { source: 'player', kind: 'ability', stagger: true, color: 0x9fd0ff });
          game.effects.slash(e.position.clone().setY(e.position.y + 1), p.yaw + Math.PI / 2, { color: 0x8fc8ff, radius: 1.4, arc: 2, duration: 0.25 });
        }
      }
    });
    return true;
  },

  moonlight_guard(game, p) {
    p.guardTimer = 5;
    p.setAction('cast', 0.4);
    game.audio.play('guard');
    radialDamage(game, p.position, 3.2, 16 * p.damageMult, { source: 'player', kind: 'ability', knockback: 7, stagger: true });
    game.effects.ring(p.position, { color: 0x8fc8ff, radius: 4, duration: 0.45 });
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fa8ff).multiplyScalar(1.1), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 2), mat);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.52, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd0ff).multiplyScalar(1.5), wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const g = new THREE.Group();
    g.add(sphere, wire);
    game.effects.animate(g, 5, (t) => {
      g.position.copy(p.position).add(V(0, 1.0, 0));
      g.rotation.y += 0.02;
      const s = Math.min(1, t * 15) * (p.guardTimer > 0 ? 1 : 0.01);
      g.scale.setScalar(Math.max(0.01, s));
      mat.opacity = 0.18 + Math.sin(t * 40) * 0.03 + (p.guardFlash ?? 0) * 0.4;
    });
    return true;
  },

  celestial_execution(game, p) {
    const target = findTarget(game, p.position, p.aimYaw, 12, 1.4);
    if (!target) {
      game.ui.toast('No target in sight.', 'warn');
      return false;
    }
    p.invulnerable(1.6);
    p.setAction('attack', 1.5, { lockMove: true, index: 0, loopAttacks: true });
    game.audio.play('execution');
    game.renderer.doFlash(0x9fd0ff, 0.25, 3);
    const hits = 7;
    for (let i = 0; i < hits; i++) {
      game.timers.after(0.12 + i * 0.13, () => {
        if (!target.alive) return;
        const a = (i / hits) * TAU * 1.5 + rand(-0.3, 0.3);
        const off = V(Math.sin(a) * 1.6, 0, Math.cos(a) * 1.6);
        p.position.copy(target.position).add(off);
        p.position.y = game.area.groundHeight(p.position.x, p.position.z);
        game.area.collision.resolveCircle(p.position, 0.4, p.position.y);
        p.yaw = yawTo(p.position.x, p.position.z, target.position.x, target.position.z);
        p.actionIndexOverride = i % 3;
        const c = target.position.clone().setY(target.position.y + 1.1);
        game.effects.slash(c, p.yaw + rand(-1, 1), { color: 0xbfe0ff, radius: 1.6, arc: 2.6, duration: 0.18, tilt: rand(-0.8, 0.8) });
        game.effects.burst(c, { count: 8, color: 0x9fd0ff, speed: 5, size: 0.14, life: 0.3, gravity: 0 });
        dealDamage(game, target, 30 * p.damageMult, { source: 'player', kind: 'ability', noHitStop: true, bloodGain: 2 });
        for (const e of playerTargets(game)) {
          if (e !== target && e.position.distanceTo(target.position) < 2.6) dealDamage(game, e, 12 * p.damageMult, { source: 'player', kind: 'ability', noHitStop: true, silent: true });
        }
      });
    }
    game.timers.after(0.12 + hits * 0.13 + 0.12, () => {
      p.actionIndexOverride = null;
      const c = target.position.clone();
      game.effects.pillar(c, { color: 0xbfe0ff, radius: 1.4, height: 14, duration: 0.6, intensity: 3 });
      game.effects.ring(c, { color: 0x9fd0ff, radius: 5, duration: 0.5 });
      game.cameraRig.shake(0.7);
      game.renderer.doFlash(0xcfe6ff, 0.4, 3);
      game.hitStop(0.14);
      if (target.alive) dealDamage(game, target, 95 * p.damageMult, { source: 'player', kind: 'ability', stagger: true, knockback: 6, noHitStop: true });
    });
    return true;
  },
};

/** Character-specific heavy attacks (RMB) other than Kairo's block. */
export function performHeavy(game, p, def) {
  if (def.type === 'heavy') {
    p.setAction('heavy', def.duration, {
      lockMove: true,
      at: def.active,
      onActive: () => {
        game.audio.play('swing_heavy');
        const c = p.position.clone().setY(p.position.y + 1.0);
        game.effects.slash(c, p.yaw, { color: p.slashColor, radius: def.range, arc: def.arc, width: 1.3, duration: 0.3, sweep: 1, intensity: 2.6 });
        game.effects.ring(p.position, { color: p.slashColor, radius: 3.6, duration: 0.35, opacity: 0.6 });
        game.cameraRig.shake(0.35);
        const hits = meleeArc(game, p.position, p.yaw, def.range, def.arc, def.damage * p.damageMult, { source: 'player', stagger: true, guardBreak: true, knockback: def.knockback, bloodGain: 9 });
        for (const h of hits) knockback(h, p.position, def.knockback);
      },
    });
    p.lungeImpulse(1.5);
    return true;
  }
  if (def.type === 'projectile') {
    p.setAction('heavy', def.duration, {
      at: def.active,
      onActive: () => {
        game.audio.play('blade_throw');
        const pitch = -game.cameraRig.pitch * 0.35 + 0.08;
        const dir = V(Math.sin(p.aimYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(p.aimYaw) * Math.cos(pitch));
        p.yaw = p.aimYaw;
        const start = p.position.clone().add(V(Math.sin(p.yaw) * 0.6, 1.45, Math.cos(p.yaw) * 0.6));
        game.projectiles.spawn({ pos: start, dir, speed: def.speed, damage: def.damage * p.damageMult, radius: 0.5, owner: 'player', color: 0xff1a35, life: def.range / def.speed, pierce: true, shape: 'lance', kind: 'normal', knockback: 3 });
      },
    });
    return true;
  }
  return false;
}
