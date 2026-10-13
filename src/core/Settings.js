// Persistent player settings (stored separately from save games so they survive "New Game").

const SETTINGS_KEY = 'bloodmoon.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.85,
  mouseSensitivity: 1.0, // multiplier (0.2 - 3)
  invertY: false,
  graphicsQuality: 'medium', // 'low' | 'medium' | 'high'
  screenShake: 0.7, // 0 - 1
  reduceFlashing: false,
  reduceLoudSounds: false,
  showDamageNumbers: true,
  fov: 62,
});

export class Settings {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
          if (key in parsed && typeof parsed[key] === typeof DEFAULT_SETTINGS[key]) {
            this.values[key] = parsed[key];
          }
        }
      }
      if (!['low', 'medium', 'high'].includes(this.values.graphicsQuality)) {
        this.values.graphicsQuality = 'medium';
      }
    } catch (err) {
      console.warn('[Settings] Could not read saved settings, using defaults.', err);
    }
  }

  save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.values));
    } catch (err) {
      console.warn('[Settings] Could not persist settings.', err);
    }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (!(key in DEFAULT_SETTINGS)) return;
    this.values[key] = value;
    this.save();
    for (const fn of this.listeners) fn(key, value, this.values);
  }

  reset() {
    this.values = { ...DEFAULT_SETTINGS };
    this.save();
    for (const key of Object.keys(this.values)) {
      for (const fn of this.listeners) fn(key, this.values[key], this.values);
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot() {
    return { ...this.values };
  }

  /** Apply settings embedded in an older save (only if the player has no local settings yet). */
  applySnapshot(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in obj && typeof obj[key] === typeof DEFAULT_SETTINGS[key]) this.values[key] = obj[key];
    }
    this.save();
    for (const key of Object.keys(this.values)) {
      for (const fn of this.listeners) fn(key, this.values[key], this.values);
    }
  }
}
