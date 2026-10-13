// Event-driven quest system. Objectives count game events ("survivor", "relic", ...); counters are
// global, so progress made before a quest starts still counts when it becomes active.

export const QUESTS = {
  main_awaken: {
    type: 'main', title: 'Awaken in the Forgotten Cathedral',
    desc: 'You wake on a cold altar with seven nights missing from your memory.',
    objectives: [
      { event: 'read_testament', text: 'Examine the altar where you awoke', area: 'cathedral', marker: 'testament' },
      { event: 'ambush_cleared', text: 'Survive the things crawling in the nave', area: 'cathedral', marker: 'ambush' },
      { event: 'cathedral_exit', text: 'Leave the cathedral', area: 'cathedral', marker: 'exit' },
    ],
    reward: { xp: 120, items: { blood_vial: 1 } },
    next: ['main_survivors', 'main_clues'],
  },
  main_survivors: {
    type: 'main', title: 'The Silent Village',
    desc: 'Ashen Village is empty. Someone must still be hiding.',
    objectives: [{ event: 'survivor', count: 3, text: 'Find the missing villagers', area: 'village', marker: 'survivor' }],
    reward: { xp: 260, items: { blood_vial: 2 } },
    next: ['main_forest'],
  },
  main_clues: {
    type: 'main', title: 'Whispers of the Blood Moon',
    desc: 'Who turned the moon red? Search for clues.',
    objectives: [{ event: 'clue', count: 3, text: 'Discover clues about the Blood Moon', area: null, marker: 'clue' }],
    reward: { xp: 260, bloodMax: 20 },
  },
  main_forest: {
    type: 'main', title: 'Survive the Whispering Forest',
    desc: 'The survivors say the taken were carried north, into the forest.',
    objectives: [{ event: 'reach_altar', text: 'Find the path to the Blood Altar', area: 'forest', marker: 'altar_gate' }],
    reward: { xp: 220 },
    next: ['main_countess'],
  },
  main_countess: {
    type: 'main', title: 'The Veiled Countess',
    desc: 'Beneath the crimson moon, someone is waiting for you.',
    objectives: [{ event: 'countess_defeated', text: 'Defeat the Veiled Countess', area: 'altar', marker: 'boss' }],
    reward: { xp: 700, cosmetic: 'crimson_regalia' },
  },
  side_relics: {
    type: 'side', title: 'Relics of the Old Blood',
    desc: 'Three relics of the vampire royal house are hidden in Nocturna.',
    objectives: [{ event: 'relic', count: 3, text: 'Find hidden relics', marker: 'relic' }],
    reward: { xp: 200, cosmetic: 'silver_moon' },
  },
  side_altars: {
    type: 'side', title: 'Profane Altars',
    desc: 'Cursed altars feed the Blood Moon. Destroy them.',
    objectives: [{ event: 'altar', count: 3, text: 'Destroy cursed altars', marker: 'altar' }],
    reward: { xp: 220, bloodMax: 20, cosmetic: 'frost_hunter' },
  },
  side_secrets: {
    type: 'side', title: 'What the Walls Conceal',
    desc: 'The old builders loved their hidden rooms.',
    objectives: [{ event: 'secret', count: 2, text: 'Discover secret rooms', marker: 'secret' }],
    reward: { xp: 160, cosmetic: 'midnight_violet' },
  },
  side_records: {
    type: 'side', title: 'Lost Vampire Records',
    desc: 'Pages of the Nocturnal Archive are scattered across the land.',
    objectives: [{ event: 'record', count: 4, text: 'Collect lost vampire records', marker: 'record' }],
    reward: { xp: 220, relic: 'archivist_quill' },
  },
  court_main: {
    type: 'side', title: 'The Court of a Thousand Vampires',
    desc: 'Castle Nocturne hosts 1,024 vampires. Befriend them — or take their power.',
    objectives: [
      { event: 'court_ally', count: 3, text: 'Befriend vampires of the court', area: 'castle' },
      { event: 'court_duel', count: 3, text: 'Win duels and steal vampire powers', area: 'castle' },
    ],
    reward: { xp: 400, items: { blood_vial: 3 } },
  },
  court_sovereigns: {
    type: 'side', title: 'The Twin Sovereigns',
    desc: 'Dravik Solmere and Nyxara Vael rule the court. They will never call you friend.',
    objectives: [{ event: 'sovereign', count: 2, text: 'Defeat the Twin Sovereigns', area: 'throne', marker: 'throne' }],
    reward: { xp: 2000 },
  },
};

export const START_QUESTS = ['main_awaken', 'side_relics', 'side_altars', 'side_secrets', 'side_records', 'court_main', 'court_sovereigns'];

export class QuestSystem {
  constructor(game) {
    this.game = game;
    this.counters = {};
    this.active = [];
    this.completed = [];
    this.tracked = null;
  }

  reset() {
    this.counters = {};
    this.active = [];
    this.completed = [];
    for (const q of START_QUESTS) this.start(q, true);
  }

  start(id, silent = false) {
    if (!QUESTS[id] || this.active.includes(id) || this.completed.includes(id)) return;
    this.active.push(id);
    if (!silent) {
      this.game.ui.toast(`New quest: ${QUESTS[id].title}`, 'quest');
      this.game.audio.play('quest');
    }
    this.check(id);
    this.game.ui?.refreshQuests();
  }

  count(event) {
    return this.counters[event] ?? 0;
  }

  progress(id) {
    const q = QUESTS[id];
    return q.objectives.map((o) => ({ ...o, have: Math.min(this.count(o.event), o.count ?? 1), need: o.count ?? 1 }));
  }

  /** The first unfinished objective of the first active main quest (for the objective marker). */
  currentObjective() {
    const ordered = [...this.active].sort((a, b) => (QUESTS[a].type === 'main' ? 0 : 1) - (QUESTS[b].type === 'main' ? 0 : 1));
    for (const id of ordered) {
      if (QUESTS[id].type !== 'main') continue;
      for (const o of this.progress(id)) if (o.have < o.need) return { quest: id, ...o };
    }
    return null;
  }

  notify(event, amount = 1) {
    this.counters[event] = (this.counters[event] ?? 0) + amount;
    let changed = false;
    for (const id of [...this.active]) {
      if (QUESTS[id].objectives.some((o) => o.event === event)) {
        changed = true;
        const before = this.progress(id);
        this.check(id);
        const obj = before.find((o) => o.event === event);
        if (obj && this.active.includes(id) && obj.have <= obj.need && (obj.need > 1 || obj.have === 1)) {
          this.game.ui.toast(`${obj.text}: ${obj.have}/${obj.need}`, 'quest-progress');
        }
      }
    }
    if (changed) this.game.ui?.refreshQuests();
  }

  check(id) {
    if (!this.active.includes(id)) return;
    const done = this.progress(id).every((o) => o.have >= o.need);
    if (done) this.complete(id);
  }

  complete(id) {
    const g = this.game;
    const q = QUESTS[id];
    this.active = this.active.filter((a) => a !== id);
    this.completed.push(id);
    g.audio.play('quest');
    const r = q.reward || {};
    const parts = [];
    if (r.xp) parts.push(`+${g.player.gainXp(r.xp)} XP`);
    if (r.items) for (const [k, n] of Object.entries(r.items)) {
      g.inventory.add(k, n, true);
      parts.push(`${n}× ${g.inventory.itemName(k)}`);
    }
    if (r.bloodMax) {
      g.player.bonusMaxBlood += r.bloodMax;
      parts.push(`+${r.bloodMax} max Blood Energy`);
    }
    if (r.relic) {
      g.inventory.addRelic(r.relic, true);
      parts.push(g.inventory.relicName(r.relic));
    }
    if (r.cosmetic) {
      const name = g.inventory.unlockCosmetic(r.cosmetic);
      if (name) parts.push(`Outfit unlocked: ${name}`);
    }
    g.ui.questComplete(q.title, parts);
    for (const n of q.next ?? []) this.start(n);
    g.ui?.refreshQuests();
    g.saveSoon();
  }

  serialize() {
    return { counters: { ...this.counters }, active: [...this.active], completed: [...this.completed] };
  }

  load(data) {
    this.counters = { ...(data?.counters ?? {}) };
    this.active = (data?.active ?? []).filter((id) => QUESTS[id]);
    this.completed = (data?.completed ?? []).filter((id) => QUESTS[id]);
    // quests added in newer versions
    for (const q of START_QUESTS) if (!this.active.includes(q) && !this.completed.includes(q)) this.active.push(q);
  }
}
