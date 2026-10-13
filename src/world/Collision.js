// 2.5D collision world: oriented boxes and circles on the XZ plane with a height range,
// stored in a uniform spatial hash for fast queries. Used by the player, enemies, projectiles
// and the camera.

const CELL = 4;

export class CollisionWorld {
  constructor() {
    this.colliders = [];
    this.grid = new Map();
    this.bounds = null; // { minX, maxX, minZ, maxZ } or { circle: {x, z, r} }
    this.ceiling = null;
    this._query = [];
    this._stamp = 0;
  }

  clear() {
    this.colliders.length = 0;
    this.grid.clear();
    this.bounds = null;
    this.ceiling = null;
  }

  /** Axis-aligned or rotated box. hw/hd = half width/depth. */
  addBox(x, z, hw, hd, rot = 0, ymin = -10, ymax = 100, tag = null) {
    const c = { type: 'box', x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), ymin, ymax, tag, enabled: true, _s: 0 };
    c.radius = Math.hypot(hw, hd);
    this._insert(c);
    return c;
  }

  addCircle(x, z, r, ymin = -10, ymax = 100, tag = null) {
    const c = { type: 'circle', x, z, r, radius: r, ymin, ymax, tag, enabled: true, _s: 0 };
    this._insert(c);
    return c;
  }

  /** Thin wall between two points. */
  addWall(x1, z1, x2, z2, thickness = 0.5, ymax = 100, tag = null) {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    // local frame: hd along wall direction (z axis rotated by rot)
    return this.addBox(cx, cz, thickness / 2, len / 2, rot, -10, ymax, tag);
  }

  remove(c) {
    if (!c) return;
    c.enabled = false;
  }

  _insert(c) {
    this.colliders.push(c);
    const r = c.radius;
    const x0 = Math.floor((c.x - r) / CELL), x1 = Math.floor((c.x + r) / CELL);
    const z0 = Math.floor((c.z - r) / CELL), z1 = Math.floor((c.z + r) / CELL);
    for (let i = x0; i <= x1; i++) {
      for (let k = z0; k <= z1; k++) {
        const key = i * 73856093 ^ k * 19349663;
        let list = this.grid.get(key);
        if (!list) this.grid.set(key, (list = []));
        list.push(c);
      }
    }
  }

  /** Colliders near a point (deduplicated). */
  near(x, z, r) {
    const out = this._query;
    out.length = 0;
    const stamp = ++this._stamp;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let i = x0; i <= x1; i++) {
      for (let k = z0; k <= z1; k++) {
        const list = this.grid.get(i * 73856093 ^ k * 19349663);
        if (!list) continue;
        for (const c of list) {
          if (c._s === stamp || !c.enabled) continue;
          c._s = stamp;
          out.push(c);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle (pos.x, pos.z, radius) out of all colliders. pos is mutated.
   * y = feet height; colliders entirely below the feet are ignored (allows jumping over low props).
   * Returns true if any collision happened.
   */
  resolveCircle(pos, radius, y = 0) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      const list = this.near(pos.x, pos.z, radius + 1);
      for (const c of list) {
        if (y > c.ymax - 0.05 || y + 1.6 < c.ymin) continue;
        if (c.type === 'circle') {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d2 = dx * dx + dz * dz;
          const rr = radius + c.r;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.0001;
            const push = rr - d;
            pos.x += (dx / d) * push;
            pos.z += (dz / d) * push;
            hit = true;
          }
        } else {
          // transform into the box's local frame
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const lx = dx * c.cos - dz * c.sin;
          const lz = dx * c.sin + dz * c.cos;
          const cx = Math.max(-c.hw, Math.min(c.hw, lx));
          const cz = Math.max(-c.hd, Math.min(c.hd, lz));
          let ox = lx - cx, oz = lz - cz;
          const d2 = ox * ox + oz * oz;
          if (d2 < radius * radius) {
            let nx, nz, push;
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              nx = ox / d;
              nz = oz / d;
              push = radius - d;
            } else {
              // centre inside the box: push out along the shallowest axis
              const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
              if (px < pz) {
                nx = Math.sign(lx) || 1;
                nz = 0;
                push = px + radius;
              } else {
                nx = 0;
                nz = Math.sign(lz) || 1;
                push = pz + radius;
              }
            }
            // back to world frame
            const wx = nx * c.cos + nz * c.sin;
            const wz = -nx * c.sin + nz * c.cos;
            pos.x += wx * push;
            pos.z += wz * push;
            hit = true;
          }
        }
      }
    }
    if (this.bounds) hit = this.clampToBounds(pos, radius) || hit;
    return hit;
  }

  clampToBounds(pos, radius = 0) {
    const b = this.bounds;
    let hit = false;
    if (b.circle) {
      const dx = pos.x - b.circle.x, dz = pos.z - b.circle.z;
      const d = Math.hypot(dx, dz);
      const max = b.circle.r - radius;
      if (d > max) {
        pos.x = b.circle.x + (dx / d) * max;
        pos.z = b.circle.z + (dz / d) * max;
        hit = true;
      }
    }
    if (b.minX !== undefined) {
      if (pos.x < b.minX + radius) { pos.x = b.minX + radius; hit = true; }
      if (pos.x > b.maxX - radius) { pos.x = b.maxX - radius; hit = true; }
      if (pos.z < b.minZ + radius) { pos.z = b.minZ + radius; hit = true; }
      if (pos.z > b.maxZ - radius) { pos.z = b.maxZ - radius; hit = true; }
    }
    return hit;
  }

  pointInside(x, z, y = 1, pad = 0) {
    const list = this.near(x, z, pad + 0.5);
    for (const c of list) {
      if (y > c.ymax || y < c.ymin) continue;
      if (c.type === 'circle') {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz < (c.r + pad) * (c.r + pad)) return c;
      } else {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad) return c;
      }
    }
    if (this.bounds) {
      const b = this.bounds;
      if (b.circle && Math.hypot(x - b.circle.x, z - b.circle.z) > b.circle.r) return { bounds: true };
      if (b.minX !== undefined && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) return { bounds: true };
    }
    return null;
  }

  /** Fraction (0..1) along the segment where it first enters a collider, or 1 if clear. */
  segmentBlocked(ax, az, bx, bz, y = 1, step = 0.3) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.pointInside(ax + (bx - ax) * t, az + (bz - az) * t, y)) return Math.max(0, (i - 1) / n);
    }
    return 1;
  }

  hasLineOfSight(ax, az, bx, bz, y = 1.2) {
    return this.segmentBlocked(ax, az, bx, bz, y, 0.5) >= 1;
  }
}
