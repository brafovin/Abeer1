// AreaBuilder: procedural gothic set-dressing. Every builder adds meshes to the area group and
// registers matching colliders, flames and lights. Static meshes are merged per material at the
// end (see mergeStatic) to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mat, Tex, boxUV, scaleUV } from './Materials.js';
import { seeded } from '../core/utils.js';

export function archShape(w, springH, { inset = 0 } = {}) {
  const a = w / 2 - inset;
  const r = w - inset * 2;
  const s = new THREE.Shape();
  s.moveTo(-a, inset);
  s.lineTo(a, inset);
  s.lineTo(a, springH);
  s.absarc(-a, springH, r, 0, Math.PI / 3, false);
  s.absarc(a, springH, r, (2 * Math.PI) / 3, Math.PI, false);
  s.lineTo(-a, inset);
  return s;
}

/** Points along a pointed arch opening, from the left springing point over the apex to the right. */
function archPoints(w, springH, n = 10, yOff = 0) {
  const a = w / 2, r = w;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const ang = Math.PI - (i / n) * (Math.PI / 3);
    pts.push(new THREE.Vector2(a + Math.cos(ang) * r, springH + Math.sin(ang) * r + yOff));
  }
  for (let i = 1; i <= n; i++) {
    const ang = Math.PI / 3 - (i / n) * (Math.PI / 3);
    pts.push(new THREE.Vector2(-a + Math.cos(ang) * r, springH + Math.sin(ang) * r + yOff));
  }
  return pts;
}

function normaliseShapeUV(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  return geo;
}

// Cached dead-tree geometries (a handful of variants reused across the forest/village).
const treeCache = new Map();
function deadTreeGeometry(variant, scale = 1) {
  const key = variant + ':' + scale;
  if (treeCache.has(key)) return treeCache.get(key);
  const rng = seeded(1000 + variant * 17);
  const geos = [];
  const up = new THREE.Vector3(0, 1, 0);
  function branch(start, dir, len, radius, depth) {
    const end = start.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(radius * 0.62, radius, len, depth > 2 ? 6 : depth > 0 ? 4 : 3, 1);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    g.applyQuaternion(q);
    g.translate(start.x, start.y, start.z);
    scaleUV(g, 2, len);
    geos.push(g);
    if (depth <= 0 || radius < 0.03) return;
    const n = depth > 2 ? 3 : depth > 1 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const nd = dir.clone();
      nd.x += rng.range(-0.9, 0.9);
      nd.z += rng.range(-0.9, 0.9);
      nd.y += rng.range(-0.15, 0.35);
      nd.normalize();
      branch(end, nd, len * rng.range(0.55, 0.78), radius * 0.6, depth - 1);
    }
    // gnarled continuation of the main stem
    if (depth > 1) {
      const nd = dir.clone();
      nd.x += rng.range(-0.3, 0.3);
      nd.z += rng.range(-0.3, 0.3);
      nd.normalize();
      branch(end, nd, len * 0.75, radius * 0.7, depth - 1);
    }
  }
  const h = rng.range(3.2, 4.6) * scale;
  branch(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(rng.range(-0.15, 0.15), 1, rng.range(-0.15, 0.15)).normalize(), h, 0.32 * scale, 3);
  // roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    const g = new THREE.ConeGeometry(0.16 * scale, 1.3 * scale, 5);
    g.rotateZ(Math.PI / 2 - 0.35);
    g.rotateY(a);
    g.translate(Math.cos(a) * 0.4 * scale, 0.05, -Math.sin(a) * 0.4 * scale);
    geos.push(g);
  }
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  merged.computeVertexNormals();
  treeCache.set(key, merged);
  return merged;
}

export class AreaBuilder {
  constructor(area) {
    this.area = area;
    this.group = area.group;
    this.col = area.collision;
    this.flames = area.flames;
    this.rng = seeded(area.seed ?? 7);
  }

  y(x, z) {
    return this.area.groundHeight(x, z);
  }

  mesh(geo, mat, o = {}) {
    const m = new THREE.Mesh(geo, mat);
    if (o.pos) m.position.set(...o.pos);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale !== undefined) typeof o.scale === 'number' ? m.scale.setScalar(o.scale) : m.scale.set(...o.scale);
    m.castShadow = o.shadow ?? true;
    m.receiveShadow = o.receive ?? true;
    m.userData.static = o.static ?? true;
    (o.parent ?? this.group).add(m);
    return m;
  }

  box(w, h, d, mat, o = {}) {
    const g = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, o.uvScale ?? 2);
    return this.mesh(g, mat, o);
  }

  // ── architecture ───────────────────────────────────────────────────────────────────────────────

  floor(minX, maxX, minZ, maxZ, mat, y = 0, uvScale = 3) {
    const w = maxX - minX, d = maxZ - minZ;
    const g = new THREE.PlaneGeometry(w, d, 1, 1);
    scaleUV(g, w / uvScale, d / uvScale);
    g.rotateX(-Math.PI / 2);
    return this.mesh(g, mat, { pos: [(minX + maxX) / 2, y, (minZ + maxZ) / 2], shadow: false });
  }

  /** Terrain following groundHeight (for outdoor areas). */
  terrain(minX, maxX, minZ, maxZ, mat, seg = 60, uvScale = 4) {
    const w = maxX - minX, d = maxZ - minZ;
    const g = new THREE.PlaneGeometry(w, d, seg, Math.round((seg * d) / w));
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + (minX + maxX) / 2, z = p.getZ(i) + (minZ + maxZ) / 2;
      p.setY(i, this.y(x, z));
    }
    scaleUV(g, w / uvScale, d / uvScale);
    g.computeVertexNormals();
    return this.mesh(g, mat, { pos: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2], shadow: false });
  }

  wall(x1, z1, x2, z2, h, thick = 0.8, mat = Mat.stone(), o = {}) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    const m = this.box(thick, h, len, mat, { pos: [(x1 + x2) / 2, (o.y ?? 0) + h / 2, (z1 + z2) / 2], rot: [0, rot, 0], uvScale: o.uvScale ?? 2.5 });
    if (o.collide !== false) this.col.addWall(x1, z1, x2, z2, thick, (o.y ?? 0) + h);
    return m;
  }

  pillar(x, z, h = 10, r = 0.45, mat = Mat.stoneWarm(), o = {}) {
    const y = this.y(x, z);
    this.box(r * 2.8, 0.5, r * 2.8, mat, { pos: [x, y + 0.25, z] });
    this.box(r * 2.4, 0.3, r * 2.4, mat, { pos: [x, y + 0.65, z] });
    const shaftH = o.broken ? h * o.broken : h - 1.6;
    const core = new THREE.CylinderGeometry(r, r * 1.05, shaftH, 12);
    scaleUV(core, 2, shaftH / 2);
    this.mesh(core, mat, { pos: [x, y + 0.8 + shaftH / 2, z] });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const sub = new THREE.CylinderGeometry(r * 0.38, r * 0.4, shaftH, 8);
      scaleUV(sub, 1, shaftH / 2);
      this.mesh(sub, mat, { pos: [x + Math.cos(a) * r * 0.95, y + 0.8 + shaftH / 2, z + Math.sin(a) * r * 0.95] });
    }
    if (!o.broken) {
      const cap = new THREE.CylinderGeometry(r * 1.6, r * 1.05, 0.8, 8);
      this.mesh(cap, mat, { pos: [x, y + 0.8 + shaftH + 0.4, z] });
    } else {
      // jagged broken top + rubble
      for (let i = 0; i < 5; i++) {
        const a = this.rng() * Math.PI * 2;
        this.rock(x + Math.cos(a) * this.rng.range(0.8, 2), z + Math.sin(a) * this.rng.range(0.8, 2), this.rng.range(0.2, 0.45), false);
      }
      const top = new THREE.ConeGeometry(r * 1.1, 0.7, 7);
      this.mesh(top, mat, { pos: [x, y + 0.8 + shaftH + 0.2, z], rot: [0.3, 0, 0.2] });
    }
    this.col.addCircle(x, z, r * 1.5, -10, y + h);
  }

  /** Gothic stained-glass window set into a wall facing +X or -X (normalX = ±1) or along Z. */
  stainedWindow(x, y, z, w, h, facing = 'x', palette = 'crimson', shaft = null) {
    const springH = h - w * 0.866;
    const shape = archShape(w, springH);
    const glassGeo = normaliseShapeUV(new THREE.ShapeGeometry(shape, 12));
    const frameShape = archShape(w + 0.6, springH + 0.3);
    const hole = [new THREE.Vector2(-w / 2, 0.3), new THREE.Vector2(w / 2, 0.3), ...archPoints(w, springH, 10, 0.3).reverse()];
    frameShape.holes.push(new THREE.Path(hole));
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: 0.35, bevelEnabled: false, curveSegments: 12 });
    frameGeo.translate(0, -0.3, -0.17);
    scaleUV(frameGeo, 0.5, 0.5);
    const rotY = facing === 'x' ? Math.PI / 2 : facing === '-x' ? -Math.PI / 2 : facing === '-z' ? Math.PI : 0;
    this.mesh(glassGeo, Mat.glass(palette), { pos: [x, y, z], rot: [0, rotY, 0], shadow: false });
    this.mesh(frameGeo, Mat.stoneWarm(), { pos: [x, y, z], rot: [0, rotY, 0] });
    // mullion
    this.box(0.12, springH + w * 0.6, 0.12, Mat.stoneWarm(), { pos: [x, y + (springH + w * 0.6) / 2, z], rot: [0, rotY, 0] });
    if (shaft) {
      // volumetric light shaft: two crossed additive gradient planes along the light direction
      const len = shaft.length ?? 14;
      const mat = Mat.additive(shaft.color ?? 0xff4060, shaft.opacity ?? 0.12, Tex.shaft());
      const dirX = facing === 'x' ? 1 : facing === '-x' ? -1 : 0;
      const dirZ = facing === 'z' ? 1 : facing === '-z' ? -1 : 0;
      const light = new THREE.Vector3(dirX, -(shaft.drop ?? 0.8), dirZ).normalize();
      const yAxis = light.clone().negate();
      const tangent = new THREE.Vector3(dirZ, 0, -dirX).normalize();
      for (let i = 0; i < 2; i++) {
        const xAxis = i === 0 ? tangent.clone() : new THREE.Vector3().crossVectors(yAxis, tangent).normalize();
        const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
        const m = this.mesh(new THREE.PlaneGeometry(w * 1.1, len), mat, { shadow: false, receive: false, static: false });
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
        m.position.set(x, y + h * 0.5, z).addScaledVector(light, len * 0.5);
        m.renderOrder = 4;
      }
    }
  }

  roseWindow(x, y, z, r, rotY = 0) {
    const g = new THREE.CircleGeometry(r, 40);
    normaliseShapeUV(g);
    this.mesh(g, Mat.glass('violet'), { pos: [x, y, z], rot: [0, rotY, 0], shadow: false });
    const ring = new THREE.TorusGeometry(r, 0.25, 8, 40);
    this.mesh(ring, Mat.stoneWarm(), { pos: [x, y, z], rot: [0, rotY, 0] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = new THREE.BoxGeometry(0.12, r * 2, 0.15);
      const m = this.mesh(spoke, Mat.stoneWarm(), { pos: [x, y, z], rot: [0, rotY, 0] });
      m.rotateZ(a);
    }
    const inner = new THREE.TorusGeometry(r * 0.4, 0.12, 6, 24);
    this.mesh(inner, Mat.stoneWarm(), { pos: [x, y, z], rot: [0, rotY, 0] });
  }

  /** Pointed-arch doorway frame (for gates/doors), facing along Z. */
  archway(x, z, w, h, rotY = 0, mat = Mat.stoneWarm(), depth = 1.2) {
    const y = this.y(x, z);
    const springH = h - w * 0.866;
    const A = w / 2 + 0.8;
    const top = h + 0.7;
    const outline = [new THREE.Vector2(-A, 0), new THREE.Vector2(-w / 2, 0), ...archPoints(w, springH, 12), new THREE.Vector2(w / 2, 0), new THREE.Vector2(A, 0), new THREE.Vector2(A, top), new THREE.Vector2(-A, top)];
    const shape = new THREE.Shape(outline);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
    geo.translate(0, 0, -depth / 2);
    scaleUV(geo, 0.4, 0.4);
    this.mesh(geo, mat, { pos: [x, y, z], rot: [0, rotY, 0] });
    // collide with the two jambs
    const c = Math.cos(rotY), s = Math.sin(rotY);
    for (const side of [-1, 1]) {
      const off = (w / 2 + 0.35) * side;
      this.col.addBox(x + off * c, z - off * s, 0.35, depth / 2, rotY, -10, y + h);
    }
  }

  // ── cathedral furniture ────────────────────────────────────────────────────────────────────────

  pew(x, z, rotY = 0, broken = false) {
    const g = new THREE.Group();
    g.position.set(x, this.y(x, z), z);
    g.rotation.y = rotY;
    const wood = Mat.woodDark();
    const len = broken ? 1.6 : 2.6;
    this.box(len, 0.08, 0.5, wood, { pos: [0, 0.46, 0], parent: g, uvScale: 1.5 });
    this.box(len, 0.62, 0.07, wood, { pos: [0, 0.82, -0.24], rot: [-0.12, 0, 0], parent: g, uvScale: 1.5 });
    for (const sx of [-1, 1]) this.box(0.08, 0.95, 0.56, wood, { pos: [(sx * len) / 2, 0.47, -0.02], parent: g });
    if (broken) g.rotation.z = 0.25;
    this.group.add(g);
    this.col.addBox(x, z, len / 2 + 0.05, 0.32, rotY, -10, 1.0);
    return g;
  }

  candles(x, y, z, count = 5, spread = 0.35, light = false) {
    const wax = Mat.wax();
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2, r = this.rng() * spread;
      const h = this.rng.range(0.08, 0.38);
      const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      this.mesh(new THREE.CylinderGeometry(0.03, 0.035, h, 7), wax, { pos: [cx, y + h / 2, cz], shadow: false });
      this.flames.add(cx, y + h + 0.05, cz, 0.16 + this.rng() * 0.06, 0xff8a30);
    }
    if (light) this.area.addFlickerLight(x, y + 0.6, z, 0xff8a40, light === true ? 2.2 : light, 7);
  }

  candelabra(x, z, h = 1.8, light = false) {
    const y = this.y(x, z);
    const iron = Mat.iron();
    this.mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 6), iron, { pos: [x, y + h / 2, z] });
    this.mesh(new THREE.ConeGeometry(0.25, 0.25, 6), iron, { pos: [x, y + 0.12, z] });
    const arm = new THREE.TorusGeometry(0.3, 0.02, 4, 12, Math.PI);
    this.mesh(arm, iron, { pos: [x, y + h - 0.05, z], rot: [0, 0, Math.PI] });
    for (const dx of [-0.3, 0, 0.3]) {
      const cy = y + h + (dx === 0 ? 0.25 : -0.05);
      this.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), Mat.wax(), { pos: [x + dx, cy, z], shadow: false });
      this.flames.add(x + dx, cy + 0.16, z, 0.18, 0xff9a40);
    }
    this.col.addCircle(x, z, 0.3, -10, y + h);
    if (light) this.area.addFlickerLight(x, y + h + 0.4, z, 0xff9040, light === true ? 2.5 : light, 9);
  }

  altar(x, z, rotY = 0) {
    const y = this.y(x, z);
    this.box(3.4, 1.1, 1.5, Mat.stoneWarm(), { pos: [x, y + 0.55, z], rot: [0, rotY, 0] });
    this.box(3.6, 0.15, 1.7, Mat.stoneWarm(), { pos: [x, y + 1.15, z], rot: [0, rotY, 0] });
    // crimson altar cloth
    const cloth = new THREE.PlaneGeometry(1.2, 1.4, 1, 4);
    this.mesh(cloth, Mat.cloth(0x6a0a18), { pos: [x, y + 0.6, z + 0.77], rot: [0, rotY, 0], shadow: false });
    this.box(1.2, 0.02, 1.72, Mat.cloth(0x6a0a18), { pos: [x, y + 1.24, z], rot: [0, rotY, 0] });
    this.col.addBox(x, z, 1.75, 0.8, rotY, -10, y + 1.25);
  }

  statue(x, z, rotY = 0, headless = true, scale = 1) {
    const y = this.y(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    g.scale.setScalar(scale);
    const stone = Mat.stone();
    this.box(1.3, 1.0, 1.3, stone, { pos: [0, 0.5, 0], parent: g });
    const robe = new THREE.LatheGeometry([[0.45, 0], [0.42, 0.6], [0.3, 1.4], [0.26, 1.9], [0.12, 2.1]].map(([r, yy]) => new THREE.Vector2(r, yy)), 12);
    this.mesh(robe, stone, { pos: [0, 1.0, 0], parent: g });
    if (!headless) this.mesh(new THREE.SphereGeometry(0.18, 10, 8), stone, { pos: [0, 3.25, 0], parent: g });
    // folded wings
    for (const s of [-1, 1]) {
      const wing = new THREE.Shape();
      wing.moveTo(0, 0);
      wing.quadraticCurveTo(0.9 * s, 0.6, 0.6 * s, 2.0);
      wing.quadraticCurveTo(0.3 * s, 1.2, 0, 0.4);
      const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.08, bevelEnabled: false });
      this.mesh(wg, stone, { pos: [0.15 * s, 1.9, -0.25], rot: [0.25, 0, 0], parent: g });
    }
    // praying arms (or broken stumps)
    this.box(0.16, 0.5, 0.16, stone, { pos: [0, 2.45, 0.28], rot: [-0.6, 0, 0], parent: g });
    this.group.add(g);
    this.col.addBox(x, z, 0.7 * scale, 0.7 * scale, rotY, -10, y + 3 * scale);
  }

  coffin(x, z, rotY = 0, open = false) {
    const y = this.y(x, z);
    const sh = new THREE.Shape();
    sh.moveTo(-0.3, -1);
    sh.lineTo(0.3, -1);
    sh.lineTo(0.42, 0.35);
    sh.lineTo(0.28, 1);
    sh.lineTo(-0.28, 1);
    sh.lineTo(-0.42, 0.35);
    sh.lineTo(-0.3, -1);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.55, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    scaleUV(g, 0.5, 0.5);
    this.mesh(g, Mat.woodDark(), { pos: [x, y, z], rot: [0, rotY, 0] });
    if (open) {
      const lid = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
      lid.rotateX(-Math.PI / 2);
      this.mesh(lid, Mat.woodDark(), { pos: [x + 0.7, y + 0.03, z + 0.2], rot: [0, rotY + 0.4, 0.15] });
    }
    this.col.addBox(x, z, 0.45, 1.0, rotY, -10, y + 0.6);
  }

  // ── village ──────────────────────────────────────────────────────────────────────────────────

  house(x, z, w, d, h, rotY = 0, o = {}) {
    const y = this.y(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    const wood = Mat.woodDark();
    this.box(w + 0.3, 0.7, d + 0.3, Mat.stoneDark(), { pos: [0, 0.35, 0], parent: g });
    this.box(w, h, d, Mat.plaster(), { pos: [0, 0.7 + h / 2, 0], parent: g, uvScale: 3 });
    // timber frame
    const beam = (bw, bh, bd, px, py, pz, rz = 0) => this.box(bw, bh, bd, wood, { pos: [px, py, pz], rot: [0, 0, rz], parent: g, uvScale: 1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(0.22, h, 0.22, (sx * w) / 2, 0.7 + h / 2, (sz * d) / 2);
    for (const sz of [-1, 1]) {
      beam(w, 0.2, 0.24, 0, 0.8, (sz * d) / 2 + 0.01 * sz);
      beam(w, 0.2, 0.24, 0, 0.7 + h - 0.1, (sz * d) / 2 + 0.01 * sz);
      beam(w, 0.16, 0.22, 0, 0.7 + h * 0.55, (sz * d) / 2 + 0.02 * sz);
      for (const sx of [-1, 1]) {
        const brace = this.box(0.16, h * 0.62, 0.2, wood, { pos: [(sx * w) / 4, 0.7 + h * 0.28, (sz * d) / 2 + 0.03 * sz], rot: [0, 0, 0.6 * sx], parent: g, uvScale: 1 });
        brace.userData.static = true;
      }
    }
    // roof (triangular prism)
    const rh = o.roofH ?? w * 0.5;
    const tri = new THREE.Shape();
    tri.moveTo(-w / 2 - 0.5, 0);
    tri.lineTo(w / 2 + 0.5, 0);
    tri.lineTo(0, rh);
    tri.lineTo(-w / 2 - 0.5, 0);
    const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: d + 0.8, bevelEnabled: false });
    roofGeo.translate(0, 0, -(d + 0.8) / 2);
    scaleUV(roofGeo, 0.35, 0.35);
    this.mesh(roofGeo, Mat.roof(), { pos: [0, 0.7 + h, 0], parent: g });
    // gable ends (plaster triangles)
    const gable = new THREE.Shape();
    gable.moveTo(-w / 2, 0);
    gable.lineTo(w / 2, 0);
    gable.lineTo(0, rh - 0.3);
    gable.lineTo(-w / 2, 0);
    const gg = new THREE.ExtrudeGeometry(gable, { depth: d - 0.05, bevelEnabled: false });
    gg.translate(0, 0, -(d - 0.05) / 2);
    scaleUV(gg, 0.3, 0.3);
    this.mesh(gg, Mat.plaster(), { pos: [0, 0.7 + h, 0], parent: g });
    if (o.chimney !== false) this.box(0.7, rh + 1.2, 0.7, Mat.stoneDark(), { pos: [w * 0.25, 0.7 + h + rh * 0.4, -d * 0.2], parent: g });
    // front door (+Z side in local space)
    this.box(1.1, 2.0, 0.12, Mat.wood(), { pos: [o.doorX ?? 0, 0.7 + 1.0, d / 2 + 0.06], parent: g, uvScale: 1.2 });
    this.box(1.35, 0.18, 0.18, wood, { pos: [o.doorX ?? 0, 0.7 + 2.05, d / 2 + 0.08], parent: g });
    // windows: dark, some glowing faintly (someone hiding?)
    const lit = o.lit ?? false;
    const winMat = lit ? Mat.emissive(0xff8a3a, 0.9) : Mat.basic(0x050405);
    const winY = 0.7 + h * 0.62;
    for (const wx of o.windows ?? [-w * 0.3, w * 0.3]) {
      if (Math.abs(wx - (o.doorX ?? 0)) < 0.9) continue;
      this.box(0.8, 0.9, 0.08, winMat, { pos: [wx, winY, d / 2 + 0.05], parent: g, shadow: false });
      this.box(0.08, 0.9, 0.12, wood, { pos: [wx, winY, d / 2 + 0.08], parent: g });
      this.box(0.8, 0.08, 0.12, wood, { pos: [wx, winY, d / 2 + 0.08], parent: g });
      // shutter (one hangs open crooked)
      this.box(0.42, 0.95, 0.05, wood, { pos: [wx - 0.62, winY - 0.05, d / 2 + 0.22], rot: [0, -0.7, 0.05], parent: g });
    }
    for (const wz of [-d * 0.2, d * 0.2]) {
      for (const sx of [-1, 1]) this.box(0.08, 0.8, 0.7, Mat.basic(0x050405), { pos: [(sx * w) / 2 + sx * 0.04, winY, wz], parent: g, shadow: false });
    }
    this.group.add(g);
    this.col.addBox(x, z, w / 2 + 0.15, d / 2 + 0.15, rotY, -10, y + h + rh);
    if (lit) {
      const c = Math.cos(rotY), s = Math.sin(rotY);
      this.area.addFlickerLight(x + s * (d / 2 + 1.2), y + 2.4, z + c * (d / 2 + 1.2), 0xff8a3a, 1.2, 6, 0.5);
    }
    return g;
  }

  streetLamp(x, z, { lit = true, broken = false } = {}) {
    const y = this.y(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (broken) g.rotation.set(0.18, 0, 0.12);
    const iron = Mat.iron();
    this.mesh(new THREE.CylinderGeometry(0.07, 0.12, 3.6, 8), iron, { pos: [0, 1.8, 0], parent: g });
    this.mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 8), iron, { pos: [0, 0.15, 0], parent: g });
    this.mesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), iron, { pos: [0, 3.5, 0.3], parent: g });
    const lantern = new THREE.Group();
    lantern.position.set(0, 3.2, 0.55);
    g.add(lantern);
    this.mesh(new THREE.ConeGeometry(0.22, 0.2, 4), iron, { pos: [0, 0.3, 0], rot: [0, Math.PI / 4, 0], parent: lantern });
    this.mesh(new THREE.BoxGeometry(0.26, 0.36, 0.26), lit ? Mat.emissive(0xffa050, 1.4) : Mat.basic(0x1a1612), { pos: [0, 0.05, 0], parent: lantern, shadow: false });
    this.group.add(g);
    this.col.addCircle(x, z, 0.2, -10, y + 3.6);
    if (lit) {
      const wp = new THREE.Vector3(0, 3.25, 0.55).applyEuler(g.rotation).add(g.position);
      this.flames.add(wp.x, wp.y, wp.z, 0.25, 0xffa050);
      this.area.addFlickerLight(wp.x, wp.y - 0.2, wp.z, 0xff9a50, 2.4, 11, broken ? 1 : 0.25);
    }
  }

  well(x, z) {
    const y = this.y(x, z);
    const ring = new THREE.CylinderGeometry(1.1, 1.2, 0.9, 16, 1, true);
    scaleUV(ring, 4, 0.6);
    this.mesh(ring, Mat.stoneDark(), { pos: [x, y + 0.45, z] });
    this.mesh(new THREE.TorusGeometry(1.15, 0.12, 6, 18), Mat.stoneDark(), { pos: [x, y + 0.9, z], rot: [Math.PI / 2, 0, 0] });
    this.mesh(new THREE.CircleGeometry(1.05, 16), Mat.basic(0x020102), { pos: [x, y + 0.5, z], rot: [-Math.PI / 2, 0, 0], shadow: false });
    for (const s of [-1, 1]) this.box(0.15, 2.4, 0.15, Mat.woodDark(), { pos: [x + s * 1.0, y + 1.2, z] });
    this.box(2.4, 0.12, 0.12, Mat.woodDark(), { pos: [x, y + 2.35, z] });
    const roof = new THREE.ConeGeometry(1.6, 0.8, 4);
    this.mesh(roof, Mat.roof(), { pos: [x, y + 2.75, z], rot: [0, Math.PI / 4, 0] });
    this.col.addCircle(x, z, 1.3, -10, y + 3);
  }

  cart(x, z, rotY = 0) {
    const y = this.y(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.set(0, rotY, 0.12);
    this.box(1.6, 0.12, 2.6, Mat.wood(), { pos: [0, 0.75, 0], parent: g });
    for (const s of [-1, 1]) this.box(0.08, 0.5, 2.6, Mat.wood(), { pos: [s * 0.8, 1.0, 0], parent: g });
    for (const s of [-1, 1]) {
      const wheel = new THREE.TorusGeometry(0.5, 0.06, 6, 14);
      this.mesh(wheel, Mat.woodDark(), { pos: [s * 0.88, 0.5, 0.6], rot: [0, Math.PI / 2, 0], parent: g });
    }
    this.box(0.1, 0.1, 1.8, Mat.wood(), { pos: [0, 0.6, 2.1], rot: [0.3, 0, 0], parent: g });
    this.group.add(g);
    this.col.addBox(x, z, 0.9, 1.4, rotY, -10, y + 1.3);
  }

  barrel(x, z, scale = 1) {
    const y = this.y(x, z);
    const g = new THREE.CylinderGeometry(0.38 * scale, 0.34 * scale, 1.0 * scale, 10);
    scaleUV(g, 1.5, 0.6);
    this.mesh(g, Mat.wood(), { pos: [x, y + 0.5 * scale, z] });
    for (const yy of [0.2, 0.8]) this.mesh(new THREE.TorusGeometry(0.38 * scale, 0.025, 4, 14), Mat.iron(), { pos: [x, y + yy * scale, z], rot: [Math.PI / 2, 0, 0], shadow: false });
    this.col.addCircle(x, z, 0.4 * scale, -10, y + scale);
  }

  crate(x, z, s = 0.8, rotY = 0, stackY = 0) {
    const y = this.y(x, z) + stackY;
    this.box(s, s, s, Mat.wood(), { pos: [x, y + s / 2, z], rot: [0, rotY, 0], uvScale: 1 });
    if (stackY === 0) this.col.addBox(x, z, s / 2, s / 2, rotY, -10, y + s);
  }

  fence(x1, z1, x2, z2, broken = 0.2) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(2, Math.round(len / 1.4));
    const rot = Math.atan2(x2 - x1, z2 - z1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      if (this.rng() < broken) continue;
      const y = this.y(x, z);
      this.box(0.12, 1.3, 0.12, Mat.woodDark(), { pos: [x, y + 0.6, z], rot: [this.rng.range(-0.1, 0.1), 0, this.rng.range(-0.1, 0.1)] });
    }
    for (const hy of [0.5, 1.0]) {
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      this.box(0.06, 0.1, len, Mat.woodDark(), { pos: [cx, this.y(cx, cz) + hy, cz], rot: [0, rot, 0], uvScale: 1 });
    }
    this.col.addWall(x1, z1, x2, z2, 0.25, this.y(x1, z1) + 1.3);
  }

  gravestone(x, z, rotY = 0, kind = 0) {
    const y = this.y(x, z);
    const stone = Mat.stone();
    const tilt = [this.rng.range(-0.15, 0.15), 0, this.rng.range(-0.12, 0.12)];
    if (kind === 0) {
      const sh = new THREE.Shape();
      sh.moveTo(-0.35, 0);
      sh.lineTo(0.35, 0);
      sh.lineTo(0.35, 0.8);
      sh.absarc(0, 0.8, 0.35, 0, Math.PI, false);
      sh.lineTo(-0.35, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
      scaleUV(g, 0.8, 0.8);
      this.mesh(g, stone, { pos: [x, y - 0.1, z], rot: [tilt[0], rotY, tilt[2]] });
    } else {
      this.box(0.14, 1.2, 0.14, stone, { pos: [x, y + 0.5, z], rot: [tilt[0], rotY, tilt[2]] });
      this.box(0.6, 0.14, 0.14, stone, { pos: [x, y + 0.8, z], rot: [tilt[0], rotY, tilt[2]] });
    }
    this.col.addCircle(x, z, 0.35, -10, y + 1.0);
  }

  deadTree(x, z, variant = 0, scale = 1, collide = true) {
    const y = this.y(x, z);
    const g = deadTreeGeometry(variant % 6, 1);
    this.mesh(g, Mat.bark(), { pos: [x, y, z], rot: [0, this.rng() * Math.PI * 2, 0], scale });
    if (collide) this.col.addCircle(x, z, 0.4 * scale, -10, y + 6 * scale);
  }

  rock(x, z, size = 0.8, collide = true) {
    const y = this.y(x, z);
    const g = new THREE.DodecahedronGeometry(size, 1);
    const p = g.attributes.position;
    const rng = this.rng;
    const offs = Array.from({ length: 24 }, () => rng.range(0.75, 1.15));
    for (let i = 0; i < p.count; i++) {
      const k = offs[(Math.abs(Math.floor(p.getX(i) * 7 + p.getY(i) * 13 + p.getZ(i) * 5)) % 24)];
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    this.mesh(g, Mat.stone(), { pos: [x, y + size * 0.25, z], rot: [rng() * 3, rng() * 3, rng() * 3] });
    if (collide && size > 0.5) this.col.addCircle(x, z, size * 0.9, -10, y + size * 1.1);
  }

  /**
   * Gothic vampire castle (Castle Nocturne): a central keep with a great spire, ring of towers with
   * needle roofs and red-lit lancet windows. Used as a distant silhouette and as the real castle.
   */
  gothicCastle(cx, cz, s = 1, o = {}) {
    const y = o.y ?? this.y(cx, cz);
    const stone = o.near ? Mat.stoneDark() : Mat.black();
    const roof = o.near ? Mat.roof() : Mat.black();
    const win = Mat.emissive(0xff1a2a, o.near ? 1.8 : 2.4);
    const rotY = o.rotY ?? 0;
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    g.rotation.y = rotY;
    g.scale.setScalar(s);
    this.group.add(g);
    const put = (geo, mat, x, yy, z, rx = 0, ry = 0) => this.mesh(geo, mat, { pos: [x, yy, z], rot: [rx, ry, 0], parent: g, shadow: !!o.near, receive: !!o.near });
    const windowsOn = (x, z, w, h0, h1, facing = 0, cols = 1) => {
      for (let yy = h0; yy < h1; yy += 4.2) {
        for (let c = 0; c < cols; c++) {
          if ((x * 7 + yy * 3 + c) % 5 < 1.2) continue;
          const wx = x + (cols > 1 ? (c - (cols - 1) / 2) * (w / cols) : 0);
          put(new THREE.BoxGeometry(0.9, 2.2, 0.3), win, wx, yy, z + facing, 0, 0);
        }
      }
    };
    // central keep
    const keep = new THREE.BoxGeometry(20, 36, 16);
    put(keep, stone, 0, 18, 0);
    put(new THREE.ConeGeometry(14, 16, 4), roof, 0, 44, 0, 0, Math.PI / 4);
    put(new THREE.CylinderGeometry(2.6, 3.2, 14, 8), stone, 0, 56, 0);
    put(new THREE.ConeGeometry(3.4, 22, 8), roof, 0, 74, 0);
    windowsOn(0, 8.1, 16, 6, 34, 0, 4);
    const rose = new THREE.CircleGeometry(3.4, 24);
    put(rose, win, 0, 28, 8.25);
    put(new THREE.TorusGeometry(3.6, 0.4, 6, 24), stone, 0, 28, 8.3);
    // gate
    put(new THREE.BoxGeometry(7, 9, 1), Mat.basic(0x070305), 0, 4.5, 8.2);
    // towers
    const towers = [
      [-15, 1, 42, 4.2], [15, 1, 42, 4.2], [-27, -5, 30, 3.4], [27, -5, 30, 3.4], [-9, 10, 50, 3], [9, 10, 50, 3],
      [-36, -12, 22, 3], [36, -12, 22, 3], [0, 14, 38, 3.4], [-20, 12, 34, 2.6], [20, 12, 34, 2.6],
    ];
    for (const [tx, tz, th, tr] of towers) {
      put(new THREE.CylinderGeometry(tr, tr * 1.1, th, 12), stone, tx, th / 2, tz);
      put(new THREE.CylinderGeometry(tr * 1.25, tr * 1.25, 1.4, 12), stone, tx, th + 0.7, tz);
      put(new THREE.ConeGeometry(tr * 1.35, tr * 5, 12), roof, tx, th + 1.4 + tr * 2.5, tz);
      put(new THREE.CylinderGeometry(0.15, 0.15, 4, 4), stone, tx, th + 1.4 + tr * 5 + 1.5, tz);
      windowsOn(tx, tz + tr, 1, 8, th - 2, 0.05, 1);
      // small turret
      put(new THREE.CylinderGeometry(tr * 0.45, tr * 0.45, 6, 8), stone, tx + tr, th - 4, tz + tr * 0.3);
      put(new THREE.ConeGeometry(tr * 0.6, tr * 2.4, 8), roof, tx + tr, th - 1 + tr * 1.2, tz + tr * 0.3);
    }
    // curtain walls with crenellations
    const walls = [[-36, -12, -27, -5], [-27, -5, -15, 1], [15, 1, 27, -5], [27, -5, 36, -12]];
    for (const [x1, z1, x2, z2] of walls) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ang = Math.atan2(x2 - x1, z2 - z1);
      put(new THREE.BoxGeometry(2.4, 16, len), stone, (x1 + x2) / 2, 8, (z1 + z2) / 2, 0, ang);
      for (let i = 0; i < len; i += 2.2) {
        const t = i / len;
        put(new THREE.BoxGeometry(1.0, 1.4, 1.0), stone, x1 + (x2 - x1) * t, 16.7, z1 + (z2 - z1) * t, 0, ang);
      }
    }
    if (o.light) this.area.addFlickerLight(cx, y + 30 * s, cz + 12 * s, 0xff2030, 6, 60 * s, 0.1);
    return g;
  }

  // ── interactive / special visuals (non-static) ─────────────────────────────────────────────────

  brazier(x, z, color = 0xff3020, light = true) {
    const y = this.y(x, z);
    const iron = Mat.iron();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.box(0.06, 1.2, 0.06, iron, { pos: [x + Math.cos(a) * 0.25, y + 0.55, z + Math.sin(a) * 0.25], rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] });
    }
    this.mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.3, 10, 1, true), iron, { pos: [x, y + 1.2, z] });
    for (let i = 0; i < 6; i++) this.flames.add(x + this.rng.range(-0.2, 0.2), y + 1.4 + this.rng.range(0, 0.25), z + this.rng.range(-0.2, 0.2), 0.55, color);
    this.col.addCircle(x, z, 0.4, -10, y + 1.4);
    if (light) this.area.addFlickerLight(x, y + 2, z, color, 3, 12, 0.3);
  }

  bloodPool(x, z, r = 3) {
    const y = this.y(x, z) + 0.03;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 c = vUv - 0.5; float d = length(c) * 2.0;
          float ripple = sin(d * 28.0 - uTime * 2.2) * 0.5 + 0.5;
          float edge = smoothstep(1.0, 0.85, d);
          vec3 col = mix(vec3(0.12, 0.0, 0.02), vec3(0.55, 0.02, 0.06), ripple * 0.35 + (1.0 - d) * 0.4);
          col += vec3(0.9, 0.1, 0.15) * pow(ripple, 8.0) * 0.35 * (1.0 - d);
          gl_FragColor = vec4(col * 1.4, edge);
        }`,
      transparent: true,
      depthWrite: false,
    });
    const m = this.mesh(new THREE.CircleGeometry(r, 40), mat, { pos: [x, y, z], rot: [-Math.PI / 2, 0, 0], shadow: false, static: false });
    m.renderOrder = 1;
    this.area.updaters.push((dt, t) => (mat.uniforms.uTime.value = t));
    return m;
  }

  runeCircle(x, z, r, color = '#ff2a3a', opacity = 0.8, spin = 0.1) {
    const y = this.y(x, z) + 0.04;
    const mat = new THREE.MeshBasicMaterial({ map: Tex.rune(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) });
    const m = this.mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat, { pos: [x, y, z], rot: [-Math.PI / 2, 0, 0], shadow: false, static: false });
    m.renderOrder = 2;
    if (spin) this.area.updaters.push((dt) => (m.rotation.z += dt * spin));
    return m;
  }

  /** Large gothic double door. Returns a controller with open(). */
  greatDoor(x, z, w = 4, h = 6, rotY = 0) {
    const y = this.y(x, z);
    this.archway(x, z, w, h, rotY);
    const leaves = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const c = Math.cos(rotY), sn = Math.sin(rotY);
      pivot.position.set(x + (s * w) / 2 * c, y, z - (s * w) / 2 * sn);
      pivot.rotation.y = rotY;
      this.group.add(pivot);
      const leafH = h - w * 0.866 + 0.3;
      const leaf = this.box(w / 2, leafH, 0.2, Mat.woodDark(), { pos: [(-s * w) / 4, leafH / 2, 0], parent: pivot, static: false, uvScale: 1.5 });
      for (const yy of [0.8, leafH - 0.8]) this.box(w / 2, 0.15, 0.26, Mat.iron(), { pos: [(-s * w) / 4, yy, 0], parent: pivot, static: false });
      this.mesh(new THREE.TorusGeometry(0.15, 0.03, 5, 12), Mat.iron(), { pos: [-s * 0.3, leafH * 0.45, 0.15], parent: pivot, static: false });
      leaves.push({ pivot, s, leaf });
    }
    const blocker = this.col.addBox(x, z, w / 2, 0.3, rotY, -10, y + h);
    let openT = 0, opening = false;
    this.area.updaters.push((dt) => {
      if (!opening || openT >= 1) return;
      openT = Math.min(1, openT + dt * 0.5);
      const e = 1 - Math.pow(1 - openT, 3);
      for (const L of leaves) L.pivot.rotation.y = rotY + L.s * e * 1.6;
    });
    return {
      open: () => {
        opening = true;
        this.col.remove(blocker);
      },
      setOpenInstant: () => {
        opening = true;
        openT = 1;
        for (const L of leaves) L.pivot.rotation.y = rotY + L.s * 1.6;
        this.col.remove(blocker);
      },
      isOpen: () => opening,
    };
  }

  /** Iron portcullis-style gate in an archway. */
  ironGate(x, z, w = 4, h = 4.5, rotY = 0) {
    const y = this.y(x, z);
    this.archway(x, z, w, h + w * 0.866 - 0.4, rotY, Mat.stoneDark(), 1.0);
    const gate = new THREE.Group();
    gate.position.set(x, y, z);
    gate.rotation.y = rotY;
    this.group.add(gate);
    const bars = Math.round(w / 0.3);
    for (let i = 0; i <= bars; i++) {
      this.mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 6), Mat.iron(), { pos: [-w / 2 + (i * w) / bars, h / 2, 0], parent: gate, static: false });
      this.mesh(new THREE.ConeGeometry(0.07, 0.25, 6), Mat.iron(), { pos: [-w / 2 + (i * w) / bars, h + 0.1, 0], parent: gate, static: false });
    }
    for (const yy of [0.5, h * 0.5, h - 0.3]) this.box(w, 0.1, 0.1, Mat.iron(), { pos: [0, yy, 0], parent: gate, static: false });
    const blocker = this.col.addBox(x, z, w / 2, 0.3, rotY, -10, y + h);
    let t = 0, opening = false;
    this.area.updaters.push((dt) => {
      if (!opening || t >= 1) return;
      t = Math.min(1, t + dt * 0.4);
      gate.position.y = y + t * (h - 0.4);
    });
    return {
      open: () => {
        opening = true;
        this.col.remove(blocker);
      },
      setOpenInstant: () => {
        opening = true;
        t = 1;
        gate.position.y = y + h - 0.4;
        this.col.remove(blocker);
      },
      isOpen: () => opening,
    };
  }

  /** Floating, glowing pickup / point of interest mote (non-static, animated). */
  glowMote(x, y, z, color = 0xffd8a0, size = 0.5) {
    const mat = new THREE.SpriteMaterial({ map: Tex.soft(), color: new THREE.Color(color).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    s.position.set(x, y, z);
    this.group.add(s);
    const base = y;
    const seed = Math.random() * 10;
    this.area.updaters.push((dt, t) => {
      s.position.y = base + Math.sin(t * 2 + seed) * 0.08;
      s.material.opacity = 0.7 + Math.sin(t * 3 + seed) * 0.3;
    });
    return s;
  }
}

/**
 * Merge all static meshes in a group by material (and coarse spatial cell) into a few big meshes.
 */
export function mergeStatic(group, cellSize = 40) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const toRemove = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.userData.static || o.isSprite) return;
    if (o.material.isShaderMaterial || o.material.transparent) return;
    let p = o.parent;
    while (p && p !== group) {
      if (p.userData.static === false) return;
      p = p.parent;
    }
    const wp = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const key = o.material.uuid + ':' + Math.floor(wp.x / cellSize) + ':' + Math.floor(wp.z / cellSize) + ':' + (o.castShadow ? 1 : 0);
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [], cast: o.castShadow, receive: o.receiveShadow });
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(m);
    buckets.get(key).geos.push(g);
    toRemove.push(o);
  });
  for (const o of toRemove) o.parent.remove(o);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    mesh.userData.merged = true;
    group.add(mesh);
  }
  // remove now-empty static groups
  const empties = [];
  group.traverse((o) => {
    if (o !== group && !o.isMesh && !o.isLight && !o.isPoints && !o.isSprite && o.children.length === 0) empties.push(o);
  });
  for (const e of empties) e.parent?.remove(e);
}
