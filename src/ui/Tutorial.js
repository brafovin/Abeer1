// Short contextual tutorial for new players (shown once per save).
import { escapeHtml as esc } from '../core/utils.js';

const STEPS = {
  move: { title: 'Movement', text: (g) => 'Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> and look with the mouse — click the game to lock the cursor (<kbd>Esc</kbd> pauses). Hold <kbd>Shift</kbd> to sprint, <kbd>Space</kbd> to jump.', doneOn: 'move', next: 'interact', delay: 4 },
  interact: { title: 'Explore', text: () => 'A golden diamond marks your objective. Glowing motes mark things you can examine — walk up and press <kbd>F</kbd>. Start with the note on the altar behind you.', doneOn: 'interact' },
  combat: {
    title: 'Combat',
    text: (g) => `<kbd>Left Mouse</kbd> attack combo · <kbd>Right Mouse</kbd> ${esc(g.player.def.heavy.name)}<br><kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd> abilities cost Blood Energy (red bar) — landing hits refills it. Watch for red warning circles.`,
    doneOn: 'ability',
    next: 'healing',
    timeout: 30,
  },
  healing: { title: 'Survival', text: () => 'Drink a Blood Vial with <kbd>1</kbd> or <kbd>H</kbd>. Rest at a Moonlit Shrine (blue crescent) to heal and save. <kbd>Tab</kbd> opens your inventory, journal and attribute points.', doneOn: 'shrine', timeout: 16 },
};

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.done = false;
    this.seen = new Set();
    this.current = null;
    this.el = null;
  }

  reset() {
    this.done = false;
    this.seen.clear();
    this.hide();
  }

  loadDone(flag) {
    this.done = !!flag;
    this.seen.clear();
  }

  show(id) {
    if (this.done || this.seen.has(id) || !STEPS[id] || !this.game.player) return;
    this.seen.add(id);
    this.hide();
    const s = STEPS[id];
    this.current = id;
    const el = document.createElement('div');
    el.className = 'hint-box';
    el.innerHTML = `<h4>${esc(s.title.toUpperCase())}</h4>${s.text(this.game)}`;
    this.game.ui.layers.hud.appendChild(el);
    this.el = el;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.complete(id), (s.timeout ?? 40) * 1000);
  }

  hide() {
    this.el?.remove();
    this.el = null;
    this.current = null;
  }

  complete(id) {
    if (this.current !== id) return;
    const s = STEPS[id];
    this.hide();
    if (s.next) setTimeout(() => this.show(s.next), (s.delay ?? 1.5) * 1000);
    if (id === 'healing') this.done = true;
  }

  notify(event) {
    if (!this.current) return;
    const s = STEPS[this.current];
    if (s.doneOn === event || (this.current === 'combat' && event === 'kill')) {
      const id = this.current;
      if (event === 'move') {
        // let the player move around a bit before moving on
        if (this._moveTimer) return;
        this._moveTimer = setTimeout(() => {
          this._moveTimer = null;
          this.complete(id);
        }, 3500);
        return;
      }
      this.complete(id);
    }
  }
}
