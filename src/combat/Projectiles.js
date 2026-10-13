// Projectiles for enemies (blood bolts, boss volleys) and the player/allies (Blood Lance, powers).
import * as THREE from 'three';
import { Tex } from '../world/Materials.js';
import { dealDamage, enemyTargets, playerTargets } from './Combat.js';

const coreGeo = new THREE.SphereGeometry(1, 12, 10);
const lanceGeo = (() => {
  const g = new THREE.ConeGeometry(0.12, 1.6, 6);
  g.rotateX(Math.PI / 2);
  return g;
})();

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.root = new THREE.Group();
  }

  attach(scene) {
    scene.add(this.root);
  }

  clear() {
    for (const p of this.list) this.root.remove(p.mesh);
    this.list.length = 0;
  }

  /**
   * o: { pos, dir, speed, damage, radius, owner ('enemy'|'player'|'ally'), color, life, size, pierce, homing, shape: 'orb'|'lance', onHit, gravity }
   */
  spawn(o) {
    const color = new THREE.Color(o.color ?? 0xff1a30);
    const group = new THREE.Group();
    const size = o.size ?? 0.22;
    const core = new THREE.Mesh(o.shape === 'lance' ? lanceGeo : coreGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.6), toneMapped: false }));
    if (o.shape !== 'lance') core.scale.setScalar(size);
    group.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.soft(), color: color.clone().multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.scale.setScalar(size * 6);
    group.add(halo);
    group.position.copy(o.pos);
    const dir = o.dir.clone().normalize();
    if (o.shape === 'lance') group.lookAt(group.position.clone().add(dir));
    this.root.add(group);
    const p = {
      mesh: group,
      pos: group.position,
      vel: dir.multiplyScalar(o.speed ?? 12),
      damage: o.damage ?? 10,
      radius: o.radius ?? 0.45,
      owner: o.owner ?? 'enemy',
      color: color.getHex(),
      life: o.life ?? 4,
      pierce: !!o.pierce,
      hit: new Set(),
      homing: o.homing ?? 0,
      target: o.target ?? null,
      onHit: o.onHit ?? null,
      gravity: o.gravity ?? 0,
      kind: o.kind ?? 'projectile',
      knockback: o.knockback ?? 0,
      dead: false,
    };
    this.list.push(p);
    return p;
  }

  update(dt) {
    const game = this.game;
    const col = game.area?.collision;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.homing && p.target && p.target.alive) {
        const to = new THREE.Vector3(p.target.position.x - p.pos.x, p.target.position.y + 1.1 - p.pos.y, p.target.position.z - p.pos.z).normalize();
        const speed = p.vel.length();
        p.vel.lerp(to.multiplyScalar(speed), Math.min(1, p.homing * dt)).setLength(speed);
      }
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      // trail
      if (Math.random() < 0.8) game.effects.burst(p.pos, { count: 1, color: p.color, speed: 0.4, size: 0.2, life: 0.35, gravity: 0, spread: 0.1 });
      let explode = p.life <= 0;
      const ground = game.area ? game.area.groundHeight(p.pos.x, p.pos.z) : 0;
      if (p.pos.y < ground + 0.05) explode = true;
      if (!explode && col && col.pointInside(p.pos.x, p.pos.z, p.pos.y)) explode = true;
      // guard sphere (Kairo) destroys enemy projectiles
      if (!explode && p.owner === 'enemy' && game.player?.guardActive) {
        const pl = game.player.position;
        if (Math.hypot(p.pos.x - pl.x, p.pos.z - pl.z) < 2.2 && Math.abs(p.pos.y - pl.y - 1) < 2.2) {
          explode = true;
          game.effects.burst(p.pos, { count: 12, color: 0x9fd0ff, speed: 4, size: 0.15, life: 0.3, gravity: 0 });
        }
      }
      if (!explode) {
        const targets = p.owner === 'enemy' ? enemyTargets(game) : playerTargets(game);
        for (const t of targets) {
          if (p.hit.has(t)) continue;
          const ty = (t.position.y ?? 0) + (t.height ?? 1.6) * 0.5;
          const dx = t.position.x - p.pos.x, dz = t.position.z - p.pos.z, dy = ty - p.pos.y;
          const r = p.radius + (t.radius ?? 0.5);
          if (dx * dx + dz * dz < r * r && Math.abs(dy) < (t.height ?? 1.6) * 0.6 + p.radius) {
            p.hit.add(t);
            dealDamage(game, t, p.damage, {
              source: p.owner === 'enemy' ? 'enemy' : p.owner,
              from: p.pos.clone().sub(p.vel.clone().normalize()),
              projectile: true,
              kind: p.kind,
              knockback: p.knockback,
              noHitStop: true,
            });
            if (p.onHit) p.onHit(t, p);
            if (!p.pierce) {
              explode = true;
              break;
            }
          }
        }
      }
      if (explode) {
        game.effects.burst(p.pos, { count: 14, color: p.color, speed: 4, size: 0.2, life: 0.4, gravity: 3 });
        this.root.remove(p.mesh);
        p.mesh.children.forEach((c) => c.material.dispose());
        this.list.splice(i, 1);
      }
    }
  }
}
