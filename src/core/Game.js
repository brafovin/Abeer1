// Game: owns every system, the main loop, area loading, story flow and save/load.
import * as THREE from 'three';
import { Settings } from './Settings.js';
import { SaveSystem } from './SaveSystem.js';
import { Input } from './Input.js';
import { Timers } from './Timers.js';
import { Renderer } from './Renderer.js';
import { CameraRig } from './CameraRig.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Effects } from '../combat/Effects.js';
import { Projectiles } from '../combat/Projectiles.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { VeiledCountess, Sovereign } from '../entities/Boss.js';
import { RIM } from '../entities/models/Toon.js';
import { createHeroModel } from '../entities/models/CharacterModels.js';
import { QuestSystem } from '../game/Quests.js';
import { Inventory } from '../game/Inventory.js';
import { PowerSystem, POWERS } from '../game/Powers.js';
import { Court } from '../game/Court.js';
import { SOVEREIGNS } from '../game/VampireRoster.js';
import { HorrorDirector } from '../game/Horror.js';
import { NOTES, LINES, ENDING } from '../game/Story.js';
import { buildCathedral } from '../world/areas/Cathedral.js';
import { buildVillage } from '../world/areas/Village.js';
import { buildForest } from '../world/areas/Forest.js';
import { buildAltar } from '../world/areas/Altar.js';
import { buildCastle, buildThrone } from '../world/areas/Castle.js';
import { MenuScene } from '../world/MenuScene.js';
import { Tex } from '../world/Materials.js';
import { UI } from '../ui/UI.js';
import { Dialogue } from '../ui/Dialogue.js';
import { Tutorial } from '../ui/Tutorial.js';
import { CHARACTERS } from '../entities/characters.js';
import { clamp, damp, rand } from './utils.js';

const AREA_BUILDERS = { cathedral: buildCathedral, village: buildVillage, forest: buildForest, altar: buildAltar, castle: buildCastle, throne: buildThrone };
const MAIN_PATH = ['cathedral', 'village', 'forest', 'altar'];

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.settings = new Settings();
    this.saves = new SaveSystem();
    this.input = new Input(canvas);
    this.timers = new Timers();
    this.renderer = new Renderer(canvas, this.settings);
    this.audio = new AudioManager();
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), window.innerWidth / window.innerHeight, 0.08, 700);
    this.cameraRig = new CameraRig(this.camera, this.settings);
    this.scene = new THREE.Scene();
    this.effects = new Effects(this.scene, this.settings);
    this.projectiles = new Projectiles(this);
    this.projectiles.attach(this.scene);
    this.quests = new QuestSystem(this);
    this.inventory = new Inventory(this);
    this.powers = new PowerSystem(this);
    this.court = new Court(this);
    this.horror = new HorrorDirector(this);
    this.ui = new UI(this, uiRoot);
    this.dialogue = new Dialogue(this);
    this.tutorial = new Tutorial(this);
    this.menuScene = new MenuScene(this);

    this.state = 'menu';
    this.player = null;
    this.area = null;
    this.enemies = [];
    this.allies = [];
    this.npcs = [];
    this.destructibles = [];
    this.pickups = [];
    this.flags = {};
    this.playTime = 0;
    this.timeScale = 1;
    this.hitStopT = 0;
    this.darkenT = 0;
    this.darkenAmount = 0;
    this.damagePulse = 0;
    this.bossActive = false;
    this.bosses = [];
    this.duelTarget = null;
    this.checkpoint = null;
    this.selectedChar = localStorage.getItem('bloodmoon.char') || 'lucien';
    this.selectedCosmetic = 'default';
    this.saveTimer = 0;
    this.envLights = [];
    this.lastTime = performance.now();
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    this.fps = 60;

    this.applySettings();
    this.settings.onChange((key) => this.onSettingChanged(key));
    this.input.onKeyDown = (e) => this.onKey(e);
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.input.freeLook && !this._ignoreUnlock) this.pause();
      this._ignoreUnlock = false;
    };
    // any user gesture unlocks audio (browser autoplay rules)
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    canvas.addEventListener('click', () => {
      if (this.state === 'playing') this.input.requestLock();
    });
    window.__game = this; // handy for debugging & automated tests
  }

  // ── settings ───────────────────────────────────────────────────────────────────────────────────
  applySettings() {
    const s = this.settings;
    this.audio.setVolumes({ master: s.get('masterVolume'), music: s.get('musicVolume'), sfx: s.get('sfxVolume') });
    this.audio.setReduceLoud(s.get('reduceLoudSounds'));
  }

  onSettingChanged(key) {
    if (key === 'graphicsQuality') {
      this.renderer.applyQuality(this.settings.get('graphicsQuality'));
      this.applyEnvShadows();
    }
    if (key === 'fov') {
      this.camera.fov = this.settings.get('fov');
      this.camera.updateProjectionMatrix();
    }
    this.applySettings();
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────────────────────────
  start() {
    this.ui.showMainMenu();
    this.menuScene.enter();
    this.audio.playMusic('menu');
    this.audio.setAmbience('menu');
    requestAnimationFrame((t) => this.loop(t));
  }

  /** Start a brand-new game (overwrites any save). */
  newGame(charId, cosmetic = 'default') {
    this.saves.clear();
    this.flags = {};
    this.playTime = 0;
    this.quests.reset();
    this.inventory.reset();
    this.powers.clearAll();
    this.court.load(null);
    this.tutorial.reset();
    this.selectedChar = charId;
    this.selectedCosmetic = cosmetic;
    localStorage.setItem('bloodmoon.char', charId);
    this.createPlayer(charId, cosmetic);
    this.beginPlay('cathedral', 'start', true);
  }

  continueGame() {
    const data = this.saves.load();
    if (!data) {
      this.ui.toast(this.saves.lastError || 'No saved game was found.', 'warn');
      return false;
    }
    try {
      this.flags = { ...data.flags };
      this.playTime = data.playTime ?? 0;
      this.quests.load(data.quests);
      this.inventory.load(data.inventory);
      this.powers.load(data.powers);
      this.court.load(data.court);
      this.tutorial.loadDone(this.flags.tutorial_done);
      this.selectedChar = CHARACTERS[data.character] ? data.character : 'lucien';
      this.selectedCosmetic = this.inventory.isUnlocked(this.selectedChar, data.cosmetic) ? data.cosmetic : 'default';
      this.createPlayer(this.selectedChar, this.selectedCosmetic);
      this.player.load(data.stats);
      this.beginPlay(AREA_BUILDERS[data.area] ? data.area : 'cathedral', data.spawn ?? 'start', false);
      this.ui.toast('Game loaded.', 'info');
      return true;
    } catch (err) {
      console.error('[Game] Failed to restore save:', err);
      this.ui.toast('The save could not be restored. Starting from the menu.', 'warn');
      this.returnToMenu(false);
      return false;
    }
  }

  createPlayer(charId, cosmetic) {
    if (this.player) {
      this.scene.remove(this.player.model.root);
      this.player.dispose();
    }
    this.player = new Player(this, charId, cosmetic);
    this.player.refreshMods();
    this.player.hp = this.player.maxHp;
    this.scene.add(this.player.model.root);
  }

  beginPlay(areaId, spawn, isNew) {
    this.menuScene.exit();
    this.ui.hideMenus();
    this.ui.showLoading('Descending into the night…');
    // let the loading screen paint before the heavy procedural build
    setTimeout(() => {
      try {
        this.state = 'playing';
        this.loadArea(areaId, spawn);
        this.ui.showHud();
        this.ui.hideLoading();
        this.ui.fadeIn(1.2);
        if (!isNew) this.input.requestLock();
        this.saveGame(true);
      } catch (err) {
        console.error('[Game] Failed to load area', err);
        this.ui.hideLoading();
        this.ui.fatal('Failed to build the level: ' + err.message);
      }
    }, 60);
  }

  returnToMenu(save = true) {
    if (save && this.player && this.player.alive && this.state !== 'menu') this.saveGame(true);
    this.input.exitLock();
    this.dialogue.cancel();
    this.tutorial.hide();
    this.ui.resetGameScreens();
    this.clearWorld();
    if (this.area) {
      this.scene.remove(this.area.group);
      this.area.dispose();
      this.area = null;
    }
    if (this.player) {
      this.scene.remove(this.player.model.root);
      this.player.dispose();
      this.player = null;
    }
    this.state = 'menu';
    this.bossActive = false;
    this.ui.hideHud();
    this.ui.showMainMenu();
    this.menuScene.enter();
    this.audio.playMusic('menu');
    this.audio.setAmbience('menu');
  }

  // ── area management ────────────────────────────────────────────────────────────────────────────
  clearWorld() {
    for (const e of [...this.enemies, ...this.npcs, ...this.allies]) e.dispose();
    this.enemies = [];
    this.npcs = [];
    this.allies = [];
    this.destructibles = [];
    for (const p of this.pickups) this.scene.remove(p.sprite);
    this.pickups = [];
    this.projectiles.clear();
    this.effects.clear();
    this.timers.clear();
    this.horror.reset();
    this.bosses = [];
    this.bossActive = false;
    this.duelTarget = null;
    this.ui.hideBossBar();
    this.cameraRig.cinematic = null;
  }

  loadArea(areaId, spawnId) {
    this.clearWorld();
    if (this.area) {
      this.scene.remove(this.area.group);
      this.area.dispose();
    }
    const area = AREA_BUILDERS[areaId](this);
    area.finalize(this.renderer.quality);
    this.area = area;
    this.scene.add(area.group);
    this.setupEnvironment(area);
    const sp = area.spawns[spawnId] ?? area.spawns.start ?? Object.values(area.spawns)[0] ?? { x: 0, z: 0, yaw: 0 };
    this.player.spawnAt(sp.x, sp.z, sp.yaw ?? 0);
    this.player.model.root.visible = true;
    this.cameraRig.snapBehind(sp.yaw ?? 0, 0.25);
    this.checkpoint = { area: areaId, spawn: area.spawns[spawnId] ? spawnId : Object.keys(area.spawns)[0] };
    for (const it of area.interactables) it.setup?.(this);
    for (const d of area.destructibles ?? []) {
      d.setup(this);
      if (d.alive) this.destructibles.push(d);
    }
    for (const s of area.enemySpawns) if (!s.dormant) this.spawnEnemy(s.type, s.x, s.z, { group: s.group });
    this.court.onAreaEnter(area);
    for (const t of area.triggers) t.fired = false;
    try {
      area.onEnter?.(this, spawnId);
    } catch (err) {
      console.error('[Game] area.onEnter failed', err);
    }
    this.audio.playMusic(area.env.music);
    this.audio.setAmbience(area.env.ambience);
    this.ui.areaBanner(area.name, area.subtitle);
    this.ui.refreshQuests();
  }

  setupEnvironment(area) {
    const env = area.env;
    const scene = this.scene;
    scene.fog = new THREE.FogExp2(env.fogColor, env.fogDensity);
    scene.background = new THREE.Color(env.background);
    for (const l of this.envLights) {
      scene.remove(l);
      if (l.target) scene.remove(l.target);
    }
    this.envLights = [];
    const amb = new THREE.AmbientLight(env.ambient, env.ambientIntensity * 2.6);
    const hemi = new THREE.HemisphereLight(env.hemiSky, env.hemiGround, env.hemiIntensity * 3.2);
    this.envLights.push(amb, hemi);
    if (env.moonLight) {
      const m = env.moonLight;
      const dir = new THREE.DirectionalLight(m.color, m.intensity * 1.8);
      dir.userData.offset = new THREE.Vector3(...m.dir).normalize().multiplyScalar(40);
      dir.shadow.mapSize.set(this.renderer.quality.shadowSize, this.renderer.quality.shadowSize);
      const sc = dir.shadow.camera;
      sc.left = -28;
      sc.right = 28;
      sc.top = 28;
      sc.bottom = -28;
      sc.near = 1;
      sc.far = 120;
      dir.shadow.bias = -0.0008;
      dir.shadow.normalBias = 0.04;
      this.moonLight = dir;
      this.envLights.push(dir);
      scene.add(dir.target);
    } else this.moonLight = null;
    // soft fill light that follows the player so silhouettes stay readable in the dark
    this.fillLight = new THREE.PointLight(0xffe6e0, env.interior ? 9 : 6, 10, 1.6);
    this.envLights.push(this.fillLight);
    for (const l of this.envLights) scene.add(l);
    this.applyEnvShadows();
    RIM.color.value.set(env.rimColor);
    RIM.strength.value = env.rimStrength ?? 0.55;
    this.renderer.renderer.toneMappingExposure = env.exposure ?? 1.05;
    this.renderer.setScene(scene, this.camera);
    this.renderer.resize();
  }

  applyEnvShadows() {
    const on = this.renderer.quality.shadows;
    if (this.moonLight) {
      this.moonLight.castShadow = on;
      this.moonLight.shadow.mapSize.set(this.renderer.quality.shadowSize, this.renderer.quality.shadowSize);
      if (this.moonLight.shadow.map) {
        this.moonLight.shadow.map.dispose();
        this.moonLight.shadow.map = null;
      }
    }
  }

  travel(areaId, spawnId) {
    if (this.traveling || !AREA_BUILDERS[areaId]) return;
    this.traveling = true;
    this.audio.play('door', { volume: 0.6 });
    try {
      this.area.onTravel?.(this, areaId);
    } catch (err) {
      console.error(err);
    }
    this.state = 'cutscene';
    this.ui.fadeOut(0.6, () => {
      try {
        this.loadArea(areaId, spawnId);
        this.saveGame(true);
      } catch (err) {
        console.error('[Game] travel failed', err);
        this.ui.fatal('Failed to build the level: ' + err.message);
      }
      this.state = 'playing';
      this.traveling = false;
      this.ui.fadeIn(0.8);
    });
  }

  spawnEnemy(type, x, z, opts = {}) {
    try {
      const e = new Enemy(this, type, x, z, opts);
      if (opts.alerted) e.alert(this.player);
      this.enemies.push(e);
      if (opts.effect) {
        this.effects.disc(e.position, 1.2, { count: 26, color: 0xff1030, up: 4, size: 0.22, life: 0.7 });
        this.effects.burst(e.position.clone().setY(e.position.y + 0.5), { count: 16, color: 0x1a0508, smoke: true, speed: 2, size: 1, life: 1, gravity: -0.4 });
      }
      return e;
    } catch (err) {
      console.error('[Game] spawnEnemy failed', err);
      return null;
    }
  }

  spawnGroup(group, opts = {}) {
    let n = 0;
    for (const s of this.area.enemySpawns) {
      if (s.group !== group) continue;
      const d = rand(0, 0.4);
      this.timers.after(n * 0.12 + d, () => this.spawnEnemy(s.type, s.x, s.z, { group, alerted: opts.alerted, effect: opts.effect }));
      n++;
    }
    this.pendingGroups = this.pendingGroups || new Set();
    this.pendingGroups.add(group);
  }

  // ── story beats ────────────────────────────────────────────────────────────────────────────────
  playAwakening() {
    const p = this.player;
    this.state = 'cutscene';
    p.setAction('getup', 3.2, { lockMove: true });
    this.cameraRig.cinematic = {
      position: p.position.clone().add(new THREE.Vector3(1.4, 2.6, -2.2)),
      lookAt: p.position.clone().add(new THREE.Vector3(0, 0.6, 0.6)),
    };
    this.ui.fadeIn(3.5);
    this.audio.play('heartbeat');
    this.timers.after(1.4, () => this.audio.play('heartbeat'));
    this.timers.after(2.8, () => {
      this.cameraRig.cinematic = null;
      this.state = 'playing';
      this.dialogue.monologue(LINES[p.charId].awaken, () => this.tutorial.show('move'));
    });
  }

  readNote(noteId, onClose) {
    const note = NOTES[noteId];
    if (!note) return;
    this.audio.play('note');
    this.state = 'note';
    this.input.clearHeld();
    this.ui.showNote(note, () => {
      this.state = 'playing';
      try {
        onClose?.();
      } catch (err) {
        console.error(err);
      }
      this.saveSoon();
    });
  }

  restAtShrine(spawnId, light) {
    const p = this.player;
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.blood = Math.max(p.blood, p.maxBlood * 0.6);
    if (this.inventory.count('blood_vial') < 3) this.inventory.items.blood_vial = Math.max(this.inventory.count('blood_vial'), Math.min(3, this.inventory.count('blood_vial') + 1));
    this.checkpoint = { area: this.area.id, spawn: spawnId };
    this.audio.play('checkpoint');
    this.effects.disc(p.position, 2, { count: 50, color: 0x8fb8ff, up: 3, size: 0.2, life: 1.2 });
    if (light) light.intensity = light.userData.base * 3;
    // downed allies recover at shrines
    for (const [, v] of this.court.state) if (v.downedT > 0) v.downedT = 0.01;
    const ok = this.saveGame(true);
    this.ui.toast(ok ? 'You rest at the Moonlit Shrine. Health restored — game saved.' : 'You rest at the shrine, but the game could not be saved.', ok ? 'good' : 'warn');
    this.tutorial.notify('shrine');
  }

  spawnCountess(x, z) {
    if (this.flags.boss_defeated || this.bosses.some((b) => b instanceof VeiledCountess)) return;
    const boss = new VeiledCountess(this, x, z);
    boss.yaw = Math.PI;
    this.enemies.push(boss);
    this.bosses.push(boss);
  }

  startCountessFight() {
    const boss = this.bosses.find((b) => b instanceof VeiledCountess);
    if (!boss || boss.active) return;
    const p = this.player;
    this.state = 'cutscene';
    this.input.clearHeld();
    this.audio.playMusic(null);
    this.audio.play('boss_laugh');
    this.cameraRig.cinematic = {
      position: boss.position.clone().add(new THREE.Vector3(3.5, 2.2, -7)),
      lookAt: boss.position.clone().add(new THREE.Vector3(0, 2.6, 0)),
    };
    this.dialogue.start([
      { speaker: 'The Veiled Countess', text: 'So. The little thief climbs the stair at last. Do you even remember my face, child?' },
      { speaker: CHARACTERS[p.charId].name.split(' ')[0], text: LINES[p.charId].countess },
      { speaker: 'The Veiled Countess', text: 'You took everything from us on the seventh night. Tonight, the moon takes it back.' },
    ], () => {
      this.cameraRig.cinematic = null;
      this.state = 'playing';
      boss.activate();
      this.bossActive = true;
      this.audio.playMusic('boss');
      this.ui.showBossBar();
      this.ui.toast('Watch for red circles on the ground — move out before they erupt!', 'info');
    });
  }

  onBossDefeated(kind) {
    if (kind !== 'countess' || this.flags.boss_defeated) return;
    this.flags.boss_defeated = true;
    this.bossActive = false;
    this.ui.hideBossBar();
    this.quests.notify('countess_defeated');
    this.audio.playMusic('victory');
    this.state = 'cutscene';
    this.dialogue.start([
      { speaker: 'The Veiled Countess', text: '…Enough. You were always stronger than you knew. That was the whole tragedy.' },
      {
        speaker: 'The Veiled Countess',
        text: 'Finish it, then. Take what is left of me — or don\'t.',
        choices: [
          { text: 'Drain her power. (Gain the Veil of Ysolde relic)', action: () => (this.flags.ending = 'drain') },
          { text: 'Show her mercy. (Learn the truth)', action: () => (this.flags.ending = 'mercy') },
        ],
      },
    ], () => {
      const ending = this.flags.ending === 'drain' ? ENDING.drain : ENDING.mercy;
      if (this.flags.ending === 'drain') this.inventory.addRelic('veil_of_ysolde');
      else this.player.gainXp(300);
      this.saveGame(true);
      this.state = 'victory';
      this.input.exitLock();
      this.ui.showVictory(ending.title, ending.text, ENDING.teaser);
    });
  }

  spawnSovereigns() {
    for (const kind of ['dravik', 'nyxara']) {
      if (this.flags['sovereign_' + kind]) continue;
      const def = SOVEREIGNS[kind];
      const b = new Sovereign(this, kind === 'dravik' ? -3 : 3, 23.5, kind, def.appearance);
      b.yaw = Math.PI;
      this.enemies.push(b);
      this.bosses.push(b);
    }
    const [a, b] = this.bosses.filter((x) => x instanceof Sovereign);
    if (a && b) {
      a.partner = b;
      b.partner = a;
    }
  }

  startSovereignEncounter() {
    const sov = this.bosses.filter((b) => b instanceof Sovereign && b.alive);
    if (!sov.length || sov.some((b) => b.active) || this.state !== 'playing') return;
    this.state = 'cutscene';
    this.input.clearHeld();
    const center = sov[0].position.clone().add(sov[sov.length - 1].position).multiplyScalar(0.5);
    this.cameraRig.cinematic = { position: center.clone().add(new THREE.Vector3(0, 2.4, -8)), lookAt: center.clone().add(new THREE.Vector3(0, 2, 0)) };
    const fight = () => {
      this.cameraRig.cinematic = null;
      this.state = 'playing';
      for (const b of sov) b.activate();
      this.bossActive = true;
      this.audio.playMusic('sovereigns');
      this.ui.showBossBar();
    };
    const leave = () => {
      this.cameraRig.cinematic = null;
      this.state = 'playing';
    };
    const lines = [];
    if (sov.find((s) => s.kind === 'dravik')) lines.push({ speaker: 'Dravik Solmere', sub: 'The Crimson Sovereign', text: 'A Heartblood thief, walking into my hall on two legs. The court has been so very bored.' });
    if (sov.find((s) => s.kind === 'nyxara')) lines.push({ speaker: 'Nyxara Vael', sub: 'The Night Empress', text: 'Look at you. All that stolen power, and still so small. Kneel, and we will make it quick.' });
    lines.push({
      speaker: sov.length === 2 ? 'The Twin Sovereigns' : sov[0].name,
      text: 'Well? Speak.',
      choices: [
        {
          text: 'Offer them friendship.',
          next: { speaker: sov[0].name, text: SOVEREIGNS[sov[0].kind].refuse + (sov.length === 2 ? '\n\n— They will never be your friends. You must fight them.' : '') },
          action: () => (this._sovChoice = 'fight'),
        },
        { text: 'Draw your weapon.', action: () => (this._sovChoice = 'fight') },
        { text: 'Not yet. (Leave — they will be waiting)', action: () => (this._sovChoice = 'leave') },
      ],
    });
    this._sovChoice = 'fight';
    this.dialogue.start(lines, () => (this._sovChoice === 'leave' ? leave() : fight()));
  }

  onSovereignDefeated(boss) {
    this.flags['sovereign_' + boss.kind] = true;
    this.quests.notify('sovereign');
    const def = SOVEREIGNS[boss.kind];
    this.powers.add(def.power, def.name, 50);
    const power = POWERS[def.power];
    this.ui.showPowerGain(power, { name: def.name, level: 50, title: def.title });
    this.player.gainXp(900);
    const remaining = this.bosses.filter((b) => b instanceof Sovereign && b.alive);
    if (!remaining.length) {
      this.bossActive = false;
      this.ui.hideBossBar();
      this.inventory.addRelic('sovereign_signet');
      this.audio.playMusic('victory');
      this.ui.toast('The Twin Sovereigns have fallen. The Court of a Thousand has no master.', 'boss');
    }
    this.saveGame(true);
  }

  changeCosmetic(cosId) {
    const p = this.player;
    if (!p || !this.inventory.isUnlocked(p.charId, cosId) || p.cosmetic === cosId) return;
    this.scene.remove(p.model.root);
    p.model.dispose();
    p.model = createHeroModel(p.charId, cosId);
    p.cosmetic = cosId;
    this.selectedCosmetic = cosId;
    p.model.root.position.copy(p.position);
    p.model.root.rotation.y = p.yaw;
    this.scene.add(p.model.root);
    this.ui.toast(`Outfit changed.`, 'good');
    this.saveSoon();
  }

  // ── combat callbacks ───────────────────────────────────────────────────────────────────────────
  hitStop(t) {
    this.hitStopT = Math.max(this.hitStopT, t);
  }

  darkenPulse(dur, amount) {
    this.darkenT = dur;
    this.darkenDur = dur;
    this.darkenAmount = amount;
  }

  onEnemyKilled(target) {
    if (target.isDestructible) return;
    const p = this.player;
    if (target.isCourt) {
      p.gainXp(30 + target.level * 12);
      this.court.onHostileKilled(target);
    } else if (target.def) {
      p.gainXp(target.def.xp);
      if (Math.random() < (target.def.orb ?? 0.5)) this.dropOrb(target.position);
      if (Math.random() < 0.06) this.dropOrb(target.position, 'vial');
    }
    p.gainBlood(10);
    this.tutorial.notify('kill');
  }

  dropOrb(pos, kind = 'blood') {
    const color = kind === 'vial' ? 0xffb050 : 0xff1a35;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.soft(), color: new THREE.Color(color).multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sprite.scale.setScalar(kind === 'vial' ? 0.8 : 0.6);
    sprite.position.copy(pos).add(new THREE.Vector3(rand(-0.4, 0.4), 0.8, rand(-0.4, 0.4)));
    this.scene.add(sprite);
    this.pickups.push({ sprite, kind, t: 0, vel: new THREE.Vector3(rand(-1, 1), 3, rand(-1, 1)) });
  }

  onPlayerDamaged(dmg, blocked) {
    this.damagePulse = Math.min(1, this.damagePulse + (blocked ? 0.15 : 0.45));
    if (!blocked) {
      this.audio.play('player_hurt', { volume: 0.8 });
      this.cameraRig.shake(Math.min(0.5, dmg / 40));
    }
  }

  onPlayerDeath() {
    this.audio.play('player_death');
    this.bossActive = false;
    this.input.clearHeld();
    const lost = this.court.onPlayerDeath();
    this.state = 'dying';
    this.timers.after(2.4, () => {
      this.state = 'dead';
      this.input.exitLock();
      this.ui.showDeath(lost);
    });
  }

  respawn() {
    const cp = this.checkpoint ?? { area: this.area.id, spawn: 'start' };
    this.ui.hideDeath();
    this.ui.fadeOut(0.4, () => {
      this.player.revive();
      this.loadArea(cp.area, cp.spawn);
      this.state = 'playing';
      this.ui.fadeIn(1.0);
      this.saveGame(true);
      this.input.requestLock();
    });
  }

  onLevelUp(level) {
    this.audio.play('levelup');
    this.effects.disc(this.player.position, 1.5, { count: 60, color: 0xffd080, up: 4, size: 0.2, life: 1.2 });
    this.ui.toast(`LEVEL ${level}! +2 attribute points — spend them in the Inventory (Tab).`, 'level');
  }

  // ── save ───────────────────────────────────────────────────────────────────────────────────────
  saveSoon() {
    this.saveTimer = 1.5;
  }

  saveGame(silent = false) {
    if (!this.player || !this.area) return false;
    const data = {
      character: this.player.charId,
      cosmetic: this.player.cosmetic,
      area: this.checkpoint?.area ?? this.area.id,
      spawn: this.checkpoint?.spawn ?? 'start',
      stats: this.player.serialize(),
      inventory: this.inventory.serialize(),
      quests: this.quests.serialize(),
      flags: { ...this.flags, tutorial_done: this.tutorial.done },
      powers: this.powers.serialize(),
      court: this.court.serialize(),
      settings: this.settings.snapshot(),
      playTime: this.playTime,
    };
    const ok = this.saves.save(data);
    if (!silent) this.ui.toast(ok ? 'Game saved.' : this.saves.lastError, ok ? 'good' : 'warn');
    if (ok) this.ui.saveIndicator();
    return ok;
  }

  // ── input routing ──────────────────────────────────────────────────────────────────────────────
  onKey(e) {
    const st = this.state;
    if (this.dialogue.active) {
      this.dialogue.onKey(e);
      return;
    }
    if (st === 'note' && (e.code === 'KeyF' || e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) {
      this.ui.closeNote();
      return;
    }
    if (st === 'cutscene' && e.code === 'Escape') this.pause();
    else if (st === 'playing') {
      if (e.code === 'Escape') this.pause();
      else if (e.code === 'Tab' || e.code === 'KeyI') {
        e.preventDefault();
        this.openInventory();
      } else if (e.code === 'KeyF') this.interact();
      else if (e.code === 'KeyJ') this.ui.toggleQuestLog();
    } else if (st === 'paused' && e.code === 'Escape') {
      this.ui.closeTopPanel();
    } else if (st === 'inventory' && (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyI')) {
      e.preventDefault();
      this.closeInventory();
    } else if (st === 'menu' && e.code === 'Escape') {
      this.ui.closeTopPanel();
    }
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'cutscene') return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.input.clearHeld();
    this.input.exitLock();
    this.ui.showPause();
    this.audio.play('ui_open');
  }

  resume() {
    if (this.state !== 'paused' && this.state !== 'inventory') return;
    this.state = this.state === 'paused' && this.pausedFrom === 'cutscene' ? 'cutscene' : 'playing';
    this.pausedFrom = null;
    this.ui.hidePause();
    this.ui.hideInventory();
    this.input.clearHeld();
    this._ignoreUnlock = false;
    this.input.requestLock();
  }

  openInventory() {
    if (this.state !== 'playing') return;
    this.state = 'inventory';
    this._ignoreUnlock = true;
    this.input.exitLock();
    this.input.clearHeld();
    this.ui.showInventory();
    this.audio.play('ui_open');
  }

  closeInventory() {
    this.ui.hideInventory();
    this.state = 'playing';
    this.input.requestLock();
  }

  /** All interactables currently available (static + court members). */
  allInteractables() {
    const list = this.area ? this.area.interactables.filter((i) => i.enabled !== false) : [];
    return this.court.slots || this.allies.length ? list.concat(this.court.interactables()) : list;
  }

  nearestInteractable() {
    if (!this.player || !this.player.alive) return null;
    const p = this.player.position;
    let best = null, bd = Infinity;
    for (const it of this.allInteractables()) {
      const d = Math.hypot(it.position.x - p.x, it.position.z - p.z);
      if (d > it.radius || Math.abs(it.position.y - p.y) > 3.5) continue;
      const score = d - (it.court ? 0.4 : 0);
      if (score < bd) {
        bd = score;
        best = it;
      }
    }
    return best;
  }

  interact() {
    const it = this.nearestInteractable();
    if (!it) return;
    try {
      it.onInteract(this, it);
    } catch (err) {
      console.error('[Game] interaction failed', err);
    }
    this.tutorial.notify('interact');
  }

  // ── objective marker ───────────────────────────────────────────────────────────────────────────
  objectiveTarget() {
    const obj = this.quests.currentObjective();
    if (!obj || !this.area) return null;
    const cur = this.area.id;
    let targetArea = obj.area;
    if (!targetArea) {
      // multi-area objectives (clues): look here first, then follow the main path
      const here = this.findMarker(obj.marker);
      if (here) return { pos: here, label: obj.text };
      targetArea = cur === 'village' ? 'forest' : 'village';
    }
    if (targetArea === cur) {
      const pos = this.findMarker(obj.marker);
      return pos ? { pos, label: obj.text } : null;
    }
    // route through gates
    let nextArea;
    const ci = MAIN_PATH.indexOf(cur), ti = MAIN_PATH.indexOf(targetArea);
    if (ci < 0) nextArea = cur === 'throne' ? 'castle' : 'village';
    else if (ti < 0) nextArea = ci > 1 ? MAIN_PATH[ci - 1] : ci < 1 ? MAIN_PATH[ci + 1] : 'castle';
    else nextArea = ti > ci ? MAIN_PATH[ci + 1] : MAIN_PATH[ci - 1];
    const gate = this.area.gates.find((g) => g.to === nextArea);
    return gate ? { pos: gate.position, label: obj.text } : null;
  }

  findMarker(tag) {
    if (!tag) return null;
    const p = this.player.position;
    let best = null, bd = Infinity;
    for (const it of this.area.interactables) {
      if (it.marker !== tag || it.enabled === false) continue;
      if (it.isDone && it.isDone(this)) continue;
      const d = it.position.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = it.position;
      }
    }
    if (!best && this.area.points[tag]) best = this.area.points[tag];
    return best;
  }

  // ── main loop ──────────────────────────────────────────────────────────────────────────────────
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!(dt > 0)) dt = 0.016;
    this.fpsAcc += Math.min(dt, 1);
    dt = Math.min(dt, 0.05);
    this.fpsFrames++;
    if (this.fpsAcc > 1) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    try {
      if (this.state === 'menu') {
        this.menuScene.update(dt);
        this.renderer.render(dt, { vignette: 0.7 });
      } else if (this.area && this.player) {
        this.updateWorld(dt);
      }
      this.audio.update(dt);
      this.ui.update(dt);
    } catch (err) {
      console.error('[Game] frame error:', err);
      this.ui.reportError?.(err);
    }
    this.input.endFrame();
  }

  /** Debug/test helper: advance the simulation quickly without waiting for real time. */
  advance(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) this.updateWorld(step, false);
  }

  updateWorld(rawDt, render = true) {
    const st = this.state;
    const simulate = st === 'playing' || st === 'cutscene' || st === 'dying';
    // hit-stop: briefly slow time for impact
    let dt = rawDt;
    if (this.hitStopT > 0) {
      this.hitStopT -= rawDt;
      dt = rawDt * 0.12;
    }
    const mouse = this.input.consumeMouse();
    if (st === 'playing') this.cameraRig.applyMouse(mouse.x, mouse.y, mouse.wheel);
    this.input.enabled = st === 'playing';

    if (simulate) {
      this.playTime += rawDt;
      this.timers.update(dt);
      this.player.update(dt, this.input);
      for (const e of this.enemies) e.update(dt);
      for (const a of this.allies) a.update(dt);
      for (const n of this.npcs) n.update(dt);
      this.cleanupEntities();
      this.projectiles.update(dt);
      this.updatePickups(dt);
      this.area.update(dt, this);
      this.checkTriggers();
      this.horror.update(dt);
      this.court.update(dt);
      this.powers.update(dt);
      if (this.saveTimer > 0) {
        this.saveTimer -= rawDt;
        if (this.saveTimer <= 0 && this.player.alive && st === 'playing') this.saveGame(true);
      }
    } else {
      // keep ambient animation alive in menus/dialogue
      this.area.update(rawDt * 0.25, this);
    }
    this.effects.update(simulate ? dt : rawDt * 0.25);

    // camera
    const p = this.player;
    const moving = Math.hypot(p.velocity.x, p.velocity.z) > 6.5;
    this.cameraRig.update(rawDt, p.position, this.area.collision, {
      groundY: this.area.groundHeight(this.camera.position.x, this.camera.position.z),
      fovBoost: moving ? 4 : 0,
      height: p.action?.type === 'dead' ? 0.6 : 1.55,
    });
    if (this.fillLight) this.fillLight.position.set(p.position.x - Math.sin(this.cameraRig.yaw) * 1.5, p.position.y + 2.6, p.position.z - Math.cos(this.cameraRig.yaw) * 1.5);
    if (this.moonLight) {
      this.moonLight.position.copy(p.position).add(this.moonLight.userData.offset);
      this.moonLight.target.position.copy(p.position);
    }
    this.audio.setListener(p.position.x, p.position.z, this.cameraRig.yaw);
    const fighting = this.enemies.some((e) => e.alive && e.alerted && e.position.distanceTo(p.position) < 25);
    this.audio.setMusicIntensity(fighting || this.bossActive ? 1 : 0);

    // post effects
    this.damagePulse = Math.max(0, this.damagePulse - rawDt * 1.2);
    const lowHp = p.alive ? clamp(1 - p.hp / p.maxHp / 0.3, 0, 1) * (0.25 + Math.sin(performance.now() / 300) * 0.1) : 0;
    let darken = 0;
    if (this.darkenT > 0) {
      this.darkenT -= rawDt;
      const k = this.darkenT / this.darkenDur;
      darken = Math.sin(k * Math.PI) * this.darkenAmount;
    }
    if (!render) return;
    this.renderer.render(rawDt, {
      damage: Math.max(this.damagePulse * 0.8, lowHp),
      desaturate: st === 'dead' || st === 'dying' ? 0.75 : this.state === 'paused' ? 0.3 : 0,
      darken,
      vignette: this.area.env.interior ? 0.65 : 0.55,
    });
  }

  cleanupEntities() {
    const keep = [];
    for (const e of this.enemies) {
      if (e.removeMe) {
        e.dispose();
        if (e.isCourt) this.court.onEntityRemoved(e);
        continue;
      }
      keep.push(e);
    }
    this.enemies = keep;
    if (this.npcs.some((n) => n.removeMe)) {
      for (const n of this.npcs) if (n.removeMe) {
        n.dispose();
        this.court.onEntityRemoved(n);
      }
      this.npcs = this.npcs.filter((n) => !n.removeMe);
    }
    if (this.allies.some((a) => a.removeMe)) {
      for (const a of this.allies) if (a.removeMe) a.dispose();
      this.allies = this.allies.filter((a) => !a.removeMe);
    }
    // downed allies leave the field once their fall animation ends
    for (const a of this.allies) if (!a.alive && a.deadT > 2.5) a.removeMe = true;
    // group clears (ambushes)
    if (this.pendingGroups) {
      for (const g of [...this.pendingGroups]) {
        const members = this.enemies.filter((e) => e.group === g);
        const pendingSpawns = this.timers.items.length > 0 && members.length === 0;
        if (members.length && members.every((e) => !e.alive)) {
          this.pendingGroups.delete(g);
          this.area.onGroupCleared?.(this, g);
        } else if (!members.length && !pendingSpawns) {
          this.pendingGroups.delete(g);
          this.area.onGroupCleared?.(this, g);
        }
      }
    }
  }

  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const o = this.pickups[i];
      o.t += dt;
      const pos = o.sprite.position;
      const target = p.position.clone().setY(p.position.y + 1);
      const d = pos.distanceTo(target);
      if (o.t > 0.6 && d < 6) {
        const dir = target.sub(pos).normalize();
        o.vel.lerp(dir.multiplyScalar(12), Math.min(1, dt * 6));
      } else {
        o.vel.y -= 6 * dt;
        o.vel.multiplyScalar(1 - dt * 2);
      }
      pos.addScaledVector(o.vel, dt);
      const ground = this.area.groundHeight(pos.x, pos.z) + 0.4;
      if (pos.y < ground) {
        pos.y = ground;
        o.vel.y = Math.abs(o.vel.y) * 0.3;
      }
      if ((d < 0.9 && o.t > 0.6) || o.t > 25) {
        if (o.t <= 25 && p.alive) {
          if (o.kind === 'vial') this.inventory.add('blood_vial', 1);
          else {
            p.gainBlood(15);
            p.heal(p.maxHp * 0.05, true);
            this.audio.play('blood_orb', { volume: 0.6 });
          }
        }
        this.scene.remove(o.sprite);
        o.sprite.material.dispose();
        this.pickups.splice(i, 1);
      }
    }
  }

  checkTriggers() {
    const p = this.player.position;
    for (const t of this.area.triggers) {
      const inside = Math.hypot(p.x - t.x, p.z - t.z) < t.radius;
      if (inside && !t.inside) {
        if (!(t.once && t.fired)) {
          t.fired = true;
          try {
            t.onEnter(this);
          } catch (err) {
            console.error('[Game] trigger failed', err);
          }
        }
      }
      t.inside = inside;
    }
  }

  /** Bars to show at the top of the screen. */
  bossBars() {
    const bars = [];
    for (const b of this.bosses) if (b.active && (b.alive || b.deadT < 1.5)) bars.push({ name: b.name, title: b.title, hp: b.hp, maxHp: b.maxHp, phase: b.phase, enraged: b.enraged });
    if (this.duelTarget && this.duelTarget.alive) bars.push({ name: this.duelTarget.name, title: `Duel · Lv ${this.duelTarget.level} · ${POWERS[this.duelTarget.data.power].name}`, hp: this.duelTarget.hp, maxHp: this.duelTarget.maxHp, small: true });
    return bars;
  }
}
