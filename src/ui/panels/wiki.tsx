import { useMemo, useState, type FormEvent } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { Action, Snapshot, WikiPage, WikiRevision } from "../../shared/actions";
import { changedSegments } from "../common/text-diff";
import { Markdown } from "../common/markdown";
import {
  filterWikiPages,
  wikiLayout,
  wikiLinks,
  wikiNodeHeight,
  wikiNodeWidth,
  type WikiLinkMap,
} from "./wiki-graph";
import "@xyflow/react/dist/style.css";

type Draft = Pick<WikiPage, "id" | "version" | "title" | "body" | "links">;

/** 이 문서를 가리키거나 이 문서가 가리키는 문서로 바로 건너가는 칩. */
function WikiChips({
  ids,
  wiki,
  open,
  arrow,
}: {
  ids: string[];
  wiki: WikiPage[];
  open: (id: string) => void;
  arrow: string;
}) {
  return (
    <div className="wiki-chips">
      {ids.map((id) => (
        <button key={id} type="button" className="wiki-chip" onClick={() => open(id)}>
          <span className="wiki-chip-arrow" aria-hidden="true">
            {arrow}
          </span>
          {wiki.find((page) => page.id === id)?.title ?? "삭제된 문서"}
        </button>
      ))}
    </div>
  );
}

/** 앞/뒤 연결 문서를 클릭 가능한 칩으로 보여 준다. 탐색기와 그래프가 같이 쓴다. */
export function WikiLinkGroups({
  pageId,
  wiki,
  links,
  open,
}: {
  pageId: string;
  wiki: WikiPage[];
  links: WikiLinkMap;
  open: (id: string) => void;
}) {
  return (
    <nav className="wiki-links" aria-label="연결 문서">
      <section className="wiki-link-group">
        <h3>이 문서를 참조하는 문서</h3>
        {links.backlinks.get(pageId)?.length ? (
          <WikiChips ids={links.backlinks.get(pageId)!} wiki={wiki} open={open} arrow="←" />
        ) : (
          <p className="muted">아직 없어요.</p>
        )}
      </section>
      <section className="wiki-link-group">
        <h3>이 문서가 가리키는 문서</h3>
        {links.outlinks.get(pageId)?.length ? (
          <WikiChips ids={links.outlinks.get(pageId)!} wiki={wiki} open={open} arrow="→" />
        ) : (
          <p className="muted">연결한 문서가 없어요.</p>
        )}
      </section>
    </nav>
  );
}

export function WikiPanel({ data, run, source, openRule, error }: {
  data: Snapshot;
  run: (action: Action) => Promise<boolean>;
  source: (revision: WikiRevision) => void;
  openRule: () => void;
  error: string;
}) {
  const [layout, setLayout] = useState<"list" | "graph">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmationVersion, setConfirmationVersion] = useState<number | null>(null);
  const page = data.wiki.find(({ id }) => id === selected);
  const draftPage = draft && data.wiki.find(({ id }) => id === draft.id);
  const links = useMemo(() => wikiLinks(data.wiki), [data.wiki]);
  const filtered = useMemo(() => filterWikiPages(data.wiki, query), [data.wiki, query]);
  const graph = useMemo(() => wikiLayout(data.wiki), [data.wiki]);

  function open(id: string) {
    setSelected(id);
    setConfirmationVersion(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !data.session || busy) return;
    setBusy(true);
    if (await run({
      type: "wiki.save",
      sessionId: data.session.id,
      pageId: draft.id,
      version: draft.version,
      title: draft.title,
      body: draft.body,
      links: draft.links.filter((id) => data.wiki.some((item) => item.id === id)),
    })) {
      open(draft.id);
      setDraft(null);
    }
    setBusy(false);
  }

  async function remove() {
    if (!page || !data.current || busy || confirmationVersion === null) return;
    setBusy(true);
    if (await run({ type: "wiki.remove", projectId: data.current.id, pageId: page.id, version: confirmationVersion })) {
      setSelected(null);
      setConfirmationVersion(null);
    }
    setBusy(false);
  }

  const nodes: Node[] = useMemo(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        ariaLabel: node.title,
        width: wikiNodeWidth,
        height: wikiNodeHeight,
        position: { x: node.x, y: node.y },
        className:
          "wiki-node wiki-depth-" + Math.min(4, node.depth) +
          (node.id === selected ? " is-open" : ""),
        data: { label: <button type="button" onClick={() => open(node.id)}>{node.title}</button> },
      })),
    [graph, selected],
  );
  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map(({ id, source, target }) => ({
        id,
        source,
        target,
        type: "smoothstep",
        style: { stroke: "var(--line-control)", strokeWidth: 1.4 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#a9835a" },
      })),
    [graph],
  );

  const rule =
    data.workflows.find(({ id }) => id === data.session?.workflowId) ??
    data.workflows[0];
  const linkedRule =
    rule && page && page.body.includes(rule.name) ? rule : undefined;

  return (
    <section className="logs wiki-panel" aria-label="프로젝트 위키 문서">
      <div className="wiki-controls">
        <button type="button" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>탐색기</button>
        <button type="button" aria-pressed={layout === "graph"} onClick={() => setLayout("graph")}>그래프</button>
        {data.session && <button type="button" disabled={!!draft} onClick={() => setDraft({
          id: crypto.randomUUID(), version: 0, title: "", body: "", links: [],
        })}>문서 추가</button>}
        <small className="muted">{data.wiki.length}개 문서</small>
      </div>
      {!data.wiki.length && (
        <p className="muted">위키 문서가 없어요. 비서에게 프로젝트 지식을 남겨 달라고 하거나 문서를 추가해 보세요.</p>
      )}
      {layout === "list" && (
        <>
          <div className="wiki-search">
            <input
              type="search"
              aria-label="위키 검색"
              placeholder="제목·본문 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && <small className="muted">{filtered.length}개</small>}
          </div>
          <ul className="wiki-list">
            {filtered.map(({ id, title }) => {
              const references = links.backlinks.get(id)?.length ?? 0;
              return (
                <li key={id}>
                  <button type="button" aria-current={id === selected} onClick={() => open(id)}>
                    {title}
                    {references > 0 && <small className="muted"> · 참조 {references}</small>}
                  </button>
                </li>
              );
            })}
          </ul>
          {query && !filtered.length && (
            <p className="muted">검색과 맞는 문서가 없어요.</p>
          )}
        </>
      )}
      {layout === "graph" && !!nodes.length && (
        <div className="wiki-graph" aria-label="위키 연결 그래프">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            minZoom={0.2}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            onNodeClick={(_, node) => open(node.id)}
          >
            <Background gap={18} color="#3f2f23" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
      {layout === "graph" && page && !draft && (
        <p className="wiki-graph-hint">
          <button type="button" className="log-link" onClick={() => setLayout("list")}>탐색기에서 열기</button>
        </p>
      )}
      {draft ? (
        <form className="wiki-editor" onSubmit={(event) => void save(event)}>
          {draftPage && draft.version !== draftPage.version && (
            <details>
              <summary>다른 곳에서 새 버전을 저장했어요.</summary>
              <Markdown text={draftPage.body} />
              <button type="button" onClick={() => setDraft({ ...draft, version: draftPage.version })}>최신 버전 위에서 계속 편집</button>
            </details>
          )}
          <label>제목 <input aria-label="제목" required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label>본문 <textarea aria-label="본문" required maxLength={24000} rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label>
          {!!data.wiki.filter(({ id }) => id !== draft.id).length && (
            <details>
              <summary>연결할 문서 ({draft.links.length})</summary>
              {data.wiki.filter(({ id }) => id !== draft.id).map((target) => (
                <label key={target.id} className="wiki-link">
                  <input type="checkbox" checked={draft.links.includes(target.id)} onChange={(event) => setDraft({
                    ...draft, links: event.target.checked ? [...draft.links, target.id] : draft.links.filter((id) => id !== target.id),
                  })} />
                  {target.title}
                </label>
              ))}
            </details>
          )}
          <div className="wiki-controls">
            <button type="submit" disabled={busy}>저장</button>
            <button type="button" disabled={busy} onClick={() => setDraft(null)}>취소</button>
          </div>
        </form>
      ) : page && (
        <article className="wiki-page" aria-label={page.title}>
          <header className="wiki-page-head">
            <h2>{page.title}</h2>
            <small className="muted">v{page.version}</small>
          </header>
          <Markdown text={page.body} />
          {linkedRule && (
            <p className="muted">
              적용 중인 규칙 · {linkedRule.name} v{linkedRule.version}{" "}
              <button type="button" className="log-link" onClick={openRule}>
                편집기 열기
              </button>
            </p>
          )}
          <WikiLinkGroups pageId={page.id} wiki={data.wiki} links={links} open={open} />
          <div className="wiki-controls">
            <button type="button" onClick={() => { setDraft(page); setConfirmationVersion(null); }}>편집</button>
            {confirmationVersion !== null ? (
              <><button type="button" disabled={busy} onClick={() => void remove()}>삭제 확인</button>
                <button type="button" onClick={() => setConfirmationVersion(null)}>취소</button></>
            ) : <button type="button" onClick={() => setConfirmationVersion(page.version)}>문서 삭제</button>}
          </div>
          <details>
            <summary>변경 이력 ({page.revisions.length})</summary>
            {page.revisions.map((revision, index) => (
              <details className="change-log" key={revision.version}>
                <summary>
                  {revision.version === 1 ? "생성" : "수정"} · {revision.authorName} · {revision.title} ·{" "}
                  <time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString()}</time>
                </summary>
                {page.revisions[index + 1] && <details>
                  <summary>이전 본문</summary>
                  <Markdown text={page.revisions[index + 1].body} />
                </details>}
                <p className="memory-body">
                  {(page.revisions[index + 1]
                    ? changedSegments(page.revisions[index + 1].body, revision.body)
                    : [{ text: revision.body, changed: false }]
                  ).map((segment, position) =>
                    segment.changed ? (
                      <mark className="wiki-sentence changed" key={position}>
                        {segment.text}
                      </mark>
                    ) : (
                      <span className="wiki-sentence" key={position}>
                        {segment.text}
                      </span>
                    ),
                  )}
                </p>
                {data.sessions.some(({ id }) => id === revision.sourceSessionId) ? (
                  <button type="button" className="log-link" onClick={() => source(revision)}>{revision.sourceJobId ? "출처 업무 열기" : "출처 대화 열기"}</button>
                ) : <small className="muted">삭제된 세션</small>}
              </details>
            ))}
          </details>
        </article>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
