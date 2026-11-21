import { expect, test } from "vitest";
import { palette, liveries } from "../../../../../src/frontend/ui/camp/art/palette";
import { campGround, crewFrame, objectArt, objectSize } from "../../../../../src/frontend/ui/camp/art/scene";
import { crewHeight, crewWidth } from "../../../../../src/frontend/ui/camp/art/crew";
import { campObjects } from "../../../../../src/frontend/ui/camp/behavior";
import { mapCols, mapRows, tileSize } from "../../../../../src/frontend/ui/camp/art/ground";

const paletteColors = new Set(
  Object.values(palette).map((hex) => hex.toLowerCase()),
);

function pixelsOf(art: { width: number; height: number; getPixel: (x: number, y: number) => readonly number[] }) {
  const colors = new Set<string>();
  for (let y = 0; y < art.height; y += 1)
    for (let x = 0; x < art.width; x += 1) {
      const pixel = art.getPixel(x, y);
      if (pixel[3] === 0) continue;
      const hex =
        "#" +
        [0, 1, 2]
          .map((index) => pixel[index].toString(16).padStart(2, "0"))
          .join("");
      colors.add(hex);
    }
  return colors;
}

test("아홉 크루의 그림은 한 팔레트의 색만 쓴다", () => {
  expect(Object.keys(liveries).map(Number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const outside = new Set<string>();
  for (const role of Object.keys(liveries).map(Number)) {
    for (const color of pixelsOf(crewFrame(role, "idle1"))) {
      const own = [
        liveries[role].cloth,
        liveries[role].clothShade,
        liveries[role].trim,
        liveries[role].hair,
        liveries[role].hairLight,
      ].map((hex) => hex.toLowerCase());
      if (!paletteColors.has(color) && !own.includes(color)) outside.add(color);
    }
  }
  expect([...outside]).toEqual([]);
});

test("크루는 서기·걷기·앉기·일하기가 서로 다른 진짜 프레임이다", () => {
  const role = 1;
  const standing = crewFrame(role, "idle1");
  const breath = crewFrame(role, "idle2");
  const walk = crewFrame(role, "walk2");
  const sitting = crewFrame(role, "sit");
  const working = crewFrame(role, "work1");

  expect(standing.width).toBe(crewWidth);
  expect(standing.height).toBe(crewHeight);

  const same = (a: typeof standing, b: typeof standing) => {
    for (let y = 0; y < a.height; y += 1)
      for (let x = 0; x < a.width; x += 1) {
        const left = a.getPixel(x, y);
        const right = b.getPixel(x, y);
        if (left.join() !== right.join()) return false;
      }
    return true;
  };

  expect(same(standing, breath)).toBe(false);
  expect(same(standing, walk)).toBe(false);
  expect(same(standing, sitting)).toBe(false);
  expect(same(standing, working)).toBe(false);

  // 앉은 자세는 세로로 눌러 만든 것이 아니라 다리를 접은 별도 그림이다.
  // 눌렀다면 머리 높이가 그대로여야 하는데, 앉으면 머리가 내려와 있다.
  const headTop = (art: typeof standing) => {
    for (let y = 0; y < art.height; y += 1)
      for (let x = 0; x < art.width; x += 1)
        if (art.getPixel(x, y)[3] > 0) return y;
    return art.height;
  };
  expect(headTop(sitting)).toBeGreaterThanOrEqual(headTop(standing));

  // 일하는 자세는 손에 든 소품 때문에 서 있는 자세와 실루엣이 다르다.
  let differing = 0;
  for (let y = 20; y < 30; y += 1)
    for (let x = 0; x < working.width; x += 1) {
      const a = working.getPixel(x, y);
      const b = standing.getPixel(x, y);
      if (a.join() !== b.join()) differing += 1;
    }
  expect(differing).toBeGreaterThan(12);
});

test("바닥 타일맵은 빈틈없이 깔리고 모닥불 자리는 흙길이다", () => {
  const ground = campGround();
  expect(ground.width).toBe(mapCols * tileSize);
  expect(ground.height).toBe(mapRows * tileSize);
  for (let y = 0; y < ground.height; y += 7)
    for (let x = 0; x < ground.width; x += 7)
      expect(ground.getPixel(x, y)[3]).toBe(255);

  // 가운데(모닥불)는 흙이고, 모서리는 풀이다.
  const centre = ground.getPixel(Math.floor(ground.width / 2), Math.floor(ground.height / 2));
  const corner = ground.getPixel(2, 2);
  expect(centre.join()).not.toBe(corner.join());
});

test("오브젝트 그림은 모두 같은 팔레트로 그려지고 배치 크기와 맞는다", () => {
  for (const object of campObjects) {
    const art = objectArt(object.kind);
    expect({ w: art.width, h: art.height }).toEqual({
      w: object.w,
      h: object.h,
    });
    expect(objectSize(object.kind)).toEqual({ w: object.w, h: object.h });
    for (const color of pixelsOf(art)) {
      if (!paletteColors.has(color)) {
        // 그림자 픽셀은 팔레트의 그림자 색을 알파만 낮춰 쓴다.
        expect(color).toBe("#2b1d16");
      }
    }
  }
});

test("모닥불은 타오르는 세 프레임을 가진다", () => {
  const frames = [0, 1, 2].map((index) => objectArt("campfire", index));
  const signature = (art: (typeof frames)[number]) => {
    let sum = 0;
    for (let y = 0; y < art.height; y += 1)
      for (let x = 0; x < art.width; x += 1) sum += art.getPixel(x, y).join("").length * (x + y);
    return sum;
  };
  expect(new Set(frames.map(signature)).size).toBe(3);
});
