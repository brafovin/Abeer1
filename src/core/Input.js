// Keyboard + mouse input with pointer lock support.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.mouseReleased = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true; // gameplay input routing (UI disables it)
    this.onLockChange = null;
    this.onKeyDown = null; // global hook (UI shortcuts)

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (this.isGameKey(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.isGameKey(e.code) && document.activeElement?.tagName !== 'INPUT') e.preventDefault();
      if (this.onKeyDown) this.onKeyDown(e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });

    canvas.addEventListener('mousedown', (e) => {
      this.mouseButtons.add(e.button);
      this.mousePressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => {
      if (this.mouseButtons.has(e.button)) this.mouseReleased.add(e.button);
      this.mouseButtons.delete(e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.mouseButtons.size > 0 || this.freeLook) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      // Pointer lock can fail (e.g. in embedded or automated browsers). The game stays
      // playable: dragging with a mouse button held also rotates the camera.
      console.warn('[Input] Pointer lock was refused; hold a mouse button and drag to look around.');
      this.freeLook = true;
    });
    this.freeLook = false;
  }

  isGameKey(code) {
    return (
      code === 'Space' ||
      code === 'Tab' ||
      code.startsWith('Arrow') ||
      code === 'KeyQ' ||
      code === 'KeyE' ||
      code === 'KeyR' ||
      code === 'KeyF'
    );
  }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          this.freeLook = true;
        });
      }
    } catch (err) {
      this.freeLook = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.enabled && this.keys.has(code);
  }

  justPressed(code) {
    return this.enabled && this.pressed.has(code);
  }

  mouseDown(btn) {
    return this.enabled && this.mouseButtons.has(btn);
  }

  mouseJustPressed(btn) {
    return this.enabled && this.mousePressed.has(btn);
  }

  mouseJustReleased(btn) {
    return this.mouseReleased.has(btn);
  }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY, wheel: this.wheel };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    return d;
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
  }

  clearHeld() {
    this.keys.clear();
    this.mouseButtons.clear();
    this.pressed.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
    this.mouseDX = this.mouseDY = 0;
  }
}
