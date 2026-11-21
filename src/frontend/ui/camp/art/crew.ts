// 캠프의 아홉 크루를 한 장의 40x54 격자에 그린다. 머리는 크게, 몸은 두세 색의
// 평평한 면으로 두고, 모두 같은 1px 잉크 외곽선으로 닫아 한 가족처럼 보이게 한다.

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

const CENTER = 19;
/** Head box: big enough for a face and a hat brim to sit on it. */
const HEAD_TOP = 6;
const FACE_W = 13;
const FACE_BOTTOM = 20;

/** A column of widths, the shape every robe and hood is built from. */
function spans(canvas: PixelCanvas, widths: number[], top: number, color: Rgba) {
  widths.forEach((width, index) => {
    hline(canvas, CENTER - Math.floor(width / 2), top + index, width, color);
  });
}

/** Half width of an ellipse row. */
function ellipseHalf(width: number, height: number, row: number) {
  const t = (row - (height - 1) / 2) / (height / 2);
  return Math.max(0, Math.round((width / 2) * Math.sqrt(Math.max(0, 1 - t * t))));
}

/** Face, drawn before the hood rim so the opening never buries it. */
function face(canvas: PixelCanvas, livery: Livery, top: number) {
  const height = FACE_BOTTOM - top + 1;
  const skin = rgba(livery.face === "shadow" ? livery.skinShade : livery.skin);
  for (let row = 0; row < height; row += 1) {
    const half = ellipseHalf(FACE_W, height, row);
    hline(canvas, CENTER - half, top + row, half * 2 + 1, skin);
    put(canvas, CENTER + half, top + row, rgba(livery.skinShade));
  }
  // One soft light on the brow, a blush and a small mouth: no broad highlights.
  hline(canvas, CENTER - 4, top + 2, 4, c("skinLight"));
  const eyeY = top + 6;
  const eye = livery.face === "shadow" ? c("trimLight") : ink;
  rect(canvas, CENTER - 4, eyeY, 2, 2, eye);
  rect(canvas, CENTER + 3, eyeY, 2, 2, eye);
  put(canvas, CENTER - 4, eyeY, c("trimLight"));
  put(canvas, CENTER + 3, eyeY, c("trimLight"));
  // Brows above the eyes, one shade of the hair cloth.
  hline(canvas, CENTER - 5, eyeY - 2, 3, rgba(livery.hoodShade ?? livery.clothShade, 170));
  hline(canvas, CENTER + 3, eyeY - 2, 3, rgba(livery.hoodShade ?? livery.clothShade, 170));
  hline(canvas, CENTER - 1, eyeY + 4, 3, rgba(livery.skinDeep, 210));
  put(canvas, CENTER - 5, eyeY + 2, rgba(palette.blush, 110));
  put(canvas, CENTER + 5, eyeY + 2, rgba(palette.blush, 110));
  if (livery.beard) {
    for (let row = 0; row < 4; row += 1) {
      const width = [11, 9, 7, 4][row];
      hline(canvas, CENTER - Math.floor(width / 2), top + 10 + row, width, c("ashLight"));
    }
    hline(canvas, CENTER - 3, top + 9, 5, c("ash"));
    put(canvas, CENTER - 3, top + 6, rgba(palette.ash, 200));
    put(canvas, CENTER + 4, top + 6, rgba(palette.ash, 200));
  }
}

/** The back of a hood, drawn behind the head. */
function hoodBack(canvas: PixelCanvas, livery: Livery, top: number) {
  const base = rgba(livery.hoodColor ?? livery.cloth);
  const shade = rgba(livery.hoodShade ?? livery.clothShade);
  const height = 20;
  for (let row = 0; row < height; row += 1) {
    const half = ellipseHalf(23, height, row);
    hline(canvas, CENTER - half, top - 3 + row, half * 2 + 1, base);
  }
  // A pointed cowl tail down the back.
  for (let row = 0; row < 7; row += 1) {
    hline(canvas, CENTER - 13 + Math.floor(row / 2), top + 8 + row, 5 - Math.floor(row / 2), row > 4 ? shade : base);
  }
  hline(canvas, CENTER + 8, top + 2, 3, shade);
  hline(canvas, CENTER + 9, top + 8, 2, shade);
}

/** The hood's front rim: a ring of cloth around the face and a peak on top. */
function hoodRim(canvas: PixelCanvas, livery: Livery, top: number) {
  const base = rgba(livery.hoodColor ?? livery.cloth);
  const shade = rgba(livery.hoodShade ?? livery.clothShade);
  const light = rgba(livery.hoodLight ?? livery.clothLight);
  const height = 20;
  const faceHeight = FACE_BOTTOM - top + 1;
  for (let row = 0; row < height; row += 1) {
    const outer = ellipseHalf(23, height, row);
    const innerRow = row - 1;
    const inner =
      innerRow >= 0 && innerRow < faceHeight ? ellipseHalf(FACE_W, faceHeight, innerRow) - 1 : 0;
    const y = top - 3 + row;
    if (inner <= 0) {
      hline(canvas, CENTER - outer, y, outer * 2 + 1, base);
      if (row < 3) hline(canvas, CENTER - outer + 2, y, Math.max(2, outer - 1), light);
      continue;
    }
    hline(canvas, CENTER - outer, y, outer - inner, base);
    hline(canvas, CENTER + inner + 1, y, outer - inner, shade);
    if (row < 6) put(canvas, CENTER - outer + 1, y, light);
    put(canvas, CENTER - outer, y, light);
  }
  // Brow shadow falling into the opening.
  hline(canvas, CENTER - 5, top + 1, 10, rgba(palette.shadow, 90));
}

/** Two ears for the assistant's cat hood. */
function catEars(canvas: PixelCanvas, livery: Livery) {
  const base = rgba(livery.hoodColor ?? livery.cloth);
  const shade = rgba(livery.hoodShade ?? livery.clothShade);
  for (const side of [-1, 1] as const) {
    const cx = CENTER + side * 7;
    for (let row = 0; row < 5; row += 1) {
      const half = Math.max(1, 3 - Math.floor(row / 3));
      hline(canvas, cx - half, HEAD_TOP - 3 + row, half * 2 + 1, base);
    }
    put(canvas, cx, HEAD_TOP - 2, c("blush"));
    put(canvas, cx + side, HEAD_TOP - 3, shade);
    put(canvas, cx - side, HEAD_TOP + 1, base);
  }
}

/** The witch's pointed hat, with a bent tip and a brim. */
function witchHat(canvas: PixelCanvas, livery: Livery) {
  const base = rgba(livery.hoodColor ?? livery.cloth);
  const shade = rgba(livery.hoodShade ?? livery.clothShade);
  const light = rgba(livery.hoodLight ?? livery.clothLight);
  const brim = HEAD_TOP + 3;
  for (let row = -2; row <= 2; row += 1) {
    const half = 14 - Math.abs(row);
    hline(canvas, CENTER - half, brim + row, half * 2 + 1, row > 0 ? shade : base);
    if (row <= 0) put(canvas, CENTER - half + 1, brim + row, light);
  }
  for (let row = 0; row < 11; row += 1) {
    const t = row / 11;
    const half = Math.max(1, Math.round(8 * (1 - t * 0.72)));
    const bend = Math.round(t * t * 6);
    hline(canvas, CENTER - half + bend, brim - 4 - row, half * 2, base);
    put(canvas, CENTER - half + bend, brim - 4 - row, light);
    put(canvas, CENTER + half - 1 + bend, brim - 4 - row, shade);
  }
  hline(canvas, CENTER + 4, brim - 16, 5, base);
  hline(canvas, CENTER + 7, brim - 15, 3, shade);
  hline(canvas, CENTER - 8, brim - 5, 16, c("brassShade"));
  hline(canvas, CENTER - 8, brim - 4, 16, c("brass"));
  rect(canvas, CENTER - 2, brim - 6, 4, 3, c("brassLight"));
}

/** A wide-brim travelling hat with a leather band and an optional flower. */
function brimHat(canvas: PixelCanvas, livery: Livery) {
  const base = rgba(livery.hoodColor ?? livery.cloth);
  const shade = rgba(livery.hoodShade ?? livery.clothShade);
  const light = rgba(livery.hoodLight ?? livery.clothLight);
  const brim = HEAD_TOP + 5;
  for (let row = -3; row <= 3; row += 1) {
    const half = 14 - Math.abs(row);
    hline(canvas, CENTER - half, brim + row, half * 2 + 1, row > 1 ? shade : base);
    if (row < 0) put(canvas, CENTER - half + 1, brim + row, light);
  }
  for (let row = 0; row < 8; row += 1) {
    const half = 8 - Math.floor(row / 3);
    hline(canvas, CENTER - half, brim - 4 - row, half * 2 + 1, base);
    put(canvas, CENTER - half, brim - 4 - row, light);
    put(canvas, CENTER + half, brim - 4 - row, shade);
  }
  hline(canvas, CENTER - 7, brim - 2, 15, c("clothLeather"));
  hline(canvas, CENTER - 7, brim - 1, 15, c("clothLeatherShade"));
  if (livery.flower) {
    put(canvas, CENTER + 6, brim - 2, rgba(livery.flower));
    put(canvas, CENTER + 7, brim - 3, rgba(livery.flower));
    put(canvas, CENTER + 5, brim - 3, rgba(livery.flower, 220));
    put(canvas, CENTER + 6, brim - 4, c("leaf"));
  }
}

/** Short hair for a bare head. */
function hair(canvas: PixelCanvas, livery: Livery) {
  const base = rgba(livery.hoodColor ?? livery.cloth);
  const shade = rgba(livery.hoodShade ?? livery.clothShade);
  for (let row = 0; row < 6; row += 1) {
    const half = 8 - Math.floor(row / 3);
    hline(canvas, CENTER - half, HEAD_TOP - 2 + row, half * 2 + 1, base);
  }
  hline(canvas, CENTER - 7, HEAD_TOP + 3, 15, base);
  hline(canvas, CENTER - 8, HEAD_TOP + 3, 2, shade);
  hline(canvas, CENTER + 6, HEAD_TOP + 4, 2, shade);
}

/** Robe: shoulders, belt, and a hem that widens over the legs. */
function robe(canvas: PixelCanvas, livery: Livery, top: number, bottom: number) {
  const widths: number[] = [];
  for (let y = top; y <= bottom; y += 1) {
    const t = (y - top) / Math.max(1, bottom - top);
    widths.push(Math.round(12 + t * 5));
  }
  spans(canvas, widths, top, rgba(livery.cloth));
  widths.forEach((width, index) => {
    const x = CENTER - Math.floor(width / 2);
    const y = top + index;
    put(canvas, x, y, rgba(livery.clothLight));
    put(canvas, x + width - 1, y, rgba(livery.clothShade));
    if (width > 13) put(canvas, x + width - 2, y, rgba(livery.clothShade, 170));
  });
  hline(canvas, CENTER - 4, top, 9, rgba(livery.trim));
  rect(canvas, CENTER - 1, top, 3, 4, rgba(livery.trim));
  hline(canvas, CENTER - 6, top + 8, 13, rgba(livery.trimShade));
  rect(canvas, CENTER - 1, top + 7, 3, 3, c("brass"));

  if (livery.apron) {
    rect(canvas, CENTER - 5, top + 3, 11, 10, rgba(livery.apron));
    vline(canvas, CENTER - 5, top + 3, 10, rgba(livery.apronShade ?? livery.apron));
    hline(canvas, CENTER - 5, top + 12, 11, rgba(livery.apronShade ?? livery.apron));
    put(canvas, CENTER - 3, top + 8, c("brass"));
    put(canvas, CENTER + 2, top + 8, c("brass"));
  }
  if (livery.scarf) {
    hline(canvas, CENTER - 6, top, 13, rgba(livery.scarf));
    rect(canvas, CENTER + 4, top + 1, 3, 5, rgba(livery.scarf));
  }
}

/** One sleeve from the shoulder, a cuff and a hand. */
function sleeve(canvas: PixelCanvas, livery: Livery, x: number, top: number, length: number) {
  rect(canvas, x, top, 3, length, rgba(livery.cloth));
  vline(canvas, x, top, length, rgba(livery.clothLight));
  vline(canvas, x + 2, top, length, rgba(livery.clothShade));
  hline(canvas, x, top, 3, rgba(livery.clothLight));
}

function hand(canvas: PixelCanvas, livery: Livery, x: number, y: number) {
  rect(canvas, x, y, 3, 3, rgba(livery.skin));
  put(canvas, x, y, c("skinLight"));
  put(canvas, x + 2, y + 2, rgba(livery.skinShade));
}

/** Standing legs with boots that show the step. */
function legs(canvas: PixelCanvas, livery: Livery, shift: number, lift: number) {
  for (const [x, raised] of [[13, lift > 0], [21, lift < 0]] as const) {
    const px = x + shift;
    const bottom = raised ? 49 : 51;
    rect(canvas, px, 38, 5, bottom - 38, c("pants"));
    vline(canvas, px, 38, bottom - 38, c("pantsLight"));
    vline(canvas, px + 4, 38, bottom - 38, c("pantsShade"));
    rect(canvas, px - 1, bottom - 2, 7, 3, rgba(livery.boots ?? palette.boots));
    hline(canvas, px - 1, bottom - 2, 7, c("bootsLight"));
    hline(canvas, px - 1, bottom, 7, c("bootsShade"));
  }
}

/** Seated legs: thighs out past the hips, shins down, boots flat on the sand. */
function seatedLegs(canvas: PixelCanvas, livery: Livery) {
  const boot = rgba(livery.boots ?? palette.boots);
  // Far leg, one shade back: a short thigh and a boot tucked under the knee.
  rect(canvas, 14, 39, 12, 4, c("pantsShade"));
  rect(canvas, 24, 42, 4, 5, c("pantsShade"));
  rect(canvas, 23, 46, 7, 3, boot);
  hline(canvas, 23, 46, 7, c("bootsLight"));
  // Near leg: thigh straight out over the log, knee, shin down, boot on the sand.
  rect(canvas, 13, 41, 16, 5, c("pants"));
  hline(canvas, 13, 41, 16, c("pantsLight"));
  hline(canvas, 13, 45, 16, c("pantsShade"));
  rect(canvas, 28, 41, 5, 6, c("pants"));
  vline(canvas, 28, 41, 6, c("pantsLight"));
  vline(canvas, 32, 41, 6, c("pantsShade"));
  rect(canvas, 29, 46, 4, 3, c("pants"));
  rect(canvas, 28, 48, 8, 3, boot);
  hline(canvas, 28, 48, 8, c("bootsLight"));
  hline(canvas, 28, 50, 8, c("bootsShade"));
  put(canvas, 35, 49, c("bootsShade"));
}

/** The magic tool each role carries: small, flat, and outlined with the body. */
function drawProp(canvas: PixelCanvas, kind: Livery["prop"], lit: boolean) {
  const handle = (x: number, top: number, height: number) => {
    vline(canvas, x, top, height, c("woodLight"));
    vline(canvas, x + 1, top, height, c("woodMid"));
    vline(canvas, x + 2, top, height, c("woodDark"));
  };
  switch (kind) {
    case "staff": {
      handle(1, 4, 26);
      for (let row = 0; row < 6; row += 1) {
        const half = [1, 2, 3, 3, 2, 1][row];
        hline(canvas, 2 - half, 2 + row, half * 2 + 1, c("violet"));
        put(canvas, 2 - half, 2 + row, c("violetLight"));
        put(canvas, 2 + half, 2 + row, c("violetDeep"));
      }
      put(canvas, 2, 3, c("violetLit"));
      hline(canvas, 0, 1, 5, c("woodDark"));
      if (lit) {
        put(canvas, 0, -1, c("violetLit"));
        put(canvas, 5, 4, c("trimLight"));
      }
      break;
    }
    case "scroll": {
      rect(canvas, 0, 3, 13, 10, c("paper"));
      hline(canvas, 0, 3, 13, c("canvasLit"));
      hline(canvas, 0, 12, 13, c("paperShade"));
      vline(canvas, 6, 4, 8, c("paperShade"));
      for (let row = 0; row < 2; row += 1) {
        hline(canvas, 2, 6 + row * 3, 3, c("paperLine"));
        hline(canvas, 8, 6 + row * 3, 3, c("paperLine"));
      }
      hline(canvas, -1, 2, 15, c("woodLit"));
      hline(canvas, -1, 13, 15, c("woodDark"));
      put(canvas, 3, 7, c("clothCrimson"));
      if (lit) {
        put(canvas, -2, 5, c("trimLight"));
        put(canvas, 14, 9, c("trimLight"));
      }
      break;
    }
    case "book": {
      rect(canvas, 0, 3, 6, 10, c("clothLeather"));
      rect(canvas, 7, 3, 6, 10, c("clothLeather"));
      hline(canvas, 0, 3, 6, c("clothLeatherLight"));
      hline(canvas, 7, 3, 6, c("clothLeatherLight"));
      rect(canvas, 1, 4, 4, 8, c("paper"));
      rect(canvas, 8, 4, 4, 8, c("paper"));
      vline(canvas, 6, 3, 10, c("woodDark"));
      for (let row = 0; row < 2; row += 1) {
        hline(canvas, 2, 6 + row * 2, 2, c("paperLine"));
        hline(canvas, 9, 6 + row * 2, 2, c("paperLine"));
      }
      put(canvas, 3, 8, c("brass"));
      if (lit) put(canvas, 6, 0, c("violetLit"));
      break;
    }
    case "brush": {
      for (let row = 0; row < 11; row += 1) put(canvas, 6 + Math.round(row * 0.2), 5 + row, c("woodLight"));
      put(canvas, 6, 6, c("woodMid"));
      put(canvas, 8, 14, c("woodDark"));
      for (let row = 0; row < 4; row += 1) {
        hline(canvas, 3 - row, 2 + row, 3 + row, c("violet"));
        put(canvas, 3 - row, 2 + row, c("violetLight"));
      }
      put(canvas, 1, 2, c("violetLit"));
      ellipse(canvas, -2, 14, 8, 19, c("clothTan"));
      hline(canvas, -1, 15, 7, c("clothTanLight"));
      put(canvas, 0, 17, c("banner"));
      put(canvas, 3, 16, c("swatchSky"));
      if (lit) {
        put(canvas, 0, -1, c("violetLit"));
        put(canvas, 10, 8, c("trimLight"));
      }
      break;
    }
    case "hammer": {
      handle(5, 6, 12);
      rect(canvas, 1, 2, 10, 6, c("metal"));
      hline(canvas, 1, 2, 10, c("metalLight"));
      hline(canvas, 1, 7, 10, c("metalShade"));
      put(canvas, 2, 3, c("trimLight"));
      put(canvas, 4, 5, c("brass"));
      put(canvas, 8, 5, c("brass"));
      if (lit) {
        put(canvas, 11, 0, c("brassLight"));
        put(canvas, 0, 4, c("trimLight"));
      }
      break;
    }
    case "quill": {
      // A long feather leaning back over the shoulder, nib at the bottom.
      for (let row = 0; row < 14; row += 1) {
        const half = row < 8 ? Math.min(3, row) : Math.max(0, 12 - row);
        const x = 10 - Math.floor(row * 0.4);
        if (half <= 0) continue;
        hline(canvas, x - half, 2 + row, half * 2 + 1, c("trimLight"));
        put(canvas, x - half, 2 + row, c("paper"));
        put(canvas, x + half, 2 + row, c("paperShade"));
      }
      for (let row = 2; row < 16; row += 1) put(canvas, 10 - Math.floor(row * 0.4), row, c("canvasShade"));
      put(canvas, 4, 17, ink);
      if (lit) {
        put(canvas, 9, 0, c("violetLit"));
        put(canvas, 1, 7, c("violetLit", 200));
      }
      break;
    }
    case "lens": {
      for (let row = 0; row < 9; row += 1) {
        const half = ellipseHalf(9, 9, row);
        hline(canvas, 4 - half, 2 + row, half * 2 + 1, c("brass"));
        put(canvas, 4 - half, 2 + row, c("brassLight"));
        put(canvas, 4 + half, 2 + row, c("brassShade"));
      }
      for (let row = 1; row < 8; row += 1) {
        const half = Math.max(0, ellipseHalf(9, 9, row) - 1);
        hline(canvas, 4 - half + 1, 2 + row, half * 2 - 1, c("seaLight"));
      }
      hline(canvas, 3, 4, 3, c("seaLit"));
      rect(canvas, 9, 10, 3, 3, c("wood"));
      rect(canvas, 11, 12, 3, 5, c("wood"));
      put(canvas, 13, 16, c("woodDark"));
      if (lit) {
        put(canvas, 1, 0, c("trimLight"));
        put(canvas, 9, 1, c("seaLit"));
      }
      break;
    }
    case "telescope": {
      rect(canvas, 0, 9, 4, 4, c("woodDark"));
      rect(canvas, 3, 7, 5, 7, c("brassShade"));
      rect(canvas, 7, 5, 5, 10, c("brass"));
      rect(canvas, 11, 3, 4, 13, c("brassShade"));
      hline(canvas, 7, 5, 5, c("brassLight"));
      hline(canvas, 11, 3, 4, c("brassLight"));
      vline(canvas, 14, 3, 13, c("trimLight"));
      hline(canvas, 11, 8, 4, c("brassShade"));
      if (lit) {
        put(canvas, 15, 1, c("trimLight"));
        put(canvas, 5, 3, c("swatchSky"));
      }
      break;
    }
    default: {
      rect(canvas, 1, 3, 9, 11, c("brassShade"));
      rect(canvas, 2, 4, 7, 9, c("lamp"));
      rect(canvas, 4, 6, 3, 5, c("fireCore"));
      hline(canvas, 1, 2, 9, c("brass"));
      hline(canvas, 1, 13, 9, c("brassShade"));
      vline(canvas, 5, -1, 4, c("metalDeep"));
      if (lit) put(canvas, 5, 7, c("trimLight"));
    }
  }
}

/** Four-point sparkles for the two working frames. */
function sparkles(canvas: PixelCanvas, frame: 0 | 1) {
  const spots = frame === 0 ? [[6, 16], [30, 22], [22, 6]] : [[8, 22], [29, 14], [12, 4]];
  for (const [x, y] of spots) {
    put(canvas, x, y, c("trimLight"));
    put(canvas, x - 1, y, c("violetLit", 200));
    put(canvas, x + 1, y, c("violetLit", 200));
    put(canvas, x, y - 1, c("violetLit", 200));
    put(canvas, x, y + 1, c("violetLit", 200));
  }
}

/** One frame of one crew member, outlined on the crew grid. */
export function drawCrew(livery: Livery, pose: CrewPose, role = 0): PixelCanvas {
  const seated = pose === "sit";
  const working = pose === "work1" || pose === "work2";
  const walking = pose.startsWith("walk");
  const bob = pose === "idle2" || pose === "walk2" || pose === "work2" ? 1 : 0;
  const lean = walking ? (pose === "walk1" || pose === "walk3" ? 1 : -1) : 0;
  const dy = bob + (seated ? 7 : 0);

  const figure = surface(crewWidth - 2, crewHeight - 2);
  const headTop = HEAD_TOP + dy;
  const bodyTop = seated ? 27 : 22 + dy;
  const bodyBottom = seated ? 41 : 38 + bob;

  // Hood and hair sit behind the head.
  if (livery.hood === "cloth" || livery.hood === "cat") hoodBack(figure, livery, headTop);

  if (!seated) legs(figure, livery, lean, pose === "walk2" ? 1 : pose === "walk4" ? -1 : 0);

  // Back arm, then the robe over both shoulders.
  sleeve(figure, livery, working ? 24 + lean : 25 + lean, bodyTop + 1, seated ? 7 : 8);
  if (!working) hand(figure, livery, 25 + lean, bodyTop + (seated ? 8 : 9));
  robe(figure, livery, bodyTop, bodyBottom);
  // Seated legs go over the hem, so the knees and boots sit in front of the log.
  if (seated) seatedLegs(figure, livery);

  // The head and its face, then the front of the hood or the hat.
  face(figure, livery, headTop);
  if (livery.hood === "cloth") hoodRim(figure, livery, headTop);
  else if (livery.hood === "cat") {
    hoodRim(figure, livery, headTop);
    catEars(figure, livery);
  } else if (livery.hood === "witch") witchHat(figure, livery);
  else if (livery.hood === "brim") brimHat(figure, livery);
  else hair(figure, livery);

  // Front arm reaching to the tool.
  sleeve(figure, livery, 8 + lean, bodyTop + 1, seated ? 8 : 9);
  hand(figure, livery, 11 + lean, bodyTop + (seated ? 7 : 8));

  const frame = pose === "work2" || pose === "walk2" || pose === "idle2" ? 1 : 0;
  const tool = surface(20, 22);
  drawProp(tool, livery.prop, frame === 1);
  const inked = outlined(tool, ink);
  const tall = livery.prop === "staff" || livery.prop === "quill" || livery.prop === "telescope";
  const toolX = tall ? 24 + lean : seated ? 13 + lean : 12 + lean;
  const toolY = tall ? 12 + dy : seated ? bodyTop + 8 : bodyTop + 6 + bob;
  stamp(figure, inked, toolX, toolY);

  if (working) sparkles(figure, frame === 1 ? 1 : 0);

  const padded = outlined(figure, ink);
  const art = surface(crewWidth, crewHeight);
  shadowEllipse(art, 11, seated ? 49 : 50, 28, 53, palette.shadow);
  stamp(art, padded, 0, 0);
  return art;
}
