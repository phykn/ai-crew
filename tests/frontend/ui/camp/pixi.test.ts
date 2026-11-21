import { expect, test } from "vitest";
import { createCampStage } from "../../../../src/frontend/ui/camp/pixi";
import {
  artUnit,
  crewHeight,
  crewMaxHeight,
  crewMinHeight,
  fireLight,
  flicker,
  sortZ,
  stagePoint,
  webglAvailable,
} from "../../../../src/frontend/ui/camp/pixi-layout";
import { campBackground, crewArt } from "../../../../src/frontend/ui/camp/art/scene";

test("캠프 좌표는 화면 크기에 맞춰 픽셀로 옮겨진다", () => {
  expect(stagePoint({ width: 800, height: 600 }, { x: 50, y: 25 })).toEqual({
    x: 400,
    y: 150,
  });
});

test("캐릭터 키는 무대 높이를 따르되 정해진 범위를 벗어나지 않는다", () => {
  // The painted clearing is 1003 tall and its crew are 108 tall.
  expect(crewHeight({ width: 1200, height: 900 })).toBeCloseTo(
    (900 * crewArt.height) / campBackground.height,
  );
  expect(crewHeight({ width: 400, height: 200 })).toBe(crewMinHeight);
  expect(crewHeight({ width: 4000, height: 3000 })).toBe(crewMaxHeight);
});

test("배경·소품·캐릭터가 모두 배경 픽셀 배율 하나를 쓴다", () => {
  const size = { width: 1200, height: 900 };
  const unit = artUnit(size);
  // One background pixel becomes this many screen pixels, tall or small window.
  expect(unit).toBeCloseTo(900 / campBackground.height);
  expect(campBackground.height * unit).toBeCloseTo(size.height);
  // The bench and the fire keep their painted size on the ground.
  expect(artUnit({ width: 600, height: 400 })).toBeCloseTo(400 / campBackground.height);
});

test("앞사람이 위에 그려지고, 같은 높이에서는 이름으로 순서가 고정된다", () => {
  expect(sortZ(50, "a")).toBeLessThan(sortZ(70, "a"));
  expect(sortZ(50, "a")).toBe(sortZ(50, "a"));
  expect(sortZ(50, "a")).not.toBe(sortZ(50, "b"));
  // A seated crew member sorts in front of the log it sits on.
  expect(sortZ(34.6 + 0.2, "crew")).toBeGreaterThan(sortZ(33.5, "bench-east"));
});

test("모닥불에서 멀어지면 빛이 약해지고, 흔들림은 늘 같은 범위 안에 있다", () => {
  expect(fireLight(50, 51, { x: 50, y: 51 })).toBeCloseTo(1);
  expect(fireLight(90, 61.8, { x: 50, y: 51 })).toBeLessThan(0.4);
  for (const time of [0, 0.3, 1.7, 4.2, 9.9]) {
    expect(flicker(time)).toBeGreaterThan(0.5);
    expect(flicker(time)).toBeLessThan(1.05);
  }
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
    crew: [],
    fire: { x: 50, y: 50 },
  });
  expect(stage).toBeNull();
});
