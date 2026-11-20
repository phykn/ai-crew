// The log view: a job's workspace, artifacts, changes, checks and activity.

import { approvalLabels, type Action, type Snapshot } from "./actions";
import { CheckList, ModelUsage } from "./renderer-ui";

type WorklogPanelProps = {
  data: Snapshot | null;
  logJob: string | null;
  selectedLogJob: Snapshot["jobs"][number] | undefined;
  run: (action: Action, resetDraft?: boolean) => Promise<boolean>;
  setLogJob: (jobId: string | null) => void;
  setView: (tab: Snapshot["view"]["tab"]) => void;
};

export function WorklogPanel({
  data,
  logJob,
  selectedLogJob,
  run,
  setLogJob,
  setView,
}: WorklogPanelProps) {
  const activity =
    data?.activity.filter((entry) => !logJob || entry.jobId === logJob) || [];
  const changes =
    data?.changes.filter((change) => !logJob || change.jobId === logJob) || [];
  return (
    <div className="logs" aria-label="로그">
      {logJob && (
        <div className="job-log-header">
          <button className="log-link" onClick={() => setLogJob(null)}>
            ← 전체 기록
          </button>
          {selectedLogJob && (
            <button className="log-link" onClick={() => setView("chat")}>
              업무로 돌아가기
            </button>
          )}
          {selectedLogJob && (
            <h2>{selectedLogJob.plan?.goal ?? selectedLogJob.request}</h2>
          )}
          {selectedLogJob && (
            <div className="job-workspace">
              {selectedLogJob.worktree ? (
                <>
                  <span className="muted">
                    격리 작업공간 · {selectedLogJob.branch} @{" "}
                    {selectedLogJob.baseCommit?.slice(0, 8)}
                    {selectedLogJob.applyState === "applied"
                      ? " · 반영됨"
                      : selectedLogJob.applyState === "blocked"
                        ? " · 반영 대기 · " +
                          (selectedLogJob.applyNote ?? "")
                        : ""}
                  </span>
                  {selectedLogJob.state === "complete" &&
                    selectedLogJob.applyState !== "applied" && (
                      <button
                        type="button"
                        onClick={() =>
                          void run({
                            type: "job.apply",
                            jobId: selectedLogJob.id,
                          })
                        }
                      >
                        원본에 반영
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() =>
                      void run({
                        type: "job.cleanup",
                        jobId: selectedLogJob.id,
                      })
                    }
                  >
                    작업공간 정리
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    void run({
                      type: "job.workspace",
                      jobId: selectedLogJob.id,
                    })
                  }
                >
                  격리 실행 준비
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <ModelUsage runs={data?.modelRuns ?? []} jobId={logJob} />
      {!!data?.artifacts.filter(({ jobId }) => !logJob || jobId === logJob)
        .length && (
        <details className="change-log">
          <summary>산출물</summary>
          <ul>
            {data.artifacts
              .filter(({ jobId }) => !logJob || jobId === logJob)
              .map((artifact) => (
                <li key={artifact.id}>
                  {artifact.name} · <code>{artifact.path}</code> ·{" "}
                  <code>{artifact.hash.slice(0, 8)}</code> · 산출물{" "}
                  <code>{artifact.id.slice(0, 8)}</code>
                </li>
              ))}
          </ul>
        </details>
      )}
      {selectedLogJob &&
        data?.fileApprovals
          .filter(({ jobId }) => jobId === selectedLogJob.id)
          .map((item) => (
            <p key={item.id}>
              승인 {approvalLabels[item.mode]} · {item.scope} ·{" "}
              {item.decision
                ? (item.decision === "allow" ? "허용" : "거절") +
                  " · " +
                  item.actor
                : "결정 기록 없음"}
            </p>
          ))}
      {data?.toolApprovals
        .filter(({ jobId }) => !logJob || jobId === logJob)
        .map((item) => (
          <p key={item.id}>
            MCP {item.serverName}/{item.toolName} · {item.memberName} ·{" "}
            {item.decision
              ? (item.decision === "allow" ? "허용" : "거절") +
                " · " +
                item.actor
              : "승인 대기 · " + approvalLabels[item.mode]}
            {" · "}
            <code>{item.scope}</code>
          </p>
        ))}
      {changes.map((change) => (
        <details className="change-log" key={change.id}>
          <summary>
            {change.movedFrom ? change.movedFrom + " → " : ""}
            {change.path} <code>{change.afterHash.slice(0, 8)}</code>
          </summary>
          <p className="muted">
            {change.beforeHash
              ? change.beforeHash.slice(0, 8)
              : "신규 파일"}{" "}
            → {change.afterHash.slice(0, 8)} ·{" "}
            <time dateTime={change.savedAt}>
              {new Date(change.savedAt).toLocaleString()}
            </time>
          </p>
          {change.authorMemberId && (
            <p className="muted">
              작성 ·{" "}
              {data?.members.find(
                ({ id }) => id === change.authorMemberId,
              )?.name ?? change.authorMemberId}
            </p>
          )}
          <CheckList checks={change.checks} />
          {change.previousChecks.length > 0 && (
            <details>
              <summary>
                이전 검증 {change.previousChecks.length}건
              </summary>
              {change.previousChecks.map((checks) => (
                <section key={checks[0].batchId}>
                  <time dateTime={checks[0].checkedAt}>
                    {new Date(checks[0].checkedAt).toLocaleString()}
                  </time>
                  <CheckList checks={checks} />
                </section>
              ))}
            </details>
          )}
        </details>
      ))}
      {activity.map((entry) => (
        <p key={entry.id}>
          {entry.recordedAt && (
            <time className="activity-time" dateTime={entry.recordedAt}>
              {new Date(entry.recordedAt).toLocaleTimeString()}
            </time>
          )}
          {entry.text}
        </p>
      ))}
      {!activity.length && (
        <p className="muted">아직 활동 기록이 없어요.</p>
      )}
    </div>
  );
}
