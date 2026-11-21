import { useState } from "react";
import type { CrewMemory, Snapshot } from "../../../shared/actions";

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
    <section className="logs memory-panel" aria-label="메모리">
      <label>
        기억 범위{" "}
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
      {!memories?.length && <p className="muted">저장된 기억이 없어요.</p>}
      {memories?.map((memory) => (
        <details className="change-log" key={memory.id}>
          <summary>{memory.body.trim().split("\n")[0].slice(0, 90)}</summary>
          <p className="memory-body">{memory.body}</p>
          <p className="muted">
            {memberLabel(memory.ownerId)} · {memory.authorName} ·{" "}
            <time dateTime={memory.createdAt}>{new Date(memory.createdAt).toLocaleString()}</time>
          </p>
          {data?.sessions.some(({ id }) => id === memory.sourceSessionId) && (
            <button className="log-link" type="button" onClick={() => source(memory)}>
              {memory.sourceJobId ? "출처 업무 열기" : "출처 대화 열기"}
            </button>
          )}
          {confirm === memory.id ? (
            <div className="memory-confirm">
              <button type="button" onClick={() => void remove(memory.id).then((ok) => {
                if (ok) setConfirm(null);
              })}>삭제 확인</button>
              <button type="button" onClick={() => setConfirm(null)}>취소</button>
            </div>
          ) : (
            <button className="log-link" type="button" onClick={() => setConfirm(memory.id)}>
              기억 삭제
            </button>
          )}
        </details>
      ))}
    </section>
  );
}
