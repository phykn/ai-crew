// The decisions waiting for the user above the composer. Only one card is shown
// at a time so a stack of approvals cannot cover the conversation; the card head
// names the pending decision, counts the rest and walks to the next one.

import { useState, type ReactNode } from "react";
import {
  approvalLabels,
  planFiles,
  type Action,
  type Snapshot,
} from "../../../shared/actions";

type DecisionStackProps = {
  data: Snapshot | null;
  approval: Snapshot["jobs"][number] | undefined;
  approvalEvent: Snapshot["fileApprovals"][number] | undefined;
  toolApproval: Snapshot["toolApprovals"][number] | undefined;
  followup: Snapshot["followups"][number] | undefined;
  firstQuestion: Snapshot["jobs"][number] | undefined;
  revision: { id: string; text: string; questionId?: string } | null;
  setRevision: (
    revision: { id: string; text: string; questionId?: string } | null,
  ) => void;
  composer: { current: HTMLTextAreaElement | null };
  run: (action: Action) => Promise<boolean>;
  openLog: (jobId: string) => void;
};

export function DecisionStack({
  data,
  approval,
  approvalEvent,
  toolApproval,
  followup,
  firstQuestion,
  revision,
  setRevision,
  composer,
  run,
  openLog,
}: DecisionStackProps) {
  const [cursor, setCursor] = useState<string | null>(null);
  const session = data?.session;
  const cards: { key: string; label: string; body: ReactNode }[] = [];

  if (toolApproval && data)
    cards.push({
      key: "tool:" + toolApproval.id,
      label: "MCP 변경 도구 승인",
      body: (
        <>
          <div className="decision-scope">
            <button
              className="decision-job"
              type="button"
              aria-label="승인 업무 로그 열기"
              onClick={() => openLog(toolApproval.jobId)}
            >
              {data.jobs.find(({ id }) => id === toolApproval.jobId)?.plan
                ?.goal ??
                data.jobs.find(({ id }) => id === toolApproval.jobId)?.request ??
                "업무"}
            </button>
            <p>
              <strong>
                {toolApproval.serverName}/{toolApproval.toolName}
              </strong>{" "}
              변경 도구를 실행할까요?
            </p>
            <small>
              {toolApproval.memberName} 요청 · {toolApproval.scope} · 요청 시
              승인 {approvalLabels[toolApproval.mode]}
            </small>
          </div>
          <div className="decision-actions">
            <button
              className="approved"
              type="button"
              onClick={() =>
                void run({
                  type: "mcp.answer",
                  jobId: toolApproval.jobId,
                  requestId: toolApproval.id,
                  allow: true,
                })
              }
            >
              허용
            </button>
            <button
              type="button"
              onClick={() =>
                void run({
                  type: "mcp.answer",
                  jobId: toolApproval.jobId,
                  requestId: toolApproval.id,
                  allow: false,
                })
              }
            >
              거절
            </button>
          </div>
        </>
      ),
    });

  if (approval?.plan && approval.approvalId)
    cards.push({
      key: "file:" + approval.approvalId,
      label: "권한 승인",
      body: (
        <>
          <div className="decision-scope">
            <button
              className="decision-job"
              type="button"
              aria-label="승인 업무 로그 열기"
              onClick={() => openLog(approval.id)}
            >
              {approval.plan.goal}
            </button>
            <p>
              {approval.plan.moves?.length ? (
                "이 경로로 파일을 옮길까요?"
              ) : planFiles(approval.plan).length === 1 ? (
                <>
                  <strong>{approval.plan.path}</strong>{" "}
                  {approval.plan.baseline === null
                    ? "파일을 만들까요?"
                    : "파일을 수정할까요?"}
                </>
              ) : (
                "이 파일들을 변경할까요?"
              )}
            </p>
            {(planFiles(approval.plan).length > 1 ||
              Boolean(approval.plan.moves?.length)) && (
              <ul>
                {planFiles(approval.plan).map(({ path, baseline }) => {
                  const move = approval.plan!.moves?.find(
                    ({ to }) => to === path,
                  );
                  return (
                    <li key={path}>
                      {move
                        ? move.from +
                          " → " +
                          path +
                          (move.edit ? " · 이동 및 수정" : " · 이동")
                        : path + (baseline === null ? " · 생성" : " · 수정")}
                    </li>
                  );
                })}
              </ul>
            )}
            {approval.plan.directories?.length ? (
              <p>폴더 예약 · {approval.plan.directories.join(", ")}</p>
            ) : null}
            <small>
              {approval.plan.criterion}
              {approvalEvent &&
                " · 요청 시 승인 " + approvalLabels[approvalEvent.mode]}
            </small>
          </div>
          <div className="decision-actions">
            <button
              className="approved"
              type="button"
              onClick={() =>
                void run({
                  type: "job.answer",
                  jobId: approval.id,
                  requestId: approval.approvalId!,
                  allow: true,
                })
              }
            >
              허용
            </button>
            <button
              type="button"
              onClick={() =>
                void run({
                  type: "job.answer",
                  jobId: approval.id,
                  requestId: approval.approvalId!,
                  allow: false,
                })
              }
            >
              거절
            </button>
          </div>
        </>
      ),
    });

  if (firstQuestion?.clarification && !revision?.questionId)
    cards.push({
      key: "question:" + firstQuestion.clarification.id,
      label: "비서의 확인 질문",
      body: (
        <>
          <div className="decision-scope">
            <p>{firstQuestion.clarification.text}</p>
            <small>{firstQuestion.plan?.goal}</small>
          </div>
          <div className="decision-actions">
            <button
              className="approved"
              type="button"
              onClick={() => {
                setRevision({
                  id: firstQuestion.id,
                  text: "",
                  questionId: firstQuestion.clarification!.id,
                });
                composer.current?.focus();
              }}
            >
              답변
            </button>
          </div>
        </>
      ),
    });

  if (followup && session)
    cards.push({
      key: "followup:" + followup.id,
      label: "추가 지시 업무 선택",
      body: (
        <>
          <div className="decision-scope">
            <p>어느 업무에 적용할까요?</p>
            <small>{followup.text}</small>
          </div>
          <div className="decision-actions">
            {followup.candidateIds.map((id) => {
              const job = data?.jobs.find((item) => item.id === id);
              return (
                job && (
                  <button
                    type="button"
                    key={id}
                    onClick={() =>
                      void run({
                        type: "job.followup.select",
                        sessionId: session.id,
                        requestId: followup.id,
                        jobId: id,
                      })
                    }
                  >
                    {job.plan?.goal ?? job.request}
                  </button>
                )
              );
            })}
            <button
              type="button"
              onClick={() =>
                void run({
                  type: "job.followup.select",
                  sessionId: session.id,
                  requestId: followup.id,
                  jobId: null,
                })
              }
            >
              취소
            </button>
          </div>
        </>
      ),
    });

  if (!cards.length) return null;
  const active = cards.find(({ key }) => key === cursor) ?? cards[0];
  const step = () => {
    const index = cards.findIndex(({ key }) => key === active.key);
    setCursor(cards[(index + 1) % cards.length].key);
  };
  return (
    <section className="decision" aria-label="대기 중인 결정">
      <div className="decision-head">
        <span className="decision-kind">{active.label}</span>
        {cards.length > 1 && (
          <>
            <span className="decision-rest">대기 +{cards.length - 1}건</span>
            <button
              type="button"
              className="decision-next"
              aria-label={
                "다음 대기 " + (cards.length - 1) + "건 중 하나 보기"
              }
              onClick={step}
            >
              다음 ›
            </button>
          </>
        )}
      </div>
      <section className="decision-body" aria-label={active.label}>
        {active.body}
      </section>
    </section>
  );
}
