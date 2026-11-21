import { useState } from "react";
import type { CrewMemory, Snapshot } from "../../../shared/actions";
import { CozyDetails, EmptyState } from "../common/cozy";

export function MemoryPanel({
  data,
  owner,
  select,
  remove,
  source,
}: {
  data: Snapshot | null;
  owner: string | null | undefined;
  select: (owner: string | null | undefined) => void;
  remove: (id: string) => Promise<boolean>;
  source: (memory: CrewMemory) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const memories = data?.memories.filter(
    (memory) => owner === undefined || memory.ownerId === owner,
  );
  const memberLabel = (id: string | null) =>
    id === null
      ? "프로젝트 공통"
      : data?.members.find((member) => member.id === id)?.name ?? "이전 팀원";
  const knownOwners = new Set(data?.memories.map(({ ownerId }) => ownerId));
  if (owner !== undefined) knownOwners.add(owner);
  return (
    <section className="logs memory-panel cozy-scope" aria-label="메모리">
      <header className="panel-tools">
        <span className="panel-heading">
          <b>{memories?.length ?? 0}</b>개의 기억
        </span>
        <label className="cozy-field">
          기억 범위
          <select
            value={owner === undefined ? "all" : owner ?? "shared"}
            onChange={(event) => {
              const value = event.target.value;
              select(value === "all" ? undefined : value === "shared" ? null : value);
              setConfirm(null);
            }}
          >
            <option value="all">전체</option>
            <option value="shared">프로젝트 공통</option>
            {[...knownOwners].filter((id) => id !== null).map((id) => (
              <option key={id} value={id}>{memberLabel(id)}</option>
            ))}
          </select>
        </label>
      </header>
      <div className="cozy-stack">
        {memories?.map((memory) => (
          <CozyDetails
            className="memory-card"
            key={memory.id}
            title={memory.body.trim().split("\n")[0].slice(0, 90)}
            aside={
              <span className="cozy-badge">{memberLabel(memory.ownerId)}</span>
            }
          >
            <p className="memory-body">{memory.body}</p>
            <p className="cozy-meta">
              {memberLabel(memory.ownerId)} · {memory.authorName} ·{" "}
              <time dateTime={memory.createdAt}>
                {new Date(memory.createdAt).toLocaleString()}
              </time>
            </p>
            <div className="cozy-actions">
              {data?.sessions.some(({ id }) => id === memory.sourceSessionId) && (
                <button className="log-link" type="button" onClick={() => source(memory)}>
                  {memory.sourceJobId ? "출처 업무 열기" : "출처 대화 열기"}
                </button>
              )}
              {confirm === memory.id ? (
                <span className="memory-confirm">
                  <button type="button" onClick={() => void remove(memory.id).then((ok) => {
                    if (ok) setConfirm(null);
                  })}>삭제 확인</button>
                  <button type="button" onClick={() => setConfirm(null)}>취소</button>
                </span>
              ) : (
                <button className="log-link" type="button" onClick={() => setConfirm(memory.id)}>
                  기억 삭제
                </button>
              )}
            </div>
          </CozyDetails>
        ))}
      </div>
      {!memories?.length && (
        <EmptyState icon="memory" title="저장된 기억이 없어요.">
          비서에게 “이건 기억해 둬”라고 하면 프로젝트 기억으로 남습니다.
        </EmptyState>
      )}
    </section>
  );
}
