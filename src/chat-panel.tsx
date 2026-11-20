// The chat view: running jobs, the transcript, the decisions waiting on the user,
// and the composer.

import type { FormEvent } from "react";
import {
  approvalLabels,
  planFiles,
  type Action,
  type ApprovalMode,
  type Message,
  type Snapshot,
} from "./actions";
import { Icon, phase } from "./renderer-ui";

type ChatPanelProps = {
  data: Snapshot | null;
  running: Message | undefined;
  approval: Snapshot["jobs"][number] | undefined;
  approvalEvent: Snapshot["fileApprovals"][number] | undefined;
  pendingTools: Snapshot["toolApprovals"];
  toolApproval: Snapshot["toolApprovals"][number] | undefined;
  followup: Snapshot["followups"][number] | undefined;
  firstQuestion: Snapshot["jobs"][number] | undefined;
  revision: { id: string; text: string; questionId?: string } | null;
  setRevision: (
    revision: { id: string; text: string; questionId?: string } | null,
  ) => void;
  revisionJob: Snapshot["jobs"][number] | undefined;
  sending: boolean;
  composeText: string;
  clearing: boolean;
  commandSuggestions: [string, string][];
  error: string;
  menu: "projects" | "sessions" | "notifications" | null;
  setMenu: (menu: "projects" | "sessions" | "notifications" | null) => void;
  messages: { current: HTMLDivElement | null };
  following: { current: boolean };
  composer: { current: HTMLTextAreaElement | null };
  saveDraft: (text: string) => void;
  setCommandsDismissed: (dismissed: boolean) => void;
  send: (event: FormEvent) => Promise<void>;
  navigate: (action: Action) => Promise<void>;
  run: (action: Action, resetDraft?: boolean) => Promise<boolean>;
  setView: (tab: Snapshot["view"]["tab"]) => void;
  setLogJob: (jobId: string | null) => void;
  setToolFocus: (approvalId: string | null) => void;
  setFocusedApprovalId: (jobId: string | null) => void;
};

export function ChatPanel({
  data,
  running,
  approval,
  approvalEvent,
  pendingTools,
  toolApproval,
  followup,
  firstQuestion,
  revision,
  setRevision,
  revisionJob,
  sending,
  composeText,
  clearing,
  commandSuggestions,
  error,
  menu,
  setMenu,
  messages,
  following,
  composer,
  saveDraft,
  setCommandsDismissed,
  send,
  navigate,
  run,
  setView,
  setLogJob,
  setToolFocus,
  setFocusedApprovalId,
}: ChatPanelProps) {
  const currentJobs =
    data?.jobs.filter((job) => !["complete", "denied"].includes(job.state)) ||
    [];
  const visibleMessages =
    data?.messages.filter(
      (message) =>
        message.text ||
        message.error ||
        message.state === "running" ||
        message.state === "stopping",
    ) || [];
  return (
    <section className="chat" aria-label="대화">
      {!!currentJobs.length && (
        <div className="current-jobs" aria-label="업무">
          {currentJobs.map((job) => (
            <div className="job" key={job.id}>
              <button
                className="job-title"
                title={job.request}
                onClick={() => {
                  setLogJob(job.id);
                  setView("log");
                }}
              >
                {job.plan?.goal || job.request}
              </button>
              <small>{phase[job.state]}</small>
              {job.state === "approval" && job.id !== approval?.id && (
                <button
                  className="job-action"
                  type="button"
                  onClick={() => setFocusedApprovalId(job.id)}
                >
                  권한 요청
                </button>
              )}
              {pendingTools.some(
                ({ jobId, id }) =>
                  jobId === job.id && id !== toolApproval?.id,
              ) && (
                <button
                  className="job-action"
                  type="button"
                  onClick={() => {
                    const next = pendingTools.find(
                      ({ jobId }) => jobId === job.id,
                    );
                    if (next) setToolFocus(next.id);
                    setView("chat");
                  }}
                >
                  도구 승인
                </button>
              )}
              {job.clarification && (
                <button
                  className="job-action"
                  type="button"
                  onClick={() => {
                    setRevision({
                      id: job.id,
                      text: "",
                      questionId: job.clarification!.id,
                    });
                    composer.current?.focus();
                  }}
                >
                  답변
                </button>
              )}
              {[
                "planning",
                "developing",
                "reviewing",
                "approval",
                "queued",
                "recovering",
                "clarification",
              ].includes(job.state) &&
                job.id !== approval?.id && (
                  <button
                    className="job-action"
                    onClick={() =>
                      void run({ type: "job.stop", jobId: job.id })
                    }
                  >
                    멈춤
                  </button>
                )}
              {["stopped", "failed"].includes(job.state) && (
                <button
                  className="job-action"
                  onClick={() =>
                    void run({ type: "job.resume", jobId: job.id })
                  }
                >
                  이어가기
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div
        className="messages"
        ref={messages}
        aria-label="비서와의 대화"
        onScroll={(event) => {
          const area = event.currentTarget;
          following.current =
            area.scrollHeight - area.scrollTop - area.clientHeight < 36;
        }}
      >
        {visibleMessages.length ? (
          <div className="transcript">
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={`bubble ${message.role}`}
                aria-label={message.role === "user" ? "나" : "비서"}
              >
                {message.text ||
                  (message.state === "running"
                    ? "답변을 준비하고 있어요…"
                    : null)}
                {message.state === "stopped" && <small>응답 중단</small>}
                {message.state === "stopping" && <small>중단 중</small>}
                {message.error && (
                  <small role="status">{message.error}</small>
                )}
                {message.role === "assistant" && message.jobId && (
                  <div className="report-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setLogJob(message.jobId);
                        setView("log");
                      }}
                    >
                      업무 로그
                    </button>
                    {data?.jobs.some(
                      (job) =>
                        job.id === message.jobId &&
                        job.state === "complete",
                    ) &&
                      data.messages.findLast(
                        (item) =>
                          item.role === "assistant" &&
                          item.jobId === message.jobId,
                      )?.id === message.id && (
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => {
                            setRevision({ id: message.jobId!, text: "" });
                            composer.current?.focus();
                          }}
                        >
                          추가 지시
                        </button>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h1>
              {data?.current
                ? "무엇을 맡길까요?"
                : "프로젝트를 열어 시작하세요"}
            </h1>
            {data && !data.current && (
              <button
                type="button"
                onClick={() => void navigate({ type: "project.pick" })}
              >
                폴더 열기 <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="footer">
        {followup && data?.session && (
          <section className="decision" aria-label="추가 지시 업무 선택">
            <div>
              <p>어느 업무에 적용할까요?</p>
              <small>{followup.text}</small>
              <div className="decision-actions">
                {followup.candidateIds.map((id) => {
                  const job = data.jobs.find((item) => item.id === id);
                  return (
                    job && (
                      <button
                        type="button"
                        key={id}
                        onClick={() =>
                          void run({
                            type: "job.followup.select",
                            sessionId: data.session!.id,
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
                      sessionId: data.session!.id,
                      requestId: followup.id,
                      jobId: null,
                    })
                  }
                >
                  취소
                </button>
              </div>
            </div>
          </section>
        )}
        {firstQuestion?.clarification && !revision?.questionId && (
          <section className="decision" aria-label="비서의 확인 질문">
            <div>
              <p>{firstQuestion.clarification.text}</p>
              <small>{firstQuestion.plan?.goal}</small>
            </div>
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
          </section>
        )}
        {toolApproval && data && (
          <section className="decision" aria-label="MCP 변경 도구 승인">
            <div className="decision-scope">
              <button
                className="decision-job"
                type="button"
                aria-label="승인 업무 로그 열기"
                onClick={() => {
                  setLogJob(toolApproval.jobId);
                  setView("log");
                }}
              >
                {data.jobs.find(({ id }) => id === toolApproval.jobId)
                  ?.plan?.goal ??
                  data.jobs.find(({ id }) => id === toolApproval.jobId)
                    ?.request ??
                  "업무"}
              </button>
              <p>
                <strong>
                  {toolApproval.serverName}/{toolApproval.toolName}
                </strong>{" "}
                변경 도구를 실행할까요?
              </p>
              <small>
                {toolApproval.memberName} 요청 · {toolApproval.scope} ·
                요청 시 승인 {approvalLabels[toolApproval.mode]}
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
          </section>
        )}
        {approval?.plan && approval.approvalId && (
          <section className="decision" aria-label="권한 승인">
            <div className="decision-scope">
              <button
                className="decision-job"
                type="button"
                aria-label="승인 업무 로그 열기"
                onClick={() => {
                  setLogJob(approval.id);
                  setView("log");
                }}
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
                          : path +
                            (baseline === null ? " · 생성" : " · 수정")}
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
          </section>
        )}
        {error && (
          <p className="muted" role="alert">
            {error}
          </p>
        )}
        <form className="composer" onSubmit={(event) => void send(event)}>
          {commandSuggestions.length > 0 && (
            <div className="command-list" role="group" aria-label="채팅 명령">
              {commandSuggestions.map(([command, description]) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => {
                    saveDraft(command);
                    composer.current?.focus();
                  }}
                >
                  <code>{command}</code> {description}
                </button>
              ))}
            </div>
          )}
          {revisionJob && (
            <div className="revision-target">
              <span title={revisionJob.plan?.goal ?? revisionJob.request}>
                {revision?.questionId
                  ? (revisionJob.clarification?.text ??
                    "질문이 바뀌었어요.")
                  : "추가 지시 · " +
                    (revisionJob.plan?.goal ?? revisionJob.request)}
              </span>
              <button
                type="button"
                disabled={sending}
                onClick={() => setRevision(null)}
              >
                취소
              </button>
            </div>
          )}
          <textarea
            ref={composer}
            aria-label="비서에게 메시지"
            value={composeText}
            maxLength={32000}
            rows={2}
            disabled={!data?.session || sending}
            placeholder={
              revision?.questionId
                ? "비서의 질문에 답하기…"
                : revision
                  ? "이 업무에서 바꿀 내용을 알려 주세요…"
                  : "비서에게 메시지 보내기…"
            }
            onChange={(event) => {
              setCommandsDismissed(false);
              if (revision)
                setRevision({ ...revision, text: event.target.value });
              else saveDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229)
                return;
              if (event.key === "Escape" && commandSuggestions.length) {
                event.preventDefault();
                setCommandsDismissed(true);
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (event.repeat) return;
                if (commandSuggestions.length === 1)
                  saveDraft(commandSuggestions[0][0]);
                else
                  event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="compose-tools">
            <button
              type="button"
              className="folder"
              aria-label="프로젝트 폴더"
              aria-expanded={menu === "projects"}
              onClick={() =>
                setMenu(menu === "projects" ? null : "projects")
              }
            >
              <Icon name="folder" />{" "}
              <span>{data?.current?.name || "프로젝트 폴더"}</span>
            </button>
            {menu === "projects" && (
              <div className="menu projects" aria-label="프로젝트 폴더">
                <button
                  type="button"
                  onClick={() => void navigate({ type: "project.pick" })}
                >
                  폴더 열기…
                </button>
                {data?.projects.map((project) => (
                  <button
                    type="button"
                    title={project.root}
                    key={project.id}
                    aria-current={data.current?.id === project.id}
                    onClick={() =>
                      void navigate({
                        type: "project.open",
                        projectId: project.id,
                      })
                    }
                  >
                    {project.name}
                  </button>
                ))}
              </div>
            )}
            {data?.current && (
              <select
                className="approval-mode"
                aria-label="승인 모드"
                value={data.current.approvalMode}
                onChange={(event) => {
                  if (data.current)
                    void run({
                      type: "project.approval",
                      projectId: data.current.id,
                      mode: event.target.value as ApprovalMode,
                    });
                }}
              >
                {Object.entries(approvalLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    승인 {label}
                  </option>
                ))}
              </select>
            )}
            <div className="compose-actions">
              {running && data?.session && (
                <button
                  type="button"
                  className="icon-button stop"
                  aria-label="응답 멈춤"
                  title="응답 멈춤"
                  disabled={running.state === "stopping"}
                  onClick={() => {
                    if (data.session)
                      void run({
                        type: "chat.stop",
                        sessionId: data.session.id,
                        responseId: running.id,
                      });
                  }}
                >
                  <Icon name="stop" />
                </button>
              )}
              {(!running || clearing) && (
                <button
                  className="icon-button send"
                  type="submit"
                  aria-label="보내기"
                  title="보내기"
                  disabled={
                    !data?.session || !composeText.trim() || sending
                  }
                >
                  <Icon name="send" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
