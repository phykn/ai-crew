// The nine crew bodies as real frames on one 40x54 grid: two standing, four
// walking, one seated with folded legs and two working. Shapes are rounded and
// shaded in three or four tones from the shared palette, so the small figures
// read as the same family as the props and the meadow.

import { PixelCanvas } from "pixlrt/core";
import {
  ellipse,
  hline,
  outlined,
  put,
  rect,
  rgba,
  roundRect,
  shadowEllipse,
  stamp,
  surface,
  vline,
  type Rgba,
} from "./draw";
import { liveries, palette, type Livery } from "./palette";

export const crewWidth = 40;
export const crewHeight = 54;

export type CrewPose =
  | "idle1"
  | "idle2"
  | "walk1"
  | "walk2"
  | "walk3"
  | "walk4"
  | "sit"
  | "work1"
  | "work2";

const c = (key: keyof typeof palette, alpha = 255): Rgba => rgba(palette[key], alpha);
const ink = c("ink");
const soft = c("inkSoft");

type Tone = { base: Rgba; shade: Rgba; light: Rgba; deep: Rgba };

function tone(base: string, shade: string, light: string, deep: string): Tone {
  return { base: rgba(base), shade: rgba(shade), light: rgba(light), deep: rgba(deep) };
}

/** Rounder on top, narrowing to a soft chin. */
const headWidths = [9, 12, 15, 16, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 16, 15, 13, 10, 7];
const HEAD_TOP = 4;
const HEAD_BOTTOM = HEAD_TOP + headWidths.length - 1;

/** Broad shoulders, a slight waist, a small hem. */
const torsoWidths = [14, 16, 16, 16, 15, 15, 15, 14, 14, 13, 13, 12, 11];
const TORSO_TOP = 26;

const CENTER = 19;

function spans(
  canvas: PixelCanvas,
  widths: number[],
  top: number,
  color: Rgba,
  dx = 0,
  dy = 0,
) {
  widths.forEach((width, index) => {
    hline(canvas, CENTER - Math.floor(width / 2) + dx, top + index + dy, width, color);
  });
}

function pants() {
  return tone(palette.pants, palette.pantsShade, palette.pantsLight, palette.pantsShade);
}
function boots() {
  return tone(palette.boots, palette.bootsShade, palette.bootsLight, palette.bootsShade);
}

/** One leg with a cuff at the boot, so the step reads at small size. */
function leg(canvas: PixelCanvas, x: number, lift: number, dx: number) {
  const p = pants();
  const b = boots();
  const top = 39;
  const bottom = 49 - lift;
  const height = Math.max(3, bottom - top);
  rect(canvas, x + dx, top, 6, height, p.base);
  vline(canvas, x + dx, top, height, p.light);
  vline(canvas, x + dx + 5, top, height, p.shade);
  hline(canvas, x + dx, top, 6, p.light);
  // Trousers gather above the boot.
  hline(canvas, x + dx, bottom - 4, 6, p.shade);
  rect(canvas, x + dx - 1, bottom - 3, 8, 2, b.light);
  rect(canvas, x + dx - 1, bottom - 1, 8, 3, b.base);
  hline(canvas, x + dx - 1, bottom - 1, 8, b.light);
  hline(canvas, x + dx - 1, bottom + 2, 8, b.shade);
  put(canvas, x + dx + 6, bottom + 1, b.deep);
}

/** Seated legs: thighs forward, knees past the body, boots flat on the ground. */
function seatedLegs(canvas: PixelCanvas, dy: number, dx: number) {
  const p = pants();
  const b = boots();
  // Far leg, a shade back.
  rect(canvas, 9 + dx, 42 + dy, 14, 5, p.shade);
  rect(canvas, 22 + dx, 45 + dy, 5, 4, p.shade);
  rect(canvas, 21 + dx, 49 + dy, 9, 3, b.base);
  hline(canvas, 21 + dx, 49 + dy, 9, b.light);
  hline(canvas, 21 + dx, 51 + dy, 9, b.shade);
  // Near leg: thigh across, knee out front, shin down, boot forward.
  rect(canvas, 9 + dx, 38 + dy, 16, 5, p.base);
  hline(canvas, 9 + dx, 38 + dy, 16, p.light);
  hline(canvas, 9 + dx, 42 + dy, 16, p.shade);
  rect(canvas, 24 + dx, 39 + dy, 6, 6, p.base);
  vline(canvas, 24 + dx, 39 + dy, 6, p.light);
  hline(canvas, 24 + dx, 44 + dy, 6, p.shade);
  rect(canvas, 25 + dx, 44 + dy, 5, 5, p.base);
  vline(canvas, 29 + dx, 44 + dy, 5, p.shade);
  rect(canvas, 24 + dx, 49 + dy, 9, 3, b.base);
  hline(canvas, 24 + dx, 49 + dy, 9, b.light);
  hline(canvas, 24 + dx, 51 + dy, 9, b.shade);
}

/** One arm: tapered sleeve, cuff, then a three-pixel hand. */
function arm(
  canvas: PixelCanvas,
  livery: Livery,
  x: number,
  dy: number,
  handDrop: number,
  sleeve = 9,
) {
  const cloth = tone(livery.cloth, livery.clothShade, livery.clothLight, livery.clothShade);
  const top = 28 + dy;
  rect(canvas, x, top, 5, sleeve, cloth.base);
  vline(canvas, x, top, sleeve, cloth.light);
  vline(canvas, x + 4, top, sleeve, cloth.shade);
  // Shoulder light and cuff.
  hline(canvas, x, top, 5, cloth.light);
  hline(canvas, x, top + sleeve - 1, 5, c("trimShade"));
  const handY = top + sleeve + handDrop;
  rect(canvas, x, handY, 4, 4, rgba(livery.skin));
  vline(canvas, x, handY, 4, rgba(palette.skinLight));
  vline(canvas, x + 3, handY, 4, rgba(livery.skinShade));
  hline(canvas, x, handY + 3, 4, rgba(livery.skinDeep, 180));
}

function drawHead(canvas: PixelCanvas, livery: Livery, dy: number, dx: number, blink: boolean) {
  const skin = rgba(livery.skin);
  const shade = rgba(livery.skinShade);
  const deep = rgba(livery.skinDeep);
  const light = rgba(palette.skinLight);

  // Neck with a shadow under the jaw.
  rect(canvas, CENTER - 2 + dx, HEAD_BOTTOM - 1 + dy, 4, 4, shade);
  vline(canvas, CENTER + 2 + dx, HEAD_BOTTOM - 1 + dy, 3, deep);

  spans(canvas, headWidths, HEAD_TOP, skin, dx, dy);
  // Rounded shading: light on the brow, shade on the right and the jaw.
  for (let i = 0; i < headWidths.length; i += 1) {
    const width = headWidths[i];
    const x = CENTER - Math.floor(width / 2) + dx;
    const y = HEAD_TOP + i + dy;
    put(canvas, x, y, light);
    put(canvas, x + 1, y, rgba(palette.skinLight, 120));
    put(canvas, x + width - 1, y, shade);
    put(canvas, x + width - 2, y, rgba(palette.skinShade, 130));
  }
  hline(canvas, CENTER - 5 + dx, HEAD_BOTTOM - 2 + dy, 11, shade);
  hline(canvas, CENTER - 3 + dx, HEAD_BOTTOM - 1 + dy, 7, deep);

  // Brows, then almond eyes with one glint each.
  const eyeY = HEAD_TOP + 10 + dy;
  hline(canvas, CENTER - 7 + dx, eyeY - 2, 4, rgba(livery.hair, 215));
  hline(canvas, CENTER + 4 + dx, eyeY - 2, 4, rgba(livery.hair, 215));
  if (blink) {
    hline(canvas, CENTER - 7 + dx, eyeY + 1, 4, deep);
    hline(canvas, CENTER + 4 + dx, eyeY + 1, 4, deep);
  } else {
    rect(canvas, CENTER - 7 + dx, eyeY, 3, 4, ink);
    rect(canvas, CENTER + 4 + dx, eyeY, 3, 4, ink);
    put(canvas, CENTER - 7 + dx, eyeY, c("trimLight"));
    put(canvas, CENTER + 4 + dx, eyeY, c("trimLight"));
    put(canvas, CENTER - 5 + dx, eyeY + 3, rgba(palette.skinDeep, 120));
    put(canvas, CENTER + 6 + dx, eyeY + 3, rgba(palette.skinDeep, 120));
  }
  // Nose and a small mouth.
  put(canvas, CENTER + dx, eyeY + 4, rgba(palette.skinShade, 210));
  hline(canvas, CENTER - 1 + dx, eyeY + 6, 3, rgba(palette.skinDeep, 200));
  put(canvas, CENTER - 2 + dx, eyeY + 5, rgba(palette.blush, 90));
  put(canvas, CENTER + 2 + dx, eyeY + 5, rgba(palette.blush, 90));
  put(canvas, CENTER - 9 + dx, eyeY + 2, rgba(palette.blush, 80));
  put(canvas, CENTER + 9 + dx, eyeY + 2, rgba(palette.blush, 80));
}

/** Hair: a back mass wider than the head, a cap with a fringe, and a glint. */
function drawHairBack(canvas: PixelCanvas, livery: Livery, dy: number, dx: number) {
  const hair = rgba(livery.hair);
  const mid = rgba(livery.hairMid);
  const back = livery.hairStyle === "long" ? 24 : livery.hairStyle === "wave" ? 22 : 0;
  if (!back) return;
  roundRect(canvas, CENTER - 13 + dx, HEAD_TOP + 3 + dy, 26, back, 9, hair);
  vline(canvas, CENTER - 12 + dx, HEAD_TOP + 7 + dy, back - 8, mid);
  vline(canvas, CENTER + 11 + dx, HEAD_TOP + 7 + dy, back - 8, rgba(livery.hair, 215));
  hline(canvas, CENTER - 10 + dx, HEAD_TOP + 4 + dy, 20, rgba(livery.hairLight, 120));
}

function drawHair(canvas: PixelCanvas, livery: Livery, dy: number, dx: number) {
  const hair = rgba(livery.hair);
  const mid = rgba(livery.hairMid);
  const light = rgba(livery.hairLight);

  // Cap: a dome over the skull.
  const cap = [8, 12, 15, 17, 17, 18, 18];
  cap.forEach((width, index) => {
    hline(canvas, CENTER - Math.floor(width / 2) + dx, HEAD_TOP - 3 + index + dy, width, hair);
  });
  // Side locks reaching the cheeks.
  rect(canvas, CENTER - 9 + dx, HEAD_TOP + 2 + dy, 3, 8, hair);
  rect(canvas, CENTER + 7 + dx, HEAD_TOP + 2 + dy, 3, 8, hair);
  // Solid fringe with two notches, so the brow stays clean.
  rect(canvas, CENTER - 9 + dx, HEAD_TOP + 2 + dy, 19, 4, hair);
  hline(canvas, CENTER - 8 + dx, HEAD_TOP + 6 + dy, 16, hair);
  hline(canvas, CENTER - 2 + dx, HEAD_TOP + 7 + dy, 5, hair);
  put(canvas, CENTER - 6 + dx, HEAD_TOP + 7 + dy, rgba(livery.hair, 220));
  put(canvas, CENTER + 4 + dx, HEAD_TOP + 7 + dy, rgba(livery.hair, 220));
  hline(canvas, CENTER - 6 + dx, HEAD_TOP + 5 + dy, 6, mid);
  hline(canvas, CENTER + 2 + dx, HEAD_TOP + 5 + dy, 5, mid);
  // Glint along the crown.
  hline(canvas, CENTER - 5 + dx, HEAD_TOP - 2 + dy, 8, light);
  put(canvas, CENTER - 7 + dx, HEAD_TOP - 1 + dy, mid);
  put(canvas, CENTER + 4 + dx, HEAD_TOP - 2 + dy, rgba(livery.hairLight, 190));

  switch (livery.hairStyle) {
    case "pony":
      rect(canvas, CENTER + 9 + dx, HEAD_TOP - 1 + dy, 4, 4, hair);
      rect(canvas, CENTER + 11 + dx, HEAD_TOP + 2 + dy, 4, 14, hair);
      vline(canvas, CENTER + 14 + dx, HEAD_TOP + 4 + dy, 11, mid);
      hline(canvas, CENTER + 10 + dx, HEAD_TOP + 1 + dy, 3, light);
      break;
    case "bun":
      ellipse(canvas, CENTER - 6 + dx, HEAD_TOP - 10 + dy, CENTER + 6 + dx, HEAD_TOP - 1 + dy, hair);
      hline(canvas, CENTER - 4 + dx, HEAD_TOP - 8 + dy, 7, light);
      hline(canvas, CENTER - 5 + dx, HEAD_TOP - 2 + dy, 9, mid);
      hline(canvas, CENTER - 5 + dx, HEAD_TOP - 1 + dy, 9, c("bannerShade"));
      break;
    case "messy":
      for (const [offset, tall] of [[-9, 3], [-6, 5], [-3, 4], [1, 6], [5, 4], [8, 3]] as const) {
        for (let i = 0; i < tall; i += 1)
          put(canvas, CENTER + offset + dx, HEAD_TOP - 3 - i + dy, i === tall - 1 ? mid : hair);
      }
      break;
    case "bob":
      roundRect(canvas, CENTER - 11 + dx, HEAD_TOP + 1 + dy, 22, 13, 5, hair);
      hline(canvas, CENTER - 8 + dx, HEAD_TOP + 2 + dy, 16, hair);
      break;
    case "wave":
      for (let i = 0; i < 4; i += 1) {
        put(canvas, CENTER - 10 + dx + (i % 2), HEAD_TOP + 8 + i * 3 + dy, mid);
        put(canvas, CENTER + 10 + dx - (i % 2), HEAD_TOP + 9 + i * 3 + dy, mid);
      }
      break;
    default:
      break;
  }

  if (livery.beard) {
    for (let i = 0; i < 5; i += 1) {
      const width = [14, 13, 11, 9, 5][i];
      hline(canvas, CENTER - Math.floor(width / 2) + dx, HEAD_BOTTOM - 6 + i + dy, width, i < 2 ? hair : rgba(livery.hair, 230));
    }
    hline(canvas, CENTER - 4 + dx, HEAD_BOTTOM - 5 + dy, 3, mid);
    hline(canvas, CENTER + 2 + dx, HEAD_BOTTOM - 5 + dy, 3, mid);
  }
}

function drawHat(canvas: PixelCanvas, livery: Livery, dy: number, dx: number) {
  if (!livery.hat) return;
  const color = rgba(livery.hatColor ?? livery.cloth);
  const shade = rgba(livery.hatShade ?? livery.clothShade);
  if (livery.hat === "cap") {
    for (let i = 0; i < 5; i += 1) {
      const width = [13, 17, 18, 18, 17][i];
      hline(canvas, CENTER - Math.floor(width / 2) + dx, HEAD_TOP - 6 + i + dy, width, color);
    }
    hline(canvas, CENTER - 4 + dx, HEAD_TOP - 6 + dy, 7, rgba(palette.trimLight, 100));
    hline(canvas, CENTER - 9 + dx, HEAD_TOP - 1 + dy, 19, shade);
    hline(canvas, CENTER - 8 + dx, HEAD_TOP + dy, 17, shade);
    put(canvas, CENTER + 7 + dx, HEAD_TOP + 1 + dy, c("clothCrimsonLight"));
  } else {
    for (let i = 0; i < 5; i += 1) {
      const width = [10, 14, 17, 18, 17][i];
      hline(canvas, CENTER - Math.floor(width / 2) + 1 + dx, HEAD_TOP - 4 + i + dy, width, color);
    }
    hline(canvas, CENTER - 4 + dx, HEAD_TOP - 3 + dy, 7, rgba(palette.leafLight, 190));
    hline(canvas, CENTER - 10 + dx, HEAD_TOP + 1 + dy, 20, shade);
    put(canvas, CENTER + 6 + dx, HEAD_TOP - 4 + dy, c("leafLit"));
  }
}

function drawGlasses(canvas: PixelCanvas, dy: number, dx: number) {
  const frame = c("metalShade");
  const glass = rgba(palette.swatchSky, 120);
  for (const x of [CENTER - 8, CENTER + 4] as const) {
    roundRect(canvas, x + dx, HEAD_TOP + 9 + dy, 5, 5, 1, frame);
    rect(canvas, x + 1 + dx, HEAD_TOP + 10 + dy, 3, 3, glass);
    put(canvas, x + 1 + dx, HEAD_TOP + 10 + dy, c("trimLight"));
  }
  hline(canvas, CENTER - 3 + dx, HEAD_TOP + 10 + dy, 7, frame);
}

/** Torso, collar, belt and the role's extra cloth. */
function drawTorso(canvas: PixelCanvas, livery: Livery, dy: number, dx: number) {
  const cloth = tone(livery.cloth, livery.clothShade, livery.clothLight, livery.clothShade);
  const trim = rgba(livery.trim);
  const trimShade = rgba(livery.trimShade);

  spans(canvas, torsoWidths, TORSO_TOP, cloth.base, dx, dy);
  for (let i = 0; i < torsoWidths.length; i += 1) {
    const width = torsoWidths[i];
    const x = CENTER - Math.floor(width / 2) + dx;
    const y = TORSO_TOP + i + dy;
    put(canvas, x, y, cloth.light);
    put(canvas, x + width - 1, y, cloth.shade);
    put(canvas, x + width - 2, y, cloth.deep);
  }
  hline(canvas, CENTER - 5 + dx, TORSO_TOP + torsoWidths.length - 1 + dy, 11, cloth.shade);
  put(canvas, CENTER - 7 + dx, TORSO_TOP + dy, cloth.base);
  put(canvas, CENTER + 7 + dx, TORSO_TOP + dy, cloth.shade);

  // Open collar with the shirt showing.
  hline(canvas, CENTER - 4 + dx, TORSO_TOP + dy, 8, trim);
  rect(canvas, CENTER - 2 + dx, TORSO_TOP + 1 + dy, 5, 5, trim);
  put(canvas, CENTER + dx, TORSO_TOP + 4 + dy, trimShade);
  hline(canvas, CENTER - 6 + dx, TORSO_TOP + 1 + dy, 3, cloth.shade);
  hline(canvas, CENTER + 4 + dx, TORSO_TOP + 1 + dy, 3, cloth.shade);
  put(canvas, CENTER + dx, TORSO_TOP + 7 + dy, rgba(palette.trim, 220));
  put(canvas, CENTER + dx, TORSO_TOP + 9 + dy, rgba(palette.trim, 190));

  if (livery.apron) {
    const apron = rgba(livery.apron);
    rect(canvas, CENTER - 6 + dx, TORSO_TOP + 5 + dy, 13, 8, apron);
    vline(canvas, CENTER - 6 + dx, TORSO_TOP + 5 + dy, 8, rgba(livery.apronShade ?? livery.apron, 230));
    hline(canvas, CENTER - 6 + dx, TORSO_TOP + 12 + dy, 13, rgba(livery.apronShade ?? livery.apron));
    hline(canvas, CENTER - 3 + dx, TORSO_TOP + 4 + dy, 7, apron);
    put(canvas, CENTER - 2 + dx, TORSO_TOP + 8 + dy, c("brass"));
    put(canvas, CENTER + 2 + dx, TORSO_TOP + 8 + dy, c("brass"));
  }
  if (livery.scarf) {
    const scarf = rgba(livery.scarf);
    hline(canvas, CENTER - 6 + dx, TORSO_TOP + dy, 13, scarf);
    hline(canvas, CENTER - 6 + dx, TORSO_TOP + 1 + dy, 13, rgba(livery.scarf, 200));
    rect(canvas, CENTER + 4 + dx, TORSO_TOP + 2 + dy, 3, 6, scarf);
    put(canvas, CENTER + 5 + dx, TORSO_TOP + 7 + dy, rgba(livery.scarf, 180));
  }

  // Belt and buckle.
  hline(canvas, CENTER - 6 + dx, TORSO_TOP + 11 + dy, 13, rgba(palette.boots));
  hline(canvas, CENTER - 6 + dx, TORSO_TOP + 12 + dy, 13, rgba(palette.bootsShade));
  rect(canvas, CENTER - 2 + dx, TORSO_TOP + 11 + dy, 5, 2, rgba(palette.brass, 230));
  put(canvas, CENTER + dx, TORSO_TOP + 11 + dy, rgba(palette.brassLight));
}

/** The tool each role carries, drawn at 26x20 and outlined on its own. */
function drawTool(canvas: PixelCanvas, role: number, x: number, y: number, frame: 0 | 1) {
  const wood = c("wood");
  const woodLight = c("woodLight");
  const woodDark = c("woodDark");
  const metal = c("metal");
  const metalShade = c("metalShade");
  const metalLight = c("metalLight");
  const metalDeep = c("metalDeep");
  const paper = c("paper");
  const paperShade = c("paperShade");
  const dy = frame;

  switch (role) {
    case 0:
      rect(canvas, x + 2, y + 2 + dy, 13, 14, paper);
      hline(canvas, x + 2, y + 2 + dy, 13, paperShade);
      hline(canvas, x + 2, y + 15 + dy, 13, paperShade);
      rect(canvas, x + 5, y + dy, 7, 4, wood);
      hline(canvas, x + 5, y + dy, 7, woodLight);
      for (let row = 0; row < 3; row += 1) hline(canvas, x + 4, y + 6 + row * 3 + dy, 9, paperShade);
      put(canvas, x + 11, y + 6 + dy, c("clothCrimson"));
      break;
    case 1:
      rect(canvas, x, y + 8 + dy, 12, 8, metalShade);
      rect(canvas, x + 1, y + 9 + dy, 10, 6, c("trimLight"));
      hline(canvas, x + 1, y + 10 + dy, 10, c("clothDenim"));
      hline(canvas, x + 1, y + 12 + dy, 6, c("clothDenimLight"));
      hline(canvas, x, y + 8 + dy, 12, metal);
      rect(canvas, x + 15, y + dy, 3, 11, metal);
      rect(canvas, x + 14, y + dy, 6, 4, metal);
      put(canvas, x + 15, y + 2 + dy, c("trimLight"));
      hline(canvas, x + 14, y + 3 + dy, 6, metalShade);
      break;
    case 2:
      rect(canvas, x + 3, y + 2 + dy, 14, 11, paper);
      hline(canvas, x + 3, y + 2 + dy, 14, paperShade);
      hline(canvas, x + 3, y + 12 + dy, 14, paperShade);
      rect(canvas, x, y + dy, 2, 15, wood);
      rect(canvas, x + 17, y + dy, 2, 15, wood);
      vline(canvas, x, y + dy, 15, woodLight);
      for (let row = 0; row < 3; row += 1) hline(canvas, x + 5, y + 4 + row * 3 + dy, 8, paperShade);
      put(canvas, x + 3, y + 4 + dy, c("clothOliveShade"));
      break;
    case 3:
      roundRect(canvas, x, y + 2 + dy, 16, 12, 4, woodLight);
      hline(canvas, x + 1, y + 2 + dy, 14, c("woodLit"));
      hline(canvas, x + 1, y + 13 + dy, 14, woodDark);
      put(canvas, x + 4, y + 9 + dy, woodDark);
      put(canvas, x + 5, y + 9 + dy, woodDark);
      for (const [dx, dy2, color] of [
        [1, 4, "fireLight"],
        [4, 4, "swatchSky"],
        [7, 4, "swatchLilac"],
        [2, 8, "swatchRose"],
        [6, 8, "swatchSage"],
        [10, 6, "fireCore"],
      ] as const) {
        put(canvas, x + dx, y + dy2 + dy, c(color));
        put(canvas, x + dx + 1, y + dy2 + dy, c(color, 200));
        put(canvas, x + dx, y + dy2 + 1 + dy, c(color, 160));
      }
      rect(canvas, x + 13, y + dy, 2, 2, metalLight);
      for (let i = 0; i < 8; i += 1) put(canvas, x + 14 + i, y + 1 + dy + Math.round(i * 0.6), wood);
      put(canvas, x + 14, y + dy, c("fireCore"));
      break;
    case 4:
      rect(canvas, x + 1, y + 3 + dy, 15, 12, c("clothTan"));
      hline(canvas, x + 1, y + 3 + dy, 15, c("clothTanLight"));
      rect(canvas, x + 1, y + dy, 8, 4, c("clothTan"));
      rect(canvas, x + 5, y + 7 + dy, 8, 4, paper);
      hline(canvas, x + 6, y + 8 + dy, 6, paperShade);
      hline(canvas, x + 5, y + 13 + dy, 7, c("clothTanShade"));
      break;
    case 5:
      rect(canvas, x + 8, y + 2 + dy, 3, 15, wood);
      vline(canvas, x + 8, y + 2 + dy, 15, woodLight);
      vline(canvas, x + 10, y + 2 + dy, 15, woodDark);
      rect(canvas, x + 4, y + 2 + dy, 12, 5, metal);
      hline(canvas, x + 4, y + 2 + dy, 12, metalLight);
      hline(canvas, x + 4, y + 6 + dy, 12, metalShade);
      rect(canvas, x + 2, y + 3 + dy, 3, 2, metalShade);
      put(canvas, x + 1, y + 3 + dy, metalDeep);
      rect(canvas, x + 15, y + 1 + dy, 3, 7, metalShade);
      hline(canvas, x + 15, y + 3 + dy, 3, metalLight);
      break;
    case 6:
      rect(canvas, x + 1, y + 6 + dy, 9, 9, paper);
      rect(canvas, x + 10, y + 6 + dy, 9, 9, paper);
      vline(canvas, x + 10, y + 6 + dy, 9, paperShade);
      hline(canvas, x + 1, y + 6 + dy, 18, paperShade);
      for (let row = 0; row < 3; row += 1) {
        hline(canvas, x + 3, y + 8 + row * 2 + dy, 5, paperShade);
        hline(canvas, x + 12, y + 8 + row * 2 + dy, 5, paperShade);
      }
      hline(canvas, x + 1, y + 15 + dy, 18, c("clothForestShade"));
      for (let i = 0; i < 8; i += 1) {
        put(canvas, x + 17 - i, y + 4 - Math.floor(i * 0.6) + dy, i > 4 ? c("trimLight") : c("paper"));
      }
      break;
    case 7:
      ellipse(canvas, x + 1, y + dy, x + 13, y + 12 + dy, metalShade);
      ellipse(canvas, x + 2, y + 1 + dy, x + 12, y + 11 + dy, c("brass"));
      ellipse(canvas, x + 3, y + 2 + dy, x + 11, y + 10 + dy, rgba(palette.trimLight, 215));
      put(canvas, x + 5, y + 4 + dy, c("trimLight"));
      put(canvas, x + 6, y + 4 + dy, c("trimLight"));
      put(canvas, x + 9, y + 7 + dy, c("swatchSky", 190));
      rect(canvas, x + 12, y + 10 + dy, 4, 3, wood);
      rect(canvas, x + 15, y + 12 + dy, 4, 6, wood);
      hline(canvas, x + 15, y + 12 + dy, 4, woodLight);
      vline(canvas, x + 18, y + 13 + dy, 5, woodDark);
      break;
    default:
      // Brass telescope: three tapering tubes with a bright lens.
      rect(canvas, x, y + 8 + dy, 5, 5, woodDark);
      hline(canvas, x, y + 8 + dy, 5, wood);
      rect(canvas, x + 4, y + 6 + dy, 6, 9, c("brassShade"));
      hline(canvas, x + 4, y + 6 + dy, 6, c("brass"));
      rect(canvas, x + 9, y + 4 + dy, 6, 13, c("brass"));
      hline(canvas, x + 9, y + 4 + dy, 6, c("brassLight"));
      rect(canvas, x + 14, y + 2 + dy, 5, 17, c("brassShade"));
      hline(canvas, x + 14, y + 2 + dy, 5, c("brassLight"));
      rect(canvas, x + 18, y + 2 + dy, 2, 17, rgba(palette.trimLight, 225));
      hline(canvas, x + 14, y + 8 + dy, 5, c("brassShade"));
      hline(canvas, x + 14, y + 13 + dy, 5, c("brassShade"));
      put(canvas, x + 19, y + 4 + dy, c("trimLight"));
      put(canvas, x + 10, y + 6 + dy, c("brassLight"));
      break;
  }
}

/** One frame of one crew member, outlined on the crew grid. */
export function drawCrew(livery: Livery, pose: CrewPose, role = 0): PixelCanvas {
  const seated = pose === "sit";
  const working = pose === "work1" || pose === "work2";
  const walking = pose.startsWith("walk");
  const bob = pose === "idle2" || pose === "walk1" || pose === "work2" ? 1 : 0;
  const lean = walking ? (pose === "walk1" || pose === "walk3" ? 1 : -1) : 0;
  const seat = seated ? 5 : 0;
  const dy = bob + seat;

  const figure = surface(crewWidth - 2, crewHeight - 2);

  if (seated) {
    seatedLegs(figure, seat, 0);
  } else {
    const leftDx = pose === "walk1" ? -2 : pose === "walk3" ? 2 : 0;
    const rightDx = pose === "walk1" ? 2 : pose === "walk3" ? -2 : 0;
    const leftLift = pose === "walk2" ? 1 : 0;
    const rightLift = pose === "walk4" ? 1 : 0;
    leg(figure, 11, leftLift, leftDx);
    leg(figure, 21, rightLift, rightDx);
  }

  if (working) {
    arm(figure, livery, 7 + lean, dy - 1, -2, 7);
    arm(figure, livery, 26 + lean, dy - 1, -2, 7);
    rect(figure, 9 + lean, 34 + dy, 16, 4, rgba(livery.cloth));
    hline(figure, 9 + lean, 34 + dy, 16, rgba(livery.clothLight));
    hline(figure, 9 + lean, 37 + dy, 16, rgba(livery.clothShade));
    rect(figure, 12 + lean, 37 + dy, 10, 3, rgba(livery.skin));
    hline(figure, 12 + lean, 39 + dy, 10, rgba(livery.skinShade));
  } else {
    const swing = walking ? (pose === "walk1" ? 1 : pose === "walk3" ? -1 : 0) : 0;
    arm(figure, livery, 6 + lean, dy - swing, 0, 9);
    arm(figure, livery, 27 + lean, dy + swing, 0, 9);
  }

  drawHairBack(figure, livery, dy, lean);
  drawTorso(figure, livery, dy, lean);
  drawHead(figure, livery, dy, lean, pose === "idle2");
  drawHair(figure, livery, dy, lean);
  drawHat(figure, livery, dy, lean);
  if (livery.glasses) drawGlasses(figure, dy, lean);

  vline(figure, 11 + lean, 30 + dy, 7, soft);
  if (!working) vline(figure, 27 + lean, 30 + dy, 7, soft);

  const frame: 0 | 1 = pose === "work2" || pose === "walk2" || pose === "idle2" ? 1 : 0;
  const tool = surface(26, 20);
  if (working) drawTool(tool, role, 3, 2 + frame, frame);
  else if (seated) drawTool(tool, role, 3, 6 + frame, frame);
  else drawTool(tool, role, 3, 2 + frame + (walking ? 1 : 0), frame);
  const inked = outlined(tool, ink);
  const toolX = working ? 5 + lean : seated ? 2 : 24 + lean;
  const toolY = working ? 21 + dy : seated ? 30 + dy : 31 + dy;
  stamp(figure, inked, toolX, toolY);

  const padded = outlined(figure, ink);
  const art = surface(crewWidth, crewHeight);
  shadowEllipse(art, 11, 49, 28, 53, palette.shadow);
  stamp(art, padded, 0, 0);
  return art;
}
