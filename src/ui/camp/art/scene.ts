// The camp art as the rest of the app uses it: one ground image, the props with
// their real pixel sizes, the crew poses and the roster portraits. Everything is
// drawn once from pixlrt and memoised, so the canvas stage, the CSS fallback and
// the avatar images all show the same pixels.

import { toDataURL, type Renderable } from "pixlrt/core";
import { crewHeight, crewWidth, drawCrew, type CrewPose } from "./crew";
import { campTiles, groundLayout } from "./ground";
import { drawBench, drawCampfire, drawCrates, drawTent, drawWagon } from "./props";
import { liveries } from "./palette";
import { surface, type Rgba } from "./draw";

export type ObjectKind = "campfire" | "bench" | "tent" | "wagon" | "crates";

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

/** 걷기·호흡·일하기 애니메이션의 프레임 순서. */
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

/** 이름표·대화창에 쓰는 얼굴: 머리와 어깨만 잘라 낸 같은 그림. */
export function crewPortrait(role: number) {
  const idle = drawCrew(liveries[role] ?? liveries[0], "idle1", role);
  const bust = surface(20, 20);
  for (let y = 0; y < 20; y += 1)
    for (let x = 0; x < 20; x += 1) {
      const pixel = idle.getPixel(x + 2, y + 1);
      if (pixel[3] > 0) bust.setPixel(x, y, pixel as Rgba);
    }
  return toDataURL(bust, { scale: 4 });
}

const objectCache = new Map<string, Renderable>();
export function objectArt(kind: ObjectKind, frame = 0) {
  const key = `${kind}:${frame}`;
  let art = objectCache.get(key);
  if (!art) {
    art =
      kind === "campfire"
        ? drawCampfire((frame % 3) as 0 | 1 | 2)
        : kind === "bench"
          ? drawBench()
          : kind === "tent"
            ? drawTent()
            : kind === "wagon"
              ? drawWagon()
              : drawCrates();
    objectCache.set(key, art);
  }
  return art;
}

/** 오브젝트의 실제 픽셀 크기. 캠프 좌표와 겹침 계산이 이 값을 쓴다. */
export function objectSize(kind: ObjectKind) {
  const art = objectArt(kind);
  return { w: art.width, h: art.height };
}

let ground: Renderable | null = null;
/** 캠프 바닥 전체(56x40 타일). 한 번만 그려 두고 캔버스와 CSS 폴백이 함께 쓴다. */
export function campGround() {
  if (!ground) ground = campTiles.scene(groundLayout());
  return ground;
}

/** 화면·CSS가 바로 쓸 수 있는 data URL. 픽셀은 rect로만 그려 확대해도 각이 산다. */
export function artDataUrl(art: Renderable, scale = 1) {
  return toDataURL(art, { scale });
}

export { crewHeight, crewWidth, type CrewPose };
