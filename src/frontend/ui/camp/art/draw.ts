// Pixel primitives on pixlrt's PixelCanvas: every camp pixel is placed and
// outlined here, so tiles, props and crew share one pixel grid and one outline.

import { PixelCanvas, type Frame } from "pixlrt/core";

export type Rgba = [number, number, number, number];

export function rgba(hex: string, alpha = 255): Rgba {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

/** A blank transparent surface. */
export function surface(width: number, height: number) {
  return new PixelCanvas(width, height);
}

export function put(canvas: PixelCanvas, x: number, y: number, color: Rgba) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  canvas.setPixel(x, y, color);
}

/** Copy every opaque pixel of `source` onto `canvas` at (dx, dy), keeping the
 * source's own alpha so translucent passes stay translucent. */
export function stamp(
  canvas: PixelCanvas,
  source: Frame | PixelCanvas,
  dx: number,
  dy: number,
) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const pixel = source.getPixel(x, y);
      if (pixel[3] === 0) continue;
      put(canvas, dx + x, dy + y, pixel as Rgba);
    }
  }
}

export function rect(
  canvas: PixelCanvas,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgba,
) {
  for (let row = 0; row < height; row += 1)
    for (let col = 0; col < width; col += 1) put(canvas, x + col, y + row, color);
}

export function hline(
  canvas: PixelCanvas,
  x: number,
  y: number,
  width: number,
  color: Rgba,
) {
  rect(canvas, x, y, width, 1, color);
}

export function vline(
  canvas: PixelCanvas,
  x: number,
  y: number,
  height: number,
  color: Rgba,
) {
  rect(canvas, x, y, 1, height, color);
}

/** Filled ellipse inside the inclusive pixel box (x0, y0)–(x1, y1). */
export function ellipse(
  canvas: PixelCanvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgba,
) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = (x1 - x0 + 1) / 2;
  const ry = (y1 - y0 + 1) / 2;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.02) put(canvas, x, y, color);
    }
  }
}

/** A soft ground shadow: flat pixel ellipse, darkest in the middle rows. */
export function shadowEllipse(
  canvas: PixelCanvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = (x1 - x0 + 1) / 2;
  const ry = (y1 - y0 + 1) / 2;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1.02) continue;
      const alpha = Math.round(46 * (1 - d * 0.55));
      if (alpha <= 0) continue;
      const pixel = canvas.getPixel(x, y);
      if (pixel[3] > 0) continue;
      put(canvas, x, y, rgba(color, alpha));
    }
  }
}

/** Checkerboard dither inside a box: `parity` 0 or 1 picks the phase. */
export function dither(
  canvas: PixelCanvas,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgba,
  parity = 0,
) {
  for (let row = 0; row < height; row += 1)
    for (let col = 0; col < width; col += 1)
      if ((col + row) % 2 === parity) put(canvas, x + col, y + row, color);
}

/** 1px dark outline around everything opaque, then the art on top, padded by 1. */
export function outlined(source: PixelCanvas, color: Rgba, thickness = 1) {
  const padded = new PixelCanvas(
    source.width + thickness * 2,
    source.height + thickness * 2,
  );
  const ink = color;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (source.getPixel(x, y)[3] === 0) continue;
      for (let t = 1; t <= thickness; t += 1) {
        const px = x + thickness;
        const py = y + thickness;
        put(padded, px - t, py, ink);
        put(padded, px + t, py, ink);
        put(padded, px, py - t, ink);
        put(padded, px, py + t, ink);
      }
    }
  }
  stamp(padded, source, thickness, thickness);
  return padded;
}

/** Paint only where the target is still transparent (keeps earlier shapes). */
export function behind(
  canvas: PixelCanvas,
  source: PixelCanvas,
  dx: number,
  dy: number,
) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const pixel = source.getPixel(x, y);
      if (pixel[3] === 0) continue;
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= canvas.width || ty >= canvas.height) continue;
      if (canvas.getPixel(tx, ty)[3] > 0) continue;
      put(canvas, tx, ty, pixel as Rgba);
    }
  }
}

/** Deterministic pseudo-random in [0, 1) for tile and grass variation. */
export function noise(x: number, y: number, seed = 0) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}
