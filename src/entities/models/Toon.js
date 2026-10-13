// Anime-style rendering helpers: cel-shaded materials with rim light, inverted-hull outlines,
// procedural hair-strand geometry and a rig optimiser that merges static parts per joint.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared rim-light uniforms so each area can tint every character's rim light (moonlight colour).
export const RIM = {
  color: { value: new THREE.Color(0.75, 0.32, 0.42) },
  strength: { value: 0.55 },
};

let gradientTex = null;
export function toonGradient() {
  if (gradientTex) return gradientTex;
  // 4-band ramp: deep shadow, shadow, lit, highlight.
  const data = new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  gradientTex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradientTex.minFilter = THREE.NearestFilter;
  gradientTex.magFilter = THREE.NearestFilter;
  gradientTex.generateMipmaps = false;
  gradientTex.needsUpdate = true;
  return gradientTex;
}

function addRim(material, rimScale = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = RIM.color;
    shader.uniforms.uRimStrength = RIM.strength;
    shader.uniforms.uRimScale = { value: rimScale };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimScale;\nvoid main() {',
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 vdir = normalize(vViewPosition);
          float rimF = 1.0 - max(dot(normal, vdir), 0.0);
          rimF = smoothstep(0.62, 1.0, rimF);
          outgoingLight += uRimColor * rimF * uRimStrength * uRimScale;
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'toon-rim';
  return material;
}

const matCache = new Map();

/** Cel-shaded material (cached). opts: { emissive, emissiveIntensity, side, vertexColors, map, rim, transparent, opacity } */
export function toon(color, opts = {}) {
  const key = JSON.stringify([color, opts.emissive, opts.emissiveIntensity, opts.side, opts.vertexColors, opts.map?.uuid, opts.rim, opts.transparent, opts.opacity]);
  if (!opts.noCache && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
    map: opts.map ?? null,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  if (opts.emissive != null) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  addRim(m, opts.rim ?? 1);
  if (!opts.noCache) matCache.set(key, m);
  return m;
}

/** Unlit HDR glow material (eyes, runes, blade edges) — bright enough to trigger bloom. */
export function glow(color, intensity = 2.2, opts = {}) {
  const key = 'glow' + JSON.stringify([color, intensity, opts.transparent, opts.opacity, opts.side, opts.additive]);
  if (!opts.noCache && matCache.has(key)) return matCache.get(key);
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const m = new THREE.MeshBasicMaterial({
    color: c,
    toneMapped: false,
    transparent: !!opts.transparent || !!opts.additive,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !opts.additive,
    fog: opts.fog ?? true,
  });
  if (!opts.noCache) matCache.set(key, m);
  return m;
}

/** Flat unlit material (eye whites, lash lines) that ignores lighting but respects fog. */
export function flat(color) {
  const key = 'flat' + color;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color });
  matCache.set(key, m);
  return m;
}

const outlineCache = new Map();
let outlinesVisible = true;

/** Globally show/hide every ink outline (used by the Low graphics preset to halve draw calls). */
export function setOutlinesVisible(v) {
  outlinesVisible = v;
  for (const m of outlineCache.values()) m.visible = v;
}
/** Inverted-hull outline material: vertices are pushed along their normals and back faces drawn. */
export function outlineMaterial(thickness = 0.008, color = 0x07040a) {
  const key = thickness + ':' + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uOutline;\nvoid main() {')
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normalize(normal) * uOutline;');
  };
  m.customProgramCacheKey = () => 'outline-' + thickness;
  m.visible = outlinesVisible;
  outlineCache.set(key, m);
  return m;
}

/**
 * Build a tapered, slightly flattened tube along a curve — the basic unit of anime hair spikes,
 * claws, petals and horns.
 * @param {number[][]} points control points [[x,y,z], ...] (root first)
 * @param {object} o { width, thick (0..1 flattening), segments, radial, center:[x,y,z] (orients the flat side), rootColor, tipColor, bulge }
 */
export function strandGeometry(points, o = {}) {
  const width = o.width ?? 0.03;
  const thick = o.thick ?? 0.5;
  const segments = o.segments ?? 8;
  const radial = o.radial ?? 6;
  const center = new THREE.Vector3(...(o.center ?? [0, 0, 0]));
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const rootC = new THREE.Color(o.rootColor ?? 0xffffff);
  const tipC = new THREE.Color(o.tipColor ?? o.rootColor ?? 0xffffff);
  const pos = [], col = [], uv = [], idx = [];
  const T = new THREE.Vector3(), out = new THREE.Vector3(), side = new THREE.Vector3(), nrm = new THREE.Vector3();
  const p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, T).normalize();
    out.copy(p).sub(center);
    if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
    out.normalize();
    side.crossVectors(T, out);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    nrm.crossVectors(side, T).normalize();
    const bulge = o.bulge ?? 0.25;
    let w = width * Math.pow(1 - t, o.taper ?? 0.9);
    if (t < 0.2) w *= 1 - bulge + bulge * (t / 0.2);
    c.copy(rootC).lerp(tipC, Math.pow(t, 0.8));
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(
        p.x + side.x * ca * w + nrm.x * sa * w * thick,
        p.y + side.y * ca * w + nrm.y * sa * w * thick,
        p.z + side.z * ca * w + nrm.z * sa * w * thick,
      );
      col.push(c.r, c.g, c.b);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c2 = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c2, b, b, c2, d);
    }
  }
  // cap the root
  const rootCenter = pos.length / 3;
  const p0 = curve.getPointAt(0);
  pos.push(p0.x, p0.y, p0.z);
  col.push(rootC.r, rootC.g, rootC.b);
  uv.push(0.5, 0);
  for (let j = 0; j < radial; j++) idx.push(rootCenter, j, (j + 1) % radial);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lathe from [[radius, y], ...] with optional open front gap (radians) and depth scale. */
export function lathe(profile, { segments = 24, gap = 0, scaleZ = 1, scaleX = 1 } = {}) {
  // LatheGeometry needs bottom-to-top points for outward-facing normals
  const ordered = profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile;
  const pts = ordered.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const phiStart = gap / 2;
  const phiLength = Math.PI * 2 - gap;
  const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  if (scaleZ !== 1 || scaleX !== 1) g.scale(scaleX, 1, scaleZ);
  g.computeVertexNormals();
  return g;
}

/** Cylinder hanging down from its top (joint) — for limbs. */
export function limb(rTop, rBottom, length, radial = 10) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, length, radial, 3);
  g.translate(0, -length / 2, 0);
  return g;
}

/**
 * Add a mesh to a joint. Options: pos, rot, scale, outline (thickness or false), shadow
 */
export function part(parent, geometry, material, o = {}) {
  const m = new THREE.Mesh(geometry, material);
  if (o.pos) m.position.set(...o.pos);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale) {
    if (typeof o.scale === 'number') m.scale.setScalar(o.scale);
    else m.scale.set(...o.scale);
  }
  m.userData.outline = o.outline === undefined ? 0.006 : o.outline;
  m.userData.static = o.static !== false;
  m.castShadow = o.shadow !== false;
  parent.add(m);
  return m;
}

function normaliseGeometry(g, keepColor) {
  let geo = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(geo.attributes)) {
    if (name === 'position' || name === 'normal' || name === 'uv') continue;
    if (name === 'color' && keepColor) continue;
    geo.deleteAttribute(name);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((geo.attributes.position.count) * 2), 2));
  }
  if (keepColor && !geo.attributes.color) {
    const arr = new Float32Array(geo.attributes.position.count * 3).fill(1);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  }
  geo.morphAttributes = {};
  return geo;
}

/**
 * Merge every static mesh that is a direct child of each joint into one mesh per material
 * (and one outline mesh per outline thickness). Dramatically reduces draw calls for the
 * layered procedural characters.
 */
export function optimiseRig(root, { outlines = true, shadows = true } = {}) {
  const joints = [];
  root.traverse((o) => {
    if (!o.isMesh) joints.push(o);
  });
  for (const joint of joints) {
    const meshes = joint.children.filter((c) => c.isMesh && c.userData.static && c.children.length === 0);
    if (!meshes.length) continue;
    const byMat = new Map();
    const byOutline = new Map();
    for (const m of meshes) {
      m.updateMatrix();
      const key = m.material.uuid;
      if (!byMat.has(key)) byMat.set(key, { material: m.material, geos: [], shadow: false });
      const entry = byMat.get(key);
      const geo = normaliseGeometry(m.geometry, !!m.material.vertexColors);
      geo.applyMatrix4(m.matrix);
      entry.geos.push(geo);
      entry.shadow = entry.shadow || m.castShadow;
      const ol = m.userData.outline;
      if (outlines && ol) {
        if (!byOutline.has(ol)) byOutline.set(ol, []);
        // Outline needs smooth normals: rebuild from an indexed copy.
        const og = normaliseGeometry(m.geometry, false);
        og.applyMatrix4(m.matrix);
        byOutline.get(ol).push(og);
      }
      joint.remove(m);
    }
    for (const { material, geos, shadow } of byMat.values()) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = shadows && shadow;
      mesh.userData.merged = true;
      joint.add(mesh);
    }
    for (const [thickness, geos] of byOutline.entries()) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, outlineMaterial(thickness));
      mesh.userData.isOutline = true;
      joint.add(mesh);
    }
  }
}

/** Dispose geometries (materials are shared/cached and intentionally kept). */
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}

/** Simple crescent / blade shape extruded thin. */
export function bladeGeometry(length, width, curve = 0.15, thickness = 0.012) {
  const s = new THREE.Shape();
  s.moveTo(0, -width * 0.5);
  s.quadraticCurveTo(length * 0.55, -width * 0.5 - curve * length * 0.3, length, curve * length);
  s.quadraticCurveTo(length * 0.5, width * 0.6 + curve * length * 0.15, 0, width * 0.5);
  s.lineTo(0, -width * 0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.4, bevelSize: thickness * 0.5, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -thickness / 2);
  g.computeVertexNormals();
  return g;
}
