// The chat view: the live status banner, running jobs, the transcript, the
// decisions waiting on the user, and the composer.

import { useEffect, useRef, useState } from "react";
import {
  approvalLabels,
  type Action,
  type ApprovalMode,
  type Message,
  type Snapshot,
} from "./actions";
import { copyText } from "./clipboard";
import { composerAction, composerHint } from "./chat-keys";
import { queueChips } from "./chat-queue";
import { ChatStatus } from "./chat-status";
import { DecisionStack } from "./chat-decisions";
import { filterMessages, searchCount } from "./chat-search";
import { Markdown } from "./markdown";
import { Icon, phase, sprites } from "./renderer-ui";

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
  commandSuggestions: [string, string][];
  error: string;
  showCamp: boolean;
  setShowCamp: (camp: boolean) => void;
  /** 프로젝트 폴더 팻말이 여는 메뉴. 툴바와 같은 상태를 쓴다. */
  menu?: "projects" | "sessions" | "notifications" | null;
  setMenu?: (menu: "projects" | "sessions" | "notifications" | null) => void;
  messages: { current: HTMLDivElement | null };
  following: { current: boolean };
  composer: { current: HTMLTextAreaElement | null };
  saveDraft: (text: string) => void;
  setCommandsDismissed: (dismissed: boolean) => void;
  /** Enter는 바로 보내고, Ctrl/Cmd+Enter는 대기열에 넣는다. */
  send: (mode: "now" | "queue") => Promise<void>;
  navigate: (action: Action) => Promise<void>;
  run: (action: Action, resetDraft?: boolean) => Promise<boolean>;
  openLog: (jobId: string) => void;
  setToolFocus: (approvalId: string | null) => void;
  setFocusedApprovalId: (jobId: string | null) => void;
};

const stoppable = [
  "planning",
  "developing",
  "reviewing",
  "approval",
  "queued",
  "recovering",
  "clarification",
];

// 빈 화면에서 바로 누를 수 있는 짧은 작업. 누르면 입력창에 요청 문장이 채워진다.
const quickTasks: {
  icon: "compass" | "bug" | "flask" | "pencil";
  label: string;
  prompt: string;
}[] = [
  {
    icon: "compass",
    label: "구조 파악",
    prompt: "이 프로젝트 구조를 파악해서 핵심 모듈과 흐름을 정리해 줘.",
  },
  {
    icon: "bug",
    label: "버그 점검",
    prompt: "지금 코드에서 버그가 날 만한 곳을 점검해 줘.",
  },
  {
    icon: "flask",
    label: "테스트 확인",
    prompt: "테스트를 돌려서 지금 상태를 확인해 줘.",
  },
  {
    icon: "pencil",
    label: "변경 리뷰",
    prompt: "최근 변경 사항을 리뷰해 줘.",
  },
];

/** 답을 기다리는 동안의 말풍선: 크루 스프라이트와 점 세 개, 짧은 상태 배지. */
function PendingBubble({ queued }: { queued: boolean }) {
  return (
    <span
      className="bubble-pending"
      role="status"
      aria-label={queued ? "앞선 답변 뒤에 이어서 답할 준비 중" : "답변 진행 중"}
    >
      <img src={sprites[0]} alt="" />
      <span className="pending-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="pending-badge">{queued ? "대기 중" : "진행 중"}</span>
    </span>
  );
}

type JobActionsProps = {
  job: Snapshot["jobs"][number];
  approval: Snapshot["jobs"][number] | undefined;
  toolApproval: Snapshot["toolApprovals"][number] | undefined;
  pendingTools: Snapshot["toolApprovals"];
  setRevision: (
    revision: { id: string; text: string; questionId?: string } | null,
  ) => void;
  composer: { current: HTMLTextAreaElement | null };
  run: (action: Action, resetDraft?: boolean) => Promise<boolean>;
  setFocusedApprovalId: (jobId: string | null) => void;
  setToolFocus: (approvalId: string | null) => void;
  compact?: boolean;
};

// 한 업무에 딸린 버튼. 목록에서는 대기 중인 승인·질문으로 건너뛰는 버튼까지 두고,
// 상단 배너(compact)에서는 한 줄을 지키려고 멈춤·이어가기만 붙인다.
function JobActions({
  job,
  approval,
  toolApproval,
  pendingTools,
  setRevision,
  composer,
  run,
  setFocusedApprovalId,
  setToolFocus,
  compact,
}: JobActionsProps) {
  return (
    <>
      {!compact && job.state === "approval" && job.id !== approval?.id && (
        <button
          className="job-action"
          type="button"
          onClick={() => setFocusedApprovalId(job.id)}
        >
          권한 요청
        </button>
      )}
      {!compact &&
        pendingTools.some(
          ({ jobId, id }) => jobId === job.id && id !== toolApproval?.id,
        ) && (
          <button
            className="job-action"
            type="button"
            onClick={() => {
              const next = pendingTools.find(({ jobId }) => jobId === job.id);
              if (next) setToolFocus(next.id);
            }}
          >
            도구 승인
          </button>
        )}
      {!compact && job.clarification && (
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
      {stoppable.includes(job.state) && job.id !== approval?.id && (
        <button
          className="job-action"
          type="button"
          onClick={() => void run({ type: "job.stop", jobId: job.id })}
        >
          멈춤
        </button>
      )}
      {["stopped", "failed"].includes(job.state) && (
        <button
          className="job-action"
          type="button"
          onClick={() => void run({ type: "job.resume", jobId: job.id })}
        >
          이어가기
        </button>
      )}
    </>
  );
}

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
  commandSuggestions,
  error,
  showCamp,
  setShowCamp,
  menu = null,
  setMenu = () => {},
  messages,
  following,
  composer,
  saveDraft,
  setCommandsDismissed,
  send,
  navigate,
  run,
  openLog,
  setToolFocus,
  setFocusedApprovalId,
}: ChatPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const [search, setSearch] = useState<string | null>(null);
  const [queueNotice, setQueueNotice] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  // 입력창 위에 띄울 대기열 칩. 대기 중인 응답 앞의 사용자 메시지가 그 내용이다.
  const chips = queueChips(data?.messages ?? []);
  const announced = useRef(chips.length);
  const searching = search !== null;
  const query = search?.trim() ?? "";
  const currentJobs =
    data?.jobs.filter((job) => !["complete", "denied"].includes(job.state)) ||
    [];
  // 업무가 한 건뿐이면 배너에 그 업무를 붙이고, 여러 건일 때만 목록을 편다.
  const singleJob = currentJobs.length === 1 ? currentJobs[0] : undefined;
  const jobList = currentJobs.length > 1 ? currentJobs : [];
  const visibleMessages =
    data?.messages.filter(
      (message) =>
        message.text ||
        message.error ||
        message.state === "running" ||
        message.state === "stopping" ||
        message.state === "queued",
    ) || [];
  const shownMessages = query
    ? filterMessages(visibleMessages, query)
    : visibleMessages;
  const commandKey = commandSuggestions.map(([command]) => command).join("|");
  const selectedCommand = Math.min(
    Math.max(commandIndex, 0),
    Math.max(commandSuggestions.length - 1, 0),
  );

  useEffect(() => {
    setCommandIndex(0);
  }, [commandKey]);

  // 대기열에 무엇이 들어갔는지 스크린리더에도 한 줄로 알린다.
  useEffect(() => {
    if (chips.length > announced.current)
      setQueueNotice(`대기열에 넣었어요. ${chips.length}번째입니다.`);
    else if (!chips.length) setQueueNotice("");
    announced.current = chips.length;
  }, [chips.length]);

  // Cmd/Ctrl+F로 대화 안 찾기를 열고 닫는다.
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f")
        return;
      event.preventDefault();
      setSearch((current) => current ?? "");
      requestAnimationFrame(() => searchInput.current?.focus());
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (searching) searchInput.current?.focus();
  }, [searching]);

  // 입력한 만큼 입력창을 늘리되 두 줄에서 160px 사이로 둔다.
  useEffect(() => {
    const area = composer.current;
    if (!area) return;
    area.style.height = "auto";
    const needed = area.scrollHeight;
    const height = Math.min(160, Math.max(44, needed));
    area.style.height = height + "px";
    area.style.overflowY = needed > 160 ? "auto" : "hidden";
  }, [composeText, composer]);

  // 최신 메시지를 보고 있을 때는 '맨 아래로' 버튼을 감춘다.
  useEffect(() => {
    if (following.current) setShowJump(false);
  }, [data?.messages, following]);

  async function copyMessage(message: Message) {
    if (!(await copyText(message.text))) return;
    setCopied(message.id);
    setTimeout(
      () => setCopied((current) => (current === message.id ? null : current)),
      1500,
    );
  }

  return (
    <section className="chat" aria-label="대화">
      <ChatStatus
        data={data}
        jobs={currentJobs}
        pendingTools={pendingTools}
        followup={followup}
        showCamp={showCamp}
        setShowCamp={setShowCamp}
        openLog={openLog}
        searching={searching}
        toggleSearch={() => setSearch(searching ? null : "")}
        jobActions={
          singleJob ? (
            <JobActions
              job={singleJob}
              compact
              approval={approval}
              toolApproval={toolApproval}
              pendingTools={pendingTools}
              setRevision={setRevision}
              composer={composer}
              run={run}
              setFocusedApprovalId={setFocusedApprovalId}
              setToolFocus={setToolFocus}
            />
          ) : undefined
        }
      />
      {searching && (
        <div className="chat-search" role="search" aria-label="대화에서 찾기">
          <Icon name="search" />
          <input
            ref={searchInput}
            type="search"
            value={search}
            aria-label="대화에서 찾기"
            placeholder="대화에서 찾기"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setSearch(null);
              }
            }}
          />
          <span className="chat-search-count" aria-live="polite">
            {query ? searchCount(shownMessages.length) : ""}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="대화 찾기 닫기"
            title="닫기"
            onClick={() => setSearch(null)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {!!jobList.length && (
        <div className="current-jobs" aria-label="업무">
          {jobList.map((job) => (
            <div className="job" key={job.id}>
              <button
                className="job-title"
                title={job.request}
                onClick={() => openLog(job.id)}
              >
                {job.plan?.goal || job.request}
              </button>
              <small>{phase[job.state]}</small>
              <JobActions
                job={job}
                approval={approval}
                toolApproval={toolApproval}
                pendingTools={pendingTools}
                setRevision={setRevision}
                composer={composer}
                run={run}
                setFocusedApprovalId={setFocusedApprovalId}
                setToolFocus={setToolFocus}
              />
            </div>
          ))}
        </div>
      )}
      <div className="messages-wrap">
        <div
          className="messages"
          ref={messages}
          aria-label="비서와의 대화"
          onScroll={(event) => {
            const area = event.currentTarget;
            const atBottom =
              area.scrollHeight - area.scrollTop - area.clientHeight < 36;
            following.current = atBottom;
            setShowJump(!atBottom && area.scrollHeight > area.clientHeight + 36);
          }}
        >
          {visibleMessages.length ? (
            query && !shownMessages.length ? (
              <p className="chat-search-none">
                ‘{query}’이 들어간 대화가 없어요.
              </p>
            ) : (
              <div className="transcript">
                {shownMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`bubble ${message.role}`}
                    aria-label={message.role === "user" ? "나" : "비서"}
                  >
                    {message.role === "assistant" ? (
                      message.text ? (
                        <Markdown text={message.text} />
                      ) : message.state === "queued" ? (
                        <PendingBubble queued />
                      ) : message.state === "running" ? (
                        <PendingBubble queued={false} />
                      ) : null
                    ) : (
                      message.text
                    )}
                    {message.state === "stopped" && <small>응답 중단</small>}
                    {message.state === "stopping" && <small>중단 중</small>}
                    {message.error && (
                      <small role="status">{message.error}</small>
                    )}
                    {message.text && (
                      <button
                        type="button"
                        className="bubble-copy"
                        aria-label={
                          copied === message.id ? "복사됨" : "메시지 복사"
                        }
                        onClick={() => void copyMessage(message)}
                      >
                        {copied === message.id ? "복사됨" : "복사"}
                      </button>
                    )}
                    {message.role === "assistant" && message.jobId && (
                      <div className="report-actions">
                        <button
                          type="button"
                          onClick={() => openLog(message.jobId!)}
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
            )
          ) : (
            <div className="empty">
              <h1>
                {data?.current
                  ? "무엇을 맡길까요?"
                  : "프로젝트를 열어 시작하세요"}
              </h1>
              {data?.current ? (
                <div className="quick-tasks" role="group" aria-label="빠른 작업">
                  {quickTasks.map(({ icon, label, prompt }) => (
                    <button
                      key={label}
                      type="button"
                      title={prompt}
                      onClick={() => {
                        saveDraft(prompt);
                        composer.current?.focus();
                      }}
                    >
                      <Icon name={icon} />
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                data && (
                  <button
                    type="button"
                    onClick={() => void navigate({ type: "project.pick" })}
                  >
                    폴더 열기 <span aria-hidden="true">↗</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
        {showJump && (
          <button
            type="button"
            className="jump-bottom"
            onClick={() => {
              const area = messages.current;
              if (!area) return;
              following.current = true;
              area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
              setShowJump(false);
            }}
          >
            ↓ 맨 아래로
          </button>
        )}
      </div>
      <div className="footer">
        <DecisionStack
          data={data}
          approval={approval}
          approvalEvent={approvalEvent}
          toolApproval={toolApproval}
          followup={followup}
          firstQuestion={firstQuestion}
          revision={revision}
          setRevision={setRevision}
          composer={composer}
          run={run}
          openLog={openLog}
        />
        {error && (
          <p className="muted" role="alert">
            {error}
          </p>
        )}
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send("now");
          }}
        >
          {commandSuggestions.length > 0 && (
            <div className="command-list" role="group" aria-label="채팅 명령">
              {commandSuggestions.map(([command, description], index) => (
                <button
                  key={command}
                  type="button"
                  aria-current={index === selectedCommand}
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
                  ? (revisionJob.clarification?.text ?? "질문이 바뀌었어요.")
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
          <div className="compose-card">
              {chips.length > 0 && (
                <div className="queue-strip" role="group" aria-label="대기열">
                  <span
                    className="queue-count"
                    title={`대기열 ${chips.length}건`}
                    aria-label={`대기열 ${chips.length}건`}
                  >
                    {chips.length}
                  </span>
                  <ol className="queue-chips">
                    {chips.map((chip) => (
                      <li className="queue-chip" key={chip.responseId}>
                        <span className="queue-order" aria-hidden="true">
                          {chip.position}
                        </span>
                        <span className="queue-text" title={chip.text}>
                          {chip.text}
                        </span>
                        <button
                          type="button"
                          className="queue-cancel"
                          aria-label={`대기열 ${chip.position}번째 메시지 대기열에서 빼기`}
                          title="대기열에서 빼기"
                          disabled={sending}
                          onClick={() => {
                            if (!data?.session) return;
                            void run({
                              type: "chat.queue.cancel",
                              sessionId: data.session.id,
                              responseId: chip.responseId,
                            });
                          }}
                        >
                          <Icon name="close" />
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <span className="visually-hidden" role="status" aria-live="polite">
                {queueNotice}
              </span>
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
                    : `비서에게 메시지 보내기… (${composerHint})`
              }
              onChange={(event) => {
                setCommandsDismissed(false);
                if (revision)
                  setRevision({ ...revision, text: event.target.value });
                else saveDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                // 한글 조합 중에는 어떤 키도 전송·대기열로 쓰지 않는다.
                if (event.nativeEvent.isComposing || event.keyCode === 229)
                  return;
                const action = composerAction({
                  key: event.key,
                  ctrlKey: event.ctrlKey,
                  metaKey: event.metaKey,
                  shiftKey: event.shiftKey,
                  altKey: event.altKey,
                  repeat: event.repeat,
                  isComposing: event.nativeEvent.isComposing,
                  keyCode: event.keyCode,
                });
                if (commandSuggestions.length) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setCommandIndex(
                      (selectedCommand + 1) % commandSuggestions.length,
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setCommandIndex(
                      (selectedCommand - 1 + commandSuggestions.length) %
                        commandSuggestions.length,
                    );
                    return;
                  }
                  if (event.key === "Tab") {
                    event.preventDefault();
                    saveDraft(commandSuggestions[selectedCommand][0]);
                    return;
                  }
                }
                if (event.key === "Escape" && commandSuggestions.length) {
                  event.preventDefault();
                  setCommandsDismissed(true);
                  return;
                }
                // Shift+Enter는 줄바꿈이라 그대로 둔다.
                if (action === "queue") {
                  event.preventDefault();
                  void send("queue");
                  return;
                }
                if (action === "send") {
                  event.preventDefault();
                  const suggestion = commandSuggestions[selectedCommand]?.[0];
                  if (suggestion && suggestion !== composeText.trim()) {
                    saveDraft(suggestion);
                    return;
                  }
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="compose-tools">
              <div className="compose-left">
              <button
                type="button"
                className="folder project-toggle"
                aria-label="프로젝트 폴더"
                title={data?.current?.root ?? "프로젝트 폴더"}
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
                <span
                  className="approval-pill"
                  title={
                    "승인 모드 · " + approvalLabels[data.current.approvalMode]
                  }
                >
                  <Icon name="shield" />
                  <span className="approval-text">
                    {approvalLabels[data.current.approvalMode]}
                  </span>
                  <select
                    className="approval-mode"
                    aria-label="승인 모드"
                    title={
                      "승인 모드 · " + approvalLabels[data.current.approvalMode]
                    }
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
                </span>
              )}
              </div>
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
                {data?.session && (
                  <button
                    className="icon-button send"
                    type="submit"
                    aria-label="보내기"
                    title={
                      running
                        ? "지금 답변을 끊고 이 메시지를 먼저 보내요 (Ctrl+Enter는 대기열)"
                        : "보내기 (Enter)"
                    }
                    disabled={!composeText.trim() || sending}
                  >
                    <Icon name="send" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="compose-hint">{composerHint}</p>
        </form>
      </div>
    </section>
  );
}
