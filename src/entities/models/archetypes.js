// Pure data (no three.js): the vampire archetypes of Castle Nocturne and the dice that turn a
// seed into a unique look. Every archetype shares the same dark-fantasy art style (pale skin, glowing
// red eyes, fangs, gothic gear) but has its own body type, face shapes, outfit kit, headgear,
// silhouette, weapons and fighting stance, so no two vampires read as copies.

export const ARCHETYPE_IDS = ['noble', 'lord', 'warrior', 'assassin', 'sorcerer', 'ancient'];

const R = (a, b) => [a, b];

export const ARCHETYPES = {
  noble: {
    label: 'Noble',
    build: { h: R(0.96, 1.05), b: R(0.9, 1.06), l: R(0.95, 1.05), r: R(0.97, 1.03), leg: R(0.98, 1.04), hd: R(0.98, 1.04) },
    outfit: { m: ['coat', 'cape', 'vest', 'coat'], f: ['gown', 'corset', 'coat', 'gown'] },
    weapon: { m: ['sword', 'sword', 'dual', 'rapier'], f: ['blades', 'blades', 'claws', 'rapier'] },
    headgear: { m: ['none'], f: ['none', 'none', 'tiara'] },
    back: { m: ['none'], f: ['none'] },
    shoulders: { m: ['none'], f: ['none'] },
    hair: { m: ['messy', 'slick', 'wolf', 'longMale', 'messy', 'undercut'], f: ['long', 'wavy', 'ponytail', 'bob', 'long', 'twintail', 'braid'] },
    marks: { m: [[], [], ['scar']], f: [[], [], [], ['runes']] },
    stance: { chest: 0, head: 0 },
    gait: { stride: 1, bounce: 1, sway: 1 },
    stats: { hp: 1, dmg: 1, spd: 1 },
    powers: [],
  },
  lord: {
    label: 'Vampire Lord',
    build: { h: R(1.05, 1.12), b: R(1.06, 1.2), l: R(1.05, 1.14), r: R(1.02, 1.06), leg: R(1.0, 1.05), hd: R(1.0, 1.04) },
    outfit: { m: ['coat', 'cape'], f: ['gown', 'coat'] },
    weapon: { m: ['greatsword', 'sword', 'scythe', 'greatsword'], f: ['rapier', 'blades', 'scythe', 'sword'] },
    headgear: { m: ['spikedCrown', 'horns', 'crown', 'circletHorns'], f: ['spikedCrown', 'crown', 'circletHorns', 'tiara'] },
    back: { m: ['bigCape', 'bigCape', 'wingsCape'], f: ['bigCape', 'wingsCape', 'bigCape'] },
    shoulders: { m: ['fur', 'pauldrons', 'spikes'], f: ['spikes', 'collar', 'pauldrons'] },
    hair: { m: ['mane', 'longMale', 'slick', 'mane'], f: ['mane', 'long', 'wavy', 'braid'] },
    marks: { m: [['scar'], ['runes'], []], f: [['runes'], [], ['veins']] },
    stance: { chest: -0.05, head: -0.06, proud: true },
    gait: { stride: 1.05, bounce: 0.8, sway: 0.7 },
    stats: { hp: 1.35, dmg: 1.25, spd: 0.95 },
    powers: ['hellfire', 'thunder_vein', 'iron_blood', 'crimson_hunger', 'beast_rage'],
  },
  warrior: {
    label: 'Blood Warrior',
    build: { h: R(1.04, 1.14), b: R(1.22, 1.42), l: R(1.2, 1.38), r: R(1.0, 1.05), leg: R(0.95, 1.02), hd: R(1.02, 1.08) },
    outfit: { m: ['vest'], f: ['corset'] },
    weapon: { m: ['axe', 'spear', 'greatsword', 'swordShield', 'axe'], f: ['spear', 'swordShield', 'axe', 'greatsword'] },
    headgear: { m: ['helm', 'hornedHelm', 'none', 'none', 'helm'], f: ['helm', 'none', 'winged', 'none'] },
    back: { m: ['none', 'cloak', 'none'], f: ['none', 'cloak'] },
    shoulders: { m: ['pauldrons', 'spikes', 'pauldrons'], f: ['pauldrons', 'spikes'] },
    hair: { m: ['crop', 'wolf', 'topknot', 'undercut', 'messy'], f: ['ponytail', 'braid', 'crop', 'twintail'] },
    marks: { m: [['scar'], ['scar', 'paint'], ['paint'], []], f: [['scar'], ['paint'], []] },
    stance: { chest: 0.02, head: 0.0, wide: 0.12 },
    gait: { stride: 0.85, bounce: 1.3, sway: 0.5 },
    stats: { hp: 1.4, dmg: 1.15, spd: 0.92 },
    powers: ['iron_blood', 'beast_rage', 'crimson_hunger', 'blood_shield', 'shadow_claw'],
  },
  assassin: {
    label: 'Night Assassin',
    build: { h: R(0.9, 1.0), b: R(0.78, 0.9), l: R(0.82, 0.94), r: R(1.02, 1.08), leg: R(1.03, 1.1), hd: R(0.96, 1.02) },
    outfit: { m: ['vest'], f: ['slit'] },
    weapon: { m: ['daggers', 'katana', 'claws', 'daggers'], f: ['daggers', 'rapier', 'claws', 'daggers'] },
    headgear: { m: ['hood', 'hood', 'none'], f: ['hood', 'none', 'hood'] },
    back: { m: ['cloak', 'cloak', 'none'], f: ['cloak', 'cloak', 'none'] },
    shoulders: { m: ['none'], f: ['none'] },
    hair: { m: ['slick', 'undercut', 'crop', 'wolf'], f: ['bob', 'ponytail', 'twintail', 'bob'] },
    marks: { m: [[], ['scar'], ['veins']], f: [[], ['paint'], ['veins']] },
    stance: { chest: 0.14, head: 0.1, crouch: 0.1 },
    gait: { stride: 1.18, bounce: 0.55, sway: 1.1 },
    stats: { hp: 0.8, dmg: 1.2, spd: 1.22 },
    powers: ['mist_step', 'shadow_claw', 'moon_veil', 'frost_fang', 'blood_bolt'],
  },
  sorcerer: {
    label: 'Blood Sorcerer',
    build: { h: R(0.98, 1.08), b: R(0.86, 0.98), l: R(0.86, 0.98), r: R(1.0, 1.05), leg: R(1.0, 1.05), hd: R(0.98, 1.04) },
    outfit: { m: ['coat'], f: ['gown'] },
    weapon: { m: ['staff', 'staff', 'blades'], f: ['staff', 'blades', 'blades'] },
    headgear: { m: ['hood', 'hood', 'circlet', 'horns'], f: ['hood', 'circlet', 'tiara', 'horns'] },
    back: { m: ['cloak', 'none'], f: ['none', 'cloak'] },
    shoulders: { m: ['mantle', 'none'], f: ['mantle', 'collar'] },
    hair: { m: ['longMale', 'messy', 'slick', 'topknot'], f: ['wavy', 'long', 'braid', 'bob'] },
    marks: { m: [['runes'], ['runes'], []], f: [['runes'], ['runes', 'veins'], []] },
    stance: { chest: -0.02, head: 0.02, casting: true },
    gait: { stride: 0.95, bounce: 0.7, sway: 1.3 },
    stats: { hp: 0.9, dmg: 1.15, spd: 1.0 },
    powers: ['blood_bolt', 'bat_swarm', 'frost_fang', 'thunder_vein', 'hellfire', 'moon_veil'],
  },
  ancient: {
    label: 'Ancient One',
    build: { h: R(1.12, 1.22), b: R(0.74, 0.86), l: R(0.68, 0.8), r: R(1.18, 1.3), leg: R(1.04, 1.1), hd: R(0.92, 0.98) },
    outfit: { m: ['rags'], f: ['rags'] },
    weapon: { m: ['claws', 'scythe', 'claws'], f: ['claws', 'claws', 'scythe'] },
    headgear: { m: ['antlers', 'horns', 'none'], f: ['antlers', 'horns', 'tiara'] },
    back: { m: ['wings', 'wings', 'wingsCape'], f: ['wings', 'wingsCape', 'wings'] },
    shoulders: { m: ['bone'], f: ['bone'] },
    hair: { m: ['lank', 'bald', 'lank'], f: ['lank', 'lank', 'bald'] },
    marks: { m: [['veins', 'hollow'], ['veins', 'hollow', 'maw']], f: [['veins', 'hollow'], ['veins', 'hollow', 'maw']] },
    stance: { chest: 0.3, head: 0.18, dangle: true, crouch: 0.08 },
    gait: { stride: 0.9, bounce: 0.9, sway: 1.6 },
    stats: { hp: 1.5, dmg: 1.3, spd: 1.05 },
    powers: ['hellfire', 'bat_swarm', 'shadow_claw', 'crimson_hunger', 'frost_fang'],
  },
};

// Palettes by archetype: { main, accent, dark, trim, armor } (all dark and gothic, with blood-red accents)
export const ARCH_PALETTES = {
  lord: [
    { main: 0x1a0508, accent: 0xb0101c, dark: 0x0a0204, trim: 0xd4a94c, armor: 0x2a2228, name: 'crimson & gold' },
    { main: 0x1c0e2a, accent: 0x7a2ab8, dark: 0x0a0510, trim: 0xc8b0e0, armor: 0x2a2234, name: 'violet regalia' },
    { main: 0x101418, accent: 0x9a0e22, dark: 0x06080a, trim: 0xb9bfcb, armor: 0x3a3f4a, name: 'iron & blood' },
    { main: 0x2a0612, accent: 0xe0a040, dark: 0x10040a, trim: 0xe0a040, armor: 0x4a1020, name: 'wine & amber' },
  ],
  warrior: [
    { main: 0x1a1a20, accent: 0x8a0a1c, dark: 0x0c0c10, trim: 0x9aa0ad, armor: 0x4a4f5c, name: 'gunmetal' },
    { main: 0x2a0a10, accent: 0xc0182c, dark: 0x0e0306, trim: 0xb08a4c, armor: 0x3a2a2e, name: 'bloodsteel' },
    { main: 0x10161e, accent: 0x4a6ab0, dark: 0x06080c, trim: 0xa8b4c8, armor: 0x5a6272, name: 'nightsteel' },
    { main: 0x1e1612, accent: 0xa0300e, dark: 0x0a0706, trim: 0xc08a50, armor: 0x2e2622, name: 'blackened bronze' },
  ],
  assassin: [
    { main: 0x0e0e12, accent: 0x9a0a22, dark: 0x050507, trim: 0x7a8090, armor: 0x1a1a20, name: 'shadow' },
    { main: 0x141a24, accent: 0x3a7ac0, dark: 0x07090d, trim: 0x90a0b8, armor: 0x1c222c, name: 'midnight blue' },
    { main: 0x1a0c18, accent: 0xc0207a, dark: 0x0a040a, trim: 0xb08aa8, armor: 0x201420, name: 'plum' },
    { main: 0x14161a, accent: 0xb0b8c8, dark: 0x06070a, trim: 0x8a90a0, armor: 0x20242c, name: 'ash & silver' },
  ],
  sorcerer: [
    { main: 0x2a1040, accent: 0xb04aff, dark: 0x120820, trim: 0xd8c0f0, armor: 0x2a1a3a, name: 'amethyst' },
    { main: 0x3a0a1c, accent: 0xff4a6a, dark: 0x14040a, trim: 0xe0b0c0, armor: 0x2a0a16, name: 'rose blood' },
    { main: 0x0e2430, accent: 0x4ad0ff, dark: 0x061018, trim: 0xa0d0e0, armor: 0x14303c, name: 'frostwoven' },
    { main: 0x2a0a0e, accent: 0xff7a2a, dark: 0x100406, trim: 0xe8c090, armor: 0x2a1410, name: 'ember' },
  ],
  ancient: [
    { main: 0x2a2024, accent: 0x7a0a18, dark: 0x0c0808, trim: 0xbfb4a0, armor: 0x3a3030, name: 'grave shroud' },
    { main: 0x1a1a22, accent: 0x4a2a7a, dark: 0x08080c, trim: 0xa8a4b8, armor: 0x2a2a34, name: 'ashen shroud' },
    { main: 0x24160e, accent: 0x9a2010, dark: 0x0a0604, trim: 0xc8b890, armor: 0x3a281c, name: 'old blood' },
    { main: 0x161a1c, accent: 0x6a1a2a, dark: 0x060808, trim: 0xb0b4a8, armor: 0x262c30, name: 'barrow grey' },
  ],
};

export const ANCIENT_HAIR = [
  { root: 0xcfcac8, tip: 0xf0eeee, hi: 0xffffff, name: 'bone white' },
  { root: 0x6a6a72, tip: 0xa8a8b4, hi: 0xdcdce6, name: 'ash grey' },
  { root: 0x2a2024, tip: 0x6a5a60, hi: 0xa89aa0, name: 'grave grey' },
];

export const ARCH_TITLES = {
  lord: { m: ['Vampire Lord', 'Lord of the Long Night', 'Blood Lord'], f: ['Vampire Lady', 'Lady of the Long Night', 'Blood Lady'] },
  warrior: { m: ['Bloodguard', 'Blood Knight', 'Warlord of the Night'], f: ['Bloodguard', 'Blood Valkyrie', 'Warlady of the Night'] },
  assassin: { m: ['Nightblade', 'Silent Fang', 'Shadow Assassin'], f: ['Nightblade', 'Silent Fang', 'Shadow Assassin'] },
  sorcerer: { m: ['Blood Sorcerer', 'Sanguimancer', 'Hexblood'], f: ['Blood Sorceress', 'Sanguimancer', 'Hexblood'] },
  ancient: { m: ['Ancient One', 'Elder of the First Night', 'The Unburied'], f: ['Ancient One', 'Elder of the First Night', 'The Unburied'] },
};

/** Which archetype a court member is, by level (ancients and lords are the high levels). */
export function pickArchetype(level, rng) {
  const r = rng();
  if (level >= 30) return r < 0.7 ? 'ancient' : 'lord';
  if (level >= 20) return r < 0.1 ? 'ancient' : r < 0.3 ? 'lord' : r < 0.56 ? 'warrior' : r < 0.78 ? 'assassin' : 'sorcerer';
  if (level >= 10) return r < 0.28 ? 'warrior' : r < 0.56 ? 'assassin' : r < 0.73 ? 'sorcerer' : 'noble';
  return r < 0.5 ? 'noble' : r < 0.7 ? 'assassin' : r < 0.9 ? 'warrior' : 'sorcerer';
}

const roll = (rng, [a, b]) => a + rng() * (b - a);

/** Facial structure for an archetype (feeds headGeometry + buildFace). */
export function rollFace(arch, female, rng) {
  const g = female ? 'f' : 'm';
  const base = female
    ? { jaw: roll(rng, [0.38, 0.46]), width: roll(rng, [0.84, 0.92]), height: roll(rng, [1.08, 1.16]), chin: 0.012, eyeW: roll(rng, [0.023, 0.028]), eyeH: roll(rng, [0.0155, 0.018]), eyeTilt: roll(rng, [0.1, 0.2]), browAngle: roll(rng, [-0.08, 0.1]), browY: 0.03, browThick: roll(rng, [0.0022, 0.003]), lidHeavy: roll(rng, [1.0, 1.25]), mouthDrop: roll(rng, [0.058, 0.068]), eyeX: roll(rng, [0.037, 0.042]), smirk: 0 }
    : { jaw: roll(rng, [0.36, 0.46]), width: roll(rng, [0.88, 0.96]), height: roll(rng, [1.08, 1.16]), chin: 0.012, eyeW: roll(rng, [0.021, 0.026]), eyeH: roll(rng, [0.013, 0.0165]), eyeTilt: roll(rng, [0.1, 0.22]), browAngle: roll(rng, [-0.34, -0.12]), browY: roll(rng, [0.024, 0.03]), browThick: roll(rng, [0.003, 0.0046]), lidHeavy: roll(rng, [0.95, 1.2]), mouthDrop: roll(rng, [0.058, 0.07]), eyeX: roll(rng, [0.038, 0.043]), smirk: roll(rng, [-0.25, 0.35]) };
  const tweak = {
    lord: { jaw: [0.42, 0.5], width: [0.92, 0.98], eyeH: [0.0125, 0.0148], browAngle: [-0.4, -0.26] },
    warrior: { jaw: [0.26, 0.34], width: [0.97, 1.04], browThick: [0.005, 0.0068], browAngle: [-0.42, -0.2], eyeH: [0.0135, 0.016] },
    assassin: { jaw: [0.5, 0.58], width: [0.82, 0.88], eyeH: [0.0108, 0.0128], eyeTilt: [0.2, 0.28], eyeW: [0.025, 0.029], browAngle: [-0.3, -0.08] },
    sorcerer: { jaw: [0.44, 0.52], eyeW: [0.026, 0.03], eyeH: [0.0165, 0.019], browAngle: [-0.05, 0.12], lidHeavy: [0.85, 1.0] },
    ancient: { jaw: [0.56, 0.64], width: [0.78, 0.84], height: [1.2, 1.28], eyeW: [0.027, 0.032], eyeH: [0.019, 0.023], browThick: [0.0012, 0.002], browAngle: [-0.1, 0.1], lidHeavy: [0.5, 0.7], mouthDrop: [0.07, 0.076], smirk: [0.1, 0.3] },
  }[arch];
  if (tweak) for (const k in tweak) base[k] = roll(rng, tweak[k]);
  base.slit = arch !== 'sorcerer' || rng() < 0.5;
  base.wing = female && arch !== 'ancient' && arch !== 'warrior';
  base.fangLen = arch === 'ancient' ? roll(rng, [0.024, 0.03]) : arch === 'lord' ? roll(rng, [0.017, 0.021]) : arch === 'assassin' ? roll(rng, [0.016, 0.02]) : roll(rng, [0.012, 0.018]);
  base.gaunt = arch === 'ancient';
  base.g = g;
  return base;
}

/** Rolls the full look of one vampire. rng must be a seeded() generator. */
export function rollLook(archId, female, rng) {
  const A = ARCHETYPES[archId] ?? ARCHETYPES.noble;
  const g = female ? 'f' : 'm';
  const b = A.build;
  const look = {
    archetype: ARCHETYPES[archId] ? archId : 'noble',
    outfit: rng.pick(A.outfit[g]),
    weapon: rng.pick(A.weapon[g]),
    headgear: rng.pick(A.headgear[g]),
    back: rng.pick(A.back[g]),
    shoulders: rng.pick(A.shoulders[g]),
    hair: rng.pick(A.hair[g]),
    marks: rng.pick(A.marks[g]),
    build: { h: roll(rng, b.h), b: roll(rng, b.b), l: roll(rng, b.l), r: roll(rng, b.r), leg: roll(rng, b.leg), hd: roll(rng, b.hd) },
    face: rollFace(archId, female, rng),
  };
  // kit variants keep the members of one archetype from reading as copies
  look.variant = rng.int(0, 2);
  if (archId === 'warrior') {
    if (look.variant === 1) {
      // berserker: bare scarred chest, one huge pauldron, fur, no helm
      look.headgear = 'none';
      look.shoulders = 'fur';
      if (look.weapon !== 'axe' && look.weapon !== 'greatsword') look.weapon = 'axe';
      if (!look.marks.includes('scar')) look.marks = [...look.marks, 'scar'];
    } else if (look.variant === 2) {
      // knight: long tabard, helm and a cloak
      if (look.headgear === 'none') look.headgear = female ? 'winged' : 'helm';
      look.back = rng() < 0.5 ? 'bigCape' : 'cloak';
    }
  } else if (archId === 'assassin') {
    if (look.variant === 1) {
      look.headgear = 'none';
      look.shoulders = 'mantle';
    } else if (look.variant === 2) {
      // duelist: wide-brimmed hat, tailcoat, cravat and sash
      look.headgear = 'hat';
      if (!female) look.outfit = 'coat';
      if (look.weapon === 'daggers') look.weapon = 'rapier';
    }
  }
  if (look.headgear === 'helm' || look.headgear === 'hornedHelm' || look.headgear === 'winged') look.hair = 'capOnly';
  if (look.headgear === 'hat') look.hair = rng.pick(female ? ['bob', 'ponytail', 'twintail'] : ['slick', 'crop', 'wolf']);
  if (look.headgear === 'hood') look.hair = rng.pick(female ? ['bob', 'bob', 'crop'] : ['slick', 'crop', 'undercut']);
  return look;
}

/** Weapon table: animation style, melee reach multiplier and whether the wielder fights at range. */
export const WEAPON_INFO = {
  sword: { style: 'sword', reach: 1 },
  greatsword: { style: 'sword', reach: 1.15 },
  swordShield: { style: 'sword', reach: 1 },
  katana: { style: 'sword', reach: 1.05 },
  rapier: { style: 'sword', reach: 1.1 },
  axe: { style: 'sword', reach: 1.0 },
  spear: { style: 'sword', reach: 1.3 },
  scythe: { style: 'sword', reach: 1.25 },
  staff: { style: 'sword', reach: 1, ranged: true },
  dual: { style: 'dual', reach: 0.95 },
  daggers: { style: 'dual', reach: 0.9 },
  claws: { style: 'dual', reach: 0.9 },
  blades: { style: 'blades', reach: 1, ranged: true },
  none: { style: 'blades', reach: 1, ranged: true },
};
