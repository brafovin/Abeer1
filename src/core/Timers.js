// Game-time scheduler. Timers advance only while gameplay is running (they pause with the game).

export class Timers {
  constructor() {
    this.items = [];
    this.time = 0;
  }

  /** Run fn after `delay` seconds of game time. Returns a handle with cancel(). */
  after(delay, fn, tag = null) {
    const item = { at: this.time + delay, fn, tag, cancelled: false };
    this.items.push(item);
    return { cancel: () => (item.cancelled = true) };
  }

  /** Call fn(t01, elapsed) every frame for `duration` seconds, then onDone. */
  during(duration, fn, onDone = null, tag = null) {
    const item = { start: this.time, duration, tick: fn, onDone, tag, cancelled: false, at: Infinity };
    this.items.push(item);
    return { cancel: () => (item.cancelled = true) };
  }

  cancelTag(tag) {
    for (const it of this.items) if (it.tag === tag) it.cancelled = true;
  }

  clear() {
    this.items.length = 0;
  }

  update(dt) {
    this.time += dt;
    // Iterate over a snapshot so callbacks can schedule new timers safely.
    const list = this.items;
    this.items = [];
    for (const it of list) {
      if (it.cancelled) continue;
      if (it.tick) {
        const elapsed = this.time - it.start;
        const t = Math.min(1, elapsed / it.duration);
        try {
          it.tick(t, elapsed);
        } catch (err) {
          console.error('[Timers] during() callback failed:', err);
          continue;
        }
        if (t >= 1) {
          if (it.onDone) {
            try {
              it.onDone();
            } catch (err) {
              console.error('[Timers] onDone callback failed:', err);
            }
          }
          continue;
        }
        this.items.push(it);
      } else if (this.time >= it.at) {
        try {
          it.fn();
        } catch (err) {
          console.error('[Timers] after() callback failed:', err);
        }
      } else {
        this.items.push(it);
      }
    }
  }
}
