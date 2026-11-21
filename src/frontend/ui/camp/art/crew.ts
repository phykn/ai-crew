// The nine crew bodies, drawn as real frames rather than squashed art: two
// breathing frames, four walk frames, one seated frame and two work frames.
// Every span is a pixel count on the same 24-wide grid, so the head, waist,
// knees and boots sit on the same rows in every pose.

import { PixelCanvas } from "pixlrt/core";
import {
  hline,
  outlined,
  put,
  rect,
  rgba,
  shadowEllipse,
  stamp,
  surface,
  vline,
} from "./draw";
import { palette, type Livery } from "./palette";

export const crewWidth = 24;
export const crewHeight = 36;

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

const ink = rgba(palette.outline);
const soft = rgba(palette.outlineSoft);

// 몸의 중심은 11.5칸. 머리 12칸, 몸통 10칸, 어깨 16칸, 다리 두 짝은 사이를 비운다.
const headRows: [number, number][] = [
  [9, 14],
  [8, 15],
  [7, 16],
  [6, 17],
  [6, 17],
  [6, 17],
  [6, 17],
  [6, 17],
  [6, 17],
  [6, 17],
  [7, 16],
  [8, 15],
];
const torsoRows: [number, number][] = [
  [8, 15],
  [7, 16],
  [7, 16],
  [7, 16],
  [7, 16],
  [7, 16],
  [7, 16],
  [7, 16],
  [8, 15],
];

function spans(
  canvas: PixelCanvas,
  rows: [number, number][],
  y0: number,
  color: ReturnType<typeof rgba>,
  dx: number,
  dy: number,
) {
  rows.forEach(([x0, x1], index) => {
    hline(canvas, x0 + dx, y0 + index + dy, x1 - x0 + 1, color);
  });
}

type Body = {
  livery: Livery;
  upper: number;
  lean: number;
  legDx: [number, number];
  bootLift: [number, number];
  handDy: [number, number];
  seated: boolean;
  work: boolean;
  blink: boolean;
};

function drawLeg(canvas: PixelCanvas, x: number, lift: number, dx: number) {
  const pants = rgba(palette.pants);
  const pantsShade = rgba(palette.pantsShade);
  const boot = rgba(palette.boots);
  const bootShade = rgba(palette.bootsShade);
  const bottom = 31 - lift;
  rect(canvas, x + dx, 23, 4, bottom - 2 - 23, pants);
  vline(canvas, x + dx + 3, 23, bottom - 2 - 23, pantsShade);
  // 부츠: 발끝이 바깥으로 한 칸, 위쪽 한 줄은 밝게.
  rect(canvas, x + dx, bottom - 2, 4, 3, boot);
  hline(canvas, x + dx, bottom - 2, 4, rgba(palette.woodLight));
  hline(canvas, x + dx, bottom, 4, bootShade);
}

function drawArm(
  canvas: PixelCanvas,
  livery: Livery,
  x: number,
  dy: number,
  handDrop: number,
) {
  const cloth = rgba(livery.cloth);
  const shade = rgba(livery.clothShade);
  rect(canvas, x, 14 + dy, 4, 7, cloth);
  vline(canvas, x + (x < 12 ? 3 : 0), 14 + dy, 7, shade);
  rect(canvas, x, 20 + dy + handDrop, 3, 3, rgba(livery.skin));
  hline(canvas, x, 22 + dy + handDrop, 3, rgba(palette.skinShade));
}

function drawHead(canvas: PixelCanvas, body: Body) {
  const { livery, upper, lean, blink } = body;
  const dy = upper;
  const dx = lean;
  const skin = rgba(livery.skin);
  const shade = rgba(palette.skinShade);
  const deep = rgba(palette.skinDeep);

  rect(canvas, 11 + dx, 11 + dy, 2, 3, shade);
  spans(canvas, headRows, 1, skin, dx, dy);
  // 턱 그늘 한 줄과 볼
  hline(canvas, 10 + dx, 12 + dy, 4, shade);
  put(canvas, 7 + dx, 9 + dy, rgba(palette.skinShade, 180));
  put(canvas, 16 + dx, 9 + dy, rgba(palette.skinShade, 180));
  // 눈: 2x2, 왼쪽 위 한 점의 빛
  if (blink) {
    hline(canvas, 8 + dx, 8 + dy, 2, deep);
    hline(canvas, 14 + dx, 8 + dy, 2, deep);
  } else {
    rect(canvas, 8 + dx, 8 + dy, 2, 2, ink);
    rect(canvas, 14 + dx, 8 + dy, 2, 2, ink);
    put(canvas, 8 + dx, 8 + dy, rgba(palette.trimLight));
    put(canvas, 14 + dx, 8 + dy, rgba(palette.trimLight));
  }
  hline(canvas, 11 + dx, 10 + dy, 2, deep);
}

function drawHair(canvas: PixelCanvas, body: Body) {
  const { livery, upper, lean } = body;
  const dy = upper;
  const dx = lean;
  const hair = rgba(livery.hair);
  const light = rgba(livery.hairLight);

  const cap: [number, number][] = [
    [9, 14],
    [8, 15],
    [7, 16],
    [6, 17],
    [6, 17],
    [6, 17],
  ];
  spans(canvas, cap, 0, hair, dx, dy);
  // 앞머리 끝: 이마를 남기고 한 칸씩 내려온다.
  hline(canvas, 6 + dx, 5 + dy, 2, hair);
  hline(canvas, 9 + dx, 6 + dy, 2, hair);
  hline(canvas, 13 + dx, 6 + dy, 2, hair);
  hline(canvas, 16 + dx, 5 + dy, 2, hair);
  // 정수리 빛
  hline(canvas, 9 + dx, 1 + dy, 4, light);
  put(canvas, 7 + dx, 2 + dy, light);
  put(canvas, 6 + dx, 5 + dy, light);

  switch (livery.hairStyle) {
    case "bob":
      rect(canvas, 5 + dx, 4 + dy, 1, 7, hair);
      rect(canvas, 18 + dx, 4 + dy, 1, 7, hair);
      rect(canvas, 6 + dx, 10 + dy, 1, 2, hair);
      rect(canvas, 17 + dx, 10 + dy, 1, 2, hair);
      break;
    case "long":
      rect(canvas, 4 + dx, 4 + dy, 2, 15, hair);
      rect(canvas, 18 + dx, 4 + dy, 2, 15, hair);
      vline(canvas, 4 + dx, 6 + dy, 10, light);
      vline(canvas, 19 + dx, 6 + dy, 10, light);
      break;
    case "pony":
      rect(canvas, 18 + dx, 5 + dy, 2, 2, hair);
      rect(canvas, 19 + dx, 6 + dy, 2, 8, hair);
      vline(canvas, 20 + dx, 8 + dy, 5, light);
      rect(canvas, 5 + dx, 4 + dy, 1, 4, hair);
      break;
    case "bun":
      rect(canvas, 10 + dx, 0 + dy - 2, 4, 2, hair);
      rect(canvas, 11 + dx, 0 + dy - 3, 2, 1, hair);
      hline(canvas, 11 + dx, 0 + dy - 2, 2, light);
      break;
    case "messy":
      put(canvas, 7 + dx, 0 + dy - 1, hair);
      put(canvas, 10 + dx, 0 + dy - 1, hair);
      put(canvas, 13 + dx, 0 + dy - 1, hair);
      put(canvas, 16 + dx, 0 + dy - 1, hair);
      put(canvas, 17 + dx, 3 + dy, light);
      break;
    case "cap":
      hline(canvas, 8 + dx, 0 + dy - 1, 8, rgba(livery.clothShade));
      rect(canvas, 7 + dx, 0 + dy - 1, 10, 5, rgba(livery.cloth));
      hline(canvas, 8 + dx, 1 + dy, 4, rgba(livery.trim, 160));
      rect(canvas, 4 + dx, 4 + dy, 16, 2, rgba(palette.boots));
      hline(canvas, 4 + dx, 5 + dy, 16, rgba(palette.bootsShade));
      break;
    case "short":
      rect(canvas, 5 + dx, 4 + dy, 1, 4, hair);
      rect(canvas, 18 + dx, 4 + dy, 1, 4, hair);
      hline(canvas, 6 + dx, 5 + dy, 2, hair);
      hline(canvas, 16 + dx, 5 + dy, 2, hair);
      break;
  }
}

function drawTorso(canvas: PixelCanvas, body: Body) {
  const { livery, upper, lean } = body;
  const dy = upper;
  const dx = lean;
  const cloth = rgba(livery.cloth);
  const shade = rgba(livery.clothShade);
  const trim = rgba(livery.trim);

  spans(canvas, torsoRows, 13, cloth, dx, dy);
  vline(canvas, 15 + dx, 14 + dy, 7, shade);
  vline(canvas, 16 + dx, 14 + dy, 7, shade);
  hline(canvas, 8 + dx, 21 + dy, 8, shade);
  // 깃과 단추, 벨트
  hline(canvas, 9 + dx, 13 + dy, 6, trim);
  put(canvas, 11 + dx, 16 + dy, rgba(palette.trim, 210));
  put(canvas, 11 + dx, 19 + dy, rgba(palette.trim, 210));
  hline(canvas, 8 + dx, 20 + dy, 8, rgba(palette.boots));
  put(canvas, 11 + dx, 20 + dy, rgba(palette.woodLight));
}

function drawSeatedLegs(canvas: PixelCanvas, body: Body) {
  const { upper, lean } = body;
  const dy = upper;
  const dx = lean;
  const pants = rgba(palette.pants);
  const pantsShade = rgba(palette.pantsShade);
  const boot = rgba(palette.boots);

  // 허벅지를 앞으로 내밀고 정강이를 내린 자세. 발은 땅에 닿는다.
  rect(canvas, 6 + dx, 21 + dy, 12, 5, pants);
  hline(canvas, 6 + dx, 25 + dy, 12, pantsShade);
  put(canvas, 7 + dx, 21 + dy, pantsShade);
  put(canvas, 16 + dx, 21 + dy, pantsShade);
  rect(canvas, 11 + dx, 24 + dy, 2, 4, pantsShade);
  rect(canvas, 7 + dx, 24 + dy, 3, 5, pants);
  rect(canvas, 14 + dx, 24 + dy, 3, 5, pants);
  vline(canvas, 9 + dx, 24 + dy, 5, pantsShade);
  vline(canvas, 16 + dx, 24 + dy, 5, pantsShade);
  rect(canvas, 6 + dx, 28 + dy, 4, 3, boot);
  rect(canvas, 14 + dx, 28 + dy, 4, 3, boot);
}

/** One frame of one crew member, outlined, on the 24x36 crew grid. */
export function drawCrew(livery: Livery, pose: CrewPose, role = 0): PixelCanvas {
  const seated = pose === "sit";
  const work = pose === "work1" || pose === "work2";
  const walking = pose.startsWith("walk");
  const upper = pose === "idle2" || pose === "walk1" || pose === "work2" ? 1 : 0;
  const lean = walking ? (pose === "walk1" || pose === "walk3" ? 1 : -1) : 0;

  const legDx: [number, number] =
    pose === "walk1" ? [-1, 1] : pose === "walk3" ? [1, -1] : [0, 0];
  const bootLift: [number, number] =
    pose === "walk1" ? [1, 0] : pose === "walk3" ? [0, 1] : [0, 0];
  const handDy: [number, number] =
    pose === "walk1" ? [2, -1] : pose === "walk3" ? [-1, 2] : [0, 0];

  const body: Body = {
    livery,
    upper,
    lean,
    legDx,
    bootLift,
    handDy,
    seated,
    work,
    blink: pose === "idle2",
  };

  const figure = surface(22, 34);
  const skin = rgba(livery.skin);
  // 앉으면 통나무 높이만큼 몸을 내려 앉는다. 눌러서 만들지 않고 통째로 내린다.
  const seat = seated ? 4 : 0;
  body.upper = upper + seat;

  if (seated) {
    drawSeatedLegs(figure, body);
  } else {
    drawLeg(figure, 7, bootLift[0], legDx[0]);
    drawLeg(figure, 13, bootLift[1], legDx[1]);
  }

  drawArm(figure, livery, 5 + lean, body.upper, Math.max(0, -handDy[0]));
  drawTorso(figure, body);

  if (work) {
    // 두 팔을 앞으로 모아 소품을 받친다.
    rect(figure, 15, 15 + upper, 4, 5, rgba(livery.cloth));
    vline(figure, 15, 15 + upper, 5, rgba(livery.clothShade));
    rect(figure, 13, 19 + upper, 7, 3, skin);
    hline(figure, 13, 21 + upper, 7, rgba(palette.skinShade));
  } else {
    drawArm(figure, livery, 16 + lean, upper, Math.max(0, -handDy[1]));
  }

  drawHead(figure, body);
  drawHair(figure, body);

  // 팔과 몸통 사이를 갈라 주는 한 줄
  vline(figure, 7 + lean, 15 + body.upper, 5, soft);
  if (!work) vline(figure, 16 + lean, 15 + body.upper, 5, soft);

  if (work)
    stamp(figure, drawWorkProp(role, livery, pose === "work2" ? 1 : 0), 5, 15 + body.upper);

  const padded = outlined(figure, ink);
  const frame = surface(crewWidth, crewHeight);
  shadowEllipse(frame, seated ? 7 : 7, 31, seated ? 16 : 16, 34, palette.shadow);
  stamp(frame, padded, 0, 0);
  return frame;
}

/** The prop each role holds while working, drawn in front of the hands.
 * 12x11 pixels so it sits between the hands without covering the head. */
export function drawWorkProp(
  role: number,
  livery: Livery,
  frame: 0 | 1,
): PixelCanvas {
  const canvas = surface(12, 11);
  const dy = frame;
  const wood = rgba(palette.wood);
  const woodDark = rgba(palette.woodDark);
  const woodLight = rgba(palette.woodLight);
  const metal = rgba(palette.metal);
  const metalShade = rgba(palette.metalShade);
  const paper = rgba(palette.paper);
  const paperShade = rgba(palette.paperShade);

  switch (role) {
    case 0: // 하나: 클립보드
      rect(canvas, 2, 2 + dy, 8, 8, paper);
      hline(canvas, 2, 2 + dy, 8, paperShade);
      rect(canvas, 4, 0 + dy, 4, 3, wood);
      hline(canvas, 4, 0 + dy, 4, woodLight);
      for (let row = 0; row < 3; row += 1)
        hline(canvas, 4, 4 + row * 2 + dy, 5, paperShade);
      break;
    case 1: // 태오: 노트북과 렌치
      rect(canvas, 1, 3 + dy, 7, 2, metal);
      rect(canvas, 1, 5 + dy, 8, 5, metalShade);
      rect(canvas, 2, 6 + dy, 6, 3, rgba(palette.trimLight));
      hline(canvas, 2, 6 + dy, 6, rgba(palette.grassDark));
      rect(canvas, 10, 1 + dy, 2, 6, metal);
      rect(canvas, 9, 0 + dy, 4, 2, metal);
      break;
    case 2: // 현우: 두루마리
      rect(canvas, 2, 2 + dy, 8, 6, paper);
      hline(canvas, 2, 2 + dy, 8, paperShade);
      hline(canvas, 2, 7 + dy, 8, paperShade);
      rect(canvas, 1, 1 + dy, 2, 9, wood);
      rect(canvas, 9, 1 + dy, 2, 9, wood);
      vline(canvas, 1, 1 + dy, 9, woodLight);
      for (let row = 0; row < 2; row += 1)
        hline(canvas, 4, 4 + row * 2 + dy, 4, paperShade);
      break;
    case 7: // 민재: 돋보기
      rect(canvas, 1, 2 + dy, 2, 5, metal);
      hline(canvas, 3, 0 + dy, 5, metal);
      hline(canvas, 3, 4 + dy, 5, metal);
      rect(canvas, 3, 1 + dy, 5, 3, rgba(palette.trimLight, 170));
      rect(canvas, 1, 7 + dy, 2, 4, wood);
      put(canvas, 4, 1 + dy, rgba(palette.trimLight));
      break;
    case 3: // 유진: 팔레트와 붓
      rect(canvas, 0, 3 + dy, 9, 5, woodLight);
      rect(canvas, 1, 2 + dy, 7, 7, woodLight);
      put(canvas, 2, 3 + dy, rgba(palette.fireLight));
      put(canvas, 6, 3 + dy, rgba(palette.swatchSky));
      put(canvas, 2, 7 + dy, rgba(palette.swatchRose));
      put(canvas, 6, 7 + dy, rgba(palette.swatchSage));
      put(canvas, 7, 5 + dy, rgba(palette.swatchLilac));
      rect(canvas, 9, 0 + dy, 2, 6, wood);
      put(canvas, 9, 0 + dy, metal);
      break;
    case 4: // 지민: 서류 폴더
      rect(canvas, 1, 2 + dy, 9, 7, rgba(livery.cloth));
      hline(canvas, 1, 2 + dy, 9, rgba(livery.clothShade));
      rect(canvas, 1, 0 + dy, 5, 3, rgba(livery.cloth));
      rect(canvas, 3, 5 + dy, 5, 2, rgba(palette.trimLight));
      hline(canvas, 3, 8 + dy, 3, rgba(palette.paperShade));
      break;
    case 5: // 도윤: 망치
      rect(canvas, 5, 2 + dy, 2, 8, wood);
      hline(canvas, 5, 2 + dy, 2, woodLight);
      rect(canvas, 1, 0 + dy, 9, 3, metal);
      hline(canvas, 1, 0 + dy, 9, rgba(palette.metal));
      hline(canvas, 1, 2 + dy, 9, metalShade);
      break;
    case 6: // 서연: 노트와 연필
      rect(canvas, 0, 2 + dy, 8, 8, paper);
      hline(canvas, 0, 2 + dy, 8, paperShade);
      rect(canvas, 0, 2 + dy, 2, 8, rgba(livery.cloth));
      for (let row = 0; row < 3; row += 1)
        hline(canvas, 3, 4 + row * 2 + dy, 5, paperShade);
      rect(canvas, 9, 0 + dy, 2, 6, wood);
      put(canvas, 9, 0 + dy, rgba(palette.outlineSoft));
      break;
    case 8: // 수아: 망원경
      rect(canvas, 0, 2 + dy, 4, 4, metal);
      rect(canvas, 3, 1 + dy, 5, 5, metalShade);
      rect(canvas, 7, 0 + dy, 4, 6, metal);
      hline(canvas, 7, 0 + dy, 4, rgba(palette.metal));
      rect(canvas, 10, 0 + dy, 2, 6, rgba(palette.trimLight, 200));
      hline(canvas, 0, 5 + dy, 4, woodDark);
      break;
    default:
      break;
  }
  return canvas;
}
