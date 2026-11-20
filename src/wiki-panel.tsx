import { useState, type FormEvent } from "react";
import { Background, Controls, MarkerType, ReactFlow, type Node } from "@xyflow/react";
import type { Action, Snapshot, WikiPage, WikiRevision } from "./actions";
import { changedSegments } from "./text-diff";
import "@xyflow/react/dist/style.css";

type Draft = Pick<WikiPage, "id" | "version" | "title" | "body" | "links">;

export function WikiPanel({ data, run, source, openRule, error }: {
  data: Snapshot;
  run: (action: Action) => Promise<boolean>;
  source: (revision: WikiRevision) => void;
  openRule: () => void;
  error: string;
}) {
  const [layout, setLayout] = useState<"list" | "graph">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmationVersion, setConfirmationVersion] = useState<number | null>(null);
  const page = data.wiki.find(({ id }) => id === selected);
  const draftPage = draft && data.wiki.find(({ id }) => id === draft.id);

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

  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(data.wiki.length))));
  const rule =
    data.workflows.find(({ id }) => id === data.session?.workflowId) ??
    data.workflows[0];
  const linkedRule =
    rule && page && page.body.includes(rule.name) ? rule : undefined;
  const nodes: Node[] = data.wiki.map((item, index) => ({
    id: item.id,
    ariaLabel: item.title,
    width: 176,
    height: 52,
    position: { x: (index % columns) * 205, y: Math.floor(index / columns) * 96 },
    data: { label: <button type="button" onClick={() => open(item.id)}>{item.title}</button> },
  }));
  const edges = data.wiki.flatMap(({ id, links }) => links.map((target) => ({
    id: `${id}/${target}`,
    source: id,
    target,
  })));

  return (
    <section className="logs wiki-panel" aria-label="프로젝트 위키 문서">
      <div className="wiki-controls">
        <button type="button" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>목록</button>
        <button type="button" aria-pressed={layout === "graph"} onClick={() => setLayout("graph")}>노드</button>
        {data.session && <button type="button" disabled={!!draft} onClick={() => setDraft({
          id: crypto.randomUUID(), version: 0, title: "", body: "", links: [],
        })}>문서 추가</button>}
      </div>
      {!data.wiki.length && <p className="muted">위키 문서가 없어요.</p>}
      {layout === "list" ? (
        <ul className="wiki-list">
          {data.wiki.map(({ id, title }) => (
            <li key={id}><button type="button" aria-current={id === selected} onClick={() => open(id)}>{title}</button></li>
          ))}
        </ul>
      ) : !!nodes.length && (
        <div className="wiki-graph" aria-label="위키 노드 보기">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }}
            fitView
            minZoom={0.15}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            onNodeClick={(_, node) => open(node.id)}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
      {draft ? (
        <form className="wiki-editor" onSubmit={(event) => void save(event)}>
          {draftPage && draft.version !== draftPage.version && (
            <details>
              <summary>다른 곳에서 새 버전을 저장했어요.</summary>
              <p className="memory-body">{draftPage.body}</p>
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
          <h2>{page.title}</h2>
          <p className="memory-body">{page.body}</p>
          {linkedRule && (
            <p className="muted">
              적용 중인 규칙 · {linkedRule.name} v{linkedRule.version}{" "}
              <button type="button" className="log-link" onClick={openRule}>
                편집기 열기
              </button>
            </p>
          )}
          {!!page.links.length && <div className="wiki-controls">
            {page.links.map((id) => <button key={id} type="button" className="log-link" onClick={() => open(id)}>{data.wiki.find((item) => item.id === id)?.title}</button>)}
          </div>}
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
                  <p className="memory-body">{page.revisions[index + 1].body}</p>
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
