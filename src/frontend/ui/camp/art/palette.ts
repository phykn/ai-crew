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
} as const;

export type Ink = keyof typeof palette;

/** Each crew member's livery. Cloth carries the role colour from the roster so
 * the name tag and the body agree; hair, hat and tools stay inside one palette. */
export type Livery = {
  cloth: string;
  clothShade: string;
  clothLight: string;
  trim: string;
  trimShade: string;
  hair: string;
  hairMid: string;
  hairLight: string;
  hairStyle: "bob" | "short" | "pony" | "long" | "messy" | "wave" | "bun";
  skin: string;
  skinShade: string;
  skinDeep: string;
  hat?: "cap" | "beret";
  hatColor?: string;
  hatShade?: string;
  glasses?: boolean;
  beard?: boolean;
  scarf?: string;
  apron?: string;
  apronShade?: string;
};

const skin = palette.skin;
const skinShade = palette.skinShade;
const skinDeep = palette.skinDeep;

export const liveries: Record<number, Livery> = {
  0: {
    cloth: palette.clothSage,
    clothShade: palette.clothSageShade,
    clothLight: palette.clothSageLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hair: palette.hairMid,
    hairMid: palette.hairLight,
    hairLight: palette.hairGlint,
    hairStyle: "bun",
    skin,
    skinShade,
    skinDeep,
  },
  1: {
    cloth: palette.clothDenim,
    clothShade: palette.clothDenimShade,
    clothLight: palette.clothDenimLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hair: palette.hairDark,
    hairMid: palette.hairMid,
    hairLight: palette.hairLight,
    hairStyle: "messy",
    skin,
    skinShade,
    skinDeep,
  },
  2: {
    cloth: palette.clothOlive,
    clothShade: palette.clothOliveShade,
    clothLight: palette.clothOliveLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hair: palette.ashDeep,
    hairMid: palette.ash,
    hairLight: palette.ashLight,
    hairStyle: "short",
    hat: "beret",
    hatColor: palette.leafDeep,
    hatShade: palette.leafDeepest,
    glasses: true,
    skin,
    skinShade,
    skinDeep,
  },
  3: {
    cloth: palette.clothApricot,
    clothShade: palette.clothApricotShade,
    clothLight: palette.clothApricotLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hair: palette.auburn,
    hairMid: palette.auburnLight,
    hairLight: palette.hairGlint,
    hairStyle: "pony",
    scarf: palette.clothTeal,
    skin,
    skinShade,
    skinDeep,
  },
  4: {
    cloth: palette.clothTan,
    clothShade: palette.clothTanShade,
    clothLight: palette.clothTanLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hair: palette.hairMid,
    hairMid: palette.hairLight,
    hairLight: palette.hairGlint,
    hairStyle: "wave",
    skin,
    skinShade,
    skinDeep,
  },
  5: {
    cloth: palette.clothLinen,
    clothShade: palette.clothLinenShade,
    clothLight: palette.trimLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hair: palette.hairDark,
    hairMid: palette.hairMid,
    hairLight: palette.hairLight,
    hairStyle: "short",
    beard: true,
    apron: palette.clothLeather,
    apronShade: palette.clothLeatherShade,
    skin,
    skinShade,
    skinDeep,
  },
  6: {
    cloth: palette.clothForest,
    clothShade: palette.clothForestShade,
    clothLight: palette.clothForestLight,
    trim: palette.trim,
    trimShade: palette.trimShade,
    hair: palette.hairDeep,
    hairMid: palette.hairDark,
    hairLight: palette.hairMid,
    hairStyle: "messy",
    skin,
    skinShade,
    skinDeep,
  },
  7: {
    cloth: palette.clothCrimson,
    clothShade: palette.clothCrimsonShade,
    clothLight: palette.clothCrimsonLight,
    trim: palette.clothLinen,
    trimShade: palette.clothLinenShade,
    hair: palette.hairMid,
    hairMid: palette.hairLight,
    hairLight: palette.hairGlint,
    hairStyle: "pony",
    hat: "cap",
    hatColor: palette.clothCrimson,
    hatShade: palette.clothCrimsonShade,
    skin,
    skinShade,
    skinDeep,
  },
  8: {
    cloth: palette.clothCloak,
    clothShade: palette.clothCloakShade,
    clothLight: palette.clothCloakLight,
    trim: palette.clothLeather,
    trimShade: palette.clothLeatherShade,
    hair: palette.blonde,
    hairMid: palette.blondeLight,
    hairLight: palette.canvasLit,
    hairStyle: "short",
    skin,
    skinShade,
    skinDeep,
  },
};
