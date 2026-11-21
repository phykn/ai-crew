import { gsap } from "gsap";
import { expect, test } from "vitest";
import { createCampStage } from "./camp-pixi";
import {
  coverFit,
  crewHeight,
  crewMaxHeight,
  crewMinHeight,
  crewScale,
  depthScale,
  fireLight,
  flicker,
  seatPose,
  sortZ,
  stagePoint,
  webglAvailable,
} from "./camp-pixi-layout";

test("캠프 좌표는 화면 크기에 맞춰 픽셀로 옮겨지고 배경은 비율대로 채워진다", () => {
  expect(stagePoint({ width: 800, height: 600 }, { x: 50, y: 25 })).toEqual({
    x: 400,
    y: 150,
  });

  // 1000×1000 배경을 800×600 무대에 넣으면 가로를 채우고 위아래가 잘린다.
  const fit = coverFit({ width: 1000, height: 1000 }, { width: 800, height: 600 });
  expect(fit.scale).toBeCloseTo(0.8);
  expect(fit.x).toBeCloseTo(0);
  expect(fit.y).toBeCloseTo(-100);
});

test("캐릭터 키는 무대 높이를 따르되 정해진 범위를 벗어나지 않고, 이름표와 같은 값을 쓴다", () => {
  expect(crewHeight({ width: 1200, height: 900 })).toBeCloseTo(99);
  expect(crewHeight({ width: 400, height: 200 })).toBe(crewMinHeight);
  expect(crewHeight({ width: 4000, height: 3000 })).toBe(crewMaxHeight);

  // 스프라이트 원본 크기와 무관하게 같은 키로 맞춘다.
  const small = crewScale({ width: 200, height: 400 }, { width: 1200, height: 900 });
  const large = crewScale({ width: 400, height: 800 }, { width: 1200, height: 900 });
  expect(small).toBeCloseTo(large * 2);
  expect(small * 400).toBeCloseTo(crewHeight({ width: 1200, height: 900 }));
});

test("뒤에 선 사람은 작게, 앞에 선 사람은 크게 그려지고 앞사람이 위에 그려진다", () => {
  expect(depthScale(40)).toBeLessThan(depthScale(70));
  expect(depthScale(46)).toBeCloseTo(0.78);
  expect(depthScale(90)).toBeCloseTo(1.06);

  expect(sortZ(50, "a")).toBeLessThan(sortZ(70, "a"));
  // 같은 높이에서는 이름으로 순서가 고정되어 프레임마다 뒤집히지 않는다.
  expect(sortZ(50, "a")).toBe(sortZ(50, "a"));
  expect(sortZ(50, "a")).not.toBe(sortZ(50, "b"));
});

test("모닥불에서 멀어지면 빛이 약해지고, 흔들림은 늘 같은 범위 안에 있다", () => {
  expect(fireLight(59.7, 61.8, { x: 59.7, y: 61.8 })).toBeCloseTo(1);
  expect(fireLight(90, 61.8, { x: 59.7, y: 61.8 })).toBeLessThan(0.4);
  for (const time of [0, 0.3, 1.7, 4.2, 9.9]) {
    expect(flicker(time)).toBeGreaterThan(0.5);
    expect(flicker(time)).toBeLessThan(1.05);
  }
});

test("앉는 자세는 0과 1 사이에서 부드럽게 이어진다", () => {
  expect(seatPose(0)).toEqual({ sink: 0, squashY: 1, squashX: 1 });
  const half = seatPose(0.5);
  expect(half.sink).toBeCloseTo(3);
  expect(half.squashY).toBeLessThan(1);
  const full = seatPose(1);
  expect(full.sink).toBeCloseTo(6);
  expect(full.squashY).toBeCloseTo(0.93);
});

test("WebGL을 못 쓰는 캔버스에서는 스테이지를 만들지 않는다", () => {
  expect(webglAvailable(() => null)).toBe(false);
  expect(webglAvailable(() => ({ getContext: () => null }))).toBe(false);
  expect(
    webglAvailable(() => ({
      getContext: (id: string) => (id === "webgl2" ? {} : null),
    })),
  ).toBe(true);
});

test("서버 렌더처럼 window가 없는 곳에서는 캔버스를 만들지 않고 null을 돌려준다", async () => {
  const stage = await createCampStage({
    host: {} as HTMLElement,
    background: "/camp.webp",
    crew: [],
    fire: { x: 59.7, y: 61.8 },
  });
  expect(stage).toBeNull();
});

test("GSAP이 착석·방향 전환의 중간값을 계산한다", () => {
  const pose = { sink: 0, squashY: 1, facing: 1 };
  const tween = gsap.to(pose, {
    sink: 6,
    squashY: 0.7,
    duration: 1,
    paused: true,
    ease: "none",
  });
  tween.progress(0.5);
  expect(pose.sink).toBeCloseTo(3);
  expect(pose.squashY).toBeCloseTo(0.85);
  tween.progress(1);
  expect(pose.sink).toBeCloseTo(6);
  expect(pose.squashY).toBeCloseTo(0.7);

  // 방향은 뒤집히는 순간에만 값이 바뀐다.
  const flip = gsap.to(pose, {
    facing: -1,
    duration: 0.18,
    paused: true,
    ease: "steps(1)",
  });
  flip.progress(0.1);
  expect(pose.facing).toBe(1);
  flip.progress(0.9);
  expect(pose.facing).toBe(-1);
  tween.kill();
  flip.kill();
});
