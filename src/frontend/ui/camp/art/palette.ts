// One warm 16-bit palette: every camp pixel is drawn from these ramps only, lit
// from the upper left and closed with the same dark brown ink.

export const palette = {
  // ── ink ────────────────────────────────────────────────────────────────
  ink: "#2b1a12",
  inkSoft: "#4a3120",
  shadow: "#241711",

  // ── skin ───────────────────────────────────────────────────────────────
  skin: "#f8d4aa",
  skinLight: "#ffe7c8",
  skinShade: "#dfa87a",
  skinDeep: "#b57c55",
  blush: "#e79183",

  // ── hair ramps ─────────────────────────────────────────────────────────
  hairDeep: "#3d2719",
  hairDark: "#553a26",
  hairMid: "#7a5537",
  hairLight: "#a0774e",
  hairGlint: "#c59c6a",
  blondeDeep: "#9c7038",
  blonde: "#d5a966",
  blondeLight: "#efd294",
  auburnDeep: "#6f3a24",
  auburn: "#a75d3d",
  auburnLight: "#c9805a",
  ashDeep: "#463f38",
  ash: "#6b6157",
  ashLight: "#8d8277",

  // ── cloth basics ───────────────────────────────────────────────────────
  trim: "#f6ead2",
  trimLight: "#fffaec",
  trimShade: "#dbc8a4",
  pants: "#6b5a49",
  pantsShade: "#4c3e31",
  pantsLight: "#87725d",
  boots: "#6b4a33",
  bootsShade: "#432c1b",
  bootsLight: "#8e6744",

  // ── meadow ramp ────────────────────────────────────────────────────────
  grassDeepest: "#3b5727",
  grassDeep: "#4b6d30",
  grassDark: "#618e3b",
  grass: "#7da94a",
  grassLight: "#9ac763",
  grassLit: "#bade86",
  grassYellow: "#c6d873",

  // ── trodden earth ramp ─────────────────────────────────────────────────
  dirtDeep: "#7c5530",
  dirtDark: "#996c3d",
  dirt: "#b88950",
  dirtLight: "#d3aa71",
  dirtLit: "#ecd09c",

  // ── wood ramp (warm, weathered) ────────────────────────────────────────
  woodDeep: "#3f2819",
  woodGrain: "#5f3d24",
  woodDark: "#74492b",
  wood: "#8d5c38",
  woodMid: "#9d6a41",
  woodLight: "#b07d4e",
  woodLit: "#caa071",

  // ── canvas / tent cloth ───────────────────────────────────────────────
  canvasDeep: "#a58f6d",
  canvasShade: "#c6b18d",
  canvas: "#e2d2af",
  canvasLight: "#f3ead3",
  canvasLit: "#fdf8e9",

  // ── metal ──────────────────────────────────────────────────────────────
  metalDeep: "#4f5049",
  metalShade: "#7b776e",
  metal: "#a49f96",
  metalLight: "#d0cabf",
  brass: "#cf9f49",
  brassShade: "#9d7228",
  brassLight: "#efcd7d",

  // ── stone ──────────────────────────────────────────────────────────────
  stoneDeep: "#565349",
  stoneShade: "#787265",
  stone: "#968f82",
  stoneLight: "#b8b1a0",
  stoneLit: "#d7d0bd",

  // ── paper ──────────────────────────────────────────────────────────────
  paper: "#f8f2e1",
  paperShade: "#dccfb1",
  paperLine: "#b3a184",

  // ── fire ───────────────────────────────────────────────────────────────
  fire: "#e4711d",
  fireLight: "#ffa339",
  fireCore: "#ffe58c",
  fireGlow: "#ffcb74",
  ember: "#c44419",

  // ── foliage ────────────────────────────────────────────────────────────
  leafDeepest: "#2d4f26",
  leafDeep: "#3d6930",
  leaf: "#55883c",
  leafLight: "#74a94d",
  leafLit: "#98c768",

  // ── light and cloth accents ────────────────────────────────────────────
  lamp: "#ffe3a1",
  lampGlow: "#ffc46a",
  banner: "#de7a5d",
  bannerShade: "#b25845",

  // ── crew livery cloth ─────────────────────────────────────────────────
  clothSage: "#a6cd82",
  clothSageShade: "#789b60",
  clothSageLight: "#bdd9a2",
  clothDenim: "#5f8cb8",
  clothDenimShade: "#456e96",
  clothDenimLight: "#8fb1cf",
  clothOlive: "#7d9450",
  clothOliveShade: "#5f6c40",
  clothOliveLight: "#9aa974",
  clothApricot: "#e6a06a",
  clothApricotShade: "#bb7d50",
  clothApricotLight: "#f2c49c",
  clothTan: "#cca76d",
  clothTanShade: "#a4834e",
  clothTanLight: "#e1c696",
  clothLinen: "#e8d6b0",
  clothLinenShade: "#c3ae86",
  clothLinenLight: "#f7eed6",
  clothForest: "#587f47",
  clothForestShade: "#47603a",
  clothForestLight: "#7d9d67",
  clothCrimson: "#cf5545",
  clothCrimsonShade: "#9e3f36",
  clothCrimsonLight: "#e47b6b",
  clothCloak: "#7ea35c",
  clothCloakShade: "#5f7849",
  clothCloakLight: "#9cb77f",
  clothTeal: "#4f9a93",
  clothTealShade: "#3a7772",
  clothTealLight: "#6fb7af",
  clothLeather: "#8a5a34",
  clothLeatherShade: "#674024",
  clothLeatherLight: "#a87849",

  // ── paint swatches (the style lead's palette) ──────────────────────────
  swatchSky: "#a9c7ec",
  swatchRose: "#f6aa8a",
  swatchSage: "#a8cd93",
  swatchLilac: "#d8b0d4",

  // ── night cloth and hoods ──────────────────────────────────────────────
  nightDeep: "#24223a",
  night: "#35324f",
  nightLight: "#4c486e",
  nightLit: "#6d6892",
  plumDeep: "#432944",
  plum: "#5d3a5c",
  plumLight: "#7e527a",

  // ── magic light: violet and sea crystals ───────────────────────────────
  violetDeep: "#4a2e6b",
  violet: "#6f3fa3",
  violetLight: "#9a66cc",
  violetLit: "#c9a4ef",
  seaDeep: "#256069",
  sea: "#3c8f97",
  seaLight: "#6fc3c4",
  seaLit: "#b6ece4",
  brew: "#8fbf58",
  brewLight: "#c6e88a",
} as const;

export type Ink = keyof typeof palette;

/** Each crew member's livery: the robe, the hood or hat and the one tool they
 * carry. Two or three flat tones per part keep nine small figures apart. */
export type Livery = {
  cloth: string;
  clothShade: string;
  clothLight: string;
  trim: string;
  trimShade: string;
  hood: "cloth" | "cat" | "witch" | "brim" | "bare";
  hoodColor?: string;
  hoodShade?: string;
  hoodLight?: string;
  prop: "staff" | "scroll" | "book" | "brush" | "hammer" | "quill" | "lens" | "telescope" | "lantern";
  /** Faces in a deep hood read a shade darker, with bright eyes. */
  face?: "bright" | "shadow";
  skin: string;
  skinShade: string;
  skinDeep: string;
  apron?: string;
  apronShade?: string;
  scarf?: string;
  flower?: string;
  boots?: string;
  beard?: boolean;
};

const skin = palette.skin;
const skinShade = palette.skinShade;
const skinDeep = palette.skinDeep;

export const liveries: Record<number, Livery> = {
  // The assistant: a cat hood and a rune staff.
  0: {
    cloth: palette.night,
    clothShade: palette.nightDeep,
    clothLight: palette.nightLight,
    trim: palette.clothApricotLight,
    trimShade: palette.clothApricotShade,
    hood: "cat",
    hoodColor: palette.night,
    hoodShade: palette.nightDeep,
    hoodLight: palette.nightLit,
    prop: "staff",
    skin,
    skinShade,
    skinDeep,
  },
  // Development: a blue hood and a floating scroll.
  1: {
    cloth: palette.clothDenim,
    clothShade: palette.clothDenimShade,
    clothLight: palette.clothDenimLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hood: "cloth",
    hoodColor: palette.clothDenim,
    hoodShade: palette.clothDenimShade,
    hoodLight: palette.clothDenimLight,
    prop: "scroll",
    skin,
    skinShade,
    skinDeep,
  },
  // Review: a red hood and a magic book.
  2: {
    cloth: palette.clothCrimson,
    clothShade: palette.clothCrimsonShade,
    clothLight: palette.clothCrimsonLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hood: "cloth",
    hoodColor: palette.clothCrimson,
    hoodShade: palette.clothCrimsonShade,
    hoodLight: palette.clothCrimsonLight,
    prop: "book",
    face: "shadow",
    skin,
    skinShade,
    skinDeep,
  },
  // Style: a teal hood and a magic brush.
  3: {
    cloth: palette.clothTeal,
    clothShade: palette.clothTealShade,
    clothLight: palette.clothTealLight,
    trim: palette.trim,
    trimShade: palette.trimShade,
    hood: "cloth",
    hoodColor: palette.clothTealShade,
    hoodShade: palette.clothTealShade,
    hoodLight: palette.clothTealLight,
    prop: "brush",
    skin,
    skinShade,
    skinDeep,
  },
  // HR: a wide-brim hat with a flower, and the roster journal.
  4: {
    cloth: palette.clothTan,
    clothShade: palette.clothTanShade,
    clothLight: palette.clothTanLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hood: "brim",
    hoodColor: palette.clothOlive,
    hoodShade: palette.clothOliveShade,
    hoodLight: palette.clothOliveLight,
    prop: "book",
    flower: palette.swatchRose,
    skin,
    skinShade,
    skinDeep,
  },
  // Build: a cream hood, a leather apron and a rune mallet.
  5: {
    cloth: palette.clothLinen,
    clothShade: palette.clothLinenShade,
    clothLight: palette.clothLinenLight,
    trim: palette.clothLeather,
    trimShade: palette.clothLeatherShade,
    hood: "cloth",
    hoodColor: palette.canvasShade,
    hoodShade: palette.canvasDeep,
    hoodLight: palette.canvas,
    apron: palette.clothLeather,
    apronShade: palette.clothLeatherShade,
    prop: "hammer",
    skin,
    skinShade,
    skinDeep,
  },
  // Docs: a violet witch hat and a quill.
  6: {
    cloth: palette.plum,
    clothShade: palette.plumDeep,
    clothLight: palette.plumLight,
    trim: palette.trim,
    trimShade: palette.trimShade,
    hood: "witch",
    hoodColor: palette.violet,
    hoodShade: palette.violetDeep,
    hoodLight: palette.violetLight,
    prop: "quill",
    skin,
    skinShade,
    skinDeep,
  },
  // Test: a brown hood, a rucksack strap and a crystal magnifier.
  7: {
    cloth: palette.clothLeather,
    clothShade: palette.clothLeatherShade,
    clothLight: palette.clothLeatherLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hood: "cloth",
    hoodColor: palette.clothLeather,
    hoodShade: palette.clothLeatherShade,
    hoodLight: palette.clothLeatherLight,
    scarf: palette.clothSage,
    prop: "lens",
    skin,
    skinShade,
    skinDeep,
  },
  // Vision: a traveller's brim hat and a telescope.
  8: {
    cloth: palette.clothForest,
    clothShade: palette.clothForestShade,
    clothLight: palette.clothForestLight,
    trim: palette.clothTan,
    trimShade: palette.clothTanShade,
    hood: "brim",
    hoodColor: palette.clothTan,
    hoodShade: palette.clothTanShade,
    hoodLight: palette.clothTanLight,
    prop: "telescope",
    beard: true,
    skin,
    skinShade,
    skinDeep,
  },
};
