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
import { crewHeight as crewArtHeight } from "../../../../src/frontend/ui/camp/art/crew";
import { tileSize } from "../../../../src/frontend/ui/camp/art/ground";

test("캠프 좌표는 화면 크기에 맞춰 픽셀로 옮겨진다", () => {
  expect(stagePoint({ width: 800, height: 600 }, { x: 50, y: 25 })).toEqual({
    x: 400,
    y: 150,
  });
});

test("캐릭터 키는 무대 높이를 따르되 정해진 범위를 벗어나지 않는다", () => {
  expect(crewHeight({ width: 1200, height: 900 })).toBeCloseTo(108);
  expect(crewHeight({ width: 400, height: 200 })).toBe(crewMinHeight);
  expect(crewHeight({ width: 4000, height: 3000 })).toBe(crewMaxHeight);
});

test("바닥·오브젝트·캐릭터가 모두 같은 아트 배율 하나를 쓴다", () => {
  const size = { width: 1200, height: 900 };
  const unit = artUnit(size);
  // The crew's art height in pixels becomes the crew height on screen.
  expect(crewArtHeight * unit).toBeCloseTo(crewHeight(size));
  // Every floor tile scales by the same single unit.
  expect(tileSize * unit).toBeCloseTo((tileSize * crewHeight(size)) / crewArtHeight);
  // 창이 작아져도 세 그림의 배율은 여전히 하나다.
  const small = { width: 600, height: 400 };
  expect(crewArtHeight * artUnit(small)).toBeCloseTo(crewHeight(small));
});

test("앞사람이 위에 그려지고, 같은 높이에서는 이름으로 순서가 고정된다", () => {
  expect(sortZ(50, "a")).toBeLessThan(sortZ(70, "a"));
  expect(sortZ(50, "a")).toBe(sortZ(50, "a"));
  expect(sortZ(50, "a")).not.toBe(sortZ(50, "b"));
  // 앉은 크루는 통나무(y 55.6)보다 앞에 그려진다.
  expect(sortZ(55.5 + 0.2, "crew")).toBeGreaterThan(sortZ(55.6, "bench-west"));
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
