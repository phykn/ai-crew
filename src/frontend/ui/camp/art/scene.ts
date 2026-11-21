// The camp art as the rest of the app uses it: one ground image, the props with
// their real pixel sizes, the crew poses and the roster portraits. Drawn once
// from pixlrt and memoised, so the canvas stage, the CSS fallback and the avatar
// images all show the same pixels.

import { toDataURL, type Renderable } from "pixlrt/core";
import { crewHeight, crewWidth, drawCrew, type CrewPose } from "./crew";
import { buildGround } from "./ground";
import {
  drawAlchemy,
  drawBanner,
  drawBarrel,
  drawBench,
  drawBush,
  drawCampfire,
  drawCauldron,
  drawCrates,
  drawCrystal,
  drawEasel,
  drawFirewood,
  drawNotice,
  drawOak,
  drawPine,
  drawRock,
  drawSignpost,
  drawTelescope,
  drawTent,
  drawWagon,
} from "./props";
import { liveries } from "./palette";
import { surface, type Rgba } from "./draw";

export type ObjectKind =
  | "campfire"
  | "bench"
  | "tent"
  | "banner"
  | "barrel"
  | "crystal"
  | "crystalSea"
  | "wagon"
  | "notice"
  | "alchemy"
  | "easel"
  | "telescope"
  | "firewood"
  | "cauldron"
  | "crates"
  | "signpost"
  | "bush"
  | "rock"
  | "pine"
  | "oak";

export const crewPoses = [
  "idle1",
  "idle2",
  "walk1",
  "walk2",
  "walk3",
  "walk4",
  "sit",
  "work1",
  "work2",
] as const satisfies readonly CrewPose[];

/** Frame order for breathing, walking and working. */
export const crewAnimations = {
  stand: ["idle1", "idle2"],
  walk: ["walk1", "walk2", "walk3", "walk4"],
  sit: ["sit"],
  work: ["work1", "work2"],
  watch: ["idle1", "idle2"],
  handoff: ["idle1"],
} as const satisfies Record<string, readonly CrewPose[]>;

const crewCache = new Map<string, Renderable>();
export function crewFrame(role: number, pose: CrewPose) {
  const key = `${role}:${pose}`;
  let frame = crewCache.get(key);
  if (!frame) {
    frame = drawCrew(liveries[role] ?? liveries[0], pose, role);
    crewCache.set(key, frame);
  }
  return frame;
}

/** Face for name tags and bubbles: head and shoulders cropped from the same art. */
export function crewPortrait(role: number) {
  const idle = drawCrew(liveries[role] ?? liveries[0], "idle1", role);
  const bust = surface(20, 20);
  for (let y = 0; y < 20; y += 1)
    for (let x = 0; x < 20; x += 1) {
      const pixel = idle.getPixel(x + 6, y + 1);
      if (pixel[3] > 0) bust.setPixel(x, y, pixel as Rgba);
    }
  return toDataURL(bust, { scale: 4 });
}

const objectCache = new Map<string, Renderable>();
export function objectArt(kind: ObjectKind, frame = 0) {
  const key = `${kind}:${frame}`;
  let art = objectCache.get(key);
  if (!art) {
    art = objectFrame(kind, frame);
    objectCache.set(key, art);
  }
  return art;
}

function objectFrame(kind: ObjectKind, frame: number) {
  switch (kind) {
    case "campfire":
      return drawCampfire((frame % 3) as 0 | 1 | 2);
    case "bench":
      return drawBench();
    case "tent":
      return drawTent();
    case "banner":
      return drawBanner();
    case "barrel":
      return drawBarrel();
    case "crystal":
      return drawCrystal(false);
    case "crystalSea":
      return drawCrystal(true);
    case "wagon":
      return drawWagon();
    case "notice":
      return drawNotice();
    case "alchemy":
      return drawAlchemy();
    case "easel":
      return drawEasel();
    case "telescope":
      return drawTelescope();
    case "firewood":
      return drawFirewood();
    case "cauldron":
      return drawCauldron();
    case "crates":
      return drawCrates();
    case "signpost":
      return drawSignpost();
    case "bush":
      return drawBush();
    case "rock":
      return drawRock();
    case "pine":
      return drawPine();
    default:
      return drawOak();
  }
}

/** Real pixel size of a prop; camp coordinates and overlap checks use it. */
export function objectSize(kind: ObjectKind) {
  const art = objectArt(kind);
  return { w: art.width, h: art.height };
}

let ground: Renderable | null = null;
/** The whole floor, drawn once and shared by the canvas stage and the CSS fallback. */
export function campGround() {
  if (!ground) ground = buildGround();
  return ground;
}

/** A data URL for the DOM and CSS; drawn with rects only so it stays crisp when scaled. */
export function artDataUrl(art: Renderable, scale = 1) {
  return toDataURL(art, { scale });
}

export { crewHeight, crewWidth, type CrewPose };
