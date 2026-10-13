// Single-draw-call atmospheric effects: candle flame fields, ground fog banks, floating motes,
// the sky dome with stars and the crimson moon.
import * as THREE from 'three';
import { Tex } from './Materials.js';
import { seeded } from '../core/utils.js';

/** All candle / torch flames of an area rendered as one flickering point cloud. */
export class FlameField {
  constructor() {
    this.positions = [];
    this.sizes = [];
    this.seeds = [];
    this.colors = [];
    this.points = null;
  }

  add(x, y, z, size = 0.18, color = 0xffa040) {
    this.positions.push(x, y, z);
    this.sizes.push(size);
    this.seeds.push(Math.random() * 100);
    const c = new THREE.Color(color);
    this.colors.push(c.r, c.g, c.b);
  }

  build() {
    if (!this.positions.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.sizes, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seeds, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.colors, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aSeed; attribute vec3 aColor;
        uniform float uTime; uniform float uScale;
        varying vec3 vColor; varying float vFlick;
        void main() {
          float f = 0.75 + 0.25 * sin(uTime * 13.0 + aSeed * 7.0) * sin(uTime * 7.3 + aSeed * 3.1);
          vFlick = f;
          vColor = aColor;
          vec3 p = position;
          p.x += sin(uTime * 3.0 + aSeed) * 0.01;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * f * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vFlick;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          uv.x *= 1.8;
          uv.y += 0.12;
          float d = length(uv);
          float core = smoothstep(0.22, 0.0, d);
          float halo = smoothstep(0.5, 0.0, d) * 0.5;
          vec3 col = mix(vColor, vec3(1.0, 0.95, 0.8), core) * (core * 2.2 + halo) * vFlick;
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    return this.points;
  }

  update(time) {
    if (this.points) {
      this.points.material.uniforms.uTime.value = time;
      this.points.material.uniforms.uScale.value = window.innerHeight * 0.5;
    }
  }
}

/** Slowly drifting ground-fog billboards in a single Points draw call. */
export class FogField {
  constructor({ count = 60, area = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, y = 0.6, size = 9, color = 0x8a8098, opacity = 0.22, seed = 5, heightFn = null }) {
    const rng = seeded(seed);
    const pos = [], seeds = [];
    for (let i = 0; i < count; i++) {
      const x = rng.range(area.minX, area.maxX), z = rng.range(area.minZ, area.maxZ);
      pos.push(x, (heightFn ? heightFn(x, z) : 0) + y + rng.range(-0.3, 0.6), z);
      seeds.push(rng() * 100);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTex: { value: Tex.fog() },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
        uSize: { value: size },
        uScale: { value: window.innerHeight * 0.5 },
        fogColor: { value: new THREE.Color() },
        fogDensity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uSize, uScale;
        varying float vAlpha; varying float vRot;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.05 + aSeed) * 2.5;
          p.z += cos(uTime * 0.04 + aSeed * 1.3) * 2.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          vAlpha = smoothstep(1.0, 6.0, dist) * (1.0 - smoothstep(40.0, 70.0, dist));
          vRot = aSeed + uTime * 0.02;
          gl_PointSize = uSize * uScale / max(0.5, dist);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uColor; uniform float uOpacity;
        varying float vAlpha; varying float vRot;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = mat2(c, -s, s, c) * uv + 0.5;
          float a = texture2D(uTex, uv).a * uOpacity * vAlpha;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uScale.value = window.innerHeight * 0.5;
  }
}

/** Floating dust / ash / ember motes that follow the camera (wrap-around volume). */
export class MoteField {
  constructor({ count = 300, radius = 18, height = 8, color = 0xd8b0b8, size = 0.06, rise = 0.15, additive = true }) {
    this.radius = radius;
    this.height = height;
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * radius;
      pos[i * 3 + 1] = Math.random() * height;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * radius;
      seeds[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: radius },
        uHeight: { value: height },
        uColor: { value: new THREE.Color(color) },
        uSize: { value: size },
        uRise: { value: rise },
        uScale: { value: window.innerHeight * 0.5 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uRadius, uHeight, uSize, uRise, uScale; uniform vec3 uCenter;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * uRise * (0.5 + fract(aSeed) ), uHeight);
          p.x += sin(uTime * 0.3 + aSeed) * 0.6;
          p.z += cos(uTime * 0.25 + aSeed * 1.7) * 0.6;
          // wrap around the camera
          vec3 rel = p - uCenter;
          rel.x = mod(rel.x + uRadius, 2.0 * uRadius) - uRadius;
          rel.z = mod(rel.z + uRadius, 2.0 * uRadius) - uRadius;
          vec3 wp = vec3(uCenter.x + rel.x, p.y + uCenter.y - uHeight * 0.3, uCenter.z + rel.z);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vA = (0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 5.0)) * smoothstep(uRadius, uRadius * 0.4, length(rel.xz));
          gl_PointSize = uSize * uScale / max(0.2, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
  }

  update(time, center) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCenter.value.copy(center);
    this.material.uniforms.uScale.value = window.innerHeight * 0.5;
  }
}

/** Gradient sky dome + stars + a large blood moon with halo. */
export class Sky {
  constructor({ top = 0x050308, horizon = 0x2a0a14, moonColor = 0xff3a3a, moonDir = new THREE.Vector3(0.3, 0.42, 1), moonSize = 60, stars = true, glow = 1 } = {}) {
    this.group = new THREE.Group();
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(top) },
        uHorizon: { value: new THREE.Color(horizon) },
        uMoonDir: { value: moonDir.clone().normalize() },
        uMoonColor: { value: new THREE.Color(moonColor) },
        uGlow: { value: glow },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uMoonColor, uMoonDir; uniform float uGlow;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uTop, smoothstep(-0.05, 0.55, h));
          float m = max(dot(normalize(vDir), uMoonDir), 0.0);
          col += uMoonColor * (pow(m, 40.0) * 0.6 + pow(m, 6.0) * 0.12) * uGlow;
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);
    this.skyMat = skyMat;

    if (stars) {
      const rng = seeded(808);
      const pos = [];
      for (let i = 0; i < 900; i++) {
        const theta = rng() * Math.PI * 2;
        const y = rng.range(0.08, 1);
        const r = Math.sqrt(1 - y * y);
        pos.push(Math.cos(theta) * r * 380, y * 380, Math.sin(theta) * r * 380);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xd8c8e0, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false, depthWrite: false });
      const pts = new THREE.Points(g, starMat);
      pts.frustumCulled = false;
      this.group.add(pts);
    }

    // the moon: textured disc + additive halo, always facing the camera
    const dir = moonDir.clone().normalize();
    this.moon = new THREE.Group();
    this.moon.position.copy(dir.multiplyScalar(330));
    const moonMat = new THREE.MeshBasicMaterial({ map: Tex.moon(), color: new THREE.Color(moonColor).multiplyScalar(1.6), transparent: true, fog: false, toneMapped: false, depthWrite: false });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(moonSize, moonSize), moonMat);
    this.moon.add(disc);
    const haloMat = new THREE.MeshBasicMaterial({ map: Tex.soft(), color: new THREE.Color(moonColor).multiplyScalar(0.9 * glow), transparent: true, blending: THREE.AdditiveBlending, fog: false, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(moonSize * 4, moonSize * 4), haloMat);
    halo.position.z = -1;
    this.moon.add(halo);
    this.moonMat = moonMat;
    this.haloMat = haloMat;
    this.group.add(this.moon);

    // drifting cloud wisps that pass over the moon
    this.clouds = [];
    const cloudMat = new THREE.MeshBasicMaterial({ map: Tex.fog(), color: 0x0a0609, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(moonSize * 2.6, moonSize * 0.7), cloudMat);
      c.userData.offset = i * 1.9;
      this.moon.add(c);
      this.clouds.push(c);
    }
    this.group.traverse((o) => (o.frustumCulled = false));
  }

  update(time, camera) {
    this.group.position.copy(camera.position);
    this.moon.lookAt(camera.position);
    for (const c of this.clouds) {
      const t = time * 0.012 + c.userData.offset;
      c.position.set(((t % 2) - 1) * 160, Math.sin(c.userData.offset * 3) * 18, 2 + c.userData.offset);
    }
  }

  setMoonPulse(v) {
    this.moonMat.color.setRGB(1.6 * v, 0.35 * v, 0.35 * v);
  }
}
