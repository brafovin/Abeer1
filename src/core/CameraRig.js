// Over-the-shoulder third-person camera with collision, zoom, shake and cinematic overrides.
import * as THREE from 'three';
import { clamp, damp, lerp } from './utils.js';

export class CameraRig {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.yaw = 0;
    this.pitch = 0.25;
    this.distance = 4.3;
    this.targetDistance = 4.3;
    this.shoulder = 0.55;
    this.pivot = new THREE.Vector3();
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.cinematic = null; // { position: Vector3, lookAt: Vector3, blend }
    this.cinematicBlend = 0;
    this._tmp = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.currentPos = new THREE.Vector3();
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get right() {
    return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  applyMouse(dx, dy, wheel) {
    const sens = 0.0022 * (this.settings.get('mouseSensitivity') ?? 1);
    const inv = this.settings.get('invertY') ? -1 : 1;
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch + dy * sens * inv, -0.45, 1.15);
    if (wheel) this.targetDistance = clamp(this.targetDistance + wheel * 0.45, 2.4, 7);
  }

  shake(amount) {
    const scale = this.settings.get('screenShake') ?? 1;
    this.shakeAmount = Math.min(1.2, Math.max(this.shakeAmount, amount * scale));
  }

  snapBehind(yaw, pitch = 0.22) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  /**
   * @param {THREE.Vector3} target player feet position
   * @param {object} world collision world exposing segmentBlocked(ax, az, bx, bz, y) and ceiling
   */
  update(dt, target, world, opts = {}) {
    this.distance = damp(this.distance, this.targetDistance * (opts.distanceScale ?? 1), 6, dt);
    const headY = opts.height ?? 1.55;
    this.pivot.set(target.x, target.y + headY, target.z);
    const right = this.right;
    const fwd = this.forward;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const pivotShoulder = this._tmp.copy(this.pivot).addScaledVector(right, this.shoulder);
    let dist = this.distance;

    // Pull the camera in if a wall is between the pivot and the desired position.
    if (world) {
      const bx = pivotShoulder.x - fwd.x * dist * cp;
      const bz = pivotShoulder.z - fwd.z * dist * cp;
      const by = pivotShoulder.y + dist * sp;
      const t = world.segmentBlocked(pivotShoulder.x, pivotShoulder.z, bx, bz, by - 0.3);
      if (t < 1) dist = Math.max(0.9, dist * t - 0.35);
    }
    this._desired.set(
      pivotShoulder.x - fwd.x * dist * cp,
      pivotShoulder.y + dist * sp,
      pivotShoulder.z - fwd.z * dist * cp,
    );
    const groundY = (opts.groundY ?? 0) + 0.35;
    if (this._desired.y < groundY) this._desired.y = groundY;
    if (world && world.ceiling != null && this._desired.y > world.ceiling - 0.5) this._desired.y = world.ceiling - 0.5;

    this._look.copy(pivotShoulder).addScaledVector(fwd, 4).add(new THREE.Vector3(0, -0.15 - this.pitch * 0.6, 0));

    // Cinematic override (boss intro, awakening) blends smoothly in and out.
    const wantCine = this.cinematic ? 1 : 0;
    this.cinematicBlend = damp(this.cinematicBlend, wantCine, 3.2, dt);
    if (this.cinematic) {
      this._desired.lerp(this.cinematic.position, this.cinematicBlend);
      this._look.lerp(this.cinematic.lookAt, this.cinematicBlend);
    } else if (this.cinematicBlend > 0.01 && this._lastCine) {
      this._desired.lerp(this._lastCine.position, this.cinematicBlend);
      this._look.lerp(this._lastCine.lookAt, this.cinematicBlend);
    }
    if (this.cinematic) this._lastCine = this.cinematic;

    this.currentPos.copy(this._desired);
    this.camera.position.copy(this._desired);

    // Shake
    if (this.shakeAmount > 0.001) {
      this.shakeTime += dt * 38;
      const s = this.shakeAmount * this.shakeAmount * 0.22;
      this.camera.position.x += Math.sin(this.shakeTime * 1.3) * s;
      this.camera.position.y += Math.sin(this.shakeTime * 1.7 + 1.2) * s;
      this.camera.position.z += Math.cos(this.shakeTime * 1.1) * s;
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.4);
    }
    this.camera.lookAt(this._look);
    const fov = this.settings.get('fov') ?? 62;
    const targetFov = fov + (opts.fovBoost ?? 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, targetFov, Math.min(1, dt * 6));
      this.camera.updateProjectionMatrix();
    }
  }
}
