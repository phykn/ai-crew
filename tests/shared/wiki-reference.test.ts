import { expect, test } from "vitest";
import { wikiExcerpt, wikiReference, type WikiDigest } from "../../src/shared/wiki-reference";

const page = (
  index: number,
  body = "본문",
  title = "문서 " + index,
): WikiDigest => ({
  id: String(index).padStart(8, "0") + "-0000-4000-8000-000000000000",
  title,
  version: 1,
  body,
  links: [],
});

test("위키가 비어 있으면 빈 목차를 준다", () => {
  expect(wikiReference([], "아무 요청")).toEqual({
    outline: [],
    pages: [],
    hidden: 0,
  });
});

test("목차는 24개까지만 싣고 나머지는 빠진 수로 센다", () => {
  const pages = Array.from({ length: 30 }, (_, index) => page(index));
  const reference = wikiReference(pages, "요청");
  expect(reference.outline).toHaveLength(24);
  expect(reference.hidden).toBe(6);
  expect(reference.outline[0]).toMatchObject({ id: pages[0].id, version: 1 });
});

test("짧은 문서는 본문 전체가 들어가고 한 줄로 눌러 요약한다", () => {
  const reference = wikiReference([page(1, "첫 줄\n둘째 줄")], "요청");
  expect(reference.outline[0].excerpt).toBe("첫 줄 둘째 줄");
  expect(wikiExcerpt("가".repeat(200))).toHaveLength(160);
  expect(wikiExcerpt("가".repeat(200)).endsWith("…")).toBe(true);
});

test("요청과 겹치는 문서 두 개의 본문만 예산 안에서 싣는다", () => {
  const long = "실행 ".repeat(1200);
  const pages = [
    page(1, "npm test 로 전체 검사를 돌린다", "실행 방법"),
    page(2, "npm run check 는 타입만 본다", "타입 검사"),
    page(3, long, "npm 긴 문서"),
    page(4, "다른 이야기", "폴더 경계"),
  ];
  const reference = wikiReference(pages, "npm 실행 방법");
  expect(reference.pages).toHaveLength(2);
  expect(reference.pages[0].title).toBe("실행 방법");
  expect(reference.pages.every(({ body }) => body.length <= 1400)).toBe(true);
});

test("겹치는 문서가 없으면 목차만 준다", () => {
  const reference = wikiReference([page(1, "폴더 경계는 src 안")], "전혀 다른 낱말");
  expect(reference.outline).toHaveLength(1);
  expect(reference.pages).toEqual([]);
});
