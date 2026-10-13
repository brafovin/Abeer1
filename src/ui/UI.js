// DOM user interface: main menu, character selection, settings, credits, HUD, inventory, pause,
// notes, death & victory screens, toasts, damage numbers and the objective marker.
import * as THREE from 'three';
import { CHARACTERS, CHARACTER_ORDER } from '../entities/characters.js';
import { COSMETICS } from '../entities/models/CharacterModels.js';
import { ITEMS, RELICS, RELIC_SLOTS, globalCosmetics } from '../game/Inventory.js';
import { QUESTS } from '../game/Quests.js';
import { NOTES } from '../game/Story.js';
import { POWERS, tierOf } from '../game/Powers.js';
import { MAX_FOLLOWERS } from '../game/Court.js';
import { xpForLevel } from '../entities/Player.js';
import { ICONS, abilityIcon } from './icons.js';
import { escapeHtml as esc, formatTime, clamp } from '../core/utils.js';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const LOADING_TIPS = [
  'Moonlit Shrines restore your health and save your progress.',
  'Red circles on the ground erupt a moment later — keep moving.',
  'Hollow Knights block frontal attacks. Heavy attacks and abilities break their guard.',
  'Night Stalkers hide in the dark. If you hear a shriek, turn around.',
  'Befriended vampires fight beside you. Up to three can follow you at once.',
  'Killing a vampire of the court steals their power — but dying costs you every stolen power.',
  'Spend attribute points in the Inventory (Tab) after levelling up.',
  'Blood Energy fuels your abilities. Land hits to refill it.',
];

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.stack = [];
    this.root.innerHTML = '';
    this.layers = {};
    for (const name of ['world', 'hud', 'menu', 'panels', 'top']) {
      const el = document.createElement('div');
      el.className = 'layer layer-' + name;
      el.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
      this.root.appendChild(el);
      this.layers[name] = el;
    }
    this.fade = h('<div id="fade"></div>');
    this.layers.top.appendChild(this.fade);
    this.toasts = h('<div class="toasts"></div>');
    this.layers.top.appendChild(this.toasts);
    this.dmgPool = [];
    this.dmgActive = [];
    this.hud = null;
    this.charIndex = Math.max(0, CHARACTER_ORDER.indexOf(game.selectedChar));
    this.cosmeticChoice = {};
    this._v = new THREE.Vector3();
  }

  // ── generic helpers ────────────────────────────────────────────────────────────────────────────
  click(el, fn) {
    el.addEventListener('click', (e) => {
      this.game.audio.unlock();
      this.game.audio.play('ui_click');
      fn(e);
    });
    el.addEventListener('mouseenter', () => this.game.audio.play('ui_hover', { volume: 0.5 }));
  }

  pushPanel(el, onClose) {
    this.layers.panels.appendChild(el);
    this.stack.push({ el, onClose });
  }

  closeTopPanel() {
    const top = this.stack.pop();
    if (!top) {
      if (this.game.state === 'paused') this.game.resume();
      return;
    }
    top.el.remove();
    this.game.audio.play('ui_back');
    top.onClose?.();
  }

  clearPanels() {
    for (const s of this.stack) s.el.remove();
    this.stack = [];
  }

  fadeIn(t = 1) {
    this.fade.style.transitionDuration = '0s';
    this.fade.style.opacity = '1';
    void this.fade.offsetWidth;
    this.fade.style.transitionDuration = t + 's';
    this.fade.style.opacity = '0';
  }

  fadeOut(t = 0.6, cb) {
    this.fade.style.transitionDuration = t + 's';
    this.fade.style.opacity = '1';
    setTimeout(() => cb?.(), t * 1000 + 30);
  }

  showLoading(text) {
    this.hideLoading();
    const tip = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    this.loading = h(`<div id="loading"><div class="boot-moon"></div><div class="loading-text">${esc(text)}</div><div class="loading-tip">${esc(tip)}</div></div>`);
    this.layers.top.appendChild(this.loading);
  }

  hideLoading() {
    this.loading?.remove();
    this.loading = null;
  }

  fatal(msg) {
    const el = h(`<div class="overlay"><div class="panel modal"><div class="panel-body"><h2>Something went wrong</h2><p>${esc(msg)}</p><div class="modal-actions"><button class="btn-frame">Return to menu</button></div></div></div></div>`);
    this.click(el.querySelector('button'), () => {
      el.remove();
      this.game.returnToMenu(false);
    });
    this.layers.top.appendChild(el);
  }

  reportError(err) {
    if (this._errShown) return;
    this._errShown = true;
    const el = h(`<div class="error-banner interactive">An error occurred: ${esc(err.message || String(err))} (see console). The game will try to continue.</div>`);
    this.layers.top.appendChild(el);
    setTimeout(() => {
      el.remove();
      this._errShown = false;
    }, 6000);
  }

  // ── main menu ──────────────────────────────────────────────────────────────────────────────────
  showMainMenu() {
    this.hideMenus();
    const save = this.game.saves.summary();
    const ch = CHARACTERS[this.game.selectedChar];
    const el = h(`
      <div id="main-menu">
        <div class="menu-left">
          <div class="title-main">BLOOD <span class="accent">MOON</span></div>
          <div class="title-ornament">◆</div>
          <div class="title-sub">Eternal Night</div>
          <div class="menu-buttons">
            <button class="btn" data-a="start">Start Game</button>
            <button class="btn" data-a="continue" ${save ? '' : 'disabled'}>Continue${save ? '' : '<span class="btn-note">No saved game yet</span>'}</button>
            <button class="btn" data-a="chars">Character Selection</button>
            <button class="btn" data-a="settings">Settings</button>
            <button class="btn" data-a="credits">Credits</button>
          </div>
          <div class="menu-save-info">${save ? `Saved: <strong>${esc(CHARACTERS[save.character]?.name ?? save.character)}</strong> · Level ${save.level} · ${esc(this.areaName(save.area))} · ${formatTime(save.playTime)}${save.bossDefeated ? ' · Chapter I complete' : ''}` : ''}</div>
        </div>
        <div class="menu-char-tag"><div class="name" style="color:${ch.color}">${esc(ch.name)}</div><div class="role">${esc(ch.title)} · ${esc(ch.kind)}</div></div>
        <div class="menu-footer">Best with headphones · <kbd>Esc</kbd> back · Click anywhere to enable sound</div>
      </div>`);
    el.querySelectorAll('[data-a]').forEach((b) => this.click(b, () => this.menuAction(b.dataset.a)));
    // Continue explains why it is disabled
    const cont = el.querySelector('[data-a=continue]');
    if (!save) cont.addEventListener('click', () => this.toast('No save is available yet — start a new game first.', 'warn'));
    this.layers.menu.appendChild(el);
    this.mainMenu = el;
    this.game.menuScene.showCharacter(this.game.selectedChar, this.game.selectedCosmetic);
  }

  areaName(id) {
    return { cathedral: 'The Forgotten Cathedral', village: 'The Ashen Village', forest: 'The Whispering Forest', altar: 'The Blood Altar', castle: 'Castle Nocturne', throne: 'The Throne Hall' }[id] ?? id;
  }

  /** Remove every in-game overlay (used when returning to the main menu). */
  resetGameScreens() {
    this.hidePause();
    this.hideInventory();
    this.hideDeath();
    this.noteEl?.remove();
    this.noteEl = null;
    this.noteClose = null;
    this.layers.panels.innerHTML = '';
    this.layers.world.innerHTML = '';
    this.stack = [];
    this.dmgActive = [];
  }

  hideMenus() {
    this.layers.menu.innerHTML = '';
    this.clearPanels();
    this.mainMenu = null;
  }

  menuAction(a) {
    const g = this.game;
    if (a === 'start') {
      if (g.saves.hasSave()) {
        this.confirm('Starting a new game will overwrite your saved progress. Continue?', 'Overwrite & Begin', () => this.showCharacterSelect(true));
      } else this.showCharacterSelect(true);
    } else if (a === 'continue') {
      if (!g.saves.hasSave()) {
        this.toast(g.saves.lastError || 'No save is available yet — start a new game first.', 'warn');
        return;
      }
      g.continueGame();
    } else if (a === 'chars') this.showCharacterSelect(false);
    else if (a === 'settings') this.showSettings();
    else if (a === 'credits') this.showCredits();
  }

  confirm(text, okLabel, onOk, cancelLabel = 'Cancel') {
    const el = h(`<div class="overlay"><div class="panel modal"><div class="panel-body"><p>${esc(text)}</p><div class="modal-actions"><button class="btn-frame danger" data-a="ok">${esc(okLabel)}</button><button class="btn-frame secondary" data-a="no">${esc(cancelLabel)}</button></div></div></div></div>`);
    this.click(el.querySelector('[data-a=ok]'), () => {
      this.closeTopPanel();
      onOk();
    });
    this.click(el.querySelector('[data-a=no]'), () => this.closeTopPanel());
    this.pushPanel(el);
  }

  // ── character selection ────────────────────────────────────────────────────────────────────────
  showCharacterSelect(forNewGame) {
    const g = this.game;
    if (this.mainMenu) this.mainMenu.style.display = 'none';
    const unlocked = globalCosmetics();
    const el = h(`<div class="charsel">
      <div class="charsel-tabs"></div>
      <div class="panel charsel-info"><div class="panel-body"></div></div>
      <div class="charsel-hint">Drag to rotate · <kbd>←</kbd> <kbd>→</kbd> switch</div>
      <div class="charsel-actions">
        <button class="btn-frame secondary" data-a="back">Back</button>
        <button class="btn-frame" data-a="go">${forNewGame ? 'Begin the Night' : 'Select'}</button>
      </div>
    </div>`);
    const tabs = el.querySelector('.charsel-tabs');
    const body = el.querySelector('.panel-body');
    const render = () => {
      const id = CHARACTER_ORDER[this.charIndex];
      const c = CHARACTERS[id];
      const cos = this.cosmeticChoice[id] ?? (id === g.selectedChar ? g.selectedCosmetic : 'default');
      el.style.setProperty('--accent', c.color);
      tabs.innerHTML = CHARACTER_ORDER.map((cid, i) => `<button class="char-tab ${i === this.charIndex ? 'active' : ''}" data-i="${i}" style="--accent:${CHARACTERS[cid].color}">${esc(CHARACTERS[cid].name)}<small>${esc(CHARACTERS[cid].kind)}</small></button>`).join('');
      tabs.querySelectorAll('.char-tab').forEach((t) => this.click(t, () => {
        this.charIndex = +t.dataset.i;
        render();
      }));
      const heavyIcon = c.heavy.type === 'block' ? 'block' : c.heavy.type === 'projectile' ? 'lance' : 'heavy';
      const cosSet = COSMETICS[id];
      body.innerHTML = `
        <div class="char-name">${esc(c.name)}</div>
        <div class="char-title">${esc(c.title)}</div>
        <div class="char-meta">
          <b>Age</b><span>${c.age} · ${esc(c.kind)}</span>
          <b>Hair</b><span>${esc(c.hair)}</span>
          <b>Eyes</b><span>${esc(c.eyes)}</span>
          <b>Weapon</b><span>${esc(c.weapon)}</span>
          <b>Nature</b><span>${esc(c.personality)}</span>
          <b>Stats</b><span>Health ${c.base.hp} · Blood ${c.base.blood} · Speed ${c.base.speed}</span>
        </div>
        <p class="char-bio">${esc(c.bio)}</p>
        <div class="ability-list">
          <div class="ability-row"><div class="key">${ICONS[c.style] ?? ICONS.sword}</div><div><h4>LMB · ${c.combo.length}-hit combo</h4><p>Fast attacks that build Blood Energy.</p></div></div>
          <div class="ability-row"><div class="key">${ICONS[heavyIcon]}</div><div><h4>RMB · ${esc(c.heavy.name)}</h4><p>${esc(c.heavy.desc)}</p></div></div>
          ${['q', 'e', 'r'].map((k) => {
            const a = c.abilities[k];
            return `<div class="ability-row"><div class="key">${abilityIcon(a.id)}</div><div><h4>${a.key} · ${esc(a.name)} <span class="cost">${a.cost} blood · ${a.cooldown}s</span></h4><p>${esc(a.desc)}</p></div></div>`;
          }).join('')}
        </div>
        <div class="section-title" style="margin-top:16px">Outfit</div>
        <div class="cosmetic-row">${Object.entries(cosSet).map(([cid, cdef]) => {
          const ok = cid === 'default' || (unlocked[id] ?? []).includes(cid) || g.inventory.isUnlocked(id, cid);
          return `<button class="cos-chip ${cid === cos ? 'active' : ''} ${ok ? '' : 'locked'}" data-c="${cid}" title="${esc(cdef.desc)}">${esc(cdef.name)}${ok ? '' : ' 🔒'}</button>`;
        }).join('')}</div>
        <p style="font-size:14px;color:var(--text-dim);margin-top:8px">${esc(cosSet[cos]?.desc ?? '')}</p>`;
      body.querySelectorAll('.cos-chip').forEach((chip) => this.click(chip, () => {
        if (chip.classList.contains('locked')) {
          this.toast(cosSet[chip.dataset.c].desc, 'info');
          return;
        }
        this.cosmeticChoice[id] = chip.dataset.c;
        render();
      }));
      g.menuScene.showCharacter(id, cos);
    };
    this.click(el.querySelector('[data-a=back]'), () => this.closeTopPanel());
    this.click(el.querySelector('[data-a=go]'), () => {
      const id = CHARACTER_ORDER[this.charIndex];
      const cos = this.cosmeticChoice[id] ?? 'default';
      g.selectedChar = id;
      g.selectedCosmetic = cos;
      localStorage.setItem('bloodmoon.char', id);
      this.stack.pop();
      el.remove();
      if (forNewGame) g.newGame(id, cos);
      else this.showMainMenu();
    });
    this.onArrow = (e) => {
      if (!el.isConnected) return document.removeEventListener('keydown', this.onArrow);
      if (e.code === 'ArrowLeft') this.charIndex = (this.charIndex + 2) % 3;
      else if (e.code === 'ArrowRight') this.charIndex = (this.charIndex + 1) % 3;
      else return;
      render();
    };
    document.addEventListener('keydown', this.onArrow);
    render();
    g.menuScene.setCharSelect(true);
    this.pushPanel(el, () => {
      g.menuScene.setCharSelect(false);
      if (this.mainMenu) this.mainMenu.style.display = '';
      g.menuScene.showCharacter(g.selectedChar, g.selectedCosmetic);
    });
  }

  // ── settings ───────────────────────────────────────────────────────────────────────────────────
  showSettings() {
    const g = this.game;
    const s = g.settings;
    const el = h(`<div class="screen"><div class="panel" id="settings-panel">
      <div class="panel-header"><h2>Settings<small>Changes apply immediately and are saved</small></h2><button class="close-x" data-a="close">✕</button></div>
      <div class="panel-body"></div></div></div>`);
    const body = el.querySelector('.panel-body');
    const slider = (key, label, min, max, step, fmt, note = '') => `<div class="setting"><label>${label}${note ? `<small>${note}</small>` : ''}</label><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s.get(key)}"><span class="val" data-v="${key}">${fmt(s.get(key))}</span></div>`;
    const toggle = (key, label, note = '') => `<div class="setting setting-wide"><label>${label}${note ? `<small>${note}</small>` : ''}</label><div class="toggle ${s.get(key) ? 'on' : ''}" data-t="${key}" role="switch" tabindex="0"></div></div>`;
    const pct = (v) => Math.round(v * 100) + '%';
    const fmts = { masterVolume: pct, musicVolume: pct, sfxVolume: pct, mouseSensitivity: (v) => (+v).toFixed(2) + '×', screenShake: pct, fov: (v) => Math.round(v) + '°' };
    body.innerHTML = `
      <div class="setting-group"><h3>Audio</h3>
        ${slider('masterVolume', 'Master volume', 0, 1, 0.01, pct)}
        ${slider('musicVolume', 'Music volume', 0, 1, 0.01, pct)}
        ${slider('sfxVolume', 'Effects volume', 0, 1, 0.01, pct)}
        ${toggle('reduceLoudSounds', 'Reduce sudden loud sounds', 'Softens jump-scare stingers, thunder and heavy impacts')}
        <div class="setting setting-wide"><label>Custom background music<small data-music>${esc(g.audio.customMusicName ? 'Playing your file: ' + g.audio.customMusicName : 'Built-in original soundtrack. Load your own audio file (mp3/ogg/wav) to use it as background music this session.')}</small></label>
          <div style="display:flex;gap:6px"><label class="btn-frame small file-btn">Load file<input type="file" accept="audio/*" data-file></label><button class="btn-frame small secondary" data-a="clearmusic">Built-in</button></div></div>
      </div>
      <div class="setting-group"><h3>Controls</h3>
        ${slider('mouseSensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, fmts.mouseSensitivity)}
        ${toggle('invertY', 'Invert vertical look')}
      </div>
      <div class="setting-group"><h3>Graphics</h3>
        <div class="setting setting-wide"><label>Graphics quality<small>Low: no bloom/shadows · Medium: bloom · High: bloom, shadows, full resolution</small></label>
          <div class="seg" data-seg="graphicsQuality">${['low', 'medium', 'high'].map((q) => `<button data-q="${q}" class="${s.get('graphicsQuality') === q ? 'active' : ''}">${q}</button>`).join('')}</div></div>
        ${slider('fov', 'Field of view', 50, 85, 1, fmts.fov)}
        ${toggle('showDamageNumbers', 'Show damage numbers')}
      </div>
      <div class="setting-group"><h3>Comfort &amp; Accessibility</h3>
        ${slider('screenShake', 'Screen shake', 0, 1, 0.05, pct)}
        ${toggle('reduceFlashing', 'Reduce flashing effects', 'Dims lightning, screen flashes and strobing')}
      </div>
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:8px"><button class="btn-frame secondary" data-a="reset">Reset to defaults</button><button class="btn-frame" data-a="close">Done</button></div>`;
    const syncFill = (inp) => {
      const p = ((inp.value - inp.min) / (inp.max - inp.min)) * 100;
      inp.style.setProperty('--fill', p + '%');
    };
    body.querySelectorAll('input[type=range]').forEach((inp) => {
      syncFill(inp);
      inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        s.set(k, parseFloat(inp.value));
        body.querySelector(`[data-v=${k}]`).textContent = fmts[k](parseFloat(inp.value));
        syncFill(inp);
        if (k.endsWith('Volume')) g.audio.play('ui_hover');
      });
    });
    body.querySelectorAll('.toggle').forEach((t) => {
      const flip = () => {
        const k = t.dataset.t;
        s.set(k, !s.get(k));
        t.classList.toggle('on', s.get(k));
        g.audio.play('ui_click');
      };
      t.addEventListener('click', flip);
      t.addEventListener('keydown', (e) => (e.code === 'Space' || e.code === 'Enter') && flip());
    });
    body.querySelectorAll('[data-seg] button').forEach((b) => this.click(b, () => {
      s.set('graphicsQuality', b.dataset.q);
      body.querySelectorAll('[data-seg] button').forEach((x) => x.classList.toggle('active', x === b));
    }));
    const fileInp = body.querySelector('[data-file]');
    fileInp.addEventListener('change', async () => {
      const f = fileInp.files?.[0];
      if (!f) return;
      g.audio.unlock();
      const ok = await g.audio.loadUserFile(f, 'all');
      body.querySelector('[data-music]').textContent = ok ? 'Playing your file: ' + f.name : 'That file could not be decoded by this browser. Try mp3 or ogg.';
      this.toast(ok ? `Background music: ${f.name}` : 'Could not play that audio file.', ok ? 'good' : 'warn');
    });
    this.click(body.querySelector('[data-a=clearmusic]'), () => {
      g.audio.clearUserMusic();
      body.querySelector('[data-music]').textContent = 'Built-in original soundtrack.';
    });
    el.querySelectorAll('[data-a=close]').forEach((b) => this.click(b, () => this.closeTopPanel()));
    this.click(body.querySelector('[data-a=reset]'), () => {
      s.reset();
      this.closeTopPanel();
      this.showSettings();
    });
    if (this.mainMenu) this.mainMenu.style.display = 'none';
    this.pushPanel(el, () => {
      if (this.mainMenu) this.mainMenu.style.display = '';
    });
  }

  showCredits() {
    const el = h(`<div class="screen"><div class="panel" id="credits-panel">
      <div class="panel-header"><h2>Credits</h2><button class="close-x" data-a="close">✕</button></div>
      <div class="panel-body credits-body">
        <p><strong>BLOOD MOON: ETERNAL NIGHT</strong> — an original anime vampire action-horror game. Characters, story, world and music are original works created for this project with the help of an AI coding assistant (Claude Code by Anthropic) at the player's request.</p>
        <h3>Technology</h3>
        <ul>
          <li>Three.js — 3D rendering (MIT License)</li>
          <li>Vite — development server and bundler (MIT License)</li>
          <li>Web Audio API — every sound effect and all music are synthesised in real time by the game's own code</li>
          <li>Fonts: Cinzel, Cinzel Decorative (Natanael Gama) and Cormorant Garamond (Christian Thalmann) — SIL Open Font License 1.1, bundled via Fontsource</li>
        </ul>
        <h3>Assets</h3>
        <ul>
          <li>All 3D characters, monsters, buildings, textures and effects are generated procedurally at runtime by the game code. No third-party models, textures or recordings are used.</li>
          <li>Character designs draw on reference images supplied by the player for mood and style; no artwork is copied.</li>
          <li>The soundtrack is original music written in the style of melancholic Belle Époque waltzes; it is not taken from any other game. You may load your own audio files in Settings.</li>
        </ul>
        <h3>Thanks</h3>
        <p>To everyone who plays with the lights off.</p>
        <div style="text-align:right"><button class="btn-frame" data-a="close">Close</button></div>
      </div></div></div>`);
    el.querySelectorAll('[data-a=close]').forEach((b) => this.click(b, () => this.closeTopPanel()));
    if (this.mainMenu) this.mainMenu.style.display = 'none';
    this.pushPanel(el, () => {
      if (this.mainMenu) this.mainMenu.style.display = '';
    });
  }

  // ── HUD ────────────────────────────────────────────────────────────────────────────────────────
  showHud() {
    this.hideHud();
    const g = this.game;
    const c = g.player.def;
    const heavyIcon = c.heavy.type === 'block' ? 'block' : c.heavy.type === 'projectile' ? 'lance' : 'heavy';
    const el = h(`<div id="hud" style="--accent:${c.color}">
      <div class="hud-player">
        <div class="crest">${esc(c.name[0])}<span class="lvl">LV <b data-h="lvl">1</b></span></div>
        <div class="bars">
          <div class="name-line"><span>${esc(c.name)}</span><span class="powers-pill" data-h="powers"></span></div>
          <div class="bar hp" data-bar="hp"><div class="ghost"></div><div class="fill"></div><span class="txt"></span></div>
          <div class="bar stamina" data-bar="stamina"><div class="fill"></div></div>
          <div class="bar blood" data-bar="blood"><div class="fill"></div><span class="txt"></span></div>
          <div class="bar xp" data-bar="xp"><div class="fill"></div></div>
        </div>
      </div>
      <div class="allies-panel"></div>
      <div class="quest-tracker"></div>
      <div class="boss-bars"></div>
      <div class="crosshair"></div>
      <div class="hud-abilities">
        <div class="slot" data-s="lmb"><span class="k">LMB</span>${ICONS[c.style] ?? ICONS.sword}<span class="slot-name">Attack</span></div>
        <div class="slot" data-s="rmb"><span class="k">RMB</span>${ICONS[heavyIcon]}<div class="cd"></div><span class="slot-name">${esc(c.heavy.name)}</span></div>
        <div class="slot-sep"></div>
        ${['q', 'e', 'r'].map((k) => `<div class="slot ${k === 'r' ? 'big' : ''}" data-s="${k}"><span class="k">${k.toUpperCase()}</span>${abilityIcon(c.abilities[k].id)}<div class="cd"></div><span class="cdt"></span><span class="c">${c.abilities[k].cost}</span><span class="slot-name">${esc(c.abilities[k].name)}</span></div>`).join('')}
        <div class="slot-sep"></div>
        <div class="slot" data-s="t"><span class="k">T</span>${ICONS.power}<div class="cd"></div><span class="cdt"></span><span class="slot-name" data-h="tname">No power</span></div>
        <div class="slot" data-s="vial"><span class="k">1</span>${ICONS.vial}<span class="c" data-h="vials" style="color:#fff">0</span><span class="slot-name">Blood Vial</span></div>
      </div>
      <div class="prompt hidden"></div>
      <div class="marker hidden"><div class="gem"></div><div class="dist"></div></div>
      <div class="save-ind">Saving</div>
      <div class="fps ${/[?&]fps/.test(location.search) ? '' : 'hidden'}"></div>
    </div>`);
    this.layers.hud.appendChild(el);
    this.hud = el;
    this.hudRefs = {
      lvl: el.querySelector('[data-h=lvl]'),
      powers: el.querySelector('[data-h=powers]'),
      bars: Object.fromEntries(['hp', 'stamina', 'blood', 'xp'].map((k) => [k, el.querySelector(`[data-bar=${k}]`)])),
      slots: Object.fromEntries(['lmb', 'rmb', 'q', 'e', 'r', 't', 'vial'].map((k) => [k, el.querySelector(`[data-s=${k}]`)])),
      vials: el.querySelector('[data-h=vials]'),
      tname: el.querySelector('[data-h=tname]'),
      prompt: el.querySelector('.prompt'),
      marker: el.querySelector('.marker'),
      markerDist: el.querySelector('.marker .dist'),
      boss: el.querySelector('.boss-bars'),
      allies: el.querySelector('.allies-panel'),
      quests: el.querySelector('.quest-tracker'),
      save: el.querySelector('.save-ind'),
      fps: el.querySelector('.fps'),
    };
    this.refreshQuests();
  }

  hideHud() {
    this.hud?.remove();
    this.hud = null;
    this.hintEl?.remove();
    for (const d of this.dmgActive) d.el.remove();
    this.dmgActive = [];
  }

  refreshHud() {}

  setBar(bar, frac, text) {
    const f = clamp(frac, 0, 1);
    const fill = bar.querySelector('.fill');
    const key = Math.round(f * 1000);
    if (bar._k !== key) {
      bar._k = key;
      fill.style.transform = `scaleX(${f})`;
      const ghost = bar.querySelector('.ghost');
      if (ghost) ghost.style.transform = `scaleX(${f})`;
    }
    if (text !== undefined) {
      const t = bar.querySelector('.txt');
      if (t && t._t !== text) {
        t._t = text;
        t.textContent = text;
      }
    }
  }

  flashSlot(slot, kind) {
    const el = this.hudRefs?.slots[slot];
    if (!el) return;
    el.classList.remove('pulse', 'deny');
    void el.offsetWidth;
    el.classList.add(kind === 'used' ? 'pulse' : 'deny');
  }

  flashBar(name) {
    const el = this.hudRefs?.bars[name];
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  refreshQuests() {
    const q = this.game.quests;
    const el = this.hudRefs?.quests;
    if (!el) return;
    const mains = q.active.filter((id) => QUESTS[id].type === 'main');
    const sides = q.active.filter((id) => QUESTS[id].type !== 'main');
    const block = (id, side) => {
      const def = QUESTS[id];
      const objs = q.progress(id).map((o) => `<div class="qt-obj ${o.have >= o.need ? 'done' : ''}">${esc(o.text)}${o.need > 1 ? ` (${o.have}/${o.need})` : ''}</div>`).join('');
      return `<div class="qt-block ${side ? 'side' : ''}"><div class="qt-type">${side ? 'SIDE QUEST' : 'MAIN QUEST'}</div><div class="qt-title">${esc(def.title)}</div>${objs}</div>`;
    };
    const showSides = this.questLogOpen ? sides : sides.filter((id) => (this.game.area?.id === 'castle' || this.game.area?.id === 'throne') ? id.startsWith('court') : false).slice(0, 1);
    el.innerHTML = mains.map((id) => block(id, false)).join('') + showSides.map((id) => block(id, true)).join('') + `<div class="qt-more">${sides.length} side quests · <kbd>J</kbd> ${this.questLogOpen ? 'hide' : 'show'} · <kbd>Tab</kbd> journal</div>`;
  }

  toggleQuestLog() {
    this.questLogOpen = !this.questLogOpen;
    this.refreshQuests();
  }

  showBossBar() {}
  hideBossBar() {
    if (this.hudRefs) this.hudRefs.boss.innerHTML = '';
    this._bossSig = '';
  }

  areaBanner(name, sub) {
    const el = h(`<div class="area-banner"><div class="an">${esc(name)}</div><div class="line"></div><div class="as">${esc(sub ?? '')}</div></div>`);
    this.layers.world.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  subtitle(text) {
    this.subEl?.remove();
    this.subEl = h(`<div class="subtitle-line">${esc(text)}</div>`);
    this.layers.world.appendChild(this.subEl);
    const el = this.subEl;
    setTimeout(() => el.remove(), 3500);
  }

  toast(msg, kind = 'info') {
    if (!msg) return;
    const el = h(`<div class="toast ${kind}">${esc(msg)}</div>`);
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild.remove();
    const life = kind === 'boss' || kind === 'level' ? 5200 : msg.length > 80 ? 6000 : 3800;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
    }, life);
  }

  questComplete(title, parts) {
    this.toast(`QUEST COMPLETE — ${title}${parts.length ? ' · ' + parts.join(' · ') : ''}`, 'quest');
  }

  saveIndicator() {
    const el = this.hudRefs?.save;
    if (!el) return;
    el.classList.add('show');
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => el.classList.remove('show'), 1200);
  }

  showPowerGain(power, from) {
    const el = h(`<div class="power-popup"><div class="pp-k">POWER STOLEN FROM ${esc(from.name.toUpperCase())}</div><div class="pp-n" style="color:${power.color}">${esc(power.name)}</div><div class="pp-d">${esc(power.passiveText)} · Press <kbd>T</kbd>: ${esc(power.desc)}</div></div>`);
    this.layers.world.appendChild(el);
    setTimeout(() => el.remove(), 4300);
    this.toast(`You stole ${power.name}! Lose it if you die.`, 'relic');
  }

  // ── damage numbers / floating text ─────────────────────────────────────────────────────────────
  damageNumber(pos, value, kind = 'normal') {
    if (!this.game.settings.get('showDamageNumbers') && typeof value === 'number') return;
    const el = this.dmgPool.pop() ?? document.createElement('div');
    el.className = 'dmg ' + kind;
    el.textContent = typeof value === 'number' ? Math.round(value) : value;
    el.style.color = '';
    this.layers.world.appendChild(el);
    this.dmgActive.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30, life: kind === 'crit' ? 1.1 : 0.85 });
  }

  floatText(pos, text, color) {
    const el = this.dmgPool.pop() ?? document.createElement('div');
    el.className = 'dmg float';
    el.textContent = text;
    el.style.color = color;
    this.layers.world.appendChild(el);
    this.dmgActive.push({ el, pos: pos.clone(), t: 0, dx: 0, life: 1.6 });
  }

  project(pos) {
    const v = this._v.copy(pos).project(this.game.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, behind: v.z > 1 };
  }

  // ── per-frame HUD update ───────────────────────────────────────────────────────────────────────
  update(dt) {
    // damage numbers
    for (let i = this.dmgActive.length - 1; i >= 0; i--) {
      const d = this.dmgActive[i];
      d.t += dt;
      const s = this.project(d.pos);
      const k = d.t / d.life;
      if (k >= 1 || s.behind) {
        d.el.remove();
        this.dmgPool.push(d.el);
        this.dmgActive.splice(i, 1);
        continue;
      }
      d.el.style.transform = `translate(${s.x + d.dx * k - 10}px, ${s.y - 40 * k - 10}px) scale(${1 + (k < 0.15 ? (0.15 - k) * 4 : 0)})`;
      d.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
    const g = this.game;
    if (!this.hud || !g.player) return;
    const p = g.player;
    const r = this.hudRefs;
    this.setBar(r.bars.hp, p.hp / p.maxHp, `${Math.ceil(p.hp)} / ${p.maxHp}`);
    this.setBar(r.bars.stamina, p.stamina / p.maxStamina);
    this.setBar(r.bars.blood, p.blood / p.maxBlood, `${Math.floor(p.blood)}`);
    this.setBar(r.bars.xp, p.xp / xpForLevel(p.level));
    if (r.lvl._v !== p.level) {
      r.lvl._v = p.level;
      r.lvl.textContent = p.level + (p.statPoints ? ' ✦' : '');
    }
    const pc = g.powers.count;
    const powTxt = pc ? `${pc} stolen power${pc > 1 ? 's' : ''}` : '';
    if (r.powers._t !== powTxt) r.powers.textContent = r.powers._t = powTxt;
    // ability slots
    for (const k of ['q', 'e', 'r']) {
      const def = p.def.abilities[k];
      const slot = r.slots[k];
      const cd = p.cooldowns[k];
      const total = def.cooldown * p.cooldownMult;
      slot.querySelector('.cd').style.setProperty('--p', cd > 0 ? (cd / total) * 100 + '%' : '0%');
      const t = cd > 0 ? Math.ceil(cd) : '';
      const cdt = slot.querySelector('.cdt');
      if (cdt._t !== t) cdt.textContent = cdt._t = t;
      slot.classList.toggle('nores', p.blood < def.cost);
      slot.classList.toggle('ready', cd <= 0 && p.blood >= def.cost);
    }
    // stolen power slot
    const act = g.powers.active;
    const tslot = r.slots.t;
    const tname = act ? POWERS[act.power].name : g.powers.count ? 'Equip in Tab' : 'No power';
    if (r.tname._t !== tname) r.tname.textContent = r.tname._t = tname;
    tslot.classList.toggle('nores', !act);
    if (act) {
      const total = POWERS[act.power].cd * p.cooldownMult;
      tslot.querySelector('.cd').style.setProperty('--p', g.powers.cooldown > 0 ? (g.powers.cooldown / total) * 100 + '%' : '0%');
      const t = g.powers.cooldown > 0 ? Math.ceil(g.powers.cooldown) : '';
      const cdt = tslot.querySelector('.cdt');
      if (cdt._t !== t) cdt.textContent = cdt._t = t;
      tslot.style.color = POWERS[act.power].color;
    }
    const vials = g.inventory.count('blood_vial');
    if (r.vials._v !== vials) r.vials.textContent = r.vials._v = vials;
    r.slots.vial.classList.toggle('nores', vials === 0);
    // prompt
    const it = g.state === 'playing' ? g.nearestInteractable() : null;
    if (it) {
      const txt = `<kbd>F</kbd>${esc(typeof it.prompt === 'function' ? it.prompt(g) : it.prompt)}${it.subtitle ? `<small>${esc(it.subtitle)}</small>` : ''}`;
      if (r.prompt._t !== txt) r.prompt.innerHTML = r.prompt._t = txt;
      r.prompt.classList.remove('hidden');
    } else r.prompt.classList.add('hidden');
    // objective marker
    this.updateMarker();
    // boss bars
    const bars = g.bossBars();
    const sig = bars.map((b) => b.name + (b.small ? 's' : '')).join('|');
    if (sig !== this._bossSig) {
      this._bossSig = sig;
      r.boss.innerHTML = bars.map((b) => `<div class="boss-bar ${b.small ? 'small' : ''}"><div class="bname">${esc(b.name)}</div><div class="btitle">${esc(b.title ?? '')}</div><div class="bar"><div class="ghost"></div><div class="fill"></div></div></div>`).join('');
    }
    [...r.boss.children].forEach((el, i) => {
      const b = bars[i];
      if (!b) return;
      this.setBar(el.querySelector('.bar'), b.hp / b.maxHp);
      el.classList.toggle('enraged', !!b.enraged || b.phase === 2);
    });
    // allies
    const allies = g.allies;
    const asig = allies.map((a) => a.id).join(',');
    if (asig !== this._allySig) {
      this._allySig = asig;
      r.allies.innerHTML = allies.map((a) => `<div class="ally-chip"><div class="an"><span>${esc(a.name)}</span><span>Lv ${a.level}</span></div><div class="bar"><div class="fill"></div></div></div>`).join('');
    }
    [...r.allies.children].forEach((el, i) => allies[i] && this.setBar(el.querySelector('.bar'), allies[i].hp / allies[i].maxHp));
    this._fpsT = (this._fpsT ?? 0) + dt;
    if (this._fpsT > 1) {
      this._fpsT = 0;
      r.fps.textContent = Math.round(g.fps) + ' fps';
    }
  }

  updateMarker() {
    const g = this.game;
    const r = this.hudRefs;
    const tgt = g.state === 'playing' ? g.objectiveTarget() : null;
    if (!tgt) {
      r.marker.classList.add('hidden');
      return;
    }
    const pos = tgt.pos.clone();
    pos.y += 1.8;
    const s = this.project(pos);
    const W = window.innerWidth, H = window.innerHeight, m = 60, mTop = 130, mBottom = 130;
    let x = s.x, y = s.y;
    let edge = false;
    if (s.behind || x < m || x > W - m || y < mTop || y > H - mBottom) {
      edge = true;
      // direction from screen centre, flipped when behind the camera
      let dx = x - W / 2, dy = y - H / 2;
      if (s.behind) {
        dx = -dx;
        dy = -dy;
        if (dy < 0) dy = Math.abs(dy) * 0.2;
      }
      const halfH = dy < 0 ? H / 2 - mTop : H / 2 - mBottom;
      const k = Math.min((W / 2 - m) / Math.abs(dx || 1), halfH / Math.abs(dy || 1));
      x = W / 2 + dx * k;
      y = H / 2 + dy * k;
    }
    r.marker.classList.remove('hidden');
    r.marker.classList.toggle('edge', edge);
    r.marker.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    const d = Math.round(g.player.position.distanceTo(tgt.pos));
    if (r.markerDist._d !== d) r.markerDist.textContent = r.markerDist._d = d + ' m';
  }

  // ── notes ──────────────────────────────────────────────────────────────────────────────────────
  showNote(note, onClose) {
    const kindLabel = { clue: 'Clue', record: 'Lost Vampire Record', note: 'Note' }[note.kind] ?? 'Note';
    const el = h(`<div class="overlay"><div class="note-paper ${note.kind}"><div class="kind">${kindLabel}</div><h2>${esc(note.title)}</h2><p>${esc(note.text)}</p><div class="note-close">[F] / [Esc] / click to close</div></div></div>`);
    el.addEventListener('click', () => this.closeNote());
    this.layers.panels.appendChild(el);
    this.noteEl = el;
    this.noteClose = onClose;
    this.game.input.exitLock();
  }

  closeNote() {
    if (!this.noteEl) return;
    this.noteEl.remove();
    this.noteEl = null;
    this.game.audio.play('note', { volume: 0.5 });
    const cb = this.noteClose;
    this.noteClose = null;
    cb?.();
    this.game.input.requestLock();
  }

  // ── pause ──────────────────────────────────────────────────────────────────────────────────────
  showPause() {
    const g = this.game;
    const el = h(`<div class="overlay"><div class="pause-wrap">
      <div class="panel pause-menu"><div class="panel-header"><h2>Paused<small>${esc(g.area?.name ?? '')} · ${formatTime(g.playTime)}</small></h2></div>
        <div class="panel-body">
          <button class="btn" data-a="resume">Resume</button>
          <button class="btn" data-a="save">Save Game</button>
          <button class="btn" data-a="inv">Inventory &amp; Journal</button>
          <button class="btn" data-a="settings">Settings</button>
          <button class="btn" data-a="menu">Main Menu</button>
        </div></div>
      <div class="panel controls-card"><div class="panel-header"><h2>Controls</h2></div><div class="panel-body">
        <div class="controls-grid">
          <kbd>W A S D</kbd><span>Move</span><kbd>Mouse</kbd><span>Look (click the game to lock the cursor)</span>
          <kbd>Shift</kbd><span>Sprint</span><kbd>Space</kbd><span>Jump</span>
          <kbd>LMB</kbd><span>Attack combo</span><kbd>RMB</kbd><span>${esc(g.player.def.heavy.name)}</span>
          <kbd>Q / E / R</kbd><span>Abilities (R = ultimate)</span><kbd>T</kbd><span>Stolen vampire power</span>
          <kbd>F</kbd><span>Interact / talk / read</span><kbd>1 / H</kbd><span>Drink a Blood Vial</span>
          <kbd>Tab / I</kbd><span>Inventory, powers, allies, journal</span><kbd>J</kbd><span>Show all quests</span>
          <kbd>Wheel</kbd><span>Camera distance</span><kbd>Esc</kbd><span>Pause / close</span>
        </div></div></div>
    </div></div>`);
    el.querySelectorAll('[data-a]').forEach((b) => this.click(b, () => {
      const a = b.dataset.a;
      if (a === 'resume') g.resume();
      else if (a === 'save') g.saveGame(false);
      else if (a === 'inv') {
        this.hidePause();
        g.state = 'playing';
        g.openInventory();
      } else if (a === 'settings') this.showSettings();
      else if (a === 'menu') this.confirm('Return to the main menu? Your progress will be saved first.', 'Save & Quit', () => g.returnToMenu(true));
    }));
    this.pauseEl = el;
    this.layers.panels.appendChild(el);
  }

  hidePause() {
    this.pauseEl?.remove();
    this.pauseEl = null;
    this.clearPanels();
  }

  // ── inventory ──────────────────────────────────────────────────────────────────────────────────
  showInventory(tab = this.invTab ?? 'character') {
    this.hideInventory();
    const el = h(`<div class="overlay"><div class="panel inventory">
      <div class="panel-header"><h2>Inventory &amp; Journal<small>Tab / Esc to close</small></h2><button class="close-x" data-a="close">✕</button></div>
      <div class="inv-tabs">${[['character', 'Character'], ['items', 'Items'], ['relics', 'Relics'], ['powers', 'Stolen Powers'], ['court', 'Court & Allies'], ['quests', 'Quests'], ['records', 'Records'], ['outfits', 'Outfits']].map(([k, n]) => `<button class="inv-tab ${k === tab ? 'active' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
      <div class="inv-body"></div></div></div>`);
    this.click(el.querySelector('[data-a=close]'), () => this.game.closeInventory());
    el.querySelectorAll('.inv-tab').forEach((t) => this.click(t, () => this.showInventory(t.dataset.tab)));
    this.invTab = tab;
    this.invEl = el;
    this.layers.panels.appendChild(el);
    this.renderInvTab(el.querySelector('.inv-body'), tab);
  }

  hideInventory() {
    this.invEl?.remove();
    this.invEl = null;
  }

  renderInvTab(body, tab) {
    const g = this.game;
    const p = g.player;
    const rerender = () => this.showInventory(tab);
    if (tab === 'character') {
      const attrs = [
        ['vitality', 'Vitality', '+15 max health'],
        ['strength', 'Strength', '+7% damage'],
        ['agility', 'Agility', '+8 stamina, +2% speed'],
        ['blood', 'Blood', '+10 Blood Energy, -1.5% cooldowns'],
      ];
      body.innerHTML = `<div class="stat-grid"><div>
          <div class="section-title">${esc(p.def.name)} — Level ${p.level}</div>
          <table class="stat-table">
            <tr><td>Health</td><td>${Math.ceil(p.hp)} / ${p.maxHp}</td></tr>
            <tr><td>Stamina</td><td>${p.maxStamina}</td></tr>
            <tr><td>Blood Energy</td><td>${Math.floor(p.blood)} / ${p.maxBlood}</td></tr>
            <tr><td>Damage multiplier</td><td>×${p.damageMult.toFixed(2)}</td></tr>
            <tr><td>Movement speed</td><td>${p.moveSpeed.toFixed(2)} m/s</td></tr>
            <tr><td>Ability cooldowns</td><td>×${p.cooldownMult.toFixed(2)}</td></tr>
            <tr><td>Critical chance</td><td>${Math.round(p.mods.crit * 100)}%</td></tr>
            <tr><td>Lifesteal</td><td>${Math.round(p.mods.lifesteal * 100)}%</td></tr>
            <tr><td>Damage reduction</td><td>${Math.round(Math.min(0.6, p.mods.defense) * 100)}%</td></tr>
            <tr><td>Experience</td><td>${p.xp} / ${xpForLevel(p.level)}</td></tr>
            <tr><td>Play time</td><td>${formatTime(g.playTime)}</td></tr>
          </table></div>
        <div><div class="section-title">Attributes</div><div class="points">${p.statPoints} point${p.statPoints === 1 ? '' : 's'} to spend</div>
          ${attrs.map(([k, n, d]) => `<div class="attr-row"><div><div class="an">${n}</div><div class="ad">${d} per point</div></div><div class="av">${p.attributes[k]}</div><button class="btn-frame small" data-attr="${k}" ${p.statPoints ? '' : 'disabled'}>+</button></div>`).join('')}
          <div class="section-title" style="margin-top:18px">Abilities</div>
          ${['q', 'e', 'r'].map((k) => `<div class="card" style="margin-bottom:8px"><h4>${k.toUpperCase()} · ${esc(p.def.abilities[k].name)}</h4><p>${esc(p.def.abilities[k].desc)}</p></div>`).join('')}
        </div></div>`;
      body.querySelectorAll('[data-attr]').forEach((b) => this.click(b, () => {
        if (p.spendPoint(b.dataset.attr)) {
          g.audio.play('levelup', { volume: 0.4 });
          g.saveSoon();
        }
        rerender();
      }));
    } else if (tab === 'items') {
      const entries = Object.entries(g.inventory.items).filter(([, n]) => n > 0);
      body.innerHTML = entries.length
        ? `<div class="grid-cards">${entries.map(([id, n]) => `<div class="card"><span class="count">×${n}</span><h4>${esc(ITEMS[id]?.name ?? id)}</h4><div class="sub">${esc(ITEMS[id]?.type ?? '')}</div><p>${esc(ITEMS[id]?.desc ?? '')}</p>${id === 'blood_vial' ? '<div class="card-actions"><button class="btn-frame small" data-use="vial">Drink</button></div>' : ''}</div>`).join('')}</div>`
        : '<div class="empty">Your pockets are empty.</div>';
      body.querySelector('[data-use=vial]') && this.click(body.querySelector('[data-use=vial]'), () => {
        p.useVial();
        rerender();
      });
    } else if (tab === 'relics') {
      const inv = g.inventory;
      body.innerHTML = `<div class="section-title">Equipped ${inv.equipped.length} / ${RELIC_SLOTS}</div>` + (inv.relics.length
        ? `<div class="grid-cards">${inv.relics.map((id) => `<div class="card ${inv.equipped.includes(id) ? 'equipped' : ''}"><h4>${esc(RELICS[id].name)}</h4><div class="sub">${esc(RELICS[id].effect)}</div><p>${esc(RELICS[id].desc)}</p><div class="card-actions"><button class="btn-frame small" data-r="${id}">${inv.equipped.includes(id) ? 'Unequip' : 'Equip'}</button></div></div>`).join('')}</div>`
        : '<div class="empty">No relics found yet. They hide in secret places.</div>');
      body.querySelectorAll('[data-r]').forEach((b) => this.click(b, () => {
        inv.toggleEquip(b.dataset.r);
        g.saveSoon();
        rerender();
      }));
    } else if (tab === 'powers') {
      const pw = g.powers;
      body.innerHTML = `<div class="warn-box">Stolen powers are taken from vampires you defeat in duels. Their passive bonuses stack. Equip one to use it with <kbd>T</kbd>.<br><strong>If you die, you lose every stolen power.</strong></div>` +
        (pw.stolen.length
          ? `<div class="grid-cards">${pw.stolen.map((s, i) => {
              const d = POWERS[s.power];
              const tier = d.unique ? 'Sovereign' : 'Tier ' + tierOf(s.level);
              return `<div class="card ${pw.equipped === i ? 'equipped' : ''}"><h4 style="color:${d.color}">${esc(d.name)}</h4><div class="sub">${tier} · from ${esc(s.from)}</div><p>Passive: ${esc(d.passiveText)}<br>[T] ${esc(d.desc)} (${d.cd}s)</p><div class="card-actions"><button class="btn-frame small" data-p="${i}">${pw.equipped === i ? 'Equipped' : 'Equip for [T]'}</button></div></div>`;
            }).join('')}</div>`
          : '<div class="empty">You have not stolen any powers yet. Visit Castle Nocturne and challenge a vampire of the court.</div>');
      body.querySelectorAll('[data-p]').forEach((b) => this.click(b, () => {
        pw.equip(+b.dataset.p);
        g.saveSoon();
        rerender();
      }));
    } else if (tab === 'court') {
      const c = g.court.counts();
      const allies = g.court.allyList();
      body.innerHTML = `<div class="court-stats">
          <div class="cs"><b>${c.total}</b><span>Court members</span></div>
          <div class="cs"><b>${c.met}</b><span>Met</span></div>
          <div class="cs"><b style="color:var(--green)">${c.allies}</b><span>Allies</span></div>
          <div class="cs"><b>${c.following} / ${MAX_FOLLOWERS}</b><span>Following you</span></div>
          <div class="cs"><b style="color:#ff6a7a">${c.dead}</b><span>Slain</span></div>
        </div>
        <div class="section-title">Your allies</div>
        ${allies.length
          ? `<div class="grid-cards">${allies.map((a) => `<div class="card"><h4>${esc(a.name)}</h4><div class="sub">Lv ${a.level} ${esc(a.title)} · ${esc(POWERS[a.power].name)}</div><p><span class="tag ally">ALLY</span>${a.follow ? '<span class="tag follow">FOLLOWING</span>' : ''}${a.downed ? '<span class="tag down">RECOVERING</span>' : ''}</p>
              <div class="card-actions">${a.follow ? `<button class="btn-frame small secondary" data-wait="${a.id}">Send to wait</button>` : `<button class="btn-frame small" data-follow="${a.id}">Summon to follow</button>`}<button class="btn-frame small danger" data-ren="${a.id}">Renounce</button></div></div>`).join('')}</div>`
          : '<div class="empty">No allies yet. In Castle Nocturne, walk up to any vampire and press [F] to offer friendship.</div>'}
        <p style="color:var(--text-dim);margin-top:16px">Renouncing an ally ends your friendship — they will immediately attack you. Allies who fall in battle recover after 45 seconds or when you rest at a shrine.</p>`;
      body.querySelectorAll('[data-follow]').forEach((b) => this.click(b, () => {
        g.court.setFollow(+b.dataset.follow, true);
        rerender();
      }));
      body.querySelectorAll('[data-wait]').forEach((b) => this.click(b, () => {
        g.court.setFollow(+b.dataset.wait, false);
        rerender();
      }));
      body.querySelectorAll('[data-ren]').forEach((b) => this.click(b, () => {
        const id = +b.dataset.ren;
        this.confirm(`Renounce ${g.court.roster[id].name}? They will turn hostile and attack you immediately.`, 'Renounce', () => {
          g.closeInventory();
          g.court.renounceFromMenu(id);
        });
      }));
    } else if (tab === 'quests') {
      const q = g.quests;
      const entry = (id, done) => {
        const def = QUESTS[id];
        const objs = q.progress(id).map((o) => `<div class="obj ${o.have >= o.need || done ? 'done' : ''}">◆ ${esc(o.text)}${o.need > 1 ? ` (${Math.min(o.have, o.need)}/${o.need})` : ''}</div>`).join('');
        return `<div class="quest-entry ${def.type === 'side' ? 'side' : ''} ${done ? 'done' : ''}"><h4>${esc(def.title)}${done ? ' — complete' : ''}</h4><p>${esc(def.desc)}</p>${objs}</div>`;
      };
      body.innerHTML = `<div class="section-title">Active</div>${q.active.map((id) => entry(id, false)).join('') || '<div class="empty">No active quests.</div>'}<div class="section-title" style="margin-top:18px">Completed</div>${q.completed.map((id) => entry(id, true)).join('') || '<div class="empty">None yet.</div>'}`;
    } else if (tab === 'records') {
      const read = Object.keys(NOTES).filter((k) => g.flags['read_' + k]);
      body.innerHTML = read.length
        ? `<div class="grid-cards">${read.map((k) => `<div class="card"><h4>${esc(NOTES[k].title)}</h4><div class="sub">${esc(NOTES[k].kind)}</div><div class="card-actions" style="margin-top:8px"><button class="btn-frame small" data-n="${k}">Read again</button></div></div>`).join('')}</div>`
        : '<div class="empty">You have not read any notes yet.</div>';
      body.querySelectorAll('[data-n]').forEach((b) => this.click(b, () => {
        const note = NOTES[b.dataset.n];
        this.hideInventory();
        const el = h(`<div class="overlay"><div class="note-paper ${note.kind}"><div class="kind">${esc(note.kind)}</div><h2>${esc(note.title)}</h2><p>${esc(note.text)}</p><div class="note-close">click to close</div></div></div>`);
        el.addEventListener('click', () => {
          el.remove();
          this.showInventory('records');
        });
        this.layers.panels.appendChild(el);
      }));
    } else if (tab === 'outfits') {
      const id = p.charId;
      const set = COSMETICS[id];
      body.innerHTML = `<div class="grid-cards">${Object.entries(set).map(([cid, c]) => {
        const ok = g.inventory.isUnlocked(id, cid);
        return `<div class="card ${p.cosmetic === cid ? 'equipped' : ''} ${ok ? '' : 'locked'}"><h4>${esc(c.name)}</h4><p>${esc(c.desc)}</p><div class="card-actions">${ok ? `<button class="btn-frame small" data-o="${cid}" ${p.cosmetic === cid ? 'disabled' : ''}>${p.cosmetic === cid ? 'Wearing' : 'Wear'}</button>` : '<span class="tag">LOCKED</span>'}</div></div>`;
      }).join('')}</div>`;
      body.querySelectorAll('[data-o]').forEach((b) => this.click(b, () => {
        g.changeCosmetic(b.dataset.o);
        rerender();
      }));
    }
  }

  // ── death / victory ────────────────────────────────────────────────────────────────────────────
  showDeath(lostPowers) {
    const g = this.game;
    const el = h(`<div class="overlay"><div class="death">
      <h1>You Have Fallen</h1>
      <p>The night swallows you… but the Heartblood will not let you rest.</p>
      <p>You will rise again at the last Moonlit Shrine you rested at in this area (or where you entered it). <strong>Your experience, items and quest progress are kept.</strong> Enemies in this area return.</p>
      ${lostPowers ? `<p class="lost">You lost ${lostPowers} stolen vampire power${lostPowers > 1 ? 's' : ''}.</p>` : '<p class="lost">Every stolen vampire power is lost when you die.</p>'}
      <div class="death-actions"><button class="btn-frame" data-a="rise">Rise Again</button><button class="btn-frame secondary" data-a="menu">Main Menu</button></div>
    </div></div>`);
    this.click(el.querySelector('[data-a=rise]'), () => g.respawn());
    this.click(el.querySelector('[data-a=menu]'), () => {
      this.hideDeath();
      g.player.revive();
      g.returnToMenu(false);
    });
    this.deathEl = el;
    this.layers.panels.appendChild(el);
  }

  hideDeath() {
    this.deathEl?.remove();
    this.deathEl = null;
  }

  showVictory(title, text, teaser) {
    const g = this.game;
    const el = h(`<div class="overlay"><div class="panel victory"><div class="panel-body">
      <div class="title-ornament">◆</div>
      <h1>${esc(title)}</h1>
      <div class="vt">${esc(text)}</div>
      <div class="teaser">${esc(teaser)}</div>
      <div class="modal-actions"><button class="btn-frame" data-a="stay">Continue Exploring</button><button class="btn-frame secondary" data-a="menu">Main Menu</button></div>
    </div></div></div>`);
    this.click(el.querySelector('[data-a=stay]'), () => {
      el.remove();
      g.state = 'playing';
      g.audio.playMusic(g.area.env.music);
      g.input.requestLock();
      this.toast('Chapter I complete. Castle Nocturne\'s 1,024 vampires — and the Twin Sovereigns — await. A red road now leads from the altar.', 'quest');
    });
    this.click(el.querySelector('[data-a=menu]'), () => {
      el.remove();
      g.returnToMenu(true);
    });
    this.layers.panels.appendChild(el);
  }
}
