// The camp props, drawn on the same 16px grid and with the same palette and
// outline as the crew: a three-frame campfire, log benches, an explorer's
// canvas tent, a supply wagon and a lantern crate. Each prop is sized against
// the crew: the tent stands about two and a half crew members tall.

import { PixelCanvas } from "pixlrt/core";
import {
  dither,
  ellipse,
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
import { palette } from "./palette";

const ink = rgba(palette.outline);

function finish(body: PixelCanvas, shadow = 0.16) {
  const padded = outlined(body, ink);
  const frame = surface(padded.width, padded.height);
  if (shadow > 0) {
    shadowEllipse(
      frame,
      2,
      frame.height - Math.round(frame.height * shadow),
      frame.width - 3,
      frame.height - 1,
      palette.shadow,
    );
  }
  stamp(frame, padded, 0, 0);
  return frame;
}

// ── 모닥불: 불티가 오르는 세 프레임 ─────────────────────────────────────
export function drawCampfire(frame: 0 | 1 | 2): PixelCanvas {
  const canvas = surface(60, 44);
  const stone = rgba(palette.stone);
  const stoneShade = rgba(palette.stoneShade);
  const wood = rgba(palette.wood);
  const woodDark = rgba(palette.woodDark);
  const woodLight = rgba(palette.woodLight);

  // 돌 화덕: 크기가 다른 돌을 둥글게 둘러 놓았다.
  ellipse(canvas, 9, 31, 50, 38, rgba(palette.dirtDeep));
  for (let i = 0; i < 11; i += 1) {
    const angle = (i / 11) * Math.PI * 2;
    const cx = 30 + Math.round(Math.cos(angle) * 18);
    const cy = 34 + Math.round(Math.sin(angle) * 4);
    const w = 5 + (i % 3);
    ellipse(canvas, cx - Math.round(w / 2), cy - 2, cx + Math.round(w / 2), cy + 2, stoneShade);
    ellipse(canvas, cx - Math.round(w / 2), cy - 2, cx + Math.round(w / 2), cy, stone);
    hline(canvas, cx - Math.round(w / 2) + 1, cy - 2, w - 1, rgba(palette.trimLight, 110));
    put(canvas, cx + 1, cy + 1, stoneShade);
  }
  // 장작: 엇갈려 놓인 세 짝
  rect(canvas, 17, 24, 26, 5, wood);
  hline(canvas, 17, 24, 26, woodLight);
  hline(canvas, 17, 28, 26, woodDark);
  rect(canvas, 24, 20, 5, 12, woodDark);
  hline(canvas, 24, 20, 5, rgba(palette.wood));
  rect(canvas, 31, 21, 4, 10, wood);
  hline(canvas, 31, 21, 4, woodLight);
  put(canvas, 22, 26, rgba(palette.fireLight));

  // 불꽃: 프레임마다 혀의 높이와 기울기가 다르다
  const lean = [0, 2, -2][frame];
  const tall = [16, 21, 13][frame];
  const mid = [11, 15, 9][frame];
  const body = rgba(palette.fire);
  const light = rgba(palette.fireLight);
  const core = rgba(palette.fireCore);

  for (let row = 0; row < tall; row += 1) {
    const t = row / tall;
    const width = Math.max(3, Math.round(17 - t * 12));
    const x = 30 - Math.round(width / 2) + Math.round((1 - t) * lean);
    hline(canvas, x, 24 - row, width, body);
  }
  for (let row = 0; row < mid; row += 1) {
    const t = row / mid;
    const width = Math.max(2, Math.round(11 - t * 8));
    const x = 30 - Math.round(width / 2) + Math.round((1 - t) * lean * 0.6);
    hline(canvas, x, 24 - row, width, light);
  }
  hline(canvas, 28, 22, 5, core);
  hline(canvas, 29 + lean, 24 - Math.round(mid * 0.55), 3, core);
  // 불티
  put(canvas, 24 + lean, 5, rgba(palette.fireLight, 230));
  put(canvas, 37 - lean, 8, rgba(palette.fire, 210));
  put(canvas, 30, 2 + frame, rgba(palette.fireCore, 180));
  put(canvas, 20, 12, rgba(palette.fire, 170));
  return finish(canvas, 0.1);
}

// ── 통나무 벤치 ─────────────────────────────────────────────────────────
// 낮은 통나무라 앉는 자리가 땅에서 12픽셀밖에 안 된다. 그래야 걸터앉은 크루의
// 몸통이 통나무 위로 보인다.
export function drawBench(): PixelCanvas {
  const canvas = surface(52, 16);
  const wood = rgba(palette.wood);
  const woodDark = rgba(palette.woodDark);
  const woodLight = rgba(palette.woodLight);
  const moss = rgba(palette.leaf);

  // 받침 두 짝
  rect(canvas, 7, 9, 4, 6, woodDark);
  rect(canvas, 41, 9, 4, 6, woodDark);
  hline(canvas, 6, 14, 6, rgba(palette.bootsShade));
  hline(canvas, 40, 14, 6, rgba(palette.bootsShade));
  // 앉는 통나무: 윗면이 밝고 앞면이 어둡다
  ellipse(canvas, 2, 2, 49, 12, wood);
  hline(canvas, 4, 2, 44, woodLight);
  hline(canvas, 5, 3, 42, woodLight);
  hline(canvas, 3, 11, 46, woodDark);
  hline(canvas, 3, 12, 46, rgba(palette.bootsShade));
  for (let x = 7; x < 46; x += 8) {
    vline(canvas, x, 4, 6, rgba(palette.woodDark, 160));
    put(canvas, x + 1, 4, rgba(palette.woodLight, 120));
  }
  for (let i = 0; i < 4; i += 1) put(canvas, 11 + i * 7, 3 + (i % 2), moss);
  put(canvas, 15, 11, rgba(palette.woodDark, 200));
  put(canvas, 33, 10, rgba(palette.woodDark, 200));
  return finish(canvas, 0.14);
}

// ── 탐험가의 캔버스 천막 ────────────────────────────────────────────────
export function drawTent(): PixelCanvas {
  const canvas = surface(98, 88);
  const body = rgba(palette.canvas);
  const shade = rgba(palette.canvasShade);
  const light = rgba(palette.canvasLight);
  const wood = rgba(palette.wood);
  const woodDark = rgba(palette.woodDark);

  const apexX = 49;
  const apexY = 10;
  const floor = 78;
  const half = 40;

  // A자 천막: 꼭대기에서 바닥까지 두 면이 벌어진다.
  for (let y = apexY; y <= floor; y += 1) {
    const t = (y - apexY) / (floor - apexY);
    const width = Math.round(2 + t * half);
    hline(canvas, apexX - width, y, width * 2, body);
    // 왼쪽 면은 그늘, 오른쪽 면은 빛.
    hline(canvas, apexX - width, y, Math.round(width * 1.1), shade);
    hline(canvas, apexX + 2, y, Math.max(1, width - 8), light);
  }
  // 용마루와 천 조각 이음선
  vline(canvas, apexX, apexY, floor - apexY + 1, rgba(palette.canvasShade, 220));
  for (let y = apexY + 8; y < floor; y += 9) {
    const t = (y - apexY) / (floor - apexY);
    const width = Math.round(2 + t * half);
    hline(canvas, apexX - width + 3, y, Math.max(2, width - 6), rgba(palette.canvasShade, 190));
    hline(canvas, apexX + 4, y, Math.max(2, width - 10), rgba(palette.canvasLight, 200));
  }
  // 입구: 안이 어둡고 문짝을 양옆으로 말아 놓았다.
  for (let y = 40; y <= floor; y += 1) {
    const t = (y - 40) / (floor - 40);
    const width = Math.round(3 + t * 10);
    hline(canvas, apexX - width, y, width * 2, rgba(palette.tentDark));
  }
  hline(canvas, apexX - 6, 42, 12, rgba(palette.bootsShade));
  rect(canvas, apexX - 16, 38, 5, floor - 38, rgba(palette.canvasShade));
  rect(canvas, apexX + 11, 38, 5, floor - 38, rgba(palette.canvasShade));
  hline(canvas, apexX - 16, 38, 5, light);
  hline(canvas, apexX + 11, 38, 5, light);
  // 기둥과 받침
  hline(canvas, 6, floor + 1, 86, shade);
  hline(canvas, 4, floor + 2, 90, woodDark);
  for (const x of [9, 85]) {
    rect(canvas, x, floor - 4, 3, 16, wood);
    put(canvas, x + 1, floor - 5, woodDark);
  }
  // 꼭대기 기둥과 깃발
  rect(canvas, apexX - 1, apexY - 8, 2, 10, wood);
  hline(canvas, apexX + 1, apexY - 7, 9, rgba(palette.banner));
  hline(canvas, apexX + 1, apexY - 6, 6, rgba(palette.banner));
  // 밧줄과 말뚝
  for (const [x1, y1, x2, y2] of [[apexX - 2, apexY + 2, 8, floor - 2], [apexX + 2, apexY + 2, 88, floor - 2]]) {
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(x1 + ((x2 - x1) * i) / steps);
      const y = Math.round(y1 + ((y2 - y1) * i) / steps);
      put(canvas, x, y, rgba(palette.woodDark, 170));
    }
  }
  // 돗자리와 보급 상자
  dither(canvas, 20, 82, 46, 4, rgba(palette.dirtLight, 170), 0);
  rect(canvas, 70, 70, 12, 10, rgba(palette.woodLight));
  hline(canvas, 70, 70, 12, rgba(palette.trimLight));
  return finish(canvas, 0.08);
}

// ── 보급 마차 ───────────────────────────────────────────────────────────
export function drawWagon(): PixelCanvas {
  const canvas = surface(104, 82);
  const wood = rgba(palette.wood);
  const woodDark = rgba(palette.woodDark);
  const woodLight = rgba(palette.woodLight);
  const body = rgba(palette.canvas);
  const shade = rgba(palette.canvasShade);
  const light = rgba(palette.canvasLight);

  // 바퀴 두 짝
  for (const cx of [26, 80]) {
    ellipse(canvas, cx - 13, 56, cx + 13, 80, woodDark);
    ellipse(canvas, cx - 11, 58, cx + 11, 78, wood);
    ellipse(canvas, cx - 4, 64, cx + 4, 72, rgba(palette.bootsShade));
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      for (let r = 4; r < 12; r += 2) {
        put(canvas, Math.round(cx + Math.cos(angle) * r), Math.round(68 + Math.sin(angle) * r), woodDark);
      }
    }
    put(canvas, cx, 68, rgba(palette.woodLight));
  }
  // 짐칸: 판자 벽
  rect(canvas, 12, 42, 82, 18, wood);
  hline(canvas, 12, 42, 82, woodLight);
  hline(canvas, 12, 52, 82, woodDark);
  hline(canvas, 12, 59, 82, rgba(palette.bootsShade));
  for (let x = 18; x < 92; x += 9) vline(canvas, x, 44, 15, rgba(palette.woodDark, 160));
  // 덮개: 반원 아치와 살대
  for (let y = 16; y <= 44; y += 1) {
    const t = (y - 16) / 28;
    const width = Math.round(40 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - t, 2))));
    hline(canvas, 53 - width, y, width * 2, body);
    hline(canvas, 53 - width, y, Math.round(width * 0.8), rgba(palette.canvasShade, 200));
    hline(canvas, 53 + Math.round(width * 0.45), y, Math.max(1, Math.round(width * 0.5)), light);
  }
  for (let x = 17; x <= 89; x += 8) {
    for (let y = 16; y <= 44; y += 1) {
      const t = (y - 16) / 28;
      const width = Math.round(40 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - t, 2))));
      if (Math.abs(x - 53) <= width && (x - 53) % 8 === 0) put(canvas, x, y, rgba(palette.canvasShade, 180));
    }
  }
  hline(canvas, 13, 44, 80, rgba(palette.woodDark));
  hline(canvas, 13, 45, 80, rgba(palette.wood));
  // 멍에와 끈
  rect(canvas, 2, 46, 12, 4, woodDark);
  hline(canvas, 0, 47, 5, rgba(palette.woodLight));
  rect(canvas, 2, 50, 10, 2, rgba(palette.wood));
  // 실린 보급 상자와 통
  rect(canvas, 84, 32, 12, 12, rgba(palette.woodLight));
  hline(canvas, 84, 32, 12, rgba(palette.trimLight));
  hline(canvas, 84, 38, 12, rgba(palette.wood));
  ellipse(canvas, 68, 30, 80, 44, rgba(palette.wood));
  hline(canvas, 69, 33, 10, rgba(palette.metalShade));
  hline(canvas, 69, 40, 10, rgba(palette.metalShade));
  return finish(canvas, 0.1);
}

// ── 등불 단 보급 상자 ───────────────────────────────────────────────────
export function drawCrates(): PixelCanvas {
  const canvas = surface(52, 46);
  const wood = rgba(palette.wood);
  const woodDark = rgba(palette.woodDark);
  const woodLight = rgba(palette.woodLight);
  const metal = rgba(palette.metalShade);

  rect(canvas, 4, 24, 24, 18, wood);
  hline(canvas, 4, 24, 24, woodLight);
  hline(canvas, 4, 33, 24, woodDark);
  vline(canvas, 4, 24, 18, woodDark);
  vline(canvas, 27, 24, 18, woodDark);
  hline(canvas, 7, 29, 4, metal);
  hline(canvas, 21, 29, 4, metal);

  rect(canvas, 18, 10, 22, 16, rgba(palette.woodLight));
  hline(canvas, 18, 10, 22, rgba(palette.trimLight));
  hline(canvas, 18, 18, 22, rgba(palette.wood));
  rect(canvas, 28, 10, 2, 16, rgba(palette.wood));
  hline(canvas, 22, 14, 4, metal);

  // 등불 기둥과 등불
  rect(canvas, 41, 3, 2, 34, woodDark);
  rect(canvas, 36, 4, 10, 2, woodDark);
  hline(canvas, 36, 5, 10, rgba(palette.woodLight));
  rect(canvas, 37, 7, 9, 11, rgba(palette.metalShade));
  rect(canvas, 38, 8, 7, 9, rgba(palette.lamp));
  rect(canvas, 39, 9, 5, 6, rgba(palette.fireCore));
  put(canvas, 40, 9, rgba(palette.trimLight));
  hline(canvas, 37, 17, 9, rgba(palette.metalShade));
  put(canvas, 42, 2, rgba(palette.metal));
  return finish(canvas, 0.12);
}
