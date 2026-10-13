// The Court of Castle Nocturne: 1,024 procedurally generated vampires (deterministic — the same
// names, faces and powers every time), plus the two unbefriendable Sovereigns.
import { seeded } from '../core/utils.js';
import { POWER_ORDER, POWERS } from './Powers.js';

export const COURT_SIZE = 1024;

const MALE = [
  'Aurelian', 'Cassius', 'Dorian', 'Evander', 'Lucan', 'Malachai', 'Silas', 'Thorne', 'Valen', 'Corvin', 'Ezra', 'Lysander', 'Sebastian',
  'Theron', 'Alaric', 'Damien', 'Caspian', 'Orion', 'Varian', 'Kaelen', 'Riven', 'Soren', 'Ashen', 'Cyril', 'Desmond', 'Elias', 'Fenwick',
  'Gideon', 'Hadrian', 'Ignatius', 'Jareth', 'Leopold', 'Marius', 'Nikolai', 'Octavian', 'Percival', 'Quentin', 'Roderick', 'Severin',
  'Tobias', 'Ulric', 'Vesper', 'Wolfram', 'Xavier', 'Yorick', 'Zephyr', 'Crispin', 'Emeric', 'Lucius', 'Mordecai', 'Osric', 'Remus',
  'Stellan', 'Tristan', 'Valerius', 'Wren', 'Anselm', 'Bastien', 'Cedric', 'Draven', 'Eamon', 'Florian', 'Gareth', 'Hollis', 'Ivo',
];
const FEMALE = [
  'Seline', 'Morgana', 'Isolde', 'Vespera', 'Ophelia', 'Carmilla', 'Elara', 'Ravenna', 'Cordelia', 'Evangeline', 'Lucretia', 'Mireille',
  'Nerissa', 'Octavia', 'Persephone', 'Rosalind', 'Sabine', 'Theodora', 'Valentina', 'Wilhelmina', 'Yvaine', 'Zara', 'Adelaide', 'Beatrix',
  'Celestine', 'Delphine', 'Elowen', 'Fiora', 'Giselle', 'Helena', 'Ingrid', 'Juliette', 'Katarina', 'Lavinia', 'Melisande', 'Nyssa',
  'Odette', 'Penelope', 'Rowena', 'Serafine', 'Tatiana', 'Veronique', 'Amara', 'Bianca', 'Calista', 'Drusilla', 'Esmeralda', 'Faustine',
  'Genevieve', 'Liora', 'Marisol', 'Noctua', 'Annalise', 'Briar', 'Coraline', 'Daphne', 'Estelle', 'Ilse', 'Larissa', 'Maelis', 'Rhiannon',
];
const HOUSES = [
  'Ashcombe', 'Bellmorte', 'Corvane', 'Darkmoor', 'Evernight', 'Faulkhurst', 'Grimwald', 'Hawthorne', 'Isenmoor', 'Karnstein', 'Lockwood',
  'Marchbanks', 'Nocterne', 'Orsini', 'Penrose', 'Ravenscroft', 'Rosenthal', 'Silvermere', 'Tenebris', 'Umberwood', 'Veyl', 'Whitlock',
  'Xanthos', 'Yarrow', 'Zolnay', 'Blackthorne', 'Crowe', 'Duskmere', 'Fellmoor', 'Gravenhart', 'Hollowmere', 'Ironveil', 'Mordaunt',
  'Nightshade', 'Sable', 'Valcourt', 'Winterbourne', 'Wyrmwood', 'Ebonhart', 'Delacroix', 'Montclair', 'Belladonne', 'Vantablack',
];
const PERSONALITIES = ['proud', 'melancholy', 'playful', 'cold', 'curious', 'hungry'];

const GREETINGS = {
  proud: ['You stand before {house} blood. Choose your next words with care.', 'Few dare to approach me uninvited. You amuse me.', 'Kneel, or at least have the decency to look impressed.'],
  melancholy: ['Seven hundred years, and every night tastes of ash.', 'Do you hear the bells? They ring for the ones we were.', 'The moon was silver once. I remember… I think.'],
  playful: ['Oh! A new face. Do you dance, or do you bite?', 'Shall we be friends? Or shall we be something more… interesting?', 'Ah, a visitor. The party just became so much more fun.'],
  cold: ['State your purpose.', 'You reek of the cathedral. What do you want?', 'Speak quickly. My patience is shorter than your life.'],
  curious: ['Your eyes… they glow like ours, yet different. Who made you?', 'You carry the Heartblood. I can smell it. Fascinating.', 'Tell me — what did you see on the seventh night?'],
  hungry: ['You smell… warm. How rude of you.', 'The Crimson Moon makes us all so very thirsty.', 'Come closer. I promise I only nibble.'],
};

export const ACCEPT_LINES = ['Then let our blood run in the same direction. I will fight at your side.', 'An alliance? How deliciously reckless. I accept.', 'Very well. Call, and I will come.', 'Until the moon falls, I am yours to command.'];
export const DUEL_LINES = ['A duel? Finally, something worth waking for!', 'Your power will taste sweet. Come.', 'So be it. Do not beg when you lose.', 'I will hang your fangs above my coffin.'];
export const RENOUNCE_LINES = ['You would cast me aside? Then I will take your heart instead!', 'Betrayal. How very… vampiric. Defend yourself!', 'I gave you my blade, and you spit on it. DIE!'];

const HAIR_COLORS = [
  { root: 0x0c0b0f, tip: 0x1d1520, hi: 0x5c1426, name: 'raven black' },
  { root: 0x121217, tip: 0x4a4e5c, hi: 0x9fa6b8, name: 'silver-black' },
  { root: 0xb9bcc8, tip: 0xeef0f6, hi: 0xffffff, name: 'moon-white' },
  { root: 0x4a0a14, tip: 0x8a1428, hi: 0xc4223a, name: 'blood red' },
  { root: 0x1e1230, tip: 0x3c2460, hi: 0x6a3aa0, name: 'midnight violet' },
  { root: 0x8a7a5a, tip: 0xd8c89a, hi: 0xf0e4c0, name: 'pale gold' },
  { root: 0x2a1a14, tip: 0x4a2e22, hi: 0x6a4030, name: 'dark auburn' },
  { root: 0x101820, tip: 0x283a4e, hi: 0x4a6a8a, name: 'storm blue' },
];
const EYES = [0xff1f3a, 0xff1b3d, 0xff3a1a, 0xff0f24, 0xff2a2a, 0xe8102e, 0xff2a4a];
const PALETTES = [
  { main: 0x131118, accent: 0x7d0c1d, dark: 0x0e0c12, trim: 0xb9bfcb, name: 'black & crimson' },
  { main: 0x5a0a17, accent: 0xb0102a, dark: 0x111015, trim: 0xc0c4cf, name: 'crimson rose' },
  { main: 0x1c0e2a, accent: 0x7a2ab8, dark: 0x120a1c, trim: 0xc8bfe0, name: 'violet court' },
  { main: 0x22232c, accent: 0x6a0a18, dark: 0x0c0c10, trim: 0x8a93a9, name: 'grave ash' },
  { main: 0x5c0915, accent: 0xd3a65a, dark: 0x140f13, trim: 0xd3a65a, name: 'burgundy & gold' },
  { main: 0x0f141d, accent: 0x5a0e1e, dark: 0x0c1018, trim: 0xa8b4c8, name: 'navy & silver' },
  { main: 0x141214, accent: 0x8a0a1c, dark: 0x080708, trim: 0x9aa0a0, name: 'mourning black' },
  { main: 0x3a0a26, accent: 0xff4a8a, dark: 0x16060f, trim: 0xd0a0b8, name: 'nightshade' },
];
const SKINS = [0xebe5ec, 0xefe7ee, 0xe4dde6, 0xddd4dc, 0xd6ccd4, 0xcfc4cc, 0xf2eef4];

function titleFor(level, female) {
  if (level >= 30) return female ? 'Countess' : 'Count';
  if (level >= 20) return female ? 'Baroness' : 'Baron';
  if (level >= 10) return female ? 'Dame of the Night' : 'Knight of the Night';
  return 'Fledgling';
}

let rosterCache = null;

/** Returns the full court (cached). Each entry is plain data; live state is kept in Court. */
export function getRoster() {
  if (rosterCache) return rosterCache;
  const rng = seeded(1024 * 7 + 13);
  const list = [];
  const used = new Set();
  for (let id = 0; id < COURT_SIZE; id++) {
    const female = rng() < 0.5;
    let name;
    for (let tries = 0; tries < 20; tries++) {
      const first = rng.pick(female ? FEMALE : MALE);
      const house = rng.pick(HOUSES);
      name = `${first} ${house}`;
      if (!used.has(name)) break;
    }
    used.add(name);
    const house = name.split(' ').slice(1).join(' ');
    // level distribution: mostly low/mid, a few ancient ones
    const r = rng();
    const level = r < 0.45 ? rng.int(1, 9) : r < 0.8 ? rng.int(10, 19) : r < 0.96 ? rng.int(20, 29) : rng.int(30, 40);
    const hair = rng.pick(HAIR_COLORS);
    const pal = rng.pick(PALETTES);
    const power = POWER_ORDER[Math.floor(rng() * POWER_ORDER.length)];
    const personality = rng.pick(PERSONALITIES);
    const appearance = {
      seed: id * 31 + 7,
      gender: female ? 'f' : 'm',
      hair: rng.pick(female ? ['long', 'wavy', 'ponytail', 'bob', 'long'] : ['messy', 'slick', 'wolf', 'longMale', 'messy']),
      hairRoot: hair.root,
      hairTip: hair.tip,
      hairHighlight: hair.hi,
      eye: rng.pick(EYES),
      skin: rng.pick(SKINS),
      outfit: rng.pick(female ? ['gown', 'corset', 'coat'] : ['coat', 'cape', 'vest', 'coat']),
      main: pal.main,
      accent: pal.accent,
      dark: pal.dark,
      trim: pal.trim,
      accessory: rng.pick(female ? ['lily', 'choker', 'earrings', 'none', 'lily'] : ['none', 'choker', 'none']),
      weapon: rng.pick(female ? ['blades', 'blades', 'claws', 'sword'] : ['sword', 'sword', 'dual', 'claws']),
      heightScale: rng.range(0.95, 1.06),
      lips: rng.pick([0x8e1428, 0x6a0a1c, 0x9a2a4a, 0x4a0a14]),
    };
    if (level >= 30) appearance.accessory = 'crown';
    list.push({
      id,
      name,
      house,
      female,
      level,
      title: titleFor(level, female),
      power,
      personality,
      greeting: rng.pick(GREETINGS[personality]).replace('{house}', house),
      hairName: hair.name,
      paletteName: pal.name,
      appearance,
    });
  }
  rosterCache = list;
  return list;
}

/** The two sovereigns: impossible to befriend, terrifyingly strong. */
export const SOVEREIGNS = {
  dravik: {
    id: 'dravik',
    name: 'Dravik Solmere',
    title: 'The Crimson Sovereign',
    power: 'sovereign_wrath',
    appearance: {
      seed: 6661, gender: 'm', hair: 'longMale', hairRoot: 0x2a0a10, hairTip: 0x8a1428, hairHighlight: 0xff3a4a, eye: 0xff1010, skin: 0xece0e4,
      outfit: 'cape', main: 0x1a0508, accent: 0xb0101c, dark: 0x0a0204, trim: 0xd4a94c, accessory: 'crown', crownColor: 0xd4a94c, weapon: 'sword', heightScale: 1.0,
    },
    refuse: 'Friendship? You crawl into MY throne room and offer me friendship? I will wear your skin as a banner.',
  },
  nyxara: {
    id: 'nyxara',
    name: 'Nyxara Vael',
    title: 'The Night Empress',
    power: 'empress_night',
    appearance: {
      seed: 6662, gender: 'f', hair: 'wavy', hairRoot: 0x0a0812, hairTip: 0x2a1a40, hairHighlight: 0x9a40ff, eye: 0xc040ff, skin: 0xf0e8f0,
      outfit: 'gown', main: 0x1c0a2c, accent: 0xa040ff, dark: 0x0a0510, trim: 0xc8b0e0, accessory: 'crown', crownColor: 0xb8a0d8, weapon: 'claws', heightScale: 1.0, lips: 0x4a0a3a,
    },
    refuse: 'How sweet. A stray thinks it may sit at our table. No, little one — you are dinner.',
  },
};

/** Number of each power available in the court (shown in the codex). */
export function powerCensus() {
  const counts = {};
  for (const v of getRoster()) counts[v.power] = (counts[v.power] ?? 0) + 1;
  return counts;
}

export { POWERS };
