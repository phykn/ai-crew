// The camp floor is painted in world space, never tiled, so no grid can show.
// Grass is built from clumped blades, the path edge is overgrown instead of cut,
// and flowers, clover and pebbles share the same coordinate space.

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

const c = (key: keyof typeof palette, alpha = 255): Rgba => rgba(palette[key], alpha);

/** Low-frequency brightness field, computed on an 8px grid and interpolated. */
const coarseW = Math.ceil(width / 8) + 2;
const coarseH = Math.ceil(height / 8) + 2;
const coarse = (() => {
  const field = new Float32Array(coarseW * coarseH);
  for (let y = 0; y < coarseH; y += 1)
    for (let x = 0; x < coarseW; x += 1)
      field[y * coarseW + x] =
        noise(x, y, 17) * 0.5 + noise(x * 0.41 + 5, y * 0.41, 23) * 0.3 + noise(x * 0.13, y * 0.13 + 9, 29) * 0.2;
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

/** A cross path two tiles wide runs through the fire pit. */
export function isPathCell(col: number, row: number) {
  const dc = col < mapCenter.col ? mapCenter.col - 1 - col : col - mapCenter.col;
  const dr = row < mapCenter.row ? mapCenter.row - 1 - row : row - mapCenter.row;
  return dc <= 0 || dr <= 0;
}

function edgeJitter(x: number, y: number) {
  return (noise(x * 0.33, y * 0.33, 71) - 0.5) * 12 + (noise(x * 0.85, y * 0.85, 72) - 0.5) * 5;
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

// ── Dirt and grass mask ───────────────────────────────────────────────────────
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const jx = x + edgeJitter(x, y);
      const jy = y + edgeJitter(y, x);
      mask[y * width + x] = isPathCell(Math.floor(jx / tileSize), Math.floor(jy / tileSize)) ? 1 : 0;
    }
  }
  const dirtAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x];

// ── Base tones from the low-frequency field ───────────────────────────────────
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const patch = coarseAt(x, y);
      const dith = noise(x * 1.7, y * 1.7, 55);
      if (mask[y * width + x]) {
        const tone = noise(x * 0.5, y * 0.5, 5);
        let color = dirt;
        if (tone > 0.93) color = dirtLight;
        else if (tone < 0.07) color = dirtDark;
        if (patch > 0.62) color = dith > 0.45 ? dirtLight : dirt;
        else if (patch < 0.38) color = dith > 0.4 ? dirtDark : dirt;
        put(canvas, x, y, color);
      } else {
        let color = grass;
        if (patch > 0.56) color = dith > 0.42 ? grassLight : grass;
        else if (patch < 0.4) color = dith > 0.38 ? grassDark : grass;
        put(canvas, x, y, color);
      }
    }
  }

// ── Path edge, where grass creeps over the dirt ───────────────────────────────
  const ring = [
    [-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, -3], [-3, 3], [3, 3],
  ] as const;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) {
        let touches = 0;
        for (const [dx, dy] of ring) if (dirtAt(x + dx, y + dy)) touches += 1;
        if (touches >= 1 && noise(x, y, 63) > 0.35) put(canvas, x, y, grassDark);
        continue;
      }
      let grassNeighbours = 0;
      for (const [dx, dy] of ring) if (!dirtAt(x + dx, y + dy)) grassNeighbours += 1;
      if (!grassNeighbours) continue;
      const n = noise(x, y, 61);
      if (grassNeighbours >= 5) {
        if (n > 0.22) put(canvas, x, y, n > 0.7 ? grassLight : grassDeep);
        if (n > 0.7) put(canvas, x, y - 1, n > 0.9 ? c("grassLit") : grass);
      } else if (grassNeighbours >= 2) {
        if (n > 0.45) put(canvas, x, y, n > 0.8 ? grassDark : dirtDark);
      } else if (n > 0.78) {
        put(canvas, x, y, dirtDark);
      }
    }
  }

// ── Blades, grown in clumps ───────────────────────────────────────────────────
  const blade = (x: number, y: number, tall: number, lit: boolean) => {
    for (let i = 0; i < tall; i += 1) {
      put(canvas, x, y - i, i === tall - 1 ? c(lit ? "grassLit" : "grassLight") : c(lit ? "grassLight" : "grass"));
    }
    put(canvas, x - 1, y, c("grassDeep", 170));
    put(canvas, x + 1, y, c("grassDark", 150));
  };
  for (let i = 0; i < 2600; i += 1) {
    const cx = Math.floor(noise(i, 2, 81) * width);
    const cy = Math.floor(noise(2, i, 82) * height);
    if (dirtAt(cx, cy)) continue;
    const count = 5 + Math.floor(noise(i, 3, 83) * 8);
    for (let k = 0; k < count; k += 1) {
      const x = cx + Math.round((noise(i, k, 84) - 0.5) * 16);
      const y = cy + Math.round((noise(k, i, 85) - 0.5) * 12);
      if (dirtAt(x, y)) continue;
      blade(x, y, 2 + Math.floor(noise(i, k, 86) * 3), noise(k, i, 87) > 0.45);
    }
  }
  for (let i = 0; i < 9000; i += 1) {
    const x = Math.floor(noise(i, 4, 88) * width);
    const y = Math.floor(noise(4, i, 89) * height);
    if (dirtAt(x, y)) continue;
    put(canvas, x, y, noise(i, 5, 90) > 0.5 ? grassLight : grassDark);
    if (noise(i, 6, 91) > 0.8) { put(canvas, x, y - 1, c("grassLit")); if (noise(i, 7, 92) > 0.6) put(canvas, x, y - 2, c("grassLight", 170)); }
  }

// ── Flowers and clover ────────────────────────────────────────────────────────
  const flowers = [
    { petal: c("trimLight"), centre: c("lamp"), stem: c("leafDeep") },
    { petal: c("grassYellow"), centre: c("brass"), stem: c("leafDeep") },
    { petal: c("swatchLilac"), centre: c("paper"), stem: c("leafDeep") },
    { petal: c("swatchSky"), centre: c("paper"), stem: c("leafDeep") },
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
  for (let i = 0; i < 420; i += 1) {
    const x = Math.floor(noise(i, 7, 101) * width);
    const y = Math.floor(noise(7, i, 102) * height);
    if (dirtAt(x, y)) continue;
    const roll = noise(i, 8, 103);
    if (roll < 0.62) {
      const kind = flowers[Math.floor(noise(i, 9, 104) * flowers.length)];
      const count = 2 + Math.floor(noise(i, 10, 105) * 3);
      for (let k = 0; k < count; k += 1) {
        const bx = x + Math.round((noise(i, k, 106) - 0.5) * 14);
        const by = y + Math.round((noise(k, i, 107) - 0.5) * 11);
        if (dirtAt(bx, by)) continue;
        bloom(bx, by, kind, k === 0 && count > 2);
      }
      for (let k = 0; k < 6; k += 1) {
        const gx = x + Math.round((noise(k, i, 108) - 0.5) * 16);
        const gy = y + 2 + Math.round(noise(i, k, 109) * 4);
        if (!dirtAt(gx, gy)) put(canvas, gx, gy, c("grassDeep", 170));
      }
    } else {
      for (let k = 0; k < 5; k += 1) {
        const cx = x + Math.round((noise(i, k, 110) - 0.5) * 12);
        const cy = y + Math.round((noise(k, i, 111) - 0.5) * 9);
        if (!dirtAt(cx, cy)) clover(cx, cy);
      }
    }
  }

// ── Pebbles on the path ───────────────────────────────────────────────────────
  for (let i = 0; i < 700; i += 1) {
    const x = Math.floor(noise(i, 11, 121) * width);
    const y = Math.floor(noise(11, i, 122) * height);
    if (!dirtAt(x, y)) continue;
    const nearEdge =
      !dirtAt(x - 6, y) || !dirtAt(x + 6, y) || !dirtAt(x, y - 6) || !dirtAt(x, y + 6);
    if (!nearEdge && noise(i, 12, 123) < 0.55) continue;
    put(canvas, x, y, c("stone"));
    put(canvas, x + 1, y, c("stoneShade"));
    put(canvas, x, y - 1, c("stoneLight", 200));
    put(canvas, x + 1, y + 1, dirtDeep);
    if (noise(i, 13, 124) > 0.7) put(canvas, x + 2, y, dirtLit);
  }

// ── Trodden marks crossing the path ───────────────────────────────────────────
  for (let i = 0; i < 40; i += 1) {
    const x = Math.floor(noise(i, 14, 131) * width);
    const y = Math.floor(noise(14, i, 132) * height);
    if (!dirtAt(x, y)) continue;
    for (let k = 0; k < 4; k += 1) put(canvas, x + k, y, c("dirtLit", 150));
    put(canvas, x + 1, y + 1, c("dirtDeep", 150));
  }
  // Decals are painted with softened palettes; the meadow itself is opaque.
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const pixel = canvas.getPixel(x, y);
      if (pixel[3] !== 255) canvas.setPixel(x, y, [pixel[0], pixel[1], pixel[2], 255]);
    }
  return canvas;
}
