import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  benchArt,
  campBackground,
  crewAnimations,
  crewArt,
  crewColumns,
  crewPortraits,
  fireArt,
} from "../../../../../src/frontend/ui/camp/art/scene";
import { campObjects } from "../../../../../src/frontend/ui/camp/behavior";

/** Reads the real pixel size out of a WebP header, lossy or lossless. */
function webpSize(name: string) {
  const buffer = readFileSync(
    fileURLToPath(
      new URL(
        `../../../../../src/frontend/ui/camp/art/${name}`,
        import.meta.url,
      ),
    ),
  );
  expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buffer.toString("ascii", 8, 12)).toBe("WEBP");
  const kind = buffer.toString("ascii", 12, 16);
  if (kind === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X")
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  return {
    width: buffer.readUInt16LE(26) & 0x3fff,
    height: buffer.readUInt16LE(28) & 0x3fff,
  };
}

test("공터 배경은 캠프 좌표가 붙는 한 장의 그림이다", () => {
  expect(campBackground.url).toContain("camp-bg.webp");
  expect(webpSize("camp-bg.webp")).toEqual({
    width: campBackground.width,
    height: campBackground.height,
  });
  // 백분율 좌표가 배경 픽셀과 같은 비율을 유지한다.
  expect(campBackground.width / campBackground.height).toBeCloseTo(1.04, 2);
});

test("크루 아홉은 같은 칸 크기의 스프라이트 띠를 쓴다", () => {
  expect(crewArt.sheets).toHaveLength(9);
  const seen = new Set<string>();
  crewArt.sheets.forEach((url, role) => {
    expect(url).toContain(`crew-${role}.webp`);
    seen.add(url);
    expect(webpSize(`crew-${role}.webp`)).toEqual({
      width: crewArt.cellWidth * 5,
      height: crewArt.cellHeight,
    });
  });
  expect(seen.size).toBe(9);
  // 서 있는 그림의 키가 곧 칸 높이다. 다른 자세도 이 칸 안에서 발이 바닥에 닿는다.
  expect(crewArt.height).toBe(crewArt.cellHeight);
});

test("자세마다 다른 칸을 쓰고 애니메이션은 있는 자세만 고른다", () => {
  const columns = Object.values(crewColumns);
  expect(columns).toEqual([0, 1, 2, 3, 4]);
  expect(new Set(columns).size).toBe(columns.length);
  for (const poses of Object.values(crewAnimations))
    for (const pose of poses) expect(crewColumns).toHaveProperty(pose);
  // 걷기는 두 칸을 번갈아 쓴다.
  expect(crewAnimations.walk).toHaveLength(2);
});

test("벤치와 모닥불 그림이 오브젝트 크기와 맞는다", () => {
  expect(webpSize("bench.webp")).toEqual({
    width: benchArt.width,
    height: benchArt.height,
  });
  expect(webpSize("fire.webp")).toEqual({
    width: fireArt.cellWidth * fireArt.frames,
    height: fireArt.cellHeight,
  });
  for (const object of campObjects) {
    const width = object.kind === "bench" ? benchArt.width : fireArt.cellWidth;
    const height = object.kind === "bench" ? benchArt.height : fireArt.cellHeight;
    expect({ w: object.w, h: object.h }).toEqual({ w: width, h: height });
  }
  // 벤치는 낮고 길며, 모닥불은 세 프레임 이상으로 탄다.
  expect(benchArt.width / benchArt.height).toBeGreaterThan(2);
  expect(fireArt.frames).toBeGreaterThanOrEqual(3);
});

test("초상 아홉 장은 모두 제자리에 있다", () => {
  expect(crewPortraits).toHaveLength(9);
  crewPortraits.forEach((url, role) => {
    expect(url).toContain(`portrait-${role}.webp`);
    const size = webpSize(`portrait-${role}.webp`);
    expect(size.width).toBe(size.height);
  });
});
