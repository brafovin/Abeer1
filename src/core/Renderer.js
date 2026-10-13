// WebGL renderer + post-processing (bloom, cinematic grade, damage vignette, flashes).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setOutlinesVisible } from '../entities/models/Toon.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.045 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.2, 0.2) },
    uDesat: { value: 0 },
    uTint: { value: new THREE.Color(1.0, 0.94, 0.96) },
    uDarken: { value: 0 },
    uAberration: { value: 0.0012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uDamage, uFlash, uDesat, uDarken, uAberration;
    uniform vec3 uFlashColor, uTint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);
      float ab = uAberration * (1.0 + uDamage * 3.0) * d * 2.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ab).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ab).b;
      col *= uTint;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum) * vec3(1.05, 0.95, 0.95), uDesat);
      // soft cinematic vignette
      float vig = smoothstep(0.85, 0.2, d * (1.0 + uVignette * 0.6));
      col *= mix(1.0, vig, uVignette);
      // damage: crimson pulse at the screen edge
      float edge = smoothstep(0.25, 0.75, d);
      col = mix(col, vec3(0.45, 0.0, 0.03), edge * uDamage * 0.85);
      // flash
      col += uFlashColor * uFlash * (0.6 + 0.4 * (1.0 - d));
      col *= (1.0 - uDarken);
      // film grain
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime * 7.13)) - 0.5;
      col += g * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const QUALITY_PRESETS = {
  low: { pixelRatio: 1.0, shadows: false, bloom: false, particles: 0.45, antialias: false, shadowSize: 512, outlines: false },
  medium: { pixelRatio: 1.25, shadows: false, bloom: true, particles: 0.75, antialias: false, shadowSize: 1024 },
  high: { pixelRatio: 2.0, shadows: true, bloom: true, particles: 1.0, antialias: true, shadowSize: 2048 },
};

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    } catch (err) {
      throw new Error('WebGL could not be initialised. Please use a browser with WebGL 2 enabled. (' + err.message + ')');
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = null;
    this.camera = null;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.55, 0.62);
    this.gradePass = new ShaderPass(GradeShader);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(this.outputPass);

    this.flash = 0;
    this.flashDecay = 3;
    this.damage = 0;
    this.time = 0;
    this.applyQuality(settings.get('graphicsQuality'));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get quality() {
    return QUALITY_PRESETS[this.settings.get('graphicsQuality')] || QUALITY_PRESETS.medium;
  }

  applyQuality(name) {
    const q = QUALITY_PRESETS[name] || QUALITY_PRESETS.medium;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    const shadowChanged = this.renderer.shadowMap.enabled !== q.shadows;
    this.renderer.shadowMap.enabled = q.shadows;
    this.bloomPass.enabled = q.bloom;
    setOutlinesVisible(q.outlines !== false);
    if (shadowChanged && this.scene) {
      this.scene.traverse((o) => {
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => (m.needsUpdate = true));
        }
      });
    }
    this.resize();
  }

  setScene(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w * 0.5, h * 0.5);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Request a full-screen flash; heavily reduced when "reduce flashing" is enabled. */
  doFlash(color = 0xff2a3a, strength = 0.5, decay = 3) {
    const reduce = this.settings.get('reduceFlashing');
    const s = reduce ? Math.min(strength * 0.15, 0.06) : strength;
    this.flash = Math.max(this.flash, s);
    this.flashDecay = reduce ? Math.max(decay, 4) : decay;
    this.gradePass.uniforms.uFlashColor.value.set(color);
  }

  render(dt, extra = {}) {
    if (!this.scene || !this.camera) return;
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * this.flashDecay * Math.max(this.flash, 0.3) * 2);
    const u = this.gradePass.uniforms;
    u.uTime.value = this.time;
    u.uFlash.value = this.flash;
    u.uDamage.value = extra.damage ?? 0;
    u.uDesat.value = extra.desaturate ?? 0;
    u.uDarken.value = extra.darken ?? 0;
    u.uVignette.value = extra.vignette ?? 0.55;
    u.uGrain.value = this.settings.get('graphicsQuality') === 'low' ? 0.02 : 0.045;
    this.composer.render(dt);
  }
}
