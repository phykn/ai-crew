// The log view: a job's workspace, artifacts, changes, checks and activity.

import { approvalLabels, type Action, type Snapshot } from "../../../shared/actions";
import { CheckList, ModelUsage } from "../common/ui";
import { CozyDetails, EmptyState, RoleBadge, StatusBadge } from "../common/cozy";
import { parseActivity } from "./worklog-format";

type WorklogPanelProps = {
  data: Snapshot | null;
  logJob: string | null;
  selectedLogJob: Snapshot["jobs"][number] | undefined;
  run: (action: Action, resetDraft?: boolean) => Promise<boolean>;
  setLogJob: (jobId: string | null) => void;
  setView: (tab: Snapshot["view"]["tab"]) => void;
  close?: () => void;
};

export function WorklogPanel({
  data,
  logJob,
  selectedLogJob,
  run,
  setLogJob,
  setView,
  close,
}: WorklogPanelProps) {
  const activity =
    data?.activity.filter((entry) => !logJob || entry.jobId === logJob) || [];
  const changes =
    data?.changes.filter((change) => !logJob || change.jobId === logJob) || [];
  const rows = activity.map((entry) =>
    parseActivity(entry, data?.members ?? []),
  );
  return (
    <div className="logs worklog-panel cozy-scope" aria-label="로그">
      {logJob && (
        <section className="cozy-card job-log-header">
          <div className="job-log-crumbs">
            <button className="log-link" onClick={() => setLogJob(null)}>
              ← 전체 기록
            </button>
            {selectedLogJob && (
              <button
                className="log-link"
                onClick={() => (close ? close() : setView("chat"))}
              >
                업무로 돌아가기
              </button>
            )}
          </div>
          {selectedLogJob && (
            <h2>{selectedLogJob.plan?.goal ?? selectedLogJob.request}</h2>
          )}
          {selectedLogJob && (
            <div className="job-workspace">
              {selectedLogJob.worktree ? (
                <>
                  <span className="cozy-meta">
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
        </section>
      )}
      <ModelUsage runs={data?.modelRuns ?? []} jobId={logJob} />
      {!!data?.artifacts.filter(({ jobId }) => !logJob || jobId === logJob)
        .length && (
        <CozyDetails title="산출물" className="artifact-log">
          <ul className="cozy-list">
            {data.artifacts
              .filter(({ jobId }) => !logJob || jobId === logJob)
              .map((artifact) => (
                <li key={artifact.id}>
                  <strong>{artifact.name}</strong>
                  <span className="cozy-meta">
                    <code>{artifact.path}</code> ·{" "}
                    <code>{artifact.hash.slice(0, 8)}</code> · 산출물{" "}
                    <code>{artifact.id.slice(0, 8)}</code>
                  </span>
                </li>
              ))}
          </ul>
        </CozyDetails>
      )}
      {selectedLogJob &&
        data?.fileApprovals
          .filter(({ jobId }) => jobId === selectedLogJob.id)
          .map((item) => (
            <p className="log-note" key={item.id}>
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
          <p className="log-note" key={item.id}>
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
        <CozyDetails
          className="change-log"
          key={change.id}
          title={
            <>
              {change.movedFrom ? change.movedFrom + " → " : ""}
              {change.path} <code>{change.afterHash.slice(0, 8)}</code>
            </>
          }
        >
          <p className="cozy-meta">
            {change.beforeHash
              ? change.beforeHash.slice(0, 8)
              : "신규 파일"}{" "}
            → {change.afterHash.slice(0, 8)} ·{" "}
            <time dateTime={change.savedAt}>
              {new Date(change.savedAt).toLocaleString()}
            </time>
          </p>
          {change.authorMemberId && (
            <p className="cozy-meta">
              작성 ·{" "}
              {data?.members.find(
                ({ id }) => id === change.authorMemberId,
              )?.name ?? change.authorMemberId}
            </p>
          )}
          <CheckList checks={change.checks} />
          {change.previousChecks.length > 0 && (
            <section className="previous-checks">
              <h4>이전 검증 {change.previousChecks.length}건</h4>
              {change.previousChecks.map((checks) => (
                <section key={checks[0].batchId}>
                  <time dateTime={checks[0].checkedAt}>
                    {new Date(checks[0].checkedAt).toLocaleString()}
                  </time>
                  <CheckList checks={checks} />
                </section>
              ))}
            </section>
          )}
        </CozyDetails>
      ))}
      <section className="activity-log" aria-label="활동 기록">
        {rows.length > 0 && <h3 className="log-section-title">활동 기록</h3>}
        {rows.length > 0 && (
          <div className="activity-list">
            {activity.map((entry, index) => {
              const row = rows[index];
              return (
                <div className="activity-row" key={entry.id}>
                  <time className="activity-time" dateTime={entry.recordedAt ?? undefined}>
                    {row.time}
                  </time>
                  <StatusBadge status={row.status} />
                  <RoleBadge label={row.label} color={row.color} />
                  <p className="activity-text">{row.body}</p>
                </div>
              );
            })}
          </div>
        )}
        {!rows.length && (
          <EmptyState icon="log" title="아직 활동 기록이 없어요.">
            업무를 시작하면 누가 무엇을 했는지 이곳에 차곡차곡 쌓입니다.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
