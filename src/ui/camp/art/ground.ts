// The camp floor: one 16px tileset of grass and dirt, composed into a flat
// top-down meadow with a dirt cross-path through the fire pit. Tiles are plain
// text grids handed to pixlrt's tileset, so the layout below reads as the map.

import { PixelCanvas, tileset, type PaletteMap } from "pixlrt/core";
import { hline, noise, put, rect, rgba, type Rgba } from "./draw";
import { palette } from "./palette";

export const tileSize = 16;
export const mapCols = 56;
export const mapRows = 40;
/** 발밑 캠프의 중심 타일. 모닥불이 이 칸에 놓인다. */
export const mapCenter = { col: 28, row: 20 };

const tilePalette: PaletteMap = {
  ".": "transparent",
  a: palette.grass,
  b: palette.grassLight,
  c: palette.grassDark,
  d: palette.grassDeep,
  e: palette.dirt,
  f: palette.dirtLight,
  g: palette.dirtDark,
  h: palette.dirtDeep,
  i: palette.stone,
  j: palette.stoneShade,
  k: palette.leaf,
  l: palette.trimLight,
  m: palette.pollen,
};

const ink = (hex: string, alpha = 255): Rgba => rgba(hex, alpha);

/** 풀밭 한 칸. 넓게 번지는 얼룩과 두어 줌의 풀잎만 둔다. */
function grassTile(kind: "grass" | "grass2" | "grass3" | "tuft" | "flower" | "pebble") {
  const canvas = new PixelCanvas(tileSize, tileSize);
  const seed = { grass: 1, grass2: 5, grass3: 9, tuft: 13, flower: 17, pebble: 21 }[kind];
  rect(canvas, 0, 0, tileSize, tileSize, ink(palette.grass));
  // 2x2 얼룩: 큰 결만 남겨 잔풀 같은 잡음을 없앤다.
  for (let by = 0; by < tileSize; by += 4)
    for (let bx = 0; bx < tileSize; bx += 4) {
      const n = noise(bx, by, seed);
      if (n > 0.72) {
        for (let y = 0; y < 4; y += 1)
          for (let x = 0; x < 4; x += 1)
            if ((x + y) % 2 === 0) put(canvas, bx + x, by + y, ink(palette.grassDark));
      } else if (n < 0.3) {
        for (let y = 0; y < 4; y += 1)
          for (let x = 0; x < 4; x += 1)
            if ((x + y) % 2 === 0) put(canvas, bx + x, by + y, ink(palette.grassLight));
      }
    }

  const blade = (x: number, y: number) => {
    put(canvas, x, y, ink(palette.grassDeep));
    put(canvas, x, y - 1, ink(palette.grassDeep));
    put(canvas, x, y - 2, ink(palette.grassLight));
    put(canvas, x - 1, y, ink(palette.grassDark));
    put(canvas, x + 1, y, ink(palette.grassDark));
  };

  if (kind === "tuft") {
    blade(5, 11);
    blade(11, 7);
    blade(8, 14);
  }
  if (kind === "flower") {
    blade(5, 12);
    // 작은 흰 꽃 한 송이
    for (const [x, y] of [[8, 5], [7, 7], [9, 7], [8, 9]]) put(canvas, x, y, ink(palette.trimLight));
    put(canvas, 8, 7, ink(palette.pollen));
    put(canvas, 8, 11, ink(palette.grassDeep));
    put(canvas, 8, 10, ink(palette.grassDark));
  }
  if (kind === "pebble") {
    put(canvas, 4, 10, ink(palette.stone));
    put(canvas, 5, 10, ink(palette.stoneShade));
    put(canvas, 5, 9, ink(palette.stone));
    put(canvas, 11, 5, ink(palette.stoneShade));
    put(canvas, 11, 4, ink(palette.stone));
    blade(9, 12);
  }
  return canvas;
}

/** 흙 타일 하나. 풀과 맞닿은 쪽은 가장자리가 삐죽하게 물러난다. */
function dirtTile(edges: { n: boolean; e: boolean; s: boolean; w: boolean }, seed: number) {
  const canvas = new PixelCanvas(tileSize, tileSize);
  rect(canvas, 0, 0, tileSize, tileSize, ink(palette.dirt));
  // 흙은 가로 결로만 고르게 흔든다.
  for (let y = 0; y < tileSize; y += 1)
    for (let x = 0; x < tileSize; x += 1) {
      const n = noise(x * 0.5, y * 1.6, seed);
      if (n > 0.88) put(canvas, x, y, ink(palette.dirtLight));
      else if (n < 0.18) put(canvas, x, y, ink(palette.dirtDark));
    }
  // 밟혀서 반들거리는 자국
  for (let i = 0; i < 2; i += 1) {
    const y = 3 + Math.floor(noise(i, seed, 2) * 10);
    const x = 2 + Math.floor(noise(seed, i, 4) * 9);
    hline(canvas, x, y, 3, ink(palette.dirtLight));
  }
  // 자잘한 자갈
  for (let i = 0; i < 3; i += 1) {
    const x = 1 + Math.floor(noise(i * 3, seed, 6) * 13);
    const y = 1 + Math.floor(noise(seed, i * 3, 8) * 13);
    put(canvas, x, y, ink(palette.stoneShade));
    put(canvas, x + 1, y, ink(palette.stone));
  }
  // 풀과 맞닿은 가장자리: 흙 그늘 한 줄 위로 삐죽한 풀
  if (edges.n)
    for (let i = 0; i < tileSize; i += 1) {
      const depth = 1 + Math.floor(noise(i, seed, 9) * 3);
      for (let d = 0; d < depth; d += 1)
        put(canvas, i, d, ink(d === depth - 1 ? palette.grassDark : palette.grass));
      put(canvas, i, depth, ink(palette.dirtDeep));
    }
  if (edges.s)
    for (let i = 0; i < tileSize; i += 1) {
      const depth = 1 + Math.floor(noise(i, seed, 10) * 3);
      for (let d = 0; d < depth; d += 1)
        put(canvas, i, tileSize - 1 - d, ink(d === depth - 1 ? palette.grassDark : palette.grass));
      put(canvas, i, tileSize - 1 - depth, ink(palette.dirtDeep));
    }
  if (edges.w)
    for (let i = 0; i < tileSize; i += 1) {
      const depth = 1 + Math.floor(noise(seed, i, 11) * 3);
      for (let d = 0; d < depth; d += 1)
        put(canvas, d, i, ink(d === depth - 1 ? palette.grassDark : palette.grass));
      put(canvas, depth, i, ink(palette.dirtDeep));
    }
  if (edges.e)
    for (let i = 0; i < tileSize; i += 1) {
      const depth = 1 + Math.floor(noise(seed, i, 12) * 3);
      for (let d = 0; d < depth; d += 1)
        put(canvas, tileSize - 1 - d, i, ink(d === depth - 1 ? palette.grassDark : palette.grass));
      put(canvas, tileSize - 1 - depth, i, ink(palette.dirtDeep));
    }
  return canvas;
}

const asciiPalette: Record<string, Rgba> = Object.fromEntries(
  Object.entries(tilePalette)
    .filter(([, value]) => value !== "transparent")
    .map(([key, value]) => [key, ink(value as string)]),
);

function toAscii(canvas: PixelCanvas) {
  const rows: string[] = [];
  for (let y = 0; y < canvas.height; y += 1) {
    let row = "";
    for (let x = 0; x < canvas.width; x += 1) {
      const pixel = canvas.getPixel(x, y);
      let key = ".";
      if (pixel[3] > 0) {
        key =
          Object.entries(asciiPalette).find(
            ([, color]) =>
              color[0] === pixel[0] && color[1] === pixel[1] && color[2] === pixel[2],
          )?.[0] ?? "a";
      }
      row += key;
    }
    rows.push(row);
  }
  return rows.join("\n");
}

const grassKinds = ["grass", "grass2", "grass3", "tuft", "flower", "pebble"] as const;

const tiles: Record<string, string> = {};
for (const kind of grassKinds) tiles[kind] = toAscii(grassTile(kind));

for (let mask = 0; mask < 16; mask += 1) {
  const edges = {
    n: Boolean(mask & 1),
    e: Boolean(mask & 2),
    s: Boolean(mask & 4),
    w: Boolean(mask & 8),
  };
  const key =
    "dirt" + (edges.n ? "N" : "") + (edges.e ? "E" : "") + (edges.s ? "S" : "") + (edges.w ? "W" : "");
  tiles[key] = toAscii(dirtTile(edges, mask + 7));
}

export const campTiles = tileset({ tileSize, palette: tilePalette, tiles });

/** 흙길인가: 모닥불을 지나는 두 칸 폭의 십자 길. */
function isPath(col: number, row: number) {
  const dc = col < mapCenter.col ? mapCenter.col - 1 - col : col - mapCenter.col;
  const dr = row < mapCenter.row ? mapCenter.row - 1 - row : row - mapCenter.row;
  return dc <= 0 || dr <= 0;
}

function cellName(col: number, row: number) {
  if (isPath(col, row)) {
    const edges = {
      n: !isPath(col, row - 1),
      e: !isPath(col + 1, row),
      s: !isPath(col, row + 1),
      w: !isPath(col - 1, row),
    };
    return (
      "dirt" +
      (edges.n ? "N" : "") +
      (edges.e ? "E" : "") +
      (edges.s ? "S" : "") +
      (edges.w ? "W" : "")
    );
  }
  const n = noise(col, row, 11);
  const nearPath = Math.abs(col - mapCenter.col) <= 3 || Math.abs(row - mapCenter.row) <= 3;
  if (n > 0.95) return "flower";
  if (n < 0.07) return "tuft";
  if (nearPath && n > 0.8) return "pebble";
  if (n > 0.62) return "grass2";
  if (n < 0.28) return "grass3";
  return "grass";
}

export function groundLayout() {
  const rows: string[] = [];
  for (let row = 0; row < mapRows; row += 1) {
    const cells: string[] = [];
    for (let col = 0; col < mapCols; col += 1) cells.push(cellName(col, row));
    rows.push(cells.join(" "));
  }
  return rows.join("\n");
}
