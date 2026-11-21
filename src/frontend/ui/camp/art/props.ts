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

/** An upright log end: bark ring, pale core, one saw cut. */
function logEnd(canvas: PixelCanvas, cx: number, cy: number, r: number) {
  ellipse(canvas, cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, inkSoft);
  ellipse(canvas, cx - r, cy - r, cx + r, cy + r, c("woodMid"));
  ellipse(canvas, cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1, c("woodLight"));
  ellipse(canvas, cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2, c("woodLit"));
  put(canvas, cx - 1, cy, c("woodDark"));
  put(canvas, cx, cy, c("wood"));
  put(canvas, cx + 1, cy + 1, c("wood"));
}

// ── Campfire in a stone ring ──────────────────────────────────────────────────
export function drawCampfire(frame: 0 | 1 | 2): PixelCanvas {
  const canvas = surface(64, 50);

  ellipse(canvas, 9, 30, 55, 46, c("dirtDeep", 220));
  ellipse(canvas, 14, 33, 50, 44, c("inkSoft", 200));
  ellipse(canvas, 20, 36, 43, 42, c("ink", 190));

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
  log(19, 31, 25, 8, 0.16);
  log(22, 38, 24, 7, -0.18);
  log(30, 26, 8, 14, 0.5);
  log(38, 28, 7, 12, -0.42);
  for (let i = 0; i < 6; i += 1) put(canvas, 27 + i * 2, 34 + (i % 2), c("fireLight", 180));

  // The ring: chunky stones, each lit on its top left.
  const stones = 13;
  for (let i = 0; i < stones; i += 1) {
    const angle = (i / stones) * Math.PI * 2 + 0.14;
    const cx = 32 + Math.round(Math.cos(angle) * 24);
    const cy = 39 + Math.round(Math.sin(angle) * 8.4);
    const w = 9 + (i % 3);
    const h = 6 + (i % 2);
    const x = cx - Math.floor(w / 2);
    const y = cy - Math.floor(h / 2);
    roundRect(canvas, x - 1, y - 1, w + 2, h + 2, 2, inkSoft);
    pillow(canvas, x, y, w, h, 2, c("stone"), c("stoneLit"), c("stoneShade"));
    put(canvas, x + 1, y, c("stoneLit"));
    put(canvas, x + w - 2, y + h - 1, c("stoneDeep"));
    if (i % 4 === 0) put(canvas, x + 2, y + h - 2, c("stoneShade"));
  }

  const tall = [21, 27, 17][frame];
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
      const half = Math.max(1, Math.round((width / 2) * (1 - t * 0.9)));
      const wobble = Math.round((1 - t) * drift + Math.sin(row * 0.8 + frame * 2) * 0.9);
      hline(canvas, baseX - half + wobble, baseY - row, half * 2 + 1, color);
    }
  };
  flame(32, 33, tall, 17, lean, c("fire"));
  flame(25, 30, Math.round(tall * 0.55), 9, -2 - lean, c("fire", 240));
  flame(39, 30, Math.round(tall * 0.5), 8, 3 + lean, c("fire", 240));
  flame(32, 32, Math.round(tall * 0.76), 12, Math.round(lean * 0.6), c("fireLight"));
  flame(32, 31, Math.round(tall * 0.48), 7, Math.round(lean * 0.4), c("fireCore"));
  hline(canvas, 30, 30, 5, c("fireCore"));
  hline(canvas, 31, 27, 3, c("fireCore", 220));
  put(canvas, 26 + lean, 10, c("fireLight", 230));
  put(canvas, 39 - lean, 14, c("fire", 210));
  put(canvas, 32, 6 + frame, c("fireCore", 190));
  put(canvas, 21, 20, c("fire", 170));
  put(canvas, 44, 22, c("fire", 160));
  return finish(canvas, 0.1);
}

// ── Log bench: a split log with two end rings, nothing carved on it ──────────
export function drawBench(): PixelCanvas {
  const canvas = surface(66, 22);

  for (const [x, w] of [[9, 15], [41, 15]] as const) {
    roundRect(canvas, x - 1, 12, w + 2, 9, 4, inkSoft);
    roundRect(canvas, x, 13, w, 7, 3, c("woodDark"));
    hline(canvas, x + 1, 13, w - 2, c("wood"));
    hline(canvas, x + 1, 19, w - 2, c("woodDeep"));
    put(canvas, x + 2, 16, c("woodGrain"));
  }

  ellipse(canvas, 1, 2, 64, 19, inkSoft);
  ellipse(canvas, 1, 2, 63, 17, c("woodDark"));
  ellipse(canvas, 2, 3, 62, 16, c("wood"));
  hline(canvas, 5, 3, 54, c("woodLit"));
  hline(canvas, 3, 4, 58, c("woodLight"));
  hline(canvas, 3, 6, 58, c("woodMid"));
  hline(canvas, 3, 14, 58, c("woodDark"));
  hline(canvas, 4, 15, 56, c("woodDeep"));
  for (let i = 0; i < 5; i += 1) {
    const y = 7 + i;
    const x = 5 + Math.floor(noise(i, 2, 4) * 7);
    hline(canvas, x, y, 24 + Math.floor(noise(i, 5, 6) * 22), c("woodGrain", 130));
  }
  for (const cx of [3, 62]) logEnd(canvas, cx, 9, 5);
  return finish(canvas, 0.2);
}

// ── Canvas awning: a stretched sheet over four poles, open at the front ──────
export function drawTent(): PixelCanvas {
  const canvas = surface(140, 118);
  const apexX = 70;
  const apexY = 12;
  const floor = 100;
  const half = 58;

  ellipse(canvas, 12, floor - 4, 130, floor + 5, c("dirtDeep", 90));

  const edge = (y: number) => {
    const t = Math.pow((y - apexY) / (floor - apexY), 0.92);
    return Math.round(3 + t * half);
  };
  for (let y = apexY; y <= floor; y += 1) {
    const w = edge(y);
    hline(canvas, apexX - w, y, w * 2, c("canvasShade"));
    hline(canvas, apexX - w, y, Math.max(2, Math.round(w * 0.42)), c("canvasDeep", 140));
    hline(canvas, apexX - w + 3, y, w * 2 - 6, c("canvas"));
    if (w > 10) {
      hline(canvas, apexX + Math.round(w * 0.1), y, Math.round(w * 0.5), c("canvasLight"));
      hline(canvas, apexX + Math.round(w * 0.68), y, Math.max(1, Math.round(w * 0.2)), c("canvasShade"));
    }
  }
  // Seams running down the sheet, and the ridge pole on top.
  for (let y = apexY + 3; y <= floor; y += 1) {
    const t = Math.pow((y - apexY) / (floor - apexY), 0.92);
    for (const toX of [apexX - 30, apexX - 52, apexX + 24, apexX + 46] as const) {
      const x = Math.round(apexX + (toX - apexX) * t);
      put(canvas, x, y, toX < apexX ? c("canvasDeep", 110) : c("canvasLit", 120));
    }
  }
  for (let x = 14; x < 128; x += 1) {
    const depth = 1 + Math.floor(noise(x, 3, 8) * 3);
    for (let d = 0; d < depth; d += 1) put(canvas, x, floor + d, c("canvasShade"));
  }

  // The doorway: a dark arch with a wide open flap and a hanging lantern.
  for (let y = 44; y <= floor; y += 1) {
    const t = (y - 44) / (floor - 44);
    const w = Math.round(7 + t * 15);
    hline(canvas, apexX - w, y, w * 2, y > 58 ? c("ink") : c("inkSoft"));
  }
  for (let y = 50; y <= floor; y += 1) {
    const t = (y - 50) / (floor - 50);
    hline(canvas, apexX - 9 - Math.round(t * 3), y, 18 + Math.round(t * 6), c("ink", 235));
  }
  dither(canvas, 46, 88, 30, 10, c("bannerShade", 235), 1);
  hline(canvas, 46, 88, 30, c("banner"));
  hline(canvas, 47, 97, 28, c("ink"));
  // Wooden door frame and the bedroll behind the opening.
  rect(canvas, 55, 70, 30, 26, inkSoft);
  rect(canvas, 56, 71, 28, 25, c("woodDark"));
  rect(canvas, 57, 72, 26, 23, c("canvasShade"));
  rect(canvas, 58, 84, 24, 10, c("bannerShade", 220));
  rect(canvas, 58, 84, 24, 3, c("banner"));
  vline(canvas, 70, 72, 23, c("inkSoft"));
  put(canvas, 76, 76, c("brassLight"));
  // Lantern hanging from the ridge inside.
  rect(canvas, 62, 52, 12, 14, c("metalDeep"));
  rect(canvas, 63, 53, 10, 12, c("brassShade"));
  rect(canvas, 64, 54, 8, 9, c("lamp"));
  rect(canvas, 65, 56, 6, 6, c("fireCore"));
  hline(canvas, 62, 51, 12, c("brass"));
  vline(canvas, 67, 44, 7, c("metalDeep"));
  put(canvas, 64, 55, c("canvasLit"));

  // Poles, braces and the ropes that stake the sheet down.
  const pole = (x0: number, x1: number, y0: number, y1: number, width = 4) => {
    const steps = 60;
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      hline(canvas, x, y, width, c("woodDark"));
      hline(canvas, x, y, 1, c("woodLight"));
      put(canvas, x + width - 1, y, c("woodDeep"));
    }
  };
  pole(16, 30, 34, 104);
  pole(30, 16, 34, 104);
  pole(124, 110, 34, 104);
  pole(110, 124, 34, 104);
  for (const [x, y] of [[23, 66], [117, 66]] as const) {
    rect(canvas, x - 4, y, 9, 5, c("woodDeep"));
    hline(canvas, x - 3, y, 7, c("woodMid"));
    put(canvas, x, y + 2, c("woodLight"));
  }
  const rope = (x1: number, y1: number, x2: number, y2: number) => {
    const steps = 80;
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(x1 + ((x2 - x1) * i) / steps);
      const y = Math.round(y1 + ((y2 - y1) * i) / steps);
      put(canvas, x, y, c("woodMid"));
      if (i % 9 === 0) put(canvas, x, y, c("paper", 210));
    }
  };
  rope(apexX - 2, apexY + 3, 3, 98);
  rope(apexX + 2, apexY + 3, 137, 98);
  rope(apexX - 18, apexY + 12, 34, 102);
  rope(apexX + 18, apexY + 12, 106, 102);
  for (const [x, y] of [[2, 96], [135, 96], [33, 100], [105, 100]] as const) {
    rect(canvas, x, y, 3, 9, inkSoft);
    rect(canvas, x, y, 3, 8, c("woodDark"));
    hline(canvas, x - 1, y, 5, c("woodMid"));
    put(canvas, x, y, c("woodLight"));
  }
  // Ridge cap: one short pole end above the apex, no forked horns.
  hline(canvas, apexX - 4, 10, 9, c("woodDark"));
  hline(canvas, apexX - 3, 11, 7, c("woodMid"));
  hline(canvas, apexX - 2, 9, 5, c("woodLight"));
  put(canvas, apexX, 8, c("woodLit"));
  put(canvas, apexX - 1, 12, c("woodDeep"));
  return finish(canvas, 0.05);
}

// ── Guild banner on a pole ───────────────────────────────────────────────────
export function drawBanner(): PixelCanvas {
  const canvas = surface(28, 68);

  rect(canvas, 12, 3, 4, 62, inkSoft);
  rect(canvas, 13, 3, 2, 61, c("wood"));
  vline(canvas, 13, 3, 61, c("woodLight"));
  vline(canvas, 15, 3, 61, c("woodDark"));
  ellipse(canvas, 11, 2, 17, 7, c("woodDark"));
  put(canvas, 13, 2, c("woodLit"));

  hline(canvas, 4, 8, 20, c("woodDark"));
  hline(canvas, 4, 9, 20, c("woodMid"));
  hline(canvas, 4, 20, 20, c("brass"));
  for (let y = 10; y < 20; y += 1) {
    hline(canvas, 5, y, 18, c("banner"));
    hline(canvas, 5, y, 3, c("bannerShade"));
    hline(canvas, 20, y, 3, c("bannerShade", 200));
    hline(canvas, 9, y, 9, c("clothCrimsonLight", 90));
  }
  // A small stitched crest: a diamond ring with a spark.
  put(canvas, 14, 12, c("brassLight"));
  put(canvas, 13, 13, c("brassLight"));
  put(canvas, 15, 13, c("brassLight"));
  put(canvas, 14, 14, c("brassLight"));
  put(canvas, 12, 14, c("brass", 200));
  put(canvas, 16, 14, c("brass", 200));
  put(canvas, 14, 16, c("brass", 200));
  hline(canvas, 9, 21, 10, c("bannerShade"));
  for (let i = 0; i < 4; i += 1) {
    hline(canvas, 6 + i, 22 + i, 16 - i * 2, c("banner"));
    hline(canvas, 6 + i, 22 + i, 4, c("bannerShade", 200));
  }
  put(canvas, 13, 25, c("bannerShade"));
  put(canvas, 14, 26, c("bannerShade"));
  vline(canvas, 13, 27, 2, c("brass", 160));
  return finish(canvas, 0.24);
}

// ── Barrel ───────────────────────────────────────────────────────────────────
export function drawBarrel(): PixelCanvas {
  const canvas = surface(26, 32);

  roundRect(canvas, 2, 5, 22, 24, 6, inkSoft);
  roundRect(canvas, 3, 6, 20, 22, 6, c("wood"));
  vline(canvas, 3, 9, 16, c("woodLight"));
  vline(canvas, 22, 9, 16, c("woodDark"));
  for (let y = 7; y < 28; y += 3) hline(canvas, 4, y, 18, c("woodGrain", 120));
  ellipse(canvas, 3, 3, 23, 9, c("woodDark"));
  ellipse(canvas, 4, 4, 22, 8, c("woodMid"));
  hline(canvas, 6, 4, 14, c("woodLit"));
  for (const y of [9, 22] as const) {
    hline(canvas, 3, y, 20, c("metalDeep"));
    hline(canvas, 3, y + 1, 20, c("metalShade"));
    put(canvas, 3, y, c("metalLight"));
  }
  put(canvas, 12, 6, c("woodLit"));
  return finish(canvas, 0.22);
}

// ── Crystal obelisk: a stone plinth holding one tall and two small shards ────
export function drawCrystal(sea: boolean): PixelCanvas {
  const canvas = surface(32, 58);
  const deep = c(sea ? "seaDeep" : "violetDeep");
  const mid = c(sea ? "sea" : "violet");
  const light = c(sea ? "seaLight" : "violetLight");
  const lit = c(sea ? "seaLit" : "violetLit");

  // Plinth: two stacked stone blocks.
  roundRect(canvas, 3, 44, 26, 11, 2, inkSoft);
  pillow(canvas, 4, 45, 24, 9, 2, c("stone"), c("stoneLit"), c("stoneShade"));
  hline(canvas, 5, 46, 22, c("stoneLit"));
  hline(canvas, 5, 53, 22, c("stoneDeep"));
  roundRect(canvas, 5, 38, 22, 7, 2, inkSoft);
  pillow(canvas, 6, 39, 20, 5, 1, c("stone"), c("stoneLit"), c("stoneShade"));
  put(canvas, 8, 40, c("stoneLit"));

  const shard = (x: number, baseY: number, h: number, w: number) => {
    for (let row = 0; row < h; row += 1) {
      const t = row / h;
      const half = Math.max(0, Math.round((w / 2) * (1 - Math.pow(t, 1.6))));
      const y = baseY - row;
      hline(canvas, x - half, y, half * 2 + 1, mid);
      if (half > 0) {
        put(canvas, x - half, y, light);
        put(canvas, x + half, y, deep);
      }
      if (row === h - 1) put(canvas, x, y, lit);
    }
    hline(canvas, x - w, baseY, w * 2 + 1, deep);
  };
  shard(13, 41, 34, 4);
  shard(7, 41, 18, 3);
  shard(22, 41, 22, 3);
  // Inner light and the small sparks the shards throw.
  vline(canvas, 12, 16, 22, light);
  put(canvas, 13, 12, lit);
  put(canvas, 6, 30, lit);
  put(canvas, 23, 26, lit);
  put(canvas, 26, 20, light);
  put(canvas, 5, 18, light);
  put(canvas, 16, 6, lit);
  return finish(canvas, 0.18);
}

// ── Covered wagon with a notice board on the side ────────────────────────────
export function drawWagon(): PixelCanvas {
  const canvas = surface(150, 112);
  const floor = 106;

  const wheel = (cx: number, cy: number, r: number) => {
    ellipse(canvas, cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, inkSoft);
    ellipse(canvas, cx - r, cy - r, cx + r, cy + r, c("woodDark"));
    ellipse(canvas, cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1, c("wood"));
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
    put(canvas, cx - 2, cy - 2, c("metalLight"));
    put(canvas, cx - 1, cy - 1, c("brassLight"));
  };
  wheel(38, floor - 18, 18);
  wheel(114, floor - 18, 18);

  // Wooden bed and side rail.
  plank(canvas, 16, 58, 118, 22, 2);
  hline(canvas, 16, 58, 118, c("woodLight"));
  hline(canvas, 16, 59, 118, c("woodMid"));
  hline(canvas, 16, 76, 118, c("woodDark"));
  hline(canvas, 16, 77, 118, c("woodDeep"));
  hline(canvas, 16, 64, 118, c("woodDark", 170));
  hline(canvas, 16, 70, 118, c("woodDark", 150));
  for (let x = 22; x < 130; x += 13) vline(canvas, x, 60, 16, c("woodGrain", 170));
  for (const x of [15, 124] as const) {
    rect(canvas, x, 56, 8, 23, c("metalDeep"));
    rect(canvas, x + 1, 57, 6, 21, c("metalShade"));
    vline(canvas, x + 2, 58, 19, c("metal"));
    for (let i = 0; i < 3; i += 1) put(canvas, x + 4, 61 + i * 7, c("brassLight"));
  }

  // Canvas cover: a tall arch with visible ribs and a laced back.
  const arch = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - 10) / 46));
    const rise = Math.min(1, t * 1.3);
    return Math.round(58 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - rise, 3.1))));
  };
  for (let y = 10; y <= 60; y += 1) {
    const width = arch(y);
    if (width <= 0) continue;
    hline(canvas, 75 - width, y, width * 2 + 1, c("canvas"));
    hline(canvas, 75 - width, y, Math.round(width * 1.22), c("canvasShade"));
    hline(canvas, 75 - width, y, Math.max(2, Math.round(width * 0.42)), c("canvasDeep", 130));
    if (width > 18) hline(canvas, 75 + Math.round(width * 0.52), y, Math.round(width * 0.46), c("canvasLight"));
    if (y <= 11) hline(canvas, 75 - width, y, width * 2 + 1, c("canvasLit"));
    else if (y <= 13) hline(canvas, 75 - width, y, width * 2 + 1, c("canvasLight"));
    if (y >= 56) hline(canvas, 75 - width, y, width * 2 + 1, c("canvasShade", 180));
  }
  for (const rib of [-42, -21, 0, 21, 42] as const) {
    for (let y = 10; y <= 60; y += 1) {
      const width = arch(y);
      if (Math.abs(rib) > width - 1) continue;
      put(canvas, 75 + rib, y, c("canvasDeep", 210));
      put(canvas, 76 + rib, y, c("canvasLit", 110));
    }
  }
  for (const x of [47, 75, 103] as const) {
    for (let y = 10; y <= 60; y += 1) {
      if (Math.abs(x - 75) > arch(y) - 1) continue;
      put(canvas, x, y, c("clothLeather"));
      put(canvas, x + 1, y, c("clothLeatherShade"));
      if (y % 10 === 0) put(canvas, x, y, c("clothLeatherLight"));
    }
    if (Math.abs(x - 75) <= arch(18) - 2) {
      rect(canvas, x - 2, 18, 6, 5, c("metalShade"));
      rect(canvas, x - 1, 19, 4, 3, c("clothLeatherShade"));
      put(canvas, x - 2, 18, c("metalLight"));
    }
  }
  seam(canvas, 18, 61, 116);
  hline(canvas, 17, 62, 118, c("canvasShade", 170));

  // Shaft and the little step at the front.
  plank(canvas, 3, 66, 24, 5, 6);
  rect(canvas, 2, 69, 7, 10, c("woodDark"));
  hline(canvas, 2, 69, 7, c("woodLight"));
  hline(canvas, 2, 78, 7, c("woodDeep"));
  rect(canvas, 25, 62, 5, 13, c("metalShade"));
  put(canvas, 26, 64, c("metalLight"));

  // A board of pinned papers tied to the side.
  rect(canvas, 30, 44, 26, 20, inkSoft);
  rect(canvas, 31, 45, 24, 18, c("woodDark"));
  rect(canvas, 32, 46, 22, 16, c("wood"));
  hline(canvas, 32, 46, 22, c("woodLight"));
  hline(canvas, 32, 61, 22, c("woodDeep"));
  for (const [px, py, w, h] of [[33, 48, 8, 6], [43, 47, 9, 7], [34, 55, 7, 5], [44, 55, 8, 6]] as const) {
    rect(canvas, px, py, w, h, c("paper"));
    hline(canvas, px, py, w, c("paperShade"));
    put(canvas, px + 1, py + 2, c("paperLine"));
    put(canvas, px + 2, py + 4, c("paperLine"));
    put(canvas, px + Math.floor(w / 2), py, c("metal"));
  }

  // Hanging lantern at the front corner.
  vline(canvas, 20, 40, 6, c("metalDeep"));
  rect(canvas, 16, 45, 10, 13, inkSoft);
  rect(canvas, 17, 46, 8, 11, c("brassShade"));
  rect(canvas, 18, 47, 6, 8, c("lamp"));
  rect(canvas, 19, 49, 4, 5, c("fireCore"));
  hline(canvas, 16, 44, 10, c("brass"));
  put(canvas, 18, 47, c("canvasLit"));
  return finish(canvas, 0.08);
}

// ── Notice board on two posts ────────────────────────────────────────────────
export function drawNotice(): PixelCanvas {
  const canvas = surface(54, 60);

  for (const x of [8, 39] as const) {
    rect(canvas, x, 18, 6, 40, inkSoft);
    rect(canvas, x + 1, 18, 4, 39, c("wood"));
    vline(canvas, x + 1, 18, 39, c("woodLight"));
    vline(canvas, x + 4, 18, 39, c("woodDark"));
    for (let y = 24; y < 54; y += 8) put(canvas, x + 3, y, c("woodGrain"));
    ellipse(canvas, x - 2, 55, x + 8, 58, c("stoneShade"));
  }
  hline(canvas, 7, 32, 40, c("woodDark"));
  hline(canvas, 7, 33, 40, c("woodMid"));

  rect(canvas, 1, 4, 52, 28, inkSoft);
  rect(canvas, 2, 5, 50, 26, c("woodDark"));
  rect(canvas, 3, 6, 48, 24, c("wood"));
  hline(canvas, 3, 6, 48, c("woodLight"));
  hline(canvas, 3, 29, 48, c("woodDeep"));
  for (let y = 10; y < 28; y += 6) hline(canvas, 5, y, 44, c("woodGrain", 90));

  const paper = (x: number, y: number, w: number, h: number, tilt: number) => {
    rect(canvas, x, y, w, h, inkSoft);
    rect(canvas, x, y, w - 1, h - 1, c("paper"));
    hline(canvas, x, y, w - 1, c("canvasLit"));
    hline(canvas, x, y + h - 2, w - 1, c("paperShade"));
    for (let row = 2; row < h - 2; row += 2)
      hline(canvas, x + 1, y + row, Math.max(2, w - 3 - (row % 3)), c("paperLine"));
    put(canvas, x + Math.floor(w / 2) + tilt, y, c("metal"));
  };
  paper(6, 8, 14, 16, 0);
  paper(22, 7, 12, 13, 1);
  paper(36, 9, 12, 15, 0);
  paper(17, 20, 10, 8, 0);
  return finish(canvas, 0.2);
}

// ── Alchemy bench: bottles, a mortar and an open recipe book ─────────────────
export function drawAlchemy(): PixelCanvas {
  const canvas = surface(64, 48);

  for (const x of [6, 54] as const) {
    rect(canvas, x, 30, 4, 14, c("woodDark"));
    vline(canvas, x, 30, 14, c("woodMid"));
    hline(canvas, x - 2, 42, 8, c("woodDeep"));
  }
  plank(canvas, 4, 42, 56, 3, 4);

  rect(canvas, 1, 22, 62, 9, inkSoft);
  rect(canvas, 2, 23, 60, 7, c("woodMid"));
  hline(canvas, 2, 23, 60, c("woodLit"));
  hline(canvas, 2, 24, 60, c("woodLight"));
  hline(canvas, 2, 29, 60, c("woodDark"));
  for (let x = 5; x < 60; x += 7) put(canvas, x, 26, c("woodGrain", 120));

  // Open book.
  rect(canvas, 5, 16, 20, 8, inkSoft);
  rect(canvas, 6, 16, 18, 7, c("paper"));
  vline(canvas, 15, 16, 7, c("paperShade"));
  hline(canvas, 6, 16, 18, c("trimLight"));
  for (let row = 0; row < 2; row += 1) {
    hline(canvas, 8, 18 + row * 2, 6, c("paperLine"));
    hline(canvas, 17, 18 + row * 2, 5, c("paperLine"));
  }
  put(canvas, 15, 15, c("clothCrimson"));

  // Three bottles: violet, green and a squat brass flask.
  const bottle = (x: number, base: number, h: number, w: number, color: keyof typeof palette, light: keyof typeof palette) => {
    rect(canvas, x, base - h, w, h, rgba(palette[color], 235));
    vline(canvas, x, base - h, h, rgba(palette[light], 240));
    rect(canvas, x + 1, base - h - 3, Math.max(1, w - 2), 4, c("metalShade"));
    put(canvas, x + 1, base - h - 4, c("paper"));
    hline(canvas, x, base - 1, w, rgba(palette[color], 255));
    put(canvas, x + w - 1, base - 1, c("inkSoft"));
  };
  bottle(30, 23, 9, 5, "brew", "brewLight");
  bottle(37, 23, 12, 4, "violetLight", "violetLit");
  bottle(44, 23, 7, 5, "swatchSky", "trimLight");
  // Mortar and pestle.
  ellipse(canvas, 52, 15, 62, 24, inkSoft);
  ellipse(canvas, 52, 16, 61, 22, c("stoneShade"));
  ellipse(canvas, 53, 16, 60, 19, c("stone"));
  hline(canvas, 54, 16, 6, c("stoneLit"));
  hline(canvas, 54, 20, 6, c("stoneDeep"));
  for (let i = 0; i < 5; i += 1) put(canvas, 55 + i, 14 - (i % 2), c("clothTan"));
  put(canvas, 60, 12, c("clothTanShade"));

  // Mortar tools on a peg and a small candle.
  rect(canvas, 20, 6, 3, 11, c("metalShade"));
  hline(canvas, 19, 6, 5, c("metalLight"));
  put(canvas, 21, 17, c("metalDeep"));
  rect(canvas, 12, 9, 5, 8, c("paper"));
  hline(canvas, 12, 9, 5, c("trimLight"));
  put(canvas, 13, 8, c("fireLight"));
  put(canvas, 14, 7, c("fireCore"));
  return finish(canvas, 0.16);
}

// ── Painter's easel with a canvas and a bucket of paint ──────────────────────
export function drawEasel(): PixelCanvas {
  const canvas = surface(48, 64);

  for (let y = 22; y < 60; y += 1) {
    const spread = Math.round((y - 22) * 0.35);
    hline(canvas, 12 - spread, y, 3, c("woodDark"));
    hline(canvas, 33 + spread, y, 3, c("woodDark"));
    put(canvas, 12 - spread, y, c("woodLight"));
    put(canvas, 33 + spread, y, c("woodDeep"));
  }
  vline(canvas, 23, 24, 34, c("woodDark"));
  vline(canvas, 23, 24, 34, c("woodMid"));
  hline(canvas, 14, 44, 20, c("wood"));

  // Canvas on the easel.
  rect(canvas, 5, 4, 38, 26, inkSoft);
  rect(canvas, 6, 5, 36, 24, c("canvasLit"));
  rect(canvas, 7, 6, 34, 22, c("canvasLight"));
  hline(canvas, 7, 27, 34, c("canvasShade"));
  // A half-painted sky and hill.
  rect(canvas, 8, 7, 32, 8, c("swatchSky", 220));
  for (let i = 0; i < 16; i += 1) put(canvas, 8 + i * 2, 14 + (i % 2), c("swatchSage", 220));
  for (let i = 0; i < 12; i += 1) hline(canvas, 12 + i, 20 - Math.round(i / 3), 10 - Math.round(i / 2), c("leaf", 210));
  hline(canvas, 8, 24, 20, c("grass", 200));
  put(canvas, 33, 10, c("swatchRose"));
  put(canvas, 35, 12, c("swatchLilac"));
  hline(canvas, 5, 29, 38, c("wood"));
  hline(canvas, 5, 30, 38, c("woodDeep"));

  // Paint bucket with brushes.
  roundRect(canvas, 30, 46, 14, 12, 2, inkSoft);
  roundRect(canvas, 31, 46, 12, 11, 2, c("metalShade"));
  hline(canvas, 31, 46, 12, c("metalLight"));
  hline(canvas, 32, 49, 10, c("swatchRose"));
  hline(canvas, 32, 50, 10, c("bannerShade"));
  for (const [x, top, color] of [[34, 38, "swatchSky"], [37, 40, "swatchLilac"], [40, 37, "grassYellow"]] as const) {
    vline(canvas, x, top, 46 - top, c("woodLight"));
    put(canvas, x, top - 1, c(color));
    put(canvas, x, top - 2, c(color));
  }
  return finish(canvas, 0.18);
}

// ── Explorer's tripod telescope ──────────────────────────────────────────────
export function drawTelescope(): PixelCanvas {
  const canvas = surface(52, 66);

  for (let y = 26; y < 62; y += 1) {
    const spread = Math.round((y - 26) * 0.36);
    hline(canvas, 24 - spread, y, 3, c("woodDark"));
    hline(canvas, 25 + spread, y, 3, c("woodDark"));
    put(canvas, 24 - spread, y, c("woodLight"));
  }
  vline(canvas, 24, 40, 16, c("woodMid"));
  hline(canvas, 12, 60, 8, c("woodDeep"));
  hline(canvas, 33, 60, 8, c("woodDeep"));

  // Brass tube angled up to the left; three tapering sections.
  const tube = (x: number, y: number, len: number, wide: number, color: Rgba, light: Rgba) => {
    for (let i = 0; i < len; i += 1) {
      const ty = y - Math.round(i * 0.5);
      hline(canvas, x - i, ty, wide, color);
      hline(canvas, x - i, ty, 1, light);
    }
  };
  tube(32, 36, 14, 8, c("brassShade"), c("brass"));
  tube(30, 31, 12, 9, c("brass"), c("brassLight"));
  tube(28, 26, 12, 10, c("brassShade"), c("brass"));
  // Lens and eyepiece.
  for (let i = 0; i < 12; i += 1) {
    const x = 18 - 0 - Math.round(i * 0.0);
    put(canvas, x - 0, 22 - Math.round(i * 0.5), c("metalDeep"));
  }
  ellipse(canvas, 10, 12, 17, 20, c("metalDeep"));
  ellipse(canvas, 11, 13, 16, 19, c("brassLight"));
  put(canvas, 12, 14, c("trimLight"));
  put(canvas, 13, 15, c("swatchSky"));
  rect(canvas, 31, 39, 8, 4, c("brassShade"));
  hline(canvas, 31, 39, 8, c("brassLight"));
  // A finder scope on top.
  for (let i = 0; i < 8; i += 1) {
    put(canvas, 26 - i, 18 - Math.round(i * 0.5), c("metalShade"));
    put(canvas, 26 - i, 19 - Math.round(i * 0.5), c("metalLight"));
  }
  put(canvas, 18, 14, c("metalDeep"));
  return finish(canvas, 0.16);
}

// ── Firewood stack with an axe in the chopping stump ────────────────────────
export function drawFirewood(): PixelCanvas {
  const canvas = surface(52, 38);

  const log = (x: number, y: number, w: number, h: number, seed: number) => {
    roundRect(canvas, x - 1, y - 1, w + 2, h + 2, 2, inkSoft);
    roundRect(canvas, x, y, w, h, 2, c("woodDark"));
    hline(canvas, x + 1, y, w - 2, c("woodMid"));
    hline(canvas, x + 1, y + h - 1, w - 2, c("woodDeep"));
    for (let i = 0; i < 2; i += 1) put(canvas, x + 2 + Math.floor(noise(seed, i, 9) * (w - 4)), y + 1 + (i % 2), c("woodGrain"));
    put(canvas, x + 1, y + 1, c("woodLight"));
  };
  log(4, 26, 18, 8, 1);
  log(22, 26, 14, 8, 2);
  log(8, 18, 16, 8, 3);
  log(20, 18, 12, 7, 4);
  log(12, 11, 14, 7, 5);

  // Stump with a chopping block top.
  roundRect(canvas, 36, 12, 15, 22, 3, inkSoft);
  roundRect(canvas, 37, 12, 13, 21, 3, c("woodDark"));
  vline(canvas, 37, 14, 18, c("wood"));
  ellipse(canvas, 36, 9, 51, 16, c("woodMid"));
  ellipse(canvas, 37, 10, 50, 15, c("woodLight"));
  ellipse(canvas, 39, 11, 48, 14, c("woodLit"));
  put(canvas, 43, 12, c("woodDark"));
  put(canvas, 44, 12, c("wood"));

  // Axe: handle up, bit buried in the stump.
  for (let y = 4; y < 18; y += 1) {
    hline(canvas, 41 + Math.round(y * 0.08), y, 2, c("woodLight"));
    put(canvas, 42 + Math.round(y * 0.08), y, c("woodMid"));
  }
  for (let y = 3; y < 11; y += 1) {
    const half = 4 - Math.abs(y - 7);
    hline(canvas, 41 - half, y, half * 2 + 2, c("metal"));
    hline(canvas, 41 - half, y, 1, c("metalLight"));
    put(canvas, 41 + half, y, c("metalShade"));
  }
  hline(canvas, 37, 7, 9, c("metalDeep"));
  put(canvas, 41, 4, c("metalLight"));
  put(canvas, 3, 33, c("leaf"));
  put(canvas, 2, 34, c("leafDeep"));
  put(canvas, 49, 33, c("leafLight"));
  return finish(canvas, 0.2);
}

// ── Cauldron on three stones ────────────────────────────────────────────────
export function drawCauldron(): PixelCanvas {
  const canvas = surface(46, 42);

  for (const [x, y] of [[6, 30], [33, 30], [20, 34]] as const) {
    ellipse(canvas, x, y, x + 11, y + 9, inkSoft);
    ellipse(canvas, x + 1, y + 1, x + 10, y + 8, c("stoneShade"));
    ellipse(canvas, x + 2, y + 1, x + 9, y + 6, c("stone"));
    hline(canvas, x + 3, y + 2, 5, c("stoneLit"));
  }

  ellipse(canvas, 4, 10, 42, 34, inkSoft);
  ellipse(canvas, 5, 11, 41, 33, c("metalDeep"));
  ellipse(canvas, 6, 12, 40, 31, c("metalShade"));
  ellipse(canvas, 8, 13, 34, 27, c("metal"));
  hline(canvas, 10, 13, 20, c("metalLight"));
  hline(canvas, 8, 26, 30, c("metalDeep"));
  ellipse(canvas, 4, 8, 42, 18, c("inkSoft"));
  ellipse(canvas, 5, 8, 41, 16, c("metalShade"));
  ellipse(canvas, 6, 9, 40, 15, c("ink"));
  ellipse(canvas, 7, 10, 39, 14, c("brew"));
  hline(canvas, 9, 10, 26, c("brewLight"));
  put(canvas, 14, 12, c("brewLight"));
  put(canvas, 26, 11, c("brewLight"));
  put(canvas, 33, 13, c("brew"));
  // Bubbles rising, and a little wooden ladle.
  put(canvas, 18, 7, c("brewLight", 220));
  put(canvas, 23, 5, c("brewLight", 180));
  put(canvas, 30, 6, c("brewLight", 150));
  for (let i = 0; i < 5; i += 1) hline(canvas, 36 + i, 2 + Math.round(i * 0.5), 3, c("woodMid"));
  put(canvas, 41, 1, c("woodLight"));
  return finish(canvas, 0.16);
}

// ── Supply crates ───────────────────────────────────────────────────────────
export function drawCrates(): PixelCanvas {
  const canvas = surface(70, 58);

  const crate = (x: number, y: number, w: number, h: number, seed: number) => {
    rect(canvas, x - 1, y - 1, w + 2, h + 2, inkSoft);
    rect(canvas, x, y, w, h, c("wood"));
    hline(canvas, x, y, w, c("woodLight"));
    hline(canvas, x, y + 1, w, c("woodMid"));
    hline(canvas, x, y + h - 1, w, c("woodDeep"));
    for (let row = y + 3; row < y + h - 2; row += 4) hline(canvas, x + 1, row, w - 2, c("woodGrain", 85));
    const span = Math.min(w, h) - 5;
    for (let i = 0; i <= span; i += 1) {
      const dx = Math.round((i / span) * (w - 5));
      put(canvas, x + 2 + dx, y + 2 + i, c("woodDark", 200));
      put(canvas, x + w - 3 - dx, y + 2 + i, c("woodDark", 200));
    }
    vline(canvas, x, y, h, c("woodDark"));
    vline(canvas, x + w - 1, y, h, c("woodDeep"));
    for (const [cx, cy] of [[x, y], [x + w - 5, y], [x, y + h - 5], [x + w - 5, y + h - 5]] as const) {
      rect(canvas, cx, cy, 5, 5, c("metalDeep"));
      rect(canvas, cx + 1, cy + 1, 3, 3, c("metalShade"));
      put(canvas, cx + 1, cy + 1, c("metalLight"));
    }
    put(canvas, x + 2 + Math.floor(noise(seed, 1, 5) * (w - 6)), y + 3 + Math.floor(noise(seed, 2, 7) * (h - 8)), c("woodDark"));
  };

  crate(30, 24, 30, 30, 9);
  crate(2, 32, 28, 22, 3);
  crate(6, 12, 24, 20, 5);
  crate(34, 4, 22, 18, 7);

  // Rope coil on top of the stack.
  for (let ring = 0; ring < 3; ring += 1) {
    const rx = 10 - ring * 3;
    const ry = 5 - ring * 1.3;
    for (let i = 0; i <= 60; i += 1) {
      const angle = (i / 60) * Math.PI * 2;
      put(canvas, Math.round(46 + Math.cos(angle) * rx), Math.round(10 + Math.sin(angle) * ry), ring === 0 ? c("dirtLight") : c("dirtLit"));
    }
  }
  return finish(canvas, 0.14);
}

// ── Signpost with a lantern ─────────────────────────────────────────────────
export function drawSignpost(): PixelCanvas {
  const canvas = surface(30, 46);

  ellipse(canvas, 8, 38, 23, 43, inkSoft);
  ellipse(canvas, 9, 38, 22, 42, c("stoneShade"));
  ellipse(canvas, 10, 39, 21, 41, c("stone"));
  hline(canvas, 12, 39, 6, c("stoneLit"));

  rect(canvas, 12, 10, 6, 32, inkSoft);
  rect(canvas, 13, 10, 4, 31, c("wood"));
  vline(canvas, 13, 10, 31, c("woodLight"));
  vline(canvas, 16, 10, 31, c("woodDark"));
  for (let y = 14; y < 38; y += 6) put(canvas, 15, y, c("woodGrain"));

  rect(canvas, 1, 2, 25, 15, inkSoft);
  rect(canvas, 2, 3, 23, 13, c("woodDark"));
  rect(canvas, 3, 4, 21, 11, c("woodMid"));
  hline(canvas, 3, 4, 21, c("woodLight"));
  hline(canvas, 3, 14, 21, c("woodDeep"));
  hline(canvas, 6, 7, 12, c("paper"));
  hline(canvas, 6, 9, 9, c("paperShade"));
  hline(canvas, 6, 11, 11, c("paperShade"));
  for (let i = 0; i < 3; i += 1) {
    put(canvas, 22 + i, 8, c("woodLight"));
    put(canvas, 21 + i, 7 + i, c("woodLit"));
    put(canvas, 21 + i, 10 - i, c("woodLit"));
  }

  rect(canvas, 3, 19, 22, 9, inkSoft);
  rect(canvas, 4, 20, 20, 7, c("woodDark"));
  rect(canvas, 5, 21, 18, 5, c("wood"));
  hline(canvas, 5, 21, 18, c("woodLight"));
  hline(canvas, 5, 25, 18, c("woodDeep"));
  hline(canvas, 7, 23, 8, c("woodGrain"));

  rect(canvas, 18, 32, 8, 7, inkSoft);
  rect(canvas, 19, 33, 6, 5, c("metalShade"));
  rect(canvas, 20, 34, 4, 3, c("lamp"));
  hline(canvas, 18, 31, 8, c("metal"));
  put(canvas, 17, 34, c("lampGlow", 90));
  put(canvas, 26, 35, c("lampGlow", 90));
  return finish(canvas, 0.22);
}

// ── Bush ────────────────────────────────────────────────────────────────────
export function drawBush(): PixelCanvas {
  const canvas = surface(40, 28);

  for (const [cx, cy, r] of [[13, 20, 9], [24, 18, 10], [32, 22, 7]] as const) {
    dome(canvas, cx, cy, r + 1, Math.round(r * 0.9), inkSoft);
    dome(canvas, cx, cy, r, Math.round(r * 0.82), c("leafDeep"));
  }
  for (const [cx, cy, r] of [[13, 18, 8], [24, 16, 9], [31, 20, 6]] as const) {
    dome(canvas, cx, cy, r, Math.round(r * 0.8), c("leaf"));
  }
  for (const [cx, cy, r] of [[12, 16, 6], [23, 14, 7], [30, 18, 4]] as const) {
    dome(canvas, cx, cy, r, Math.round(r * 0.62), c("leafLight", 225));
    put(canvas, cx - 2, cy - r + 1, c("leafLit"));
    put(canvas, cx - 1, cy - r + 1, c("leafLit"));
  }
  for (let i = 0; i < 18; i += 1) {
    const x = 4 + Math.floor(noise(i, 1, 4) * 31);
    const y = 8 + Math.floor(noise(i, 2, 6) * 14);
    put(canvas, x, y, c("leafDeep", 210));
    put(canvas, x + 1, y - 1, c("leafLit", 190));
  }
  for (const [x, y] of [[14, 19], [26, 18], [22, 10], [31, 17]] as const) {
    put(canvas, x, y, c("banner"));
    put(canvas, x + 1, y, c("bannerShade"));
  }
  ellipse(canvas, 3, 23, 37, 27, c("grassDeepest", 55));
  return finish(canvas, 0.18);
}

// ── Mossy rock ──────────────────────────────────────────────────────────────
export function drawRock(): PixelCanvas {
  const canvas = surface(34, 24);

  const boulder = (x: number, y: number, w: number, h: number) => {
    ellipse(canvas, x - 1, y - 1, x + w + 1, y + h + 1, inkSoft);
    ellipse(canvas, x, y, x + w, y + h, c("stoneShade"));
    ellipse(canvas, x + 1, y + 1, x + w - 1, y + h - 1, c("stone"));
    ellipse(canvas, x + Math.round(w * 0.18), y + 1, x + Math.round(w * 0.68), y + Math.round(h * 0.42), c("stoneLight", 215));
    hline(canvas, x + Math.round(w * 0.3), y + 1, Math.round(w * 0.34), c("stoneLit", 215));
    put(canvas, x + Math.round(w * 0.55), y + Math.round(h * 0.5), c("stoneDeep"));
    put(canvas, x + Math.round(w * 0.58), y + Math.round(h * 0.66), c("stoneDeep"));
  };
  boulder(2, 6, 21, 14);
  boulder(18, 10, 13, 11);

  for (const [x, y] of [[6, 8], [8, 7], [11, 9], [21, 12], [24, 12], [9, 11]] as const) {
    put(canvas, x, y, c("leaf"));
    put(canvas, x + 1, y + 1, c("leafDeep"));
  }
  hline(canvas, 6, 8, 5, c("leafLight", 190));
  hline(canvas, 21, 12, 3, c("leafLight", 170));
  put(canvas, 1, 18, c("stoneLight"));
  put(canvas, 27, 18, c("stoneShade"));
  put(canvas, 14, 10, c("trimLight", 160));
  return finish(canvas, 0.2);
}

// ── Pine: four tiers of needles over a short trunk ──────────────────────────
export function drawPine(): PixelCanvas {
  const canvas = surface(48, 88);

  rect(canvas, 21, 62, 6, 22, c("woodDark"));
  vline(canvas, 21, 62, 22, c("wood"));
  vline(canvas, 26, 62, 22, c("woodDeep"));
  hline(canvas, 18, 82, 12, c("woodDeep"));

  const tier = (baseY: number, half: number, height: number) => {
    for (let row = 0; row < height; row += 1) {
      const t = row / height;
      const w = Math.round(half * Math.pow(t, 0.8));
      const y = baseY - row;
      hline(canvas, 24 - w, y, w * 2 + 1, c("leafDeep"));
      hline(canvas, 24 - w, y, Math.max(1, Math.round(w * 0.55)), c("leaf"));
      hline(canvas, 24 - w + 1, y, Math.max(1, Math.round(w * 0.22)), c("leafLight"));
      put(canvas, 24 + w, y, c("leafDeepest"));
      if (row % 5 === 0) put(canvas, 24 + Math.round(w * 0.5), y, c("leafDeepest"));
    }
    for (let x = 24 - half; x <= 24 + half; x += 1) {
      if (noise(x, baseY, 5) > 0.4) put(canvas, x, baseY + 1, c("leafDeepest"));
    }
  };
  tier(64, 22, 22);
  tier(50, 18, 20);
  tier(36, 14, 18);
  tier(24, 9, 16);
  put(canvas, 24, 6, c("leafLight"));
  put(canvas, 23, 8, c("leafLit"));
  put(canvas, 25, 9, c("leafLight"));
  return finish(canvas, 0.16);
}

// ── Oak: a rounded canopy on a thick trunk ──────────────────────────────────
export function drawOak(): PixelCanvas {
  const canvas = surface(68, 92);

  rect(canvas, 30, 58, 9, 30, c("woodDark"));
  vline(canvas, 30, 58, 30, c("wood"));
  vline(canvas, 35, 58, 30, c("woodGrain"));
  vline(canvas, 38, 58, 30, c("woodDeep"));
  hline(canvas, 25, 86, 19, c("woodDeep"));
  for (let i = 0; i < 3; i += 1) {
    const x = 27 + i * 4;
    put(canvas, x, 70 + i * 6, c("woodGrain"));
  }

  const lobes: [number, number, number, number][] = [
    [18, 66, 22, 20],
    [34, 62, 26, 24],
    [50, 68, 20, 18],
    [24, 46, 24, 24],
    [42, 44, 22, 22],
    [33, 30, 26, 22],
  ];
  for (const [cx, baseY, rx, ry] of lobes) {
    dome(canvas, cx, baseY, rx + 1, ry + 1, inkSoft);
    dome(canvas, cx, baseY, rx, ry, c("leafDeep"));
  }
  for (const [cx, baseY, rx, ry] of lobes) {
    dome(canvas, cx - 1, baseY - 2, Math.round(rx * 0.88), Math.round(ry * 0.8), c("leaf"));
  }
  for (const [cx, baseY, rx, ry] of lobes) {
    dome(canvas, cx - 2, baseY - 4, Math.round(rx * 0.6), Math.round(ry * 0.55), c("leafLight", 225));
    put(canvas, cx - Math.round(rx * 0.4), baseY - ry - 1, c("leafLit"));
  }
  for (let i = 0; i < 26; i += 1) {
    const x = 8 + Math.floor(noise(i, 3, 11) * 52);
    const y = 18 + Math.floor(noise(i, 4, 12) * 46);
    if (noise(i, 5, 13) > 0.5) put(canvas, x, y, c("leafDeepest", 200));
    else put(canvas, x, y, c("leafLit", 170));
  }
  put(canvas, 12, 84, c("grassDeep", 120));
  return finish(canvas, 0.14);
}
