// Inventory: consumables, key items, relics (equippable, 2 slots), lore records and cosmetics.
import { COSMETICS } from '../entities/models/CharacterModels.js';

export const ITEMS = {
  blood_vial: { name: 'Blood Vial', type: 'consumable', icon: 'vial', desc: 'Restores 45% of your health. Press [1] or [H] to drink.' },
  rusted_key: { name: 'Rusted Key', type: 'key', icon: 'key', desc: 'A heavy iron key stamped with the crest of the Marrow family.' },
  cellar_key: { name: 'Cellar Key', type: 'key', icon: 'key', desc: 'A small brass key. It smells of wine and damp earth.' },
};

export const RELICS = {
  fang_first_night: { name: 'Fang of the First Night', desc: 'A fang taken from the first vampire of Nocturna.', effect: '+12% damage', mods: { damage: 0.12 } },
  silver_rosary: { name: 'Silver Rosary of Saint Veyra', desc: 'It should burn you. It does not.', effect: '+25 max health, +5% damage reduction', mods: { maxHp: 25, defense: 0.05 } },
  moonstone_locket: { name: 'Moonstone Locket', desc: 'Inside: a portrait scratched out with a fingernail.', effect: '-15% ability cooldowns', mods: { cdr: 0.15 } },
  veil_of_ysolde: { name: 'Veil of Ysolde', desc: 'The Countess\'s veil, still warm.', effect: '+2 Blood Energy per second, +6% lifesteal', mods: { bloodRegen: 2, lifesteal: 0.06 } },
  archivist_quill: { name: 'Archivist\'s Quill', desc: 'The quill that wrote the Treaty. The ink is blood.', effect: '+15 max Blood Energy, +15% experience', mods: { maxBlood: 15, xp: 0.15 } },
  sovereign_signet: { name: 'Signet of the Twin Sovereigns', desc: 'Two rings fused into one by their final breath.', effect: '+15% damage, +40 max health, +8% crit', mods: { damage: 0.15, maxHp: 40, crit: 0.08 } },
};

export const RELIC_SLOTS = 2;

export class Inventory {
  constructor(game) {
    this.game = game;
    this.items = {};
    this.relics = [];
    this.equipped = [];
    this.records = [];
    this.cosmetics = {}; // charId -> [cosmeticIds]
  }

  reset() {
    this.items = { blood_vial: 2 };
    this.relics = [];
    this.equipped = [];
    this.records = [];
    this.cosmetics = { lucien: ['default'], seraphina: ['default'], kairo: ['default'] };
  }

  itemName(id) {
    return ITEMS[id]?.name ?? id;
  }

  relicName(id) {
    return RELICS[id]?.name ?? id;
  }

  count(id) {
    return this.items[id] ?? 0;
  }

  has(id) {
    return this.count(id) > 0;
  }

  add(id, n = 1, silent = false) {
    if (!ITEMS[id]) {
      console.warn('[Inventory] Unknown item', id);
      return;
    }
    this.items[id] = (this.items[id] ?? 0) + n;
    if (!silent) {
      this.game.ui.toast(`Obtained: ${ITEMS[id].name}${n > 1 ? ' ×' + n : ''}`, 'item');
      this.game.audio.play('pickup');
    }
    this.game.ui?.refreshHud?.();
  }

  consume(id) {
    if (!this.has(id)) return false;
    this.items[id]--;
    return true;
  }

  addRelic(id, silent = false) {
    if (!RELICS[id] || this.relics.includes(id)) return false;
    this.relics.push(id);
    if (this.equipped.length < RELIC_SLOTS) this.equipped.push(id);
    this.game.player?.refreshMods();
    if (!silent) {
      this.game.ui.toast(`Relic found: ${RELICS[id].name} — ${RELICS[id].effect}`, 'relic');
      this.game.audio.play('pickup', { pitch: 0.8 });
    }
    return true;
  }

  toggleEquip(id) {
    if (!this.relics.includes(id)) return;
    if (this.equipped.includes(id)) this.equipped = this.equipped.filter((r) => r !== id);
    else if (this.equipped.length < RELIC_SLOTS) this.equipped.push(id);
    else {
      this.game.ui.toast(`Only ${RELIC_SLOTS} relics can be worn. Unequip one first.`, 'warn');
      return;
    }
    this.game.player?.refreshMods();
  }

  relicMods() {
    const m = {};
    for (const id of this.equipped) {
      const r = RELICS[id];
      if (!r) continue;
      for (const k in r.mods) m[k] = (m[k] ?? 0) + r.mods[k];
    }
    return m;
  }

  addRecord(id) {
    if (this.records.includes(id)) return false;
    this.records.push(id);
    return true;
  }

  /** Unlock a cosmetic set for every character that has it. Returns a display name. */
  unlockCosmetic(cosId) {
    let name = null;
    for (const charId of Object.keys(COSMETICS)) {
      if (!COSMETICS[charId][cosId]) continue;
      this.cosmetics[charId] = this.cosmetics[charId] ?? ['default'];
      if (!this.cosmetics[charId].includes(cosId)) this.cosmetics[charId].push(cosId);
      name = name ?? COSMETICS[charId][cosId].name;
    }
    this.persistCosmetics();
    return name;
  }

  isUnlocked(charId, cosId) {
    return cosId === 'default' || (this.cosmetics[charId] ?? []).includes(cosId);
  }

  /** Cosmetics are also remembered across save slots so the character menu can show them. */
  persistCosmetics() {
    try {
      const prev = JSON.parse(localStorage.getItem('bloodmoon.cosmetics') || '{}');
      for (const k in this.cosmetics) prev[k] = Array.from(new Set([...(prev[k] ?? []), ...this.cosmetics[k]]));
      localStorage.setItem('bloodmoon.cosmetics', JSON.stringify(prev));
    } catch (err) {
      console.warn('[Inventory] Could not persist cosmetics', err);
    }
  }

  serialize() {
    return { items: { ...this.items }, relics: [...this.relics], equipped: [...this.equipped], records: [...this.records], cosmetics: JSON.parse(JSON.stringify(this.cosmetics)) };
  }

  load(data) {
    this.reset();
    if (!data) return;
    this.items = { ...(data.items ?? {}) };
    this.relics = (data.relics ?? []).filter((r) => RELICS[r]);
    this.equipped = (data.equipped ?? []).filter((r) => this.relics.includes(r)).slice(0, RELIC_SLOTS);
    this.records = [...(data.records ?? [])];
    this.cosmetics = { lucien: ['default'], seraphina: ['default'], kairo: ['default'], ...(data.cosmetics ?? {}) };
  }
}

/** Cosmetics unlocked in any save (for the main-menu character screen). */
export function globalCosmetics() {
  try {
    return JSON.parse(localStorage.getItem('bloodmoon.cosmetics') || '{}');
  } catch {
    return {};
  }
}
