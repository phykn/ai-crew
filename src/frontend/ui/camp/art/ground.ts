// The camp floor is painted in world space, never tiled, so no grid can show.
// The fire sits on one soft sand clearing in an open meadow, grass grows over its
// scalloped edge, and flowers, clover and pebbles share the same coordinate space.

import { PixelCanvas } from "pixlrt/core";
import { noise, put, rgba, surface, type Rgba } from "./draw";
import { palette } from "./palette";

export const tileSize = 24;
export const mapCols = 56;
export const mapRows = 40;
/** The camp's centre tile; the campfire sits on it. */
export const mapCenter = { col: 28, row: 20 };

const width = mapCols * tileSize;
const height = mapRows * tileSize;

/** Half-width and half-height of the sand clearing under the fire, in pixels. */
const clearingX = 132;
const clearingY = 80;

const centreX = mapCenter.col * tileSize + tileSize / 2;
const centreY = mapCenter.row * tileSize + tileSize / 2;

const c = (key: keyof typeof palette, alpha = 255): Rgba => rgba(palette[key], alpha);

/** Stable scatter for placement; a sine hash repeats in stripes at these counts. */
function rand(index: number, salt = 0) {
  let value = (index * 1664525 + salt * 1013904223) | 0;
  value = Math.imul(value ^ (value >>> 15), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Low-frequency brightness field, computed on an 8px grid and interpolated. */
const coarseW = Math.ceil(width / 8) + 2;
const coarseH = Math.ceil(height / 8) + 2;
const coarse = (() => {
  const field = new Float32Array(coarseW * coarseH);
  for (let y = 0; y < coarseH; y += 1)
    for (let x = 0; x < coarseW; x += 1)
      field[y * coarseW + x] =
        noise(x * 0.8, y * 0.8, 17) * 0.5 + noise(x * 0.27 + 5, y * 0.27, 23) * 0.32 + noise(x * 0.09, y * 0.09 + 9, 29) * 0.18;
  return field;
})();

function coarseAt(x: number, y: number) {
  const gx = x / 8;
  const gy = y / 8;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const at = (cx: number, cy: number) => coarse[cy * coarseW + cx] ?? 0.5;
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** A slow ribbon around the clearing, so the sand's outline is wavy, not noisy. */
function edgeAt(x: number, y: number) {
  const dx = (x - centreX) / clearingX;
  const dy = (y - centreY) / clearingY;
  const angle = Math.atan2(dy, dx);
  const ribbon =
    Math.sin(angle * 3.1 + 1.7) * 0.055 +
    Math.sin(angle * 5.7 - 0.4) * 0.03 +
    (noise(x * 0.03, y * 0.03, 91) - 0.5) * 0.14;
  return Math.hypot(dx, dy) + ribbon;
}

export function buildGround(): PixelCanvas {
  const canvas = surface(width, height);
  const grass = c("grass");
  const grassDark = c("grassDark");
  const grassLight = c("grassLight");
  const grassDeep = c("grassDeep");
  const dirt = c("dirt");
  const dirtDark = c("dirtDark");
  const dirtLight = c("dirtLight");
  const dirtDeep = c("dirtDeep");
  const dirtLit = c("dirtLit");

  // ── Meadow base: broad light and dark patches, never a flat fill ────────────
  const sand = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = edgeAt(x, y);
      if (edge < 1) sand[y * width + x] = 1;
      const patch = coarseAt(x, y);
      const dith = noise(x * 1.9, y * 1.9, 55);
      if (edge < 1) {
        // Sand lightens toward the fire and darkens into the trampled rim.
        let color = dirtLight;
        if (edge < 0.3) color = noise(x * 0.7, y * 0.7, 56) > 0.4 ? dirtLit : dirtLight;
        else if (edge < 0.62) color = noise(x * 0.9, y * 0.9, 57) > 0.5 ? dirtLight : dirt;
        else if (edge < 0.86) color = noise(x * 0.8, y * 0.8, 58) > 0.45 ? dirt : dirtLight;
        else color = noise(x * 1.1, y * 1.1, 59) > 0.4 ? dirtDark : dirt;
        if (patch > 0.72) color = edge < 0.6 ? dirtLit : dirtLight;
        else if (patch < 0.28) color = edge > 0.6 ? dirtDark : dirt;
        put(canvas, x, y, color);
      } else {
        let color = grass;
        if (patch > 0.64) color = dith > 0.45 ? grassLight : grass;
        else if (patch < 0.46) color = dith > 0.5 ? grassDark : grass;
        else if (patch < 0.3) color = dith > 0.5 ? grassDeep : grassDark;
        put(canvas, x, y, color);
      }
    }
  }
  const sandAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : sand[y * width + x];

  // ── Scalloped rim: a dark lip inside the sand, tufts leaning over it ──────
  for (let step = 0; step < 150; step += 1) {
    const angle = (step / 150) * Math.PI * 2 + rand(step, 3) * 0.04;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let reach = 40;
    for (let r = 40; r < 230; r += 1) {
      if (edgeAt(centreX + cos * r, centreY + sin * r) >= 1) {
        reach = r;
        break;
      }
    }
    const edgeX = centreX + cos * reach;
    const edgeY = centreY + sin * reach;
    // Dark, hard-packed lip just inside the sand.
    for (let depth = 0; depth < 4; depth += 1) {
      const x = Math.round(edgeX - cos * depth);
      const y = Math.round(edgeY - sin * depth);
      if (rand(step * 7 + depth, 5) > 0.35) put(canvas, x, y, depth < 2 ? dirtDark : dirt);
    }
    // Grass tufts at the boundary, two blades and a shadow each.
    const tufts = 2 + Math.floor(rand(step, 6) * 2);
    for (let k = 0; k < tufts; k += 1) {
      const along = (rand(step * 5 + k, 7) - 0.5) * 10;
      const bx = Math.round(edgeX + Math.cos(angle + 1.57) * along);
      const by = Math.round(edgeY + Math.sin(angle + 1.57) * along);
      const tall = 3 + Math.floor(rand(step * 3 + k, 8) * 4);
      for (let i = 0; i < tall; i += 1) {
        put(canvas, bx, by - i, i === tall - 1 ? c("grassLit") : c("grassLight"));
        put(canvas, bx + 1, by - i, c("grassDeep"));
      }
    }
  }

  // ── Shade clumps and light scrub break up the meadow ──────────────────────
  for (let i = 0; i < 320; i += 1) {
    const cx = Math.floor(rand(i, 11) * width);
    const cy = Math.floor(rand(i, 12) * height);
    if (sandAt(cx, cy)) continue;
    const rx = 4 + Math.floor(rand(i, 13) * 9);
    const ry = 2 + Math.floor(rand(i, 14) * 3);
    for (let dy = -ry; dy <= ry; dy += 1)
      for (let dx = -rx; dx <= rx; dx += 1) {
        if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue;
        if (sandAt(cx + dx, cy + dy)) continue;
        if (rand(i * 31 + dx * 3 + dy, 15) > 0.5) put(canvas, cx + dx, cy + dy, grassDeep);
      }
  }

  // ── Blades in fans, one clump at a time ────────────────────────────────────
  const blade = (x: number, y: number, tall: number, lean: number) => {
    for (let i = 0; i < tall; i += 1) {
      const bx = x + Math.round((lean * i) / Math.max(1, tall));
      put(canvas, bx, y - i, i === tall - 1 ? c("grassLit") : c("grassLight"));
      put(canvas, bx + 1, y - i, c("grassDark"));
    }
    put(canvas, x, y, c("grassDeep"));
  };
  for (let i = 0; i < 1400; i += 1) {
    const cx = Math.floor(rand(i, 21) * width);
    const cy = Math.floor(rand(i, 22) * height);
    if (sandAt(cx, cy)) continue;
    const count = 3 + Math.floor(rand(i, 23) * 4);
    for (let k = 0; k < count; k += 1) {
      const x = cx + Math.round((rand(i * 9 + k, 24) - 0.5) * 14);
      const y = cy + Math.round((rand(i * 9 + k, 25) - 0.5) * 9);
      if (sandAt(x, y)) continue;
      const tall = 3 + Math.floor(rand(i * 5 + k, 26) * 3);
      const lean = Math.round((rand(k * 7 + i, 27) - 0.5) * 3);
      blade(x, y, tall, lean);
    }
  }
  for (let i = 0; i < 7000; i += 1) {
    const x = Math.floor(rand(i, 31) * width);
    const y = Math.floor(rand(i, 32) * height);
    if (sandAt(x, y)) continue;
    put(canvas, x, y, rand(i, 33) > 0.5 ? grassLight : grassDark);
    if (rand(i, 34) > 0.9) put(canvas, x, y - 1, c("grassLit"));
  }

  // ── Flowers, clover and mushrooms ──────────────────────────────────────────
  const flowers = [
    { petal: c("trimLight"), centre: c("lamp") },
    { petal: c("grassYellow"), centre: c("brass") },
    { petal: c("swatchLilac"), centre: c("paper") },
    { petal: c("swatchSky"), centre: c("paper") },
    { petal: c("swatchRose"), centre: c("fireCore") },
  ];
  const bloom = (x: number, y: number, kind: (typeof flowers)[number], big: boolean) => {
    put(canvas, x, y + 2, c("leafDeep"));
    put(canvas, x, y + 1, c("leaf"));
    put(canvas, x - 1, y + 2, c("leafLight", 190));
    if (big) {
      put(canvas, x, y + 3, c("leafDeep"));
      put(canvas, x + 1, y + 3, c("leaf", 200));
    }
    put(canvas, x - 1, y, kind.petal);
    put(canvas, x + 1, y, kind.petal);
    put(canvas, x, y - 1, kind.petal);
    put(canvas, x, y + 1, kind.petal);
    put(canvas, x - 1, y - 1, rgba(palette.trimLight, 170));
    put(canvas, x, y, kind.centre);
    if (big) {
      put(canvas, x - 2, y, rgba(palette.trimLight, 90));
      put(canvas, x + 2, y, rgba(palette.trimLight, 90));
      put(canvas, x, y - 2, rgba(palette.trimLight, 110));
      put(canvas, x, y + 2, c("leafLight", 150));
    }
  };
  const clover = (x: number, y: number) => {
    put(canvas, x, y + 1, c("leafDeep"));
    put(canvas, x, y + 2, c("leafDeep"));
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]] as const) {
      put(canvas, x + dx, y + dy, c("leaf"));
      if (dy !== 0) put(canvas, x + dx, y + dy - 1, c("leafLight", 210));
    }
    put(canvas, x, y, c("leafLit", 220));
  };
  const mushroom = (x: number, y: number, red: boolean) => {
    put(canvas, x, y + 1, c("trimShade"));
    put(canvas, x, y + 2, c("canvasShade"));
    put(canvas, x - 1, y, c(red ? "banner" : "clothTan"));
    put(canvas, x + 1, y, c(red ? "banner" : "clothTan"));
    put(canvas, x, y - 1, c(red ? "bannerShade" : "clothTanShade"));
    put(canvas, x, y, c(red ? "swatchRose" : "clothTanLight", 200));
  };
  for (let i = 0; i < 380; i += 1) {
    const x = Math.floor(rand(i, 41) * width);
    const y = Math.floor(rand(i, 42) * height);
    if (sandAt(x, y)) continue;
    const roll = rand(i, 43);
    if (roll < 0.55) {
      const kind = flowers[Math.floor(rand(i, 44) * flowers.length)];
      const count = 2 + Math.floor(rand(i, 45) * 4);
      for (let k = 0; k < count; k += 1) {
        const bx = x + Math.round((rand(i * 3 + k, 46) - 0.5) * 16);
        const by = y + Math.round((rand(k * 5 + i, 47) - 0.5) * 12);
        if (sandAt(bx, by)) continue;
        bloom(bx, by, kind, k === 0 && count > 2);
      }
      for (let k = 0; k < 6; k += 1) {
        const gx = x + Math.round((rand(k * 7 + i, 48) - 0.5) * 18);
        const gy = y + 2 + Math.round(rand(i * 9 + k, 49) * 5);
        if (!sandAt(gx, gy)) put(canvas, gx, gy, c("grassDeep", 170));
      }
    } else if (roll < 0.9) {
      for (let k = 0; k < 6; k += 1) {
        const cx = x + Math.round((rand(i * 11 + k, 50) - 0.5) * 14);
        const cy = y + Math.round((rand(k * 13 + i, 51) - 0.5) * 10);
        if (!sandAt(cx, cy)) clover(cx, cy);
      }
    } else {
      mushroom(x, y, rand(i, 52) > 0.45);
      if (rand(i, 53) > 0.55) mushroom(x + 3, y + 1, false);
    }
  }

  // ── Pebbles, twigs and ash around the fire ─────────────────────────────────
  for (let i = 0; i < 420; i += 1) {
    const x = Math.floor(centreX + (rand(i, 61) - 0.5) * clearingX * 2.3);
    const y = Math.floor(centreY + (rand(i, 62) - 0.5) * clearingY * 2.6);
    const edge = edgeAt(x, y);
    if (edge > 1 || edge < 0.18) continue;
    if (edge > 0.95 && rand(i, 63) < 0.5) continue;
    put(canvas, x, y, c("stone"));
    put(canvas, x + 1, y, c("stoneShade"));
    put(canvas, x, y - 1, c("stoneLight", 200));
    put(canvas, x + 1, y + 1, dirtDeep);
    if (rand(i, 64) > 0.7) put(canvas, x + 2, y, dirtLit);
  }
  for (let i = 0; i < 26; i += 1) {
    const x = Math.floor(centreX + (rand(i, 71) - 0.5) * clearingX * 2);
    const y = Math.floor(centreY + (rand(i, 72) - 0.5) * clearingY * 2.1);
    if (edgeAt(x, y) > 0.88) continue;
    const len = 3 + Math.floor(rand(i, 73) * 4);
    const tilt = rand(i, 74) > 0.5 ? 1 : -1;
    for (let k = 0; k < len; k += 1) put(canvas, x + k, y + (k % 2) * tilt, c("woodGrain", 200));
  }
  // Decals are painted with softened palettes; the meadow itself is opaque.
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const pixel = canvas.getPixel(x, y);
      if (pixel[3] !== 255) canvas.setPixel(x, y, [pixel[0], pixel[1], pixel[2], 255]);
    }
  return canvas;
}
