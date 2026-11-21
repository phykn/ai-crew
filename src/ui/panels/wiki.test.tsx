import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CrewStore } from "../../store/store";
import { WikiPanel, WikiLinkGroups } from "./wiki";
import { wikiLinks } from "./wiki-graph";

function withStore(run: (store: CrewStore, folder: string) => void) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-wiki-ui-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    run(store, folder);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
}

test("탐색기는 검색창과 문서 목록, 참조 수를 보여 준다", () => {
  withStore((store) => {
    const sessionId = store.snapshot().session!.id;
    const target = randomUUID();
    store.saveWiki(sessionId, {
      id: target,
      version: 0,
      title: "실행 방법",
      body: "npm test 로 확인",
      links: [],
    });
    store.saveWiki(sessionId, {
      id: randomUUID(),
      version: 0,
      title: "폴더 경계",
      body: "src 안에서만",
      links: [target],
    });
    const html = renderToStaticMarkup(
      <WikiPanel
        data={store.snapshot()}
        run={async () => true}
        source={() => {}}
        openRule={() => {}}
        error=""
      />,
    );
    expect(html).toContain('aria-label="위키 검색"');
    expect(html).toContain("제목·본문 검색");
    expect(html).toContain("2개 문서");
    expect(html).toContain("실행 방법");
    expect(html).toContain("참조 1");
  });
});

test("앞 문서와 뒤 문서를 클릭 가능한 칩으로 나눠 보여 준다", () => {
  withStore((store) => {
    const sessionId = store.snapshot().session!.id;
    const method = randomUUID();
    const boundary = randomUUID();
    store.saveWiki(sessionId, {
      id: method,
      version: 0,
      title: "실행 방법",
      body: "npm test",
      links: [],
    });
    store.saveWiki(sessionId, {
      id: boundary,
      version: 0,
      title: "폴더 경계",
      body: "src 안에서만",
      links: [],
    });
    // 서로를 가리키는 두 문서: 실행 방법 → 폴더 경계, 폴더 경계 → 실행 방법.
    store.saveWiki(sessionId, {
      id: method,
      version: 1,
      title: "실행 방법",
      body: "npm test",
      links: [boundary],
    });
    store.saveWiki(sessionId, {
      id: boundary,
      version: 1,
      title: "폴더 경계",
      body: "src 안에서만",
      links: [method],
    });
    const wiki = store.snapshot().wiki;
    const html = renderToStaticMarkup(
      <WikiLinkGroups
        pageId={method}
        wiki={wiki}
        links={wikiLinks(wiki)}
        open={() => {}}
      />,
    );
    expect(html).toContain("이 문서를 참조하는 문서");
    expect(html).toContain("이 문서가 가리키는 문서");
    expect(html).toContain("←");
    expect(html).toContain("→");
    expect(html).toContain("폴더 경계");
  });
});
