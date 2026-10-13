// Combat VFX: pooled GPU particles (additive + dark smoke), slash arcs, shockwaves, telegraph
// circles, beams, eruption pillars and generic animated meshes.
import * as THREE from 'three';
import { Tex } from '../world/Materials.js';
import { rand, TAU } from '../core/utils.js';

class ParticlePool {
  constructor(max, blending) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aColor', this.colAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    const additive = blending === THREE.AdditiveBlending;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: Tex.soft() }, uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        uniform float uScale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; varying vec3 vColor; varying float vAlpha;
        void main() {
          float a = texture2D(uTex, gl_PointCoord).a * vAlpha;
          if (a < 0.003) discard;
          ${additive ? 'gl_FragColor = vec4(vColor * a, a);' : 'gl_FragColor = vec4(vColor, a);'}
        }`,
      transparent: true,
      depthWrite: false,
      blending,
      toneMapped: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0.5, grow = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.grow[i] = grow;
    this.alpha[i] = 1;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = Math.min(1, k * 1.6) * (k > 0.92 ? (1 - k) * 12 : 1);
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.material.uniforms.uScale.value = window.innerHeight * 0.5;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}

const _c = new THREE.Color();

export class Effects {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.glowPool = new ParticlePool(2400, THREE.AdditiveBlending);
    this.smokePool = new ParticlePool(900, THREE.NormalBlending);
    this.root = new THREE.Group();
    this.root.add(this.glowPool.points, this.smokePool.points);
    scene.add(this.root);
    this.anims = [];
    this.slashGeoCache = new Map();
  }

  setScene(scene) {
    this.scene.remove(this.root);
    this.scene = scene;
    scene.add(this.root);
  }

  get density() {
    const q = this.settings.get('graphicsQuality');
    return q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1;
  }

  clear() {
    this.glowPool.clear();
    this.smokePool.clear();
    for (const a of this.anims) {
      if (a.mesh) this.root.remove(a.mesh);
      a.dispose?.();
    }
    this.anims.length = 0;
  }

  /** Radial burst of glowing particles. */
  burst(pos, o = {}) {
    const n = Math.max(1, Math.round((o.count ?? 20) * this.density));
    _c.set(o.color ?? 0xff2040);
    const pool = o.smoke ? this.smokePool : this.glowPool;
    const speed = o.speed ?? 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const e = (Math.random() - 0.3) * (o.vertical ?? 1.2);
      const s = speed * (0.35 + Math.random() * 0.75);
      const dir = new THREE.Vector3(Math.cos(a), e, Math.sin(a)).normalize();
      if (o.dir) dir.lerp(o.dir, o.dirBias ?? 0.6).normalize();
      const spread = o.spread ?? 0.15;
      const v = o.colorVar ?? 0.15;
      pool.spawn(
        pos.x + (Math.random() - 0.5) * spread,
        pos.y + (Math.random() - 0.5) * spread,
        pos.z + (Math.random() - 0.5) * spread,
        dir.x * s,
        dir.y * s + (o.up ?? 0),
        dir.z * s,
        _c.r * (1 - v + Math.random() * v * 2),
        _c.g * (1 - v + Math.random() * v * 2),
        _c.b * (1 - v + Math.random() * v * 2),
        (o.size ?? 0.18) * (0.6 + Math.random() * 0.8),
        (o.life ?? 0.6) * (0.6 + Math.random() * 0.7),
        o.gravity ?? 6,
        o.drag ?? 1.5,
        o.grow ?? 0,
      );
    }
  }

  /** Particles spawned inside a disc on the ground (eruptions, auras). */
  disc(pos, radius, o = {}) {
    const n = Math.max(1, Math.round((o.count ?? 30) * this.density));
    _c.set(o.color ?? 0xff2040);
    const pool = o.smoke ? this.smokePool : this.glowPool;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius;
      pool.spawn(pos.x + Math.cos(a) * r, pos.y + (o.y ?? 0.1), pos.z + Math.sin(a) * r, (Math.random() - 0.5) * (o.spread ?? 0.6), (o.up ?? 3) * (0.5 + Math.random()), (Math.random() - 0.5) * (o.spread ?? 0.6), _c.r, _c.g, _c.b, (o.size ?? 0.2) * (0.6 + Math.random() * 0.8), (o.life ?? 0.8) * (0.6 + Math.random() * 0.7), o.gravity ?? 0, o.drag ?? 1, o.grow ?? 0);
    }
  }

  /** A stream of particles between two points (used for drains and beams). */
  stream(from, to, o = {}) {
    const n = Math.max(1, Math.round((o.count ?? 6) * this.density));
    _c.set(o.color ?? 0xff2040);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t, z = from.z + (to.z - from.z) * t;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const sp = o.speed ?? 1;
      this.glowPool.spawn(x + rand(-0.15, 0.15), y + rand(-0.15, 0.15), z + rand(-0.15, 0.15), dx * sp, dy * sp, dz * sp, _c.r, _c.g, _c.b, o.size ?? 0.16, o.life ?? 0.4, 0, 0);
    }
  }

  /** Generic animated mesh: update(t01, mesh) each frame, removed after duration. */
  animate(mesh, duration, update, onDone = null) {
    this.root.add(mesh);
    const a = { mesh, duration, t: 0, update, onDone };
    a.dispose = () => {
      mesh.traverse((o) => {
        if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
        if (o.material && !o.userData.sharedMat) o.material.dispose?.();
      });
    };
    this.anims.push(a);
    return a;
  }

  slashGeometry(radius, arc, width) {
    const key = radius + ':' + arc + ':' + width;
    if (!this.slashGeoCache.has(key)) {
      const g = new THREE.RingGeometry(radius - width, radius, 32, 1, -arc / 2, arc);
      // alpha gradient along the arc (stored in uv.x)
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const ang = Math.atan2(pos.getY(i), pos.getX(i));
        const t = (ang + arc / 2) / arc;
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, t, (r - (radius - width)) / width);
      }
      this.slashGeoCache.set(key, g);
    }
    return this.slashGeoCache.get(key);
  }

  /**
   * Crescent slash arc in the horizontal plane (or tilted).
   * yaw: facing direction; sweep: +1 sweeps right->left
   */
  slash(pos, yaw, o = {}) {
    const radius = o.radius ?? 2.4;
    const arc = o.arc ?? 2.4;
    const geo = this.slashGeometry(radius, arc, o.width ?? 0.9);
    const color = new THREE.Color(o.color ?? 0xff2040).multiplyScalar(o.intensity ?? 2.2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uT: { value: 0 }, uDir: { value: o.sweep ?? 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uT; uniform float uDir; varying vec2 vUv;
        void main(){
          float along = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
          float head = uT * 1.4;
          float a = smoothstep(head - 0.7, head, along) * (1.0 - smoothstep(head, head + 0.05, along));
          a *= smoothstep(0.0, 0.5, vUv.y) * (0.4 + 0.6 * vUv.y);
          a *= 1.0 - smoothstep(0.6, 1.0, uT);
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.sharedGeo = true;
    const holder = new THREE.Group();
    holder.position.copy(pos);
    holder.rotation.y = yaw;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.PI / 2; // arc centred on +Z (forward)
    const tiltG = new THREE.Group();
    tiltG.rotation.z = o.tilt ?? 0;
    tiltG.rotation.x = o.pitch ?? 0;
    tiltG.add(mesh);
    holder.add(tiltG);
    holder.renderOrder = 11;
    this.animate(holder, o.duration ?? 0.28, (t) => {
      mat.uniforms.uT.value = t;
    });
  }

  /** Expanding ground ring / shockwave. */
  ring(pos, o = {}) {
    const color = new THREE.Color(o.color ?? 0xff2040).multiplyScalar(o.intensity ?? 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const geo = new THREE.RingGeometry(0.8, 1, 48);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.position.y += 0.08;
    const r0 = o.from ?? 0.3, r1 = o.radius ?? 5;
    this.animate(mesh, o.duration ?? 0.5, (t) => {
      const r = r0 + (r1 - r0) * (1 - Math.pow(1 - t, 3));
      mesh.scale.set(r, r, r);
      mat.opacity = (1 - t) * (o.opacity ?? 0.9);
    });
  }

  /** Ground telegraph that fills over `duration`; calls onDone at the end. Returns a cancel handle. */
  telegraph(pos, radius, duration, o = {}) {
    const color = new THREE.Color(o.color ?? 0xff1030);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uT: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uT; uniform float uTime; varying vec2 vUv;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          float rim = smoothstep(0.9, 0.97, d) * (1.0 - smoothstep(0.97, 1.0, d));
          float fill = step(d, uT) * 0.35;
          float pulse = 0.6 + 0.4 * sin(uTime * 18.0);
          float a = (rim * pulse + fill + 0.08) * step(d, 1.0);
          gl_FragColor = vec4(uColor * 1.8 * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.position.y += 0.06;
    mesh.renderOrder = 3;
    let cancelled = false;
    const a = this.animate(mesh, duration, (t) => {
      mat.uniforms.uT.value = t;
      mat.uniforms.uTime.value += 1 / 60;
    }, () => {
      if (!cancelled && o.onDone) o.onDone();
    });
    return { cancel: () => { cancelled = true; a.t = a.duration; } };
  }

  /** Vertical eruption column (blood spikes, light pillars). */
  pillar(pos, o = {}) {
    const color = new THREE.Color(o.color ?? 0xff1030).multiplyScalar(o.intensity ?? 2.5);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, map: Tex.shaft(), side: THREE.DoubleSide });
    const h = o.height ?? 6, r = o.radius ?? 1;
    const geo = new THREE.CylinderGeometry(r, r * 1.2, h, 16, 1, true);
    geo.translate(0, h / 2, 0);
    // flip uv so the gradient fades upward
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.animate(mesh, o.duration ?? 0.6, (t) => {
      mesh.scale.set(1 + t * 0.4, Math.min(1, t * 5), 1 + t * 0.4);
      mat.opacity = 1 - t;
    });
    if (o.spikes) {
      const spikeMat = new THREE.MeshToonMaterial({ color: o.spikeColor ?? 0x7a0a18, emissive: new THREE.Color(0x400008) });
      const grp = new THREE.Group();
      grp.position.copy(pos);
      for (let i = 0; i < o.spikes; i++) {
        const a = Math.random() * TAU, d = Math.random() * r;
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.12 + Math.random() * 0.1, 1 + Math.random() * 1.4, 5), spikeMat);
        s.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
        s.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
        grp.add(s);
      }
      this.animate(grp, 0.9, (t) => {
        const k = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        grp.children.forEach((s) => (s.scale.y = Math.max(0.01, k)));
        grp.position.y = pos.y - (t > 0.6 ? (t - 0.6) * 1.5 : 0);
      }, () => spikeMat.dispose());
    }
  }

  /** Beam between two moving points (fns return Vector3). */
  beam(fromFn, toFn, duration, o = {}) {
    const color = new THREE.Color(o.color ?? 0xff1030).multiplyScalar(o.intensity ?? 2.4);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const geo = new THREE.CylinderGeometry(o.width ?? 0.06, o.width ?? 0.06, 1, 8, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, 0.5);
    const mesh = new THREE.Mesh(geo, mat);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.animate(mesh, duration, (t) => {
      a.copy(fromFn());
      b.copy(toFn());
      mesh.position.copy(a);
      mesh.lookAt(b);
      mesh.scale.set(1 + Math.sin(t * 60) * 0.3, 1 + Math.sin(t * 60) * 0.3, a.distanceTo(b));
      mat.opacity = 0.85 * (t > 0.85 ? (1 - t) / 0.15 : 1);
    });
  }

  /** Expanding translucent sphere (shields, explosions). */
  sphere(pos, o = {}) {
    const color = new THREE.Color(o.color ?? 0xff1030).multiplyScalar(o.intensity ?? 1.5);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o.opacity ?? 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
    mesh.position.copy(pos);
    const r0 = o.from ?? 0.2, r1 = o.radius ?? 3;
    this.animate(mesh, o.duration ?? 0.4, (t) => {
      const r = r0 + (r1 - r0) * (1 - Math.pow(1 - t, 2));
      mesh.scale.setScalar(r);
      mat.opacity = (o.opacity ?? 0.5) * (1 - t);
      if (o.follow) mesh.position.copy(o.follow());
    });
    return mesh;
  }

  update(dt) {
    this.glowPool.update(dt);
    this.smokePool.update(dt);
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const t = Math.min(1, a.t / a.duration);
      try {
        a.update?.(t, a.mesh);
      } catch (err) {
        console.error('[Effects] animation update failed', err);
        a.t = a.duration;
      }
      if (a.t >= a.duration) {
        this.root.remove(a.mesh);
        a.dispose();
        this.anims.splice(i, 1);
        try {
          a.onDone?.();
        } catch (err) {
          console.error('[Effects] onDone failed', err);
        }
      }
    }
  }
}
