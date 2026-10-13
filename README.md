# BLOOD MOON: ETERNAL NIGHT

A dark anime vampire action-horror game for the desktop browser, built with **Three.js** and **Vite**.
Wake with no memory in a ruined cathedral, fight through the Ashen Village and the Whispering Forest,
face **the Veiled Countess** beneath the crimson moon, then enter **Castle Nocturne**, home to a court of
**1,024 vampires**. Befriend them so they fight beside you, or duel them and steal their powers.

Everything is generated at runtime: the cel-shaded anime characters, monsters, buildings, textures,
effects, sound effects and the original soundtrack. The game needs no downloads, accounts, API keys
or paid services.

---

## Quick start

Requirements: **Node.js 20.19+ or 22.12+** (needed by Vite 7) and a desktop browser with WebGL 2
(Chrome, Edge, Firefox or Safari 15+).

```bash
npm install
npm run dev
```

Open the address Vite prints (by default **http://localhost:5173/**). Click the page once so the browser allows sound.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Build a production bundle into `dist/` |
| `npm run preview` | Serve the production build locally |

The production build uses relative paths, so you can host `dist/` on any static web server.

---

## Controls

| Input | Action |
| --- | --- |
| **W A S D** | Move |
| **Mouse** | Look around. Click the game to lock the cursor; **Esc** releases it and pauses |
| **Shift** | Sprint (uses stamina) |
| **Space** | Jump |
| **Left mouse** | Attack combo |
| **Right mouse** | Lucien: *Nightfall Cleave* (heavy). Seraphina: *Blood Lance* (thrown). Kairo: hold to block; a timed block parries |
| **Q / E / R** | Character abilities (R is the ultimate). They cost Blood Energy |
| **T** | Use your equipped **stolen vampire power** |
| **F** | Interact, talk, read, open, travel |
| **1** or **H** | Drink a Blood Vial |
| **Tab** or **I** | Inventory and journal: stats, items, relics, stolen powers, court allies, quests, records, outfits |
| **J** | Show or hide all side quests in the tracker |
| **Mouse wheel** | Camera distance |
| **Esc** | Pause / close panels |

If your browser refuses pointer lock, hold a mouse button and drag to look around.

---

## The game

### Characters (selectable in *Character Selection*)

| | Lucien Noctis | Seraphina Vex | Kairo Draeven |
| --- | --- | --- | --- |
| | Vampire, 24, silver-black hair, crimson eyes | Vampire, 23, black hair with burgundy highlights, ruby eyes, pointed ears | Vampire hunter, 25, dark hair with a white streak, blue eyes |
| Weapon | Black longsword | Floating blood blades | Twin moon-silver sabres |
| RMB | Nightfall Cleave | Blood Lance (piercing throw) | Silver Guard (block / parry) |
| Q | **Shadow Blink**: teleport and damage on arrival | **Blood Roses**: damaging, slowing rose garden | **Spectral Dash**: invulnerable dash through enemies |
| E | **Soul Drain**: channelled lifesteal beam | **Crimson Chains**: immobilise (bosses are slowed) | **Moonlight Guard**: 75% damage shield, destroys projectiles |
| R | **Crimson Eclipse**: leaping area slam | **Queen of the Crimson Moon**: storm of blood blades | **Celestial Execution**: seven-hit teleport finisher |

Each character has distinct stats, combos, animations and personality lines. Outfits (cosmetics) unlock
through quests and can be worn from the menu or the Inventory.

### Areas
1. **The Forgotten Cathedral**: the awakening, a hidden crypt, the first ambush.
2. **The Ashen Village**: three hidden survivors, clues, a secret walled garden, a cursed altar. The Castle Road starts here.
3. **The Whispering Forest**: fog, ambush clearings, a hidden grove, two cursed altars, the sealed stair.
4. **The Blood Altar**: the boss fight with **the Veiled Countess** (two phases) and the Chapter I ending, where you make a choice.
5. **Castle Nocturne**: the **Court of a Thousand Vampires**. You can enter early from the village road.
6. **The Throne Hall**: the **Twin Sovereigns**, Dravik Solmere and Nyxara Vael.

### The vampire court (Castle Nocturne)
- **1,024 unique vampires**, each with their own name, house, level, title, personality and greeting.
  Each also has a look (male or female; hair style and colour; eyes; outfit and palette; accessories;
  weapon) and **one of 12 vampire powers**.
- Walk up to any vampire and press **F**:
  - **Befriend**: they become an ally. Up to **3** follow you everywhere and fight beside you, using
    their power. Other allies wait at the court; swap them in *Inventory → Court & Allies*.
  - **Duel**: they turn hostile. **Kill them to steal their power.** Its passive bonus stacks, and you
    can equip it as the active power on **T**.
- **Renounce** an ally (by talking to them, or from the Court tab) and they immediately attack you.
- **If you die, you lose every stolen power.** You respawn at the last Moonlit Shrine you rested at in
  that area (or where you entered it). You keep experience, items and quest progress.
- **The Twin Sovereigns** (one male, one female) cannot be befriended. They refuse, and you must fight
  them together. When one falls, the other becomes enraged. Defeating them grants their unique powers.

Rendering 1,024 fully animated characters at once is not possible in a browser. Nearby vampires (up to
14 at a time) are built as full animated anime models as you approach; the rest of the crowd is drawn
as lightweight instanced silhouettes that turn into full models when you get close.

### Systems
- **Stats and progression**: health, stamina, Blood Energy and XP. Levels give 2 attribute points
  (Vitality, Strength, Agility, Blood).
- **Quests**: 5 main and 6 side quests, updated automatically. A golden diamond marks the current objective.
- **Inventory**: Blood Vials, key items, **relics** (2 equip slots), lore records and outfits.
- **Save system**: versioned localStorage saves with validation and migration. The game auto-saves on
  area travel, at shrines and after important events; you can also *Save Game* from the pause menu.
  Starting a new game over an existing save asks for confirmation.
- **Horror director**: whispers, footsteps, a tolling bell, flickering and dying lights, silhouettes at
  the edge of your vision, and rare, fair jump scares. Shrines are safe zones.
- **Accessibility**: master, music and effects volume; mouse sensitivity; invert Y; graphics quality
  (Low, Medium, High); field of view; screen-shake amount; reduced flashing; reduced sudden loud sounds;
  damage numbers on or off.

---

## Music

All music is original and synthesised live with the Web Audio API. The menu and exploration tracks are
melancholic Belle Époque–style waltzes with piano, strings, a music box and gramophone crackle; Castle
Nocturne has its own dark ballroom waltz; there are separate battle themes for the Countess and the
Twin Sovereigns.

**Play your own music**: you can use audio files you own (for example a soundtrack you bought) as
background music.
- **For this session**: *Settings → Custom background music → Load file*.
- **Permanently**: put the files in `public/music/` and map them in `public/music/playlist.json`, e.g.
  `{ "tracks": { "all": "my-music.mp3" } }` or per track (`menu`, `explore`, `cathedral`, `forest`,
  `castle`, `boss`, `boss2`, `sovereigns`, `victory`). See `public/music/README.txt`.

---

## Project structure

```
index.html                 page shell + boot screen
src/main.js                entry: fonts, styles, boot
src/style.css              gothic UI styling
src/core/                  Game (loop, areas, story flow, save), Renderer (bloom + grade pass),
                           CameraRig, Input, Settings, SaveSystem, Timers, utils
src/audio/AudioManager.js  synthesised SFX, ambience beds, procedural music, custom music files
src/entities/              Player, Enemy (AI), Boss (Countess, Sovereigns), CourtVampire (ally/hostile),
                           characters.js (character data)
src/entities/models/       Toon.js (cel shading, outlines, hair strands), Humanoid.js (rig + animator),
                           CharacterModels.js (heroes, villagers), EnemyModels.js, VampireModels.js
src/combat/                Combat helpers, Abilities, Projectiles, Effects (particles, slashes, telegraphs)
src/game/                  Quests, Inventory, Story (notes, lines, endings), Horror director,
                           VampireRoster (1,024 vampires), Court (befriend/duel/renounce), Powers
src/world/                 Area, AreaBuilder props, Materials (procedural textures), Collision,
                           Effects3D (sky, fog, flames), Interactables, MenuScene, areas/*.js
src/ui/                    UI (menus, HUD, inventory, screens), Dialogue, Tutorial, icons
public/music/              optional custom music (playlist.json)
dev/preview.html           developer model viewer (see below)
```

### Developer model viewer
With the dev server running, open
`http://localhost:5173/dev/preview.html?models=lucien,seraphina,kairo` to inspect models. Other
models: `crawler,knight,stalker,mage,countess,elda,tomas,aldric`. Parameters: `cos=silver_moon`,
`yaw=0.6`, `zoom=face`, `action=attack&t=0.45`.

For automated testing, the game is exposed as `window.__game`; `__game.advance(seconds)` steps the
simulation without waiting for real time.

---

## Adding real character models and audio

- **3D models**: every model factory returns a small interface: `{ root, update(dt, state), dispose() }`
  (enemies also `flashHit()`, `setOpacity()`, `eyeMat`). To swap in a rigged glTF character:
  1. Load it with `GLTFLoader` from `three/addons/loaders/GLTFLoader.js` and put the file in `public/models/`.
  2. Return an object with that interface from `createHeroModel` in `CharacterModels.js` (or from
     `createEnemyModel` / `createVampireModel`).
  3. Map the `state.action.type` values (`attack`, `heavy`, `cast`, `block`, `dash`, `hurt`, `dead`,
     `levitate`, ...) and `state.speed` to an `AnimationMixer` in `update()`.

  Gameplay code only talks to that interface, so nothing else needs to change.
- **Sound effects**: `AudioManager.play(name)` recipes are synthesised. To use recorded files, decode
  them with `AudioContext.decodeAudioData` and play the buffer through the SFX bus under the same name.
  Callers use names like `swing`, `hit`, `boss_shriek` and `door`.

---

## Known limitations
- Characters are stylised procedural models (layered geometry, cel shading, ink outlines and strand
  hair), not hand-sculpted or rigged meshes. Animation is procedural rather than motion-captured.
- Only nearby court vampires are fully animated (see above). Allies and duellists are full models.
- The terrain is mostly flat ground with collision; you cannot climb onto props.
- Headless or software-rendered browsers run the game very slowly. Use a GPU-accelerated browser.
- The soundtrack is synthesised, so it sounds closer to a chiptune or synth orchestra than a real
  recording. Load your own music if you prefer.

## Credits
Created for the player with Claude Code (Anthropic). Three.js (MIT), Vite (MIT), fonts Cinzel,
Cinzel Decorative and Cormorant Garamond (SIL Open Font License 1.1, via Fontsource). All characters,
story, art and music in this repository are original and generated by the game's code.
