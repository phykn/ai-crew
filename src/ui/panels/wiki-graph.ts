// 위키 화면이 쓰는 순수 계산. 탐색기의 앞/뒤 연결 문서와 노드 배치를 화면 없이도
// 시험할 수 있게 React 밖에 둔다.

export type WikiPageLink = {
  id: string;
  title: string;
  body?: string;
  links: string[];
};

export type WikiLinkMap = {
  /** 이 문서가 가리키는 문서. */
  outlinks: Map<string, string[]>;
  /** 이 문서를 가리키는 문서. */
  backlinks: Map<string, string[]>;
};

/** 연결을 지금 살아 있는 문서 사이로만 좁히고, 자기 자신과 중복은 버린다. */
export function wikiLinks(pages: WikiPageLink[]): WikiLinkMap {
  const ids = new Set(pages.map(({ id }) => id));
  const outlinks = new Map<string, string[]>();
  const backlinks = new Map(pages.map(({ id }) => [id, [] as string[]]));
  for (const page of pages) {
    const targets = [...new Set(page.links)].filter(
      (id) => id !== page.id && ids.has(id),
    );
    outlinks.set(page.id, targets);
    for (const target of targets) backlinks.get(target)!.push(page.id);
  }
  return { outlinks, backlinks };
}

/** 제목과 본문에서 모든 검색어를 찾는 문서만 남긴다. 검색어가 없으면 전체. */
export function filterWikiPages<T extends WikiPageLink>(
  pages: T[],
  query: string,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return pages;
  return pages.filter((page) => {
    const text = (page.title + " " + (page.body ?? "")).toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export const wikiNodeWidth = 172;
export const wikiNodeHeight = 54;
const columnStep = 200;
const rowStep = 118;

export type WikiLayoutNode = {
  id: string;
  title: string;
  /** 시작 문서에서 몇 번 이어져야 닿는지. 시작 문서는 0. */
  depth: number;
  x: number;
  y: number;
};

export type WikiLayoutEdge = { id: string; source: string; target: string };

export type WikiLayout = {
  nodes: WikiLayoutNode[];
  edges: WikiLayoutEdge[];
  columns: number;
};

/**
 * 연결 깊이를 위에서 아래로 놓는 계층 배치. 같은 깊이의 문서는 앞 단계에서 이어지는
 * 위치의 평균 순서로 늘어놓아 선이 서로 엇갈리는 일을 줄인다. 순환 연결이 있어도
 * 깊이가 문서 수를 넘지 않게 묶어 배치가 끝나지 않는 일을 막는다.
 */
export function wikiLayout(pages: WikiPageLink[]): WikiLayout {
  if (!pages.length) return { nodes: [], edges: [], columns: 0 };
  const { outlinks, backlinks } = wikiLinks(pages);
  const ids = pages.map(({ id }) => id);
  const title = new Map(pages.map(({ id, title: text }) => [id, text]));
  const depth = new Map(ids.map((id) => [id, 0]));
  const ceiling = ids.length - 1;
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const id of ids) {
      for (const target of outlinks.get(id) ?? []) {
        const next = Math.min(ceiling, (depth.get(id) ?? 0) + 1);
        if (next > (depth.get(target) ?? 0)) {
          depth.set(target, next);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const levels: string[][] = [];
  for (const id of ids) (levels[depth.get(id) ?? 0] ??= []).push(id);
  const rows = levels
    .map((level, index) => ({ index, ids: level ?? [] }))
    .filter(({ ids: level }) => level.length > 0);
  for (const row of rows.slice(1)) {
    const above = new Map(
      (rows[rows.indexOf(row) - 1]?.ids ?? []).map((id, index) => [id, index]),
    );
    const rank = (id: string) => {
      const parents = (backlinks.get(id) ?? [])
        .map((parent) => above.get(parent))
        .filter((index): index is number => index !== undefined);
      return parents.length
        ? parents.reduce((sum, index) => sum + index, 0) / parents.length
        : Number.MAX_SAFE_INTEGER;
    };
    row.ids.sort(
      (left, right) =>
        rank(left) - rank(right) ||
        (title.get(left) ?? "").localeCompare(title.get(right) ?? ""),
    );
  }
  const nodes = rows.flatMap(({ index, ids: level }, row) =>
    level.map((id, column) => ({
      id,
      title: title.get(id) ?? "",
      depth: index,
      x: (column - (level.length - 1) / 2) * columnStep,
      y: row * rowStep,
    })),
  );
  const edges = pages.flatMap(({ id }) =>
    (outlinks.get(id) ?? []).map((target) => ({
      id: id + "/" + target,
      source: id,
      target,
    })),
  );
  return { nodes, edges, columns: rows.length };
}
