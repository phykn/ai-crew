// 좌표와 크기 계산. 화면 크기에서 "아트 1픽셀이 화면 몇 픽셀인가"(unit)를 한 번
// 정하고, 바닥 타일·오브젝트·캐릭터가 모두 그 값을 곱해 그려진다. 그래서 어떤
// 창 크기에서도 모든 그림의 픽셀 밀도가 같다.

import { crewHeight as crewArtHeight } from "./art/crew";

export type StageSize = { width: number; height: number };
export type StagePoint = { x: number; y: number };

export const crewMinHeight = 64;
export const crewMaxHeight = 128;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** 캠프 좌표(0~100 백분율)를 스테이지 픽셀 자리로 옮긴다. */
export function stagePoint(size: StageSize, point: StagePoint): StagePoint {
  return {
    x: (point.x / 100) * size.width,
    y: (point.y / 100) * size.height,
  };
}

/**
 * 캐릭터 키: 캠프 높이에 비례하되 너무 작거나 커지지 않게 묶는다. CSS 캠프의
 * `.character` 높이도 이 값(`--crew-h`)을 쓰므로 이름표와 그림의 키가 같다.
 */
export function crewHeight(size: StageSize) {
  return clamp(size.height * 0.12, crewMinHeight, crewMaxHeight);
}

/**
 * 아트 1픽셀에 곱할 화면 배율. 캐릭터 원본 키(36px)가 crewHeight에 오도록 맞추고,
 * 바닥 타일(16px)·오브젝트·그림자도 전부 이 배율 하나를 쓴다.
 */
export function artUnit(size: StageSize) {
  return crewHeight(size) / crewArtHeight;
}

/** 모닥불에서 멀어질수록 약해지는 따뜻한 빛. 0~1. */
export function fireLight(x: number, y: number, fire: StagePoint) {
  const reach = Math.hypot(x - fire.x, y - fire.y);
  return 1 - clamp(reach / 18, 0, 1) * 0.78;
}

/**
 * 앞뒤 정렬 키. 발밑 y가 뒤에 있을수록 작다. 같은 높이면 이름으로 순서를 고정해
 * 프레임마다 순서가 뒤집히지 않게 한다.
 */
export function sortZ(y: number, id: string) {
  const base = Math.round(clamp(y, 0, 100) * 100) * 1000;
  const tie = [...id].reduce(
    (sum, char) => (sum * 31 + char.charCodeAt(0)) % 997,
    7,
  );
  return base + tie;
}

/** 불빛의 플리커. 여러 주기를 겹쳐 규칙적으로 보이지 않게 한다. */
export function flicker(time: number) {
  const a = Math.sin(time * 7.3) * 0.5 + 0.5;
  const b = Math.sin(time * 2.1 + 1.7) * 0.5 + 0.5;
  const c = Math.sin(time * 13.7 + 0.4) * 0.5 + 0.5;
  return 0.62 + a * 0.18 + b * 0.14 + c * 0.06;
}

/**
 * WebGL을 쓸 수 있는지 확인한다. 실제 캔버스를 만들지 않고 넘겨받은 생성기로만
 * 확인하므로, 테스트에서 가짜 캔버스를 넣어 두 갈래를 모두 검증할 수 있다.
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
