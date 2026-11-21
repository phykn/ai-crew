// Coordinates and sizes. The window size gives one scale for the whole camp:
// how many screen pixels one background pixel is. The clearing, the props and
// the crew all multiply by it, so every drawing keeps the same pixel density at
// any window size.

import { campBackground, crewArt } from "./art/scene";

export type StageSize = { width: number; height: number };
export type StagePoint = { x: number; y: number };

export const crewMinHeight = 56;
export const crewMaxHeight = 132;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Where the clearing sits on the stage. The painting keeps its own aspect and
 * covers the camp box, so a narrow panel crops the outer forest instead of
 * squashing the art.
 */
export function worldRect(size: StageSize) {
  const scale = Math.max(
    size.width / campBackground.width,
    size.height / campBackground.height,
  );
  const width = campBackground.width * scale;
  const height = campBackground.height * scale;
  return {
    scale,
    width,
    height,
    x: (size.width - width) / 2,
    y: (size.height - height) / 2,
  };
}

/** Camp percent coordinates to stage pixels. */
export function stagePoint(size: StageSize, point: StagePoint): StagePoint {
  const world = worldRect(size);
  return {
    x: world.x + (point.x / 100) * world.width,
    y: world.y + (point.y / 100) * world.height,
  };
}

/**
 * A crew member's height on screen. It keeps the clearing's own proportion, so a
 * crew member standing on a path is exactly as tall as the painted scenery
 * around it. The CSS camp's `--crew-h` uses the same value.
 */
export function crewHeight(size: StageSize) {
  return clamp(
    crewArt.height * worldRect(size).scale,
    crewMinHeight,
    crewMaxHeight,
  );
}

/** Screen pixels per background pixel; bench and fire sprites use it. */
export function artUnit(size: StageSize) {
  return worldRect(size).scale;
}

/** Warm light that fades with the distance from the fire. 0 to 1. */
export function fireLight(x: number, y: number, fire: StagePoint) {
  const reach = Math.hypot(x - fire.x, y - fire.y);
  return 1 - clamp(reach / 18, 0, 1) * 0.78;
}

/**
 * Depth key. A foot position further back sorts lower; equal positions break by
 * id so the order never flips between frames.
 */
export function sortZ(y: number, id: string) {
  const base = Math.round(clamp(y, 0, 100) * 100) * 1000;
  const tie = [...id].reduce(
    (sum, char) => (sum * 31 + char.charCodeAt(0)) % 997,
    7,
  );
  return base + tie;
}

/** Fire light flicker: several cycles so it never looks regular. */
export function flicker(time: number) {
  const a = Math.sin(time * 7.3) * 0.5 + 0.5;
  const b = Math.sin(time * 2.1 + 1.7) * 0.5 + 0.5;
  const c = Math.sin(time * 13.7 + 0.4) * 0.5 + 0.5;
  return 0.62 + a * 0.18 + b * 0.14 + c * 0.06;
}

/**
 * Whether WebGL is available. The check takes a canvas factory instead of making
 * its own canvas, so a test can drive both branches with a fake canvas.
 */
export function webglAvailable(
  createCanvas: () => { getContext: (id: string) => unknown } | null,
) {
  try {
    const canvas = createCanvas();
    if (!canvas) return false;
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
