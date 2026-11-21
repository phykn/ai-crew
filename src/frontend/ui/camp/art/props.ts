// The camp props, drawn pixel by pixel on the same grid, palette and outline as
// the crew and the meadow. Light comes from the upper left for every prop, and
// sizes are read from the art itself so the stage, the CSS fallback and the
// obstacle map agree where each prop's feet are.

import { PixelCanvas } from "pixlrt/core";
import {
  dome,
  dither,
  ellipse,
  hline,
  noise,
  outlined,
  pillow,
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
import { palette } from "./palette";

const c = (key: keyof typeof palette, alpha = 255): Rgba => rgba(palette[key], alpha);
const ink = c("ink");
const inkSoft = c("inkSoft");

/** Outline the body, then drop a soft contact shadow under its feet. */
function finish(body: PixelCanvas, shadow = 0.14) {
  const padded = outlined(body, ink);
  const frame = surface(padded.width, padded.height);
  if (shadow > 0) {
    shadowEllipse(
      frame,
      2,
      frame.height - Math.round(frame.height * shadow) - 1,
      frame.width - 3,
      frame.height - 2,
      palette.shadow,
    );
  }
  stamp(frame, padded, 0, 0);
  return frame;
}

/** A dark seam under a shape so overlapping parts stay readable. */
function seam(canvas: PixelCanvas, x: number, y: number, width: number) {
  hline(canvas, x, y, width, inkSoft);
}

/** A filled polygon by scanline; used for the tent's two canvas planes. */
function wedge(
  canvas: PixelCanvas,
  apexX: number,
  apexY: number,
  leftX: number,
  rightX: number,
  baseY: number,
  color: Rgba,
  curve = 1,
) {
  for (let y = apexY; y <= baseY; y += 1) {
    const t = Math.pow((y - apexY) / (baseY - apexY), curve);
    const x0 = Math.round(apexX + (leftX - apexX) * t);
    const x1 = Math.round(apexX + (rightX - apexX) * t);
    hline(canvas, Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, color);
  }
}

/** A plank with grain: base fill, a lit top edge, a shaded bottom edge. */
function plank(
  canvas: PixelCanvas,
  x: number,
  y: number,
  width: number,
  height: number,
  seed = 0,
) {
  rect(canvas, x, y, width, height, c("wood"));
  hline(canvas, x, y, width, c("woodLight"));
  hline(canvas, x, y + height - 1, width, c("woodDeep"));
  for (let i = 0; i < Math.max(1, Math.round(height / 3)); i += 1) {
    const gy = y + 1 + Math.floor(noise(i, seed, 3) * Math.max(1, height - 2));
    const gx = x + 1 + Math.floor(noise(seed, i, 5) * Math.max(1, width - 6));
    hline(canvas, gx, gy, 3 + Math.floor(noise(i, i, 7) * 5), c("woodDark", 150));
  }
}

/** A metal band strapped around wood, with a brass rivet. */
function band(canvas: PixelCanvas, x: number, y: number, height: number, width = 3) {
  rect(canvas, x, y, width, height, c("metalShade"));
  vline(canvas, x, y, height, c("metalLight"));
  vline(canvas, x + width - 1, y, height, c("metalDeep"));
  put(canvas, x + Math.floor(width / 2), y + 1, c("brassLight"));
  put(canvas, x + Math.floor(width / 2), y + height - 2, c("metalDeep"));
}

// ── Campfire ──────────────────────────────────────────────────────────────────
export function drawCampfire(frame: 0 | 1 | 2): PixelCanvas {
  const canvas = surface(64, 52);

  ellipse(canvas, 8, 31, 55, 46, c("dirtDeep"));
  ellipse(canvas, 13, 33, 50, 44, c("inkSoft", 190));
  ellipse(canvas, 20, 36, 43, 42, c("ink", 170));

  const log = (x: number, y: number, w: number, h: number, tilt: number) => {
    for (let i = 0; i < h; i += 1) {
      const shift = Math.round((i - h / 2) * tilt);
      hline(canvas, x + shift, y + i, w, i === 0 ? c("woodLight") : i === h - 1 ? c("woodDeep") : c("wood"));
    }
    for (let i = 0; i < h; i += 1) {
      const shift = Math.round((i - h / 2) * tilt);
      hline(canvas, x + shift, y + i, 3, c("woodMid"));
    }
    put(canvas, x + 1, y + 2, c("woodDark"));
    put(canvas, x + 1, y + h - 3, c("ember"));
    put(canvas, x + 2, y + h - 2, c("fire", 200));
  };
  log(19, 32, 24, 8, 0.16);
  log(23, 39, 23, 7, -0.18);
  log(31, 27, 8, 14, 0.5);
  log(38, 29, 7, 12, -0.42);
  for (let i = 0; i < 6; i += 1) put(canvas, 28 + i * 2, 35 + (i % 2), c("fireLight", 180));

  const stones = 14;
  for (let i = 0; i < stones; i += 1) {
    const angle = (i / stones) * Math.PI * 2 + 0.16;
    const cx = 32 + Math.round(Math.cos(angle) * 23);
    const cy = 38 + Math.round(Math.sin(angle) * 8.6);
    const w = 7 + (i % 3);
    const h = 5 + (i % 2);
    const x = cx - Math.floor(w / 2);
    const y = cy - Math.floor(h / 2);
    roundRect(canvas, x - 1, y - 1, w + 2, h + 2, 2, inkSoft);
    pillow(canvas, x, y, w, h, 2, c("stone"), c("stoneLit"), c("stoneShade"));
    put(canvas, x + 1, y, c("stoneLit"));
    put(canvas, x + w - 2, y + h - 1, c("stoneDeep"));
  }

  const tall = [22, 28, 18][frame];
  const lean = [0, 2, -2][frame];
  const flame = (
    baseX: number,
    baseY: number,
    height: number,
    width: number,
    drift: number,
    color: Rgba,
  ) => {
    for (let row = 0; row < height; row += 1) {
      const t = row / height;
      const half = Math.max(1, Math.round((width / 2) * (1 - t * 0.88)));
      const wobble = Math.round((1 - t) * drift + Math.sin(row * 0.8 + frame * 2) * 0.9);
      hline(canvas, baseX - half + wobble, baseY - row, half * 2 + 1, color);
    }
  };
  flame(32, 34, tall, 18, lean, c("fire"));
  flame(25, 31, Math.round(tall * 0.56), 10, -2 - lean, c("fire", 240));
  flame(40, 31, Math.round(tall * 0.5), 9, 3 + lean, c("fire", 240));
  flame(32, 33, Math.round(tall * 0.78), 13, Math.round(lean * 0.6), c("fireLight"));
  flame(32, 32, Math.round(tall * 0.5), 8, Math.round(lean * 0.4), c("fireCore"));
  hline(canvas, 30, 31, 5, c("fireCore"));
  hline(canvas, 31, 28, 3, c("fireCore", 220));
  put(canvas, 26 + lean, 11, c("fireLight", 230));
  put(canvas, 39 - lean, 15, c("fire", 210));
  put(canvas, 32, 7 + frame, c("fireCore", 190));
  put(canvas, 22, 21, c("fire", 160));
  put(canvas, 44, 23, c("fire", 150));
  return finish(canvas, 0.1);
}

// ── Log bench ─────────────────────────────────────────────────────────────────
export function drawBench(): PixelCanvas {
  const canvas = surface(64, 22);

  for (const [x, w] of [[8, 17], [39, 17]] as const) {
    roundRect(canvas, x - 1, 12, w + 2, 9, 4, inkSoft);
    roundRect(canvas, x, 13, w, 7, 3, c("woodDark"));
    hline(canvas, x + 1, 13, w - 2, c("wood"));
    hline(canvas, x + 1, 19, w - 2, c("woodDeep"));
    ellipse(canvas, x - 1, 14, x + 3, 19, c("woodMid"));
    hline(canvas, x, 15, 2, c("woodLit"));
    put(canvas, x + 1, 18, c("woodDark"));
  }

  ellipse(canvas, 1, 2, 62, 18, inkSoft);
  ellipse(canvas, 1, 2, 61, 16, c("wood"));
  hline(canvas, 5, 3, 52, c("woodLit"));
  hline(canvas, 3, 4, 56, c("woodLight"));
  hline(canvas, 2, 5, 58, c("woodMid"));
  hline(canvas, 2, 6, 58, c("wood"));
  hline(canvas, 2, 14, 58, c("woodDark"));
  hline(canvas, 3, 15, 56, c("woodDeep"));
  for (let i = 0; i < 5; i += 1) {
    const y = 7 + i;
    const x = 5 + Math.floor(noise(i, 2, 4) * 7);
    hline(canvas, x, y, 22 + Math.floor(noise(i, 5, 6) * 22), c("woodGrain", 130));
  }
  for (let i = 0; i < 3; i += 1) {
    const x = 13 + i * 13;
    const y = 9 + (i % 2);
    put(canvas, x, y, c("woodDark", 190));
    put(canvas, x + 1, y, c("woodGrain", 170));
  }
  for (const cx of [3, 60]) {
    ellipse(canvas, cx - 2, 4, cx + 2, 15, c("woodMid"));
    ellipse(canvas, cx - 1, 6, cx + 1, 13, c("wood"));
    put(canvas, cx, 9, c("woodDark"));
    put(canvas, cx, 10, c("woodGrain"));
    put(canvas, cx - 1, 7, c("woodLight"));
  }
  for (const x of [15, 44] as const) {
    band(canvas, x, 3, 14, 4);
    hline(canvas, x, 3, 4, c("metalLight"));
    hline(canvas, x, 16, 4, c("metalDeep"));
  }
  return finish(canvas, 0.18);
}

// ── Explorer's canvas tent ────────────────────────────────────────────────────
export function drawTent(): PixelCanvas {
  const canvas = surface(128, 112);
  const apexX = 64;
  const apexY = 14;
  const floor = 92;
  const half = 50;

  ellipse(canvas, 10, floor - 4, 118, floor + 5, c("dirtDeep", 90));

  const edge = (y: number) => {
    const t = Math.pow((y - apexY) / (floor - apexY), 0.9);
    return Math.round(2 + t * half);
  };
  for (let y = apexY; y <= floor; y += 1) {
    const w = edge(y);
    hline(canvas, apexX - w, y, Math.round(w * 1.15), c("canvasShade"));
    hline(canvas, apexX - w, y, Math.max(2, Math.round(w * 0.5)), c("canvasDeep", 150));
    hline(canvas, apexX + 2, y, w - 1, c("canvas"));
    if (w > 8) {
      hline(canvas, apexX + Math.round(w * 0.45), y, Math.round(w * 0.4), c("canvasLight"));
      hline(canvas, apexX + Math.round(w * 0.8), y, Math.max(1, Math.round(w * 0.15)), c("canvasShade"));
    }
  }
  vline(canvas, apexX, apexY + 1, 26, c("canvasLit", 190));
  vline(canvas, apexX + 1, apexY + 1, 30, c("canvasShade", 140));
  for (let y = apexY + 2; y <= floor; y += 1) {
    const t = Math.pow((y - apexY) / (floor - apexY), 0.9);
    for (const toX of [apexX - 30, apexX - 48, apexX + 30, apexX + 48] as const) {
      const x = Math.round(apexX + (toX - apexX) * t);
      put(canvas, x, y, toX < apexX ? c("canvasDeep", 120) : c("canvasLit", 130));
    }
  }
  for (let i = 0; i < 5; i += 1) {
    const y = 48 + i * 9;
    for (let x = 10; x < 118; x += 1) {
      if (noise(x, i, 5) > 0.72) put(canvas, x, y + Math.round(Math.sin(x * 0.33 + i) * 1.2), c("canvasShade", 60));
    }
  }
  for (let x = 8; x < 120; x += 1) {
    const depth = 1 + Math.floor(noise(x, 3, 8) * 3);
    for (let d = 0; d < depth; d += 1) put(canvas, x, floor + d, c("canvasShade"));
  }

  for (let y = 46; y <= floor; y += 1) {
    const t = (y - 46) / (floor - 46);
    const w = Math.round(6 + t * 13);
    hline(canvas, apexX - w, y, w * 2 + 1, y > 60 ? c("ink") : c("inkSoft"));
  }
  dither(canvas, 52, 84, 25, 8, c("bannerShade", 235));
  hline(canvas, 52, 84, 25, c("banner"));
  hline(canvas, 53, 91, 23, c("ink"));
  rect(canvas, 68, 74, 14, 11, inkSoft);
  rect(canvas, 69, 75, 12, 9, c("woodDark"));
  rect(canvas, 70, 76, 10, 4, c("wood"));
  hline(canvas, 70, 76, 10, c("woodLight"));
  hline(canvas, 70, 80, 10, c("woodMid"));
  put(canvas, 74, 78, c("brassLight"));
  rect(canvas, 57, 80, 2, 5, c("paper"));
  put(canvas, 57, 79, c("fireLight"));
  put(canvas, 57, 78, c("fireCore"));

  const roll = (x: number, width: number, flip: number) => {
    roundRect(canvas, x - 1, 50, width + 2, floor - 46, 5, c("canvasDeep"));
    roundRect(canvas, x, 50, width, floor - 47, 5, c("canvasDeep"));
    roundRect(canvas, x + 1, 51, Math.round(width * 0.62), floor - 49, 4, c("canvasShade"));
    vline(canvas, x + Math.round(width * (flip > 0 ? 0.3 : 0.5)), 52, floor - 51, c("canvasLight", 230));
    for (let y = 56; y < floor - 6; y += 6) hline(canvas, x + 1, y, width - 2, c("canvasDeep", 80));
    const coilY = floor - 5;
    ellipse(canvas, x + 1, coilY - 3, x + width - 1, coilY + 3, c("canvasShade"));
    ellipse(canvas, x + 2, coilY - 2, x + width - 2, coilY + 2, c("canvas"));
    put(canvas, x + Math.round(width / 2), coilY, c("canvasDeep"));
    put(canvas, x + Math.round(width / 2) + 1, coilY - 1, c("canvasLight", 200));
    const tieY = 64;
    hline(canvas, x - 1, tieY, width + 1, c("woodMid"));
    hline(canvas, x - 1, tieY + 1, width + 1, c("woodDeep"));
    rect(canvas, x + Math.round(width / 2) - 1, tieY - 1, 3, 3, c("woodDark"));
    put(canvas, x + Math.round(width / 2), tieY, c("woodLight"));
  };
  roll(43, 10, -1);
  roll(75, 10, 1);

  vline(canvas, 64, 40, 5, c("metalDeep"));
  rect(canvas, 58, 45, 12, 13, c("metalDeep"));
  rect(canvas, 59, 46, 10, 11, c("brassShade"));
  rect(canvas, 60, 47, 8, 9, c("lamp"));
  rect(canvas, 61, 49, 6, 5, c("fireCore"));
  hline(canvas, 58, 44, 12, c("brass"));
  hline(canvas, 58, 57, 12, c("brassShade"));
  put(canvas, 61, 48, c("canvasLit"));

  const pole = (x0: number, x1: number, y0: number, y1: number, width = 4) => {
    const steps = 72;
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      hline(canvas, x, y, width, c("woodDark"));
      hline(canvas, x, y, 1, c("woodLight"));
      put(canvas, x + 1, y, c("wood"));
      put(canvas, x + width - 1, y, c("woodDeep"));
    }
  };
  pole(13, 30, 38, 100);
  pole(30, 13, 38, 100);
  pole(111, 94, 38, 100);
  pole(94, 111, 38, 100);
  for (const [x, y] of [[22, 62], [104, 62]] as const) {
    rect(canvas, x - 4, y, 9, 5, c("woodDeep"));
    hline(canvas, x - 3, y, 7, c("woodMid"));
    put(canvas, x, y + 2, c("woodLight"));
  }
  for (const [x, y] of [[30, 37], [13, 37], [94, 37], [111, 37]] as const) {
    put(canvas, x, y - 1, c("woodLight"));
    put(canvas, x + 1, y - 1, c("wood"));
  }

  const rope = (x1: number, y1: number, x2: number, y2: number) => {
    const steps = 100;
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(x1 + ((x2 - x1) * i) / steps);
      const y = Math.round(y1 + ((y2 - y1) * i) / steps);
      put(canvas, x, y, c("woodMid"));
      if (i % 10 === 0) put(canvas, x, y, c("paper", 210));
    }
  };
  rope(apexX - 2, apexY + 4, 3, 90);
  rope(apexX + 2, apexY + 4, 125, 90);
  rope(apexX - 14, apexY + 14, 33, 94);
  rope(apexX + 14, apexY + 14, 95, 94);
  for (const [x, y] of [[2, 88], [123, 88], [32, 92], [94, 92]] as const) {
    rect(canvas, x, y, 3, 9, inkSoft);
    rect(canvas, x, y, 3, 8, c("woodDark"));
    hline(canvas, x - 1, y, 5, c("woodMid"));
    put(canvas, x, y, c("woodLight"));
  }

  for (const lean of [-1, 1] as const) {
    for (let y = 3; y <= 15; y += 1) {
      const x = apexX + Math.round(lean * (y - 3) * 0.75);
      hline(canvas, x - 1, y, 3, lean < 0 ? c("wood") : c("woodDark"));
      put(canvas, x - 1, y, c("woodLit"));
    }
  }
  hline(canvas, apexX - 5, 10, 10, c("woodDark"));
  hline(canvas, apexX - 4, 11, 8, c("woodMid"));
  put(canvas, apexX, 12, c("woodLight"));
  return finish(canvas, 0.05);
}

// ── Supply wagon ──────────────────────────────────────────────────────────────
export function drawWagon(): PixelCanvas {
  const canvas = surface(136, 104);
  const floor = 100;

  const wheel = (cx: number, cy: number, r: number) => {
    ellipse(canvas, cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, inkSoft);
    ellipse(canvas, cx - r, cy - r, cx + r, cy + r, c("woodDark"));
    ellipse(canvas, cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1, c("wood"));
    ellipse(canvas, cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2, c("wood", 0));
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      put(canvas, Math.round(cx + Math.cos(angle) * (r - 1)), Math.round(cy + Math.sin(angle) * (r - 1)), c("woodDeep"));
    }
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + 0.18;
      for (let step = 3; step <= r - 3; step += 1) {
        const x = Math.round(cx + Math.cos(angle) * step);
        const y = Math.round(cy + Math.sin(angle) * step);
        put(canvas, x, y, c("woodLight"));
        if (step % 3 === 0) put(canvas, x, y, c("woodMid"));
      }
    }
    ellipse(canvas, cx - 4, cy - 4, cx + 4, cy + 4, c("metalDeep"));
    ellipse(canvas, cx - 3, cy - 3, cx + 3, cy + 3, c("metalShade"));
    ellipse(canvas, cx - 1, cy - 1, cx + 1, cy + 1, c("metal"));
    put(canvas, cx - 2, cy - 2, c("metalLight"));
    put(canvas, cx - 1, cy - 1, c("brassLight"));
  };
  wheel(35, floor - 17, 17);
  wheel(105, floor - 17, 17);

  plank(canvas, 15, 55, 106, 21, 2);
  hline(canvas, 15, 55, 106, c("woodLight"));
  hline(canvas, 15, 56, 106, c("woodMid"));
  hline(canvas, 15, 72, 106, c("woodDark"));
  hline(canvas, 15, 73, 106, c("woodDeep"));
  hline(canvas, 15, 61, 106, c("woodDark", 170));
  hline(canvas, 15, 62, 106, c("woodLight", 110));
  hline(canvas, 15, 68, 106, c("woodDark", 150));
  for (let x = 20; x < 121; x += 12) vline(canvas, x, 57, 15, c("woodGrain", 170));
  for (const x of [14, 113] as const) {
    rect(canvas, x, 53, 8, 22, c("metalDeep"));
    rect(canvas, x + 1, 54, 6, 20, c("metalShade"));
    vline(canvas, x + 2, 55, 18, c("metal"));
    for (let i = 0; i < 3; i += 1) put(canvas, x + 4, 58 + i * 7, c("brassLight"));
  }
  seam(canvas, 15, 54, 106);

  const arch = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - 16) / 42));
    const rise = Math.min(1, t * 1.34);
    return Math.round(52 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - rise, 3.2))));
  };
  for (let y = 16; y <= 58; y += 1) {
    const width = arch(y);
    if (width <= 0) continue;
    hline(canvas, 68 - width, y, width * 2 + 1, c("canvas"));
    hline(canvas, 68 - width, y, Math.round(width * 1.25), c("canvasShade"));
    hline(canvas, 68 - width, y, Math.max(2, Math.round(width * 0.45)), c("canvasDeep", 140));
    if (width > 16) hline(canvas, 68 + Math.round(width * 0.55), y, Math.round(width * 0.45), c("canvasLight"));
    if (y <= 17) hline(canvas, 68 - width, y, width * 2 + 1, c("canvasLit"));
    if (y === 18) hline(canvas, 68 - width, y, width * 2 + 1, c("canvasLight"));
    if (y >= 55) hline(canvas, 68 - width, y, width * 2 + 1, c("canvasShade", 170));
  }
  for (const rib of [-38, -19, 0, 19, 38] as const) {
    for (let y = 16; y <= 58; y += 1) {
      const width = arch(y);
      const x = 68 + rib;
      if (Math.abs(rib) > width - 1) continue;
      put(canvas, x, y, c("canvasDeep", 210));
      put(canvas, x + 1, y, c("canvasLit", 120));
    }
  }
  for (const x of [42, 68, 94] as const) {
    for (let y = 16; y <= 58; y += 1) {
      if (Math.abs(x - 68) > arch(y) - 1) continue;
      put(canvas, x, y, c("clothLeather"));
      put(canvas, x + 1, y, c("clothLeatherShade"));
      if (y % 9 === 0) put(canvas, x, y, c("clothLeatherLight"));
    }
    const buckleY = 22;
    if (Math.abs(x - 68) <= arch(buckleY) - 2) {
      rect(canvas, x - 2, buckleY, 6, 5, c("metalShade"));
      rect(canvas, x - 1, buckleY + 1, 4, 3, c("clothLeatherShade"));
      put(canvas, x - 2, buckleY, c("metalLight"));
      put(canvas, x + 3, buckleY + 4, c("metalDeep"));
    }
  }
  seam(canvas, 17, 59, 102);
  hline(canvas, 16, 60, 104, c("canvasShade", 180));

  plank(canvas, 2, 63, 24, 5, 6);
  rect(canvas, 1, 66, 7, 9, c("woodDark"));
  hline(canvas, 1, 66, 7, c("woodLight"));
  hline(canvas, 1, 74, 7, c("woodDeep"));
  put(canvas, 4, 69, c("metalShade"));
  rect(canvas, 24, 60, 5, 12, c("metalShade"));
  put(canvas, 25, 62, c("metalLight"));
  put(canvas, 25, 69, c("metalDeep"));

  const bx = 84;
  const by = 58;
  roundRect(canvas, bx - 1, by - 1, 22, 26, 5, inkSoft);
  roundRect(canvas, bx, by, 20, 24, 5, c("woodMid"));
  hline(canvas, bx + 2, by, 16, c("woodLight"));
  vline(canvas, bx + 1, by + 2, 20, c("woodLight", 190));
  vline(canvas, bx + 18, by + 2, 20, c("woodDark"));
  for (const y of [by + 4, by + 12, by + 20] as const) {
    hline(canvas, bx, y, 20, c("metalDeep"));
    hline(canvas, bx, y + 1, 20, c("metalShade"));
    put(canvas, bx + 9, y, c("metalLight"));
  }
  hline(canvas, bx, by + 22, 20, c("woodDeep"));
  ellipse(canvas, bx + 2, by - 3, bx + 18, by + 1, c("woodDark"));
  ellipse(canvas, bx + 3, by - 2, bx + 17, by, c("woodLight"));
  hline(canvas, bx + 3, by - 5, 3, c("woodMid"));
  hline(canvas, bx + 14, by - 5, 3, c("woodMid"));
  vline(canvas, bx + 4, by - 5, 3, c("woodMid"));
  vline(canvas, bx + 15, by - 5, 3, c("woodMid"));

  rect(canvas, 95, 34, 21, 21, inkSoft);
  rect(canvas, 96, 35, 19, 19, c("wood"));
  hline(canvas, 96, 35, 19, c("woodLight"));
  hline(canvas, 96, 53, 19, c("woodDeep"));
  for (let i = 0; i < 15; i += 1) {
    put(canvas, 98 + Math.round(i * 0.92), 37 + i, c("woodDark", 200));
    put(canvas, 112 - Math.round(i * 0.92), 37 + i, c("woodDark", 200));
  }
  vline(canvas, 96, 35, 19, c("woodDark"));
  vline(canvas, 114, 35, 19, c("woodDeep"));
  put(canvas, 97, 36, c("metalShade"));
  put(canvas, 97, 51, c("metalShade"));
  put(canvas, 112, 36, c("metalShade"));
  put(canvas, 112, 51, c("metalShade"));
  ellipse(canvas, 20, 42, 40, 56, inkSoft);
  ellipse(canvas, 21, 43, 39, 55, c("canvasShade"));
  hline(canvas, 24, 45, 12, c("canvasLight"));
  for (let x = 24; x < 37; x += 4) vline(canvas, x, 46, 8, c("canvasDeep", 140));
  hline(canvas, 22, 49, 16, c("woodMid"));
  return finish(canvas, 0.09);
}

// ── Crate stack with lantern ──────────────────────────────────────────────────
export function drawCrates(): PixelCanvas {
  const canvas = surface(72, 64);

  const crate = (x: number, y: number, w: number, h: number, seed: number, braces = true) => {
    rect(canvas, x - 1, y - 1, w + 2, h + 2, inkSoft);
    rect(canvas, x, y, w, h, c("wood"));
    hline(canvas, x, y, w, c("woodLight"));
    hline(canvas, x, y + 1, w, c("woodMid"));
    hline(canvas, x, y + h - 1, w, c("woodDeep"));
    for (let row = y + 3; row < y + h - 2; row += 4) hline(canvas, x + 1, row, w - 2, c("woodGrain", 85));
    if (braces) {
      const span = Math.min(w, h) - 5;
      for (let i = 0; i <= span; i += 1) {
        const dx = Math.round((i / span) * (w - 5));
        put(canvas, x + 2 + dx, y + 2 + i, c("woodDark", 210));
        put(canvas, x + w - 3 - dx, y + 2 + i, c("woodDark", 210));
      }
    }
    vline(canvas, x, y, h, c("woodDark"));
    vline(canvas, x + w - 1, y, h, c("woodDeep"));
    for (const [cx, cy] of [[x, y], [x + w - 5, y], [x, y + h - 5], [x + w - 5, y + h - 5]] as const) {
      rect(canvas, cx, cy, 5, 5, c("metalDeep"));
      rect(canvas, cx + 1, cy + 1, 3, 3, c("metalShade"));
      put(canvas, cx + 1, cy + 1, c("metalLight"));
      put(canvas, cx + 3, cy + 3, c("metalDeep"));
      put(canvas, cx + 2, cy + 2, c("brassLight"));
    }
    put(canvas, x + 2 + Math.floor(noise(seed, 1, 5) * (w - 6)), y + 3 + Math.floor(noise(seed, 2, 7) * (h - 8)), c("woodDark"));
  };

  crate(36, 26, 30, 36, 9);
  crate(2, 38, 34, 24, 3);
  crate(8, 14, 26, 22, 5);
  crate(38, 6, 24, 19, 7, false);

  const coilX = 50;
  const coilY = 12;
  for (let ring = 0; ring < 3; ring += 1) {
    const rx = 11 - ring * 3;
    const ry = 6 - ring * 1.4;
    for (let i = 0; i <= 70; i += 1) {
      const angle = (i / 70) * Math.PI * 2;
      const x = Math.round(coilX + Math.cos(angle) * rx);
      const y = Math.round(coilY + Math.sin(angle) * ry);
      put(canvas, x, y, ring === 0 ? c("dirtLight") : c("dirtLit"));
      put(canvas, x, y + 1, c("dirtDeep", 130));
    }
  }
  rect(canvas, coilX - 2, coilY - 1, 4, 3, c("dirtDeep"));
  put(canvas, coilX, coilY, c("dirtLit"));
  for (let i = 0; i < 4; i += 1) put(canvas, coilX + 10 + i, coilY + 3 + (i % 2), c("dirtLight"));

  vline(canvas, 67, 4, 6, c("brassShade"));
  for (let i = 0; i < 5; i += 1) put(canvas, 65 + i, 7 - Math.abs(i - 2), c("brassShade"));
  rect(canvas, 62, 10, 12, 15, inkSoft);
  rect(canvas, 63, 11, 10, 13, c("brassShade"));
  rect(canvas, 64, 12, 8, 10, c("lamp"));
  rect(canvas, 65, 14, 6, 7, c("fireCore"));
  hline(canvas, 65, 16, 5, c("fireLight", 190));
  hline(canvas, 63, 10, 10, c("brass"));
  hline(canvas, 63, 9, 10, c("brassLight"));
  hline(canvas, 63, 24, 10, c("brass"));
  put(canvas, 64, 11, c("canvasLit"));
  put(canvas, 72, 21, c("brass"));
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    put(canvas, 67 + Math.round(Math.cos(angle) * 7), 17 + Math.round(Math.sin(angle) * 8), c("lampGlow", 55));
  }
  return finish(canvas, 0.12);
}

// ── Signpost and notice board ─────────────────────────────────────────────────
export function drawSignpost(): PixelCanvas {
  const canvas = surface(30, 44);

  ellipse(canvas, 8, 37, 22, 42, inkSoft);
  ellipse(canvas, 9, 37, 21, 41, c("stoneShade"));
  ellipse(canvas, 10, 38, 20, 40, c("stone"));
  hline(canvas, 12, 38, 6, c("stoneLit"));

  rect(canvas, 12, 8, 6, 32, inkSoft);
  rect(canvas, 13, 8, 4, 31, c("wood"));
  vline(canvas, 13, 8, 31, c("woodLight"));
  vline(canvas, 16, 8, 31, c("woodDark"));
  for (let y = 12; y < 37; y += 6) put(canvas, 15, y, c("woodGrain"));

  rect(canvas, 1, 2, 28, 17, inkSoft);
  rect(canvas, 2, 3, 26, 15, c("woodDark"));
  rect(canvas, 3, 4, 24, 13, c("woodMid"));
  hline(canvas, 3, 4, 24, c("woodLight"));
  hline(canvas, 3, 16, 24, c("woodDeep"));
  rect(canvas, 5, 6, 7, 9, inkSoft);
  rect(canvas, 5, 6, 6, 8, c("paper"));
  hline(canvas, 6, 8, 4, c("paperShade"));
  hline(canvas, 6, 10, 3, c("paperShade"));
  rect(canvas, 13, 5, 6, 9, inkSoft);
  rect(canvas, 13, 5, 5, 8, c("paper"));
  hline(canvas, 14, 7, 3, c("paperLine"));
  hline(canvas, 14, 9, 2, c("paperLine"));
  rect(canvas, 20, 7, 6, 8, c("paperShade"));
  hline(canvas, 21, 9, 3, c("paperLine"));
  hline(canvas, 21, 11, 2, c("paperLine"));
  put(canvas, 8, 6, c("metal"));
  put(canvas, 15, 5, c("metal"));
  put(canvas, 22, 7, c("metal"));

  rect(canvas, 3, 21, 24, 10, inkSoft);
  rect(canvas, 4, 22, 22, 8, c("woodDark"));
  rect(canvas, 5, 23, 20, 6, c("wood"));
  hline(canvas, 5, 23, 20, c("woodLight"));
  hline(canvas, 5, 28, 20, c("woodDeep"));
  hline(canvas, 8, 25, 9, c("woodGrain"));
  hline(canvas, 8, 27, 6, c("woodGrain", 170));
  for (let i = 0; i < 3; i += 1) {
    put(canvas, 25 + i, 25, c("woodLight"));
    put(canvas, 24 + i, 24 + i, c("woodLit"));
    put(canvas, 24 + i, 27 - i, c("woodLit"));
  }
  put(canvas, 9, 23, c("metal"));

  rect(canvas, 18, 32, 8, 8, inkSoft);
  rect(canvas, 19, 33, 6, 6, c("metalShade"));
  rect(canvas, 20, 34, 4, 4, c("lamp"));
  put(canvas, 21, 35, c("fireCore"));
  hline(canvas, 18, 31, 8, c("metal"));
  put(canvas, 17, 34, c("lampGlow", 90));
  put(canvas, 26, 36, c("lampGlow", 90));
  return finish(canvas, 0.2);
}

// ── Workbench ─────────────────────────────────────────────────────────────────
export function drawWorkbench(): PixelCanvas {
  const canvas = surface(50, 32);

  for (const x of [7, 37] as const) {
    for (let y = 18; y < 29; y += 1) {
      const drift = Math.round((y - 18) * 0.16);
      hline(canvas, x - drift, y, 3, c("woodDark"));
      hline(canvas, x + 4 + drift, y, 3, c("woodDark"));
    }
    hline(canvas, x - 2, 26, 12, c("woodDark"));
    hline(canvas, x + 2, 19, 4, c("woodMid"));
  }
  plank(canvas, 6, 25, 38, 3, 4);

  rect(canvas, 1, 13, 48, 7, inkSoft);
  rect(canvas, 1, 14, 48, 5, c("woodMid"));
  hline(canvas, 1, 14, 48, c("woodLit"));
  hline(canvas, 1, 15, 48, c("woodLight"));
  hline(canvas, 1, 18, 48, c("woodDark"));
  for (let x = 3; x < 48; x += 6) put(canvas, x, 16, c("woodGrain", 120));

  rect(canvas, 3, 7, 11, 8, inkSoft);
  rect(canvas, 4, 8, 9, 6, c("metalShade"));
  rect(canvas, 5, 9, 7, 3, c("metal"));
  hline(canvas, 5, 9, 7, c("metalLight"));
  hline(canvas, 4, 13, 9, c("metalDeep"));
  rect(canvas, 1, 10, 4, 3, c("metalDeep"));
  put(canvas, 12, 11, c("brass"));

  rect(canvas, 16, 12, 12, 2, c("wood"));
  hline(canvas, 16, 12, 12, c("woodLight"));
  rect(canvas, 25, 9, 6, 4, inkSoft);
  rect(canvas, 26, 9, 4, 3, c("metal"));
  hline(canvas, 26, 9, 4, c("metalLight"));
  rect(canvas, 31, 8, 2, 6, c("metalShade"));
  put(canvas, 31, 8, c("metalLight"));

  for (let y = 3; y < 14; y += 1) {
    const half = y < 6 ? 6 : y < 10 ? 3 : 5;
    hline(canvas, 41 - half, y, half * 2 + 1, c("metalDeep"));
  }
  hline(canvas, 35, 3, 13, c("metalLight"));
  hline(canvas, 36, 4, 11, c("metal"));
  hline(canvas, 37, 5, 9, c("metalShade"));
  put(canvas, 35, 3, c("metal"));
  put(canvas, 46, 12, c("metal"));
  rect(canvas, 36, 13, 10, 2, c("woodDark"));

  for (const [x, y] of [[10, 17], [14, 18], [34, 17], [39, 18], [22, 18]] as const)
    put(canvas, x, y, c("woodLit", 170));
  return finish(canvas, 0.16);
}

// ── Firewood stack and axe ────────────────────────────────────────────────────
export function drawFirewood(): PixelCanvas {
  const canvas = surface(42, 30);

  const log = (x: number, y: number, w: number, h: number) => {
    roundRect(canvas, x - 1, y - 1, w + 2, h + 2, 2, inkSoft);
    roundRect(canvas, x, y, w, h, 2, c("woodDark"));
    hline(canvas, x + 1, y, w - 2, c("woodMid"));
    hline(canvas, x + 1, y + h - 1, w - 2, c("woodDeep"));
    for (let i = 0; i < 2; i += 1) put(canvas, x + 2 + i * 3, y + 1 + (i % 2), c("woodGrain"));
    ellipse(canvas, x, y, x + 3, y + h - 1, c("woodLight"));
    put(canvas, x + 1, y + 1, c("woodLit"));
    put(canvas, x + 1, y + h - 2, c("wood"));
  };
  log(6, 20, 20, 7);
  log(17, 20, 20, 7);
  log(11, 14, 21, 6);
  log(19, 14, 16, 6);
  log(14, 8, 16, 6);

  roundRect(canvas, 29, 16, 13, 12, 3, inkSoft);
  roundRect(canvas, 30, 16, 11, 12, 3, c("woodDark"));
  ellipse(canvas, 30, 15, 41, 20, c("woodMid"));
  hline(canvas, 32, 16, 7, c("woodLight"));
  for (let i = 0; i < 3; i += 1) ellipse(canvas, 32 + i, 17 + i, 39 - i, 18 + i, c("woodGrain", 150));
  for (let y = 2; y < 18; y += 1) {
    hline(canvas, 34 + Math.round(y * 0.06), y, 2, c("woodLight"));
    put(canvas, 35 + Math.round(y * 0.06), y, c("wood"));
  }
  for (let y = 4; y < 12; y += 1) {
    const half = 5 - Math.abs(y - 8);
    hline(canvas, 36 - half, y, half * 2 + 2, c("metal"));
    hline(canvas, 36 - half, y, 2, c("metalLight"));
    put(canvas, 36 + half, y, c("metalShade"));
  }
  hline(canvas, 31, 7, 10, c("metalDeep"));
  put(canvas, 34, 5, c("metalLight"));
  put(canvas, 27, 26, c("leaf"));
  put(canvas, 28, 25, c("leafDeep"));
  put(canvas, 4, 25, c("leafLight"));
  put(canvas, 3, 26, c("leaf"));
  put(canvas, 39, 26, c("leaf"));
  return finish(canvas, 0.18);
}

// ── Map table ─────────────────────────────────────────────────────────────────
export function drawMapTable(): PixelCanvas {
  const canvas = surface(52, 32);

  for (const x of [7, 41] as const) {
    rect(canvas, x, 17, 3, 12, c("woodDark"));
    vline(canvas, x, 17, 12, c("woodMid"));
  }
  plank(canvas, 5, 26, 40, 2, 8);

  rect(canvas, 2, 12, 48, 7, inkSoft);
  rect(canvas, 2, 13, 48, 5, c("woodMid"));
  hline(canvas, 2, 13, 48, c("woodLit"));
  hline(canvas, 2, 14, 48, c("woodLight"));
  hline(canvas, 2, 17, 48, c("woodDeep"));
  for (let x = 4; x < 48; x += 6) put(canvas, x, 16, c("woodGrain", 110));

  rect(canvas, 4, 3, 42, 11, inkSoft);
  rect(canvas, 4, 3, 41, 10, c("paper"));
  hline(canvas, 5, 4, 38, c("canvasLight", 180));
  hline(canvas, 4, 12, 41, c("paperShade"));
  for (let x = 7; x < 25; x += 1) {
    const y = 7 + Math.round(Math.sin(x * 0.42) * 1.5);
    put(canvas, x, y, c("dirtDark", 200));
    put(canvas, x, y + 1, c("dirtDark", 90));
  }
  for (let x = 25; x < 42; x += 1) {
    const y = 10 + Math.round(Math.cos(x * 0.5) * 1.3);
    put(canvas, x, y, c("dirtDark", 200));
  }
  ellipse(canvas, 30, 5, 35, 8, c("dirtDark", 160));
  for (let i = 0; i < 8; i += 1) {
    const x = 10 + i * 4;
    const y = 10 - Math.round(Math.sin(i * 0.8) * 1.6);
    put(canvas, x, y, c("bannerShade", 210));
    if (i % 2 === 0) put(canvas, x, y - 1, c("banner", 180));
  }
  put(canvas, 38, 7, c("bannerShade"));
  put(canvas, 37, 7, c("banner"));
  put(canvas, 38, 6, c("banner"));
  ellipse(canvas, 39, 10, 43, 12, c("metalShade", 150));
  put(canvas, 41, 10, c("banner"));
  put(canvas, 41, 11, c("paperShade"));
  for (let i = 0; i < 8; i += 1) hline(canvas, 43 + i, 5 + Math.round(i * 0.2), 2, c("woodLight"));
  put(canvas, 51, 6, c("inkSoft"));
  ellipse(canvas, 3, 2, 7, 5, c("stone"));
  put(canvas, 4, 3, c("stoneLit"));
  ellipse(canvas, 42, 11, 45, 13, c("stoneShade"));
  roundRect(canvas, 32, 0, 8, 5, 2, c("canvasShade"));
  hline(canvas, 32, 0, 8, c("canvasLight"));
  put(canvas, 34, 0, c("paper", 120));
  return finish(canvas, 0.16);
}

// ── Lantern post ──────────────────────────────────────────────────────────────
export function drawLanternPost(): PixelCanvas {
  const canvas = surface(20, 58);

  rect(canvas, 7, 12, 6, 43, inkSoft);
  rect(canvas, 8, 12, 4, 42, c("wood"));
  vline(canvas, 8, 12, 42, c("woodLight"));
  vline(canvas, 11, 12, 42, c("woodDark"));
  for (let y = 16; y < 50; y += 7) put(canvas, 9, y, c("woodGrain"));
  rect(canvas, 6, 49, 8, 5, inkSoft);
  rect(canvas, 6, 50, 8, 4, c("woodDark"));
  hline(canvas, 6, 50, 8, c("woodMid"));
  ellipse(canvas, 4, 53, 16, 56, c("stoneShade"));
  ellipse(canvas, 5, 53, 15, 55, c("stone"));

  rect(canvas, 3, 11, 14, 4, inkSoft);
  rect(canvas, 4, 12, 12, 3, c("woodDark"));
  hline(canvas, 4, 12, 12, c("woodLight"));
  hline(canvas, 4, 14, 12, c("woodDeep"));
  vline(canvas, 4, 15, 3, c("metalDeep"));

  rect(canvas, 0, 16, 13, 16, inkSoft);
  rect(canvas, 1, 17, 11, 14, c("brassShade"));
  rect(canvas, 2, 18, 9, 12, c("lamp"));
  rect(canvas, 3, 20, 7, 8, c("fireCore"));
  hline(canvas, 4, 22, 5, c("fireLight", 180));
  hline(canvas, 1, 16, 11, c("brass"));
  hline(canvas, 1, 17, 11, c("brassLight"));
  hline(canvas, 1, 30, 11, c("brass"));
  hline(canvas, 1, 31, 11, c("brassShade"));
  put(canvas, 2, 18, c("canvasLit"));
  put(canvas, 10, 28, c("brass"));
  hline(canvas, 2, 15, 9, c("metalDeep"));
  put(canvas, 5, 14, c("metalShade"));
  put(canvas, 6, 14, c("metal"));
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    put(canvas, 6 + Math.round(Math.cos(angle) * 6), 23 + Math.round(Math.sin(angle) * 6), c("lampGlow", 50));
  }
  return finish(canvas, 0.14);
}

// ── Bush ──────────────────────────────────────────────────────────────────────
export function drawBush(): PixelCanvas {
  const canvas = surface(38, 28);

  for (const [cx, cy, r] of [[12, 19, 9], [23, 17, 10], [31, 21, 7], [18, 22, 9]] as const) {
    dome(canvas, cx, cy, r + 1, Math.round(r * 0.9), inkSoft);
    dome(canvas, cx, cy, r, Math.round(r * 0.82), c("leafDeep"));
  }
  for (const [cx, cy, r] of [[12, 17, 8], [23, 15, 9], [30, 19, 6]] as const) {
    dome(canvas, cx, cy, r, Math.round(r * 0.8), c("leaf"));
  }
  for (const [cx, cy, r] of [[11, 15, 6], [22, 13, 7], [29, 17, 4]] as const) {
    dome(canvas, cx, cy, r, Math.round(r * 0.65), c("leafLight", 220));
    put(canvas, cx - 2, cy - r + 1, c("leafLit"));
    put(canvas, cx - 1, cy - r + 1, c("leafLit"));
  }
  for (let i = 0; i < 22; i += 1) {
    const x = 4 + Math.floor(noise(i, 1, 4) * 29);
    const y = 7 + Math.floor(noise(i, 2, 6) * 15);
    put(canvas, x, y, c("leafDeep", 210));
    put(canvas, x + 1, y - 1, c("leafLit", 190));
  }
  for (const [x, y] of [[13, 19], [25, 18], [21, 10], [30, 16]] as const) {
    put(canvas, x, y, c("banner"));
    put(canvas, x + 1, y, c("bannerShade"));
  }
  put(canvas, 9, 13, c("trimLight"));
  put(canvas, 17, 15, c("trimLight"));
  ellipse(canvas, 3, 23, 35, 27, c("grassDeepest", 55));
  return finish(canvas, 0.16);
}

// ── Mossy rock ────────────────────────────────────────────────────────────────
export function drawRock(): PixelCanvas {
  const canvas = surface(32, 22);

  const boulder = (x: number, y: number, w: number, h: number) => {
    ellipse(canvas, x - 1, y - 1, x + w + 1, y + h + 1, inkSoft);
    ellipse(canvas, x, y, x + w, y + h, c("stoneShade"));
    ellipse(canvas, x + 1, y + 1, x + w - 1, y + h - 1, c("stone"));
    ellipse(canvas, x + Math.round(w * 0.2), y + 1, x + Math.round(w * 0.7), y + Math.round(h * 0.4), c("stoneLight", 210));
    hline(canvas, x + Math.round(w * 0.3), y + 1, Math.round(w * 0.35), c("stoneLit", 210));
    put(canvas, x + Math.round(w * 0.55), y + Math.round(h * 0.5), c("stoneDeep"));
    put(canvas, x + Math.round(w * 0.58), y + Math.round(h * 0.65), c("stoneDeep"));
    put(canvas, x + Math.round(w * 0.8), y + h - 2, c("stoneDeep"));
  };
  boulder(2, 5, 20, 14);
  boulder(17, 9, 13, 11);

  for (const [x, y] of [[6, 7], [8, 6], [11, 8], [20, 11], [23, 11], [9, 10]] as const) {
    put(canvas, x, y, c("leaf"));
    put(canvas, x + 1, y + 1, c("leafDeep"));
  }
  hline(canvas, 6, 7, 5, c("leafLight", 190));
  hline(canvas, 20, 11, 3, c("leafLight", 170));
  put(canvas, 1, 17, c("stoneLight"));
  put(canvas, 26, 17, c("stoneShade"));
  put(canvas, 12, 19, c("stone"));
  put(canvas, 14, 10, c("trimLight", 160));
  return finish(canvas, 0.2);
}
