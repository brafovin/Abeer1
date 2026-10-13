// Versioned localStorage save system with validation and migration.

export const SAVE_KEY = 'bloodmoon.save';
export const SAVE_VERSION = 2;

export class SaveSystem {
  constructor() {
    this.lastError = null;
  }

  hasSave() {
    return this.load() !== null;
  }

  /** Returns a short summary for menus or null. */
  summary() {
    const data = this.load();
    if (!data) return null;
    return {
      character: data.character,
      area: data.area,
      level: data.stats?.level ?? 1,
      timestamp: data.timestamp,
      playTime: data.playTime ?? 0,
      bossDefeated: !!data.flags?.boss_defeated,
    };
  }

  save(data) {
    try {
      const payload = { ...data, version: SAVE_VERSION, timestamp: Date.now() };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      this.lastError = null;
      return true;
    } catch (err) {
      this.lastError = 'Could not write save data (storage may be full or disabled).';
      console.error('[SaveSystem] Save failed:', err);
      return false;
    }
  }

  load() {
    let raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (err) {
      this.lastError = 'Local storage is not available in this browser.';
      console.error('[SaveSystem]', err);
      return null;
    }
    if (!raw) return null;
    try {
      const data = this.migrate(JSON.parse(raw));
      if (!this.validate(data)) {
        this.lastError = 'The save file is damaged and cannot be loaded.';
        console.warn('[SaveSystem] Save failed validation:', data);
        return null;
      }
      return data;
    } catch (err) {
      this.lastError = 'The save file is corrupted and cannot be loaded.';
      console.error('[SaveSystem] Could not parse save:', err);
      return null;
    }
  }

  migrate(data) {
    if (!data || typeof data !== 'object') return data;
    // v1 -> v2: inventory.equipped was introduced, cosmetics moved to a map.
    if ((data.version ?? 1) < 2) {
      data.inventory = data.inventory || {};
      data.inventory.equipped = data.inventory.equipped || [];
      data.cosmetics = data.cosmetics || {};
      data.version = 2;
    }
    return data;
  }

  validate(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.character !== 'string') return false;
    if (typeof data.area !== 'string') return false;
    if (!data.stats || typeof data.stats.level !== 'number') return false;
    if (!data.inventory || typeof data.inventory !== 'object') return false;
    if (!data.quests || typeof data.quests !== 'object') return false;
    if (!data.flags || typeof data.flags !== 'object') return false;
    return true;
  }

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      console.warn('[SaveSystem] Could not clear save:', err);
    }
  }
}
