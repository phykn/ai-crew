// 프롬프트에 싣는 프로젝트 위키 참고 자료. 도구를 쓸 수 있는 모델도, 없는 모델도
// 같은 자료에서 시작하도록 목차와 요청에 겹치는 문서 본문을 함께 만든다.
// 문서가 많아도 토큰이 터지지 않게 목차·본문 모두 글자 예산 안에서 자른다.

export type WikiDigest = {
  id: string;
  title: string;
  version: number;
  body: string;
  links: string[];
};

export type WikiReference = {
  /** 모든 문서의 제목과 한 줄 요약. 예산을 넘긴 문서 수는 hidden에 센다. */
  outline: { id: string; title: string; version: number; excerpt: string }[];
  /** 이번 요청과 겹치는 문서의 본문. */
  pages: { id: string; title: string; body: string }[];
  hidden: number;
};

const outlineLimit = 24;
const excerptLimit = 160;
const bodyLimit = 1400;
const pageLimit = 2;
const bodyBudget = 2800;

function flatten(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function wikiExcerpt(body: string, limit = excerptLimit) {
  const text = flatten(body);
  return text.length > limit ? text.slice(0, limit - 1) + "…" : text;
}

function words(request: string) {
  return [
    ...new Set(
      request
        .toLowerCase()
        .split(/[^0-9a-z가-힣]+/)
        .filter((word) => word.length >= 2),
    ),
  ];
}

export function wikiReference(
  pages: WikiDigest[],
  request: string,
): WikiReference {
  const outline = pages
    .slice(0, outlineLimit)
    .map(({ id, title, version, body }) => ({
      id,
      title,
      version,
      excerpt: wikiExcerpt(body),
    }));
  const terms = words(request);
  const relevant = pages
    .map((page) => ({
      page,
      score: terms.reduce(
        (sum, term) =>
          sum +
          (page.title.toLowerCase().includes(term) ? 4 : 0) +
          (page.body.toLowerCase().includes(term) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.page.title.localeCompare(right.page.title),
    );
  const chosen: WikiReference["pages"] = [];
  let used = 0;
  for (const { page } of relevant) {
    if (chosen.length >= pageLimit || used >= bodyBudget) break;
    const body =
      page.body.length > bodyLimit
        ? page.body.slice(0, bodyLimit - 1) + "…"
        : page.body;
    chosen.push({ id: page.id, title: page.title, body });
    used += body.length;
  }
  return {
    outline,
    pages: chosen,
    hidden: Math.max(0, pages.length - outlineLimit),
  };
}
