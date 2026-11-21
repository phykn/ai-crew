// 캠프 픽셀아트 스테이지의 좌표 계산. 화면 크기·스프라이트 비율·자세만으로 자리와
// 깊이, 앞뒤 정렬 순서, 불빛의 밝기를 정하는 순수 함수들이다. WebGL 없이도
// 검증할 수 있게 PixiJS 렌더러(`camp-pixi.ts`)와 분리해 둔다.

export type StageSize = { width: number; height: number };
export type StagePoint = { x: number; y: number };
export type TextureSize = { width: number; height: number };

export const crewMinHeight = 58;
export const crewMaxHeight = 104;

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

/** 배경 그림을 비율 그대로 채운다(cover). 넘치는 쪽은 가운데를 기준으로 잘린다. */
export function coverFit(texture: TextureSize, size: StageSize) {
  if (!texture.width || !texture.height || !size.width || !size.height)
    return { scale: 1, x: 0, y: 0 };
  const scale = Math.max(
    size.width / texture.width,
    size.height / texture.height,
  );
  return {
    scale,
    x: (size.width - texture.width * scale) / 2,
    y: (size.height - texture.height * scale) / 2,
  };
}

/**
 * 캐릭터 키: 캠프 높이에 비례하되 너무 작거나 커지지 않게 묶는다. CSS 캠프의
 * `.character` 높이도 이 값(`--crew-h`)을 쓰므로 이름표와 그림의 키가 같다.
 */
export function crewHeight(size: StageSize) {
  return clamp(size.height * 0.11, crewMinHeight, crewMaxHeight);
}

/** 스프라이트 원본 크기에서 캐릭터 키에 맞는 배율. */
export function crewScale(texture: TextureSize, size: StageSize) {
  if (!texture.height) return 1;
  return crewHeight(size) / texture.height;
}

/**
 * 뒤쪽(위) 사람은 작게, 앞쪽(아래) 사람은 크게 그려 깊이를 준다. CSS 캠프와
 * PixiJS 캔버스가 같은 배율을 쓰도록 이 함수 하나에서 값을 낸다.
 */
export function depthScale(y: number) {
  return 0.78 + (clamp(y - 46, 0, 44) / 44) * 0.28;
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

/** 앉는 자세로 옮겨가는 동안의 몸 내림(비율)과 가로·세로 압축. */
export function seatPose(progress: number) {
  const t = clamp(progress, 0, 1);
  const ease = t * t * (3 - 2 * t);
  return { sink: 6 * ease, squashY: 1 - 0.07 * ease, squashX: 1 + 0.06 * ease };
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
    return Boolean(
      canvas.getContext("webgl2") || canvas.getContext("webgl"),
    );
  } catch {
    return false;
  }
}
