// The one palette every camp pixel is drawn from: warm pastel retro, one dark
// brown outline. Tiles, props and crew share these exact hex values.

export const palette = {
  outline: "#33241c",
  outlineSoft: "#4d382a",
  shadow: "#2b1d16",
  skin: "#f6cfa5",
  skinShade: "#e0a97b",
  skinDeep: "#b57a52",
  hairDark: "#5b4030",
  hairMid: "#7d5a41",
  hairLight: "#a5794f",
  hairBlonde: "#d9b273",
  hairAuburn: "#a85f42",
  hairAsh: "#6c6259",
  trim: "#f4e7cd",
  trimLight: "#fff8e8",
  pants: "#6f6152",
  pantsShade: "#54483d",
  boots: "#6b4a33",
  bootsShade: "#4d3324",
  grass: "#96bd6e",
  grassLight: "#b3d68c",
  grassDark: "#74994f",
  grassDeep: "#5c7f3f",
  dirt: "#c9a066",
  dirtLight: "#e0bd85",
  dirtDark: "#a97f4c",
  dirtDeep: "#8a6539",
  wood: "#a97a4c",
  woodLight: "#c79c66",
  woodDark: "#7a5230",
  canvas: "#ecdcb6",
  canvasShade: "#cdb891",
  canvasLight: "#f9f0d8",
  metal: "#c2cbd0",
  metalShade: "#8f9aa2",
  paper: "#f8f2e2",
  paperShade: "#dcd2b8",
  stone: "#bcb6a8",
  stoneShade: "#948d7f",
  fire: "#ff8a3c",
  fireLight: "#ffbe5c",
  fireCore: "#fff0b4",
  leaf: "#6a9a4e",
  lamp: "#ffe6a0",
  banner: "#e78a7a",
  bannerShade: "#c46d61",
  pollen: "#e7b58a",
  tentDark: "#3b2a20",
  swatchSky: "#a9c7ec",
  swatchRose: "#f6aa8a",
  swatchSage: "#a8cd93",
  swatchLilac: "#d8b0d4",
} as const;

export type Ink = keyof typeof palette;

/** Each crew member's livery. Cloth carries the role colour from the roster so
 * the name tag and the body agree; hair and build stay inside the one palette. */
export type Livery = {
  cloth: string;
  clothShade: string;
  trim: string;
  hair: string;
  hairLight: string;
  hairStyle: "bob" | "short" | "pony" | "long" | "messy" | "cap" | "bun";
  skin: string;
};

const skin = palette.skin;

export const liveries: Record<number, Livery> = {
  // `roles[].sprite`의 번호를 그대로 쓴다: 0 비서 하나, 1 개발 태오, 2 리뷰 현우,
  // 3 스타일 유진, 4 인사 지민, 5 빌드 도윤, 6 문서 서연, 7 테스트 민재, 8 비전 수아.
  0: { cloth: "#e9c48f", clothShade: "#c9a066", trim: palette.trimLight, hair: palette.hairMid, hairLight: palette.hairLight, hairStyle: "bob", skin },
  1: { cloth: "#a8cd93", clothShade: "#85a975", trim: "#f4f7e6", hair: palette.hairDark, hairLight: palette.hairMid, hairStyle: "short", skin },
  2: { cloth: "#d8b0d4", clothShade: "#b08aae", trim: "#f9eef8", hair: palette.hairAsh, hairLight: "#8a8078", hairStyle: "long", skin },
  3: { cloth: "#f2ab8c", clothShade: "#cd8a70", trim: "#fdeee6", hair: palette.hairAuburn, hairLight: "#c37a58", hairStyle: "pony", skin },
  4: { cloth: "#eed292", clothShade: "#c9ac6f", trim: "#fbf5e0", hair: palette.hairBlonde, hairLight: "#ecc98a", hairStyle: "bun", skin },
  5: { cloth: "#d6ac86", clothShade: "#b08a68", trim: "#f7efe4", hair: palette.hairDark, hairLight: palette.hairMid, hairStyle: "cap", skin },
  6: { cloth: "#b7cbe6", clothShade: "#93a7c4", trim: "#f2f6fc", hair: palette.hairMid, hairLight: palette.hairLight, hairStyle: "short", skin },
  7: { cloth: "#a9c7ec", clothShade: "#82a3c9", trim: "#f0f6fd", hair: "#4a3a30", hairLight: palette.hairMid, hairStyle: "messy", skin },
  8: { cloth: "#a2d4c6", clothShade: "#7fada1", trim: "#eefaf6", hair: "#4a3a30", hairLight: palette.hairMid, hairStyle: "bob", skin },
};
