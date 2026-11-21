import { expect, test } from "vitest";
import { filterWikiPages, wikiLayout, wikiLinks } from "../../../../src/frontend/ui/panels/wiki-graph";

const page = (id: string, title: string, links: string[] = [], body = "") => ({
  id,
  title,
  body,
  links,
});

test("앞 문서와 뒤 문서를 따로 세고, 없는 문서·자기 자신으로 가는 연결은 버린다", () => {
  const pages = [
    page("a", "A", ["b", "b", "a", "missing"]),
    page("b", "B"),
    page("c", "C", ["b"]),
  ];
  const { outlinks, backlinks } = wikiLinks(pages);
  expect(outlinks.get("a")).toEqual(["b"]);
  expect(outlinks.get("c")).toEqual(["b"]);
  expect(backlinks.get("b")).toEqual(["a", "c"]);
  expect(backlinks.get("a")).toEqual([]);
});

test("검색은 제목과 본문의 모든 검색어를 본다", () => {
  const pages = [
    page("a", "실행 방법", [], "npm test 로 확인"),
    page("b", "폴더 경계", [], "src 안에서만 둔다"),
  ];
  expect(filterWikiPages(pages, "npm").map(({ id }) => id)).toEqual(["a"]);
  expect(filterWikiPages(pages, "폴더 경계").map(({ id }) => id)).toEqual(["b"]);
  expect(filterWikiPages(pages, "폴더 src").map(({ id }) => id)).toEqual(["b"]);
  expect(filterWikiPages(pages, "   ").length).toBe(2);
  expect(filterWikiPages(pages, "없는말")).toEqual([]);
});

test("연결 깊이 순서로 위에서 아래로 놓고 부모를 자식보다 위에 둔다", () => {
  const pages = [page("c", "C"), page("b", "B", ["c"]), page("a", "A", ["b"])];
  const { nodes, edges, columns } = wikiLayout(pages);
  expect(columns).toBe(3);
  const at = (id: string) => nodes.find((node) => node.id === id)!;
  expect(at("a").depth).toBe(0);
  expect(at("b").depth).toBe(1);
  expect(at("c").depth).toBe(2);
  expect(at("a").y).toBeLessThan(at("b").y);
  expect(at("b").y).toBeLessThan(at("c").y);
  expect(edges).toEqual([
    { id: "b/c", source: "b", target: "c" },
    { id: "a/b", source: "a", target: "b" },
  ]);
});

test("같은 단계의 문서는 앞 단계 부모 순서를 따라 늘어선다", () => {
  const pages = [
    page("c", "C"),
    page("d", "D"),
    page("e", "E"),
    page("f", "F"),
    page("a", "A", ["c", "d"]),
    page("b", "B", ["e", "f"]),
  ];
  const { nodes } = wikiLayout(pages);
  const second = nodes
    .filter(({ depth }) => depth === 1)
    .sort((left, right) => left.x - right.x)
    .map(({ id }) => id);
  expect(second).toEqual(["c", "d", "e", "f"]);
  expect(nodes.find(({ id }) => id === "a")!.y).toBe(
    nodes.find(({ id }) => id === "b")!.y,
  );
});

test("순환 연결이 있어도 배치가 끝나고 깊이가 문서 수를 넘지 않는다", () => {
  const pages = [page("a", "A", ["b"]), page("b", "B", ["c"]), page("c", "C", ["a"])];
  const { nodes } = wikiLayout(pages);
  expect(nodes).toHaveLength(3);
  for (const node of nodes) {
    expect(node.depth).toBeGreaterThanOrEqual(0);
    expect(node.depth).toBeLessThan(pages.length);
    expect(Number.isFinite(node.x)).toBe(true);
    expect(Number.isFinite(node.y)).toBe(true);
  }
});

test("문서가 없으면 빈 배치를 준다", () => {
  expect(wikiLayout([])).toEqual({ nodes: [], edges: [], columns: 0 });
});
