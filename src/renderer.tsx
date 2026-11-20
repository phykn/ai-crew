import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  approvalLabels,
  planFiles,
  roles,
  type Action,
  type ApprovalMode,
  type Job,
  type Snapshot,
  type WorkCheck,
} from "./actions";
import camp from "../demo/assets/camp.webp";
import sprite0 from "../demo/assets/crew-0.webp";
import sprite1 from "../demo/assets/crew-1.webp";
import sprite2 from "../demo/assets/crew-2.webp";
import sprite3 from "../demo/assets/crew-3.webp";
import "../demo/tokens.css";
import "./workspace.css";

const sprites = [sprite0, sprite1, sprite2, sprite3];
const phase = {
  recovering: "파일 상태 확인 중",
  clarification: "답변 대기",
  planning: "플랜",
  approval: "승인 대기",
  queued: "같은 파일 작업 대기",
  developing: "개발",
  reviewing: "검증",
  stopping: "중단 중",
  stopped: "중단됨",
  denied: "거절",
  complete: "완료",
  failed: "실패",
} satisfies Record<Job["state"], string>;
const icons = {
  fire: "M13 2c1 6-4 7-2 11 2-1 3-3 3-6 4 3 6 6 5 10-1 4-5 6-9 5-5-1-7-5-6-9 1-2 2-4 5-7-1 5 0 6 1 6-1-4 4-6 3-10Z",
  chat: "M3 4h18v13H9l-5 4v-4H3Z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1",
  menu: "M3 6h18M3 12h18M3 18h18",
  folder: "M3 7V5h6l2 2h10v12H3Z",
  send: "m3 11 18-8-7 18-3-8-8-2Zm8 2 10-10",
  stop: "M6 6h12v12H6Z",
};
function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

function CheckList({ checks }: { checks: WorkCheck[] }) {
  return (
    <ul>
      {checks.map((check) => (
        <li key={check.role}>
          {roles.find(({ id }) => id === check.role)?.title} ·{" "}
          {check.passed ? "통과" : check.unavailable ? "미검증" : "실패"}
          {check.command && (
            <>
              {" "}
              · <code>{check.command}</code>
            </>
          )}
          {" · "}
          {check.note}
          {check.findings.map((finding, index) => (
            <details className="review-finding" key={index}>
              <summary>
                {finding.startLine === finding.endLine
                  ? `${finding.startLine}줄`
                  : `${finding.startLine}–${finding.endLine}줄`}
                {" · "}
                {finding.note}
              </summary>
              <pre>{finding.excerpt}</pre>
            </details>
          ))}
        </li>
      ))}
    </ul>
  );
}

function Workspace() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [revision, setRevision] = useState<{
    id: string;
    text: string;
    questionId?: string;
  } | null>(null);
  const [logJob, setLogJob] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "log">("chat");
  const [menu, setMenu] = useState<"projects" | "sessions" | null>(null);
  const [showCamp, setShowCamp] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const dataRef = useRef<Snapshot | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  function apply(next: Snapshot, resetDraft = false) {
    if (next.session?.id !== dataRef.current?.session?.id) setRevision(null);
    if (resetDraft || next.session?.id !== dataRef.current?.session?.id) {
      setDraft(next.session?.draft ?? "");
      following.current = true;
    }
    dataRef.current = next;
    setData(next);
  }

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void window.crew
        .run({ type: "app.state" })
        .then((snapshot) => {
          if (active) apply(snapshot);
        })
        .catch((problem: Error) => {
          if (active) setError(problem.message);
        });
    };
    const stopListening = window.crew.subscribe((event) => {
      if (!active) return;
      if (!event) return refresh();
      const prior = dataRef.current;
      if (prior?.session?.id !== event.sessionId) return;
      const updated = prior.messages.map((message) =>
        message.id === event.responseId
          ? { ...message, text: message.text + event.delta }
          : message,
      );
      apply({ ...prior, messages: updated });
    });
    refresh();
    return () => {
      active = false;
      stopListening();
    };
  }, []);

  useEffect(() => {
    const area = messages.current;
    if (area && following.current) area.scrollTop = area.scrollHeight;
  }, [data?.messages, view]);

  async function run(action: Action, resetDraft = false) {
    setError("");
    try {
      apply(await window.crew.run(action), resetDraft);
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      return false;
    }
  }

  async function navigate(action: Action) {
    setMenu(null);
    setLogJob(null);
    setAddingMember(false);
    setEditingMember(null);
    if (await run(action)) {
      setView("chat");
      setShowCamp(false);
      requestAnimationFrame(() => composer.current?.focus());
    }
  }

  function saveDraft(text: string) {
    setDraft(text);
    if (data?.session) {
      void window.crew
        .run({ type: "session.draft", sessionId: data.session.id, draft: text })
        .catch((problem: Error) => setError(problem.message));
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = (revision?.text ?? draft).trim();
    if (
      !data?.session ||
      !text ||
      sending ||
      (running && (revision || text !== "/clear"))
    )
      return;
    setSending(true);
    following.current = true;
    const request = {
      sessionId: data.session.id,
      requestId: crypto.randomUUID(),
      text,
    };
    if (revision) {
      if (
        await run({
          type: "job.revise",
          jobId: revision.id,
          questionId: revision.questionId,
          ...request,
        })
      )
        setRevision(null);
    } else {
      await run({ type: "chat.send", ...request }, true);
    }
    setSending(false);
    composer.current?.focus();
  }

  const running = data?.messages.find((message) =>
    ["running", "stopping"].includes(message.state),
  );
  const approval = data?.jobs.find((job) => job.state === "approval");
  const revisionJob = data?.jobs.find((job) => job.id === revision?.id);
  const firstQuestion = data?.jobs.find((job) => job.clarification);
  const composeText = revision?.text ?? draft;
  const clearing = !revision && composeText.trim() === "/clear";
  const currentJobs =
    data?.jobs.filter(
      (job) => job !== approval && !["complete", "denied"].includes(job.state),
    ) || [];
  const activity =
    data?.activity.filter((entry) => !logJob || entry.jobId === logJob) || [];
  const changes =
    data?.changes.filter((change) => !logJob || change.jobId === logJob) || [];
  const workingMembers = new Set(
    data?.assignees
      .filter(({ jobId, roleId }) =>
        data.jobs.some(
          (job) =>
            job.id === jobId &&
            ((job.state === "planning" && roleId === "plan") ||
              (job.state === "developing" && roleId === "development") ||
              (job.state === "reviewing" &&
                ["review", "style", "test"].includes(roleId))),
        ),
      )
      .map(({ memberId }) => memberId),
  );
  const visibleMessages =
    data?.messages.filter(
      (message) =>
        message.text ||
        message.error ||
        message.state === "running" ||
        message.state === "stopping",
    ) || [];

  return (
    <main
      className={showCamp ? "workspace camp-visible" : "workspace"}
      onClick={(event) => {
        if (!(event.target as Element).closest(".menu,[aria-expanded]"))
          setMenu(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setMenu(null);
      }}
    >
      <section
        className="camp"
        aria-label="캠프"
        style={{ backgroundImage: `url(${camp})` }}
      >
        <div className="camp-tools">
          <strong className="wordmark">
            <Icon name="fire" /> AI Crew
          </strong>
          {data?.current && (
            <details className="roster">
              <summary>
                크루 · {data.members.filter((member) => member.hired).length}
              </summary>
              <div className="crew-list">
                {data.members.map((member) => {
                  const role = roles.find(({ id }) => id === member.roleId)!;
                  return (
                    <div key={member.id} className="crew-row">
                      <button
                        type="button"
                        className="employment"
                        aria-label={
                          role.title +
                          " " +
                          (member.hired ? "고용" : "미고용") +
                          (member.id !== role.id ? " · " + member.name : "")
                        }
                        aria-pressed={member.hired}
                        onClick={() => {
                          if (data.current)
                            void run({
                              type: "crew.member.update",
                              projectId: data.current.id,
                              memberId: member.id,
                              hired: !member.hired,
                            });
                        }}
                      >
                        {member.hired ? "고용" : "미고용"}
                      </button>
                      <span>
                        {role.title} ·{" "}
                        {editingMember === member.id ? (
                          <input
                            className="crew-name"
                            autoFocus
                            aria-label={role.title + " 별명"}
                            maxLength={32}
                            defaultValue={member.name}
                            onKeyDown={(event) => {
                              if (event.nativeEvent.isComposing) return;
                              if (event.key === "Escape")
                                event.currentTarget.value = member.name;
                              if (
                                event.key === "Escape" ||
                                event.key === "Enter"
                              )
                                event.currentTarget.blur();
                            }}
                            onBlur={(event) => {
                              const name = event.currentTarget.value.trim();
                              setEditingMember(null);
                              if (data.current && name && name !== member.name)
                                void run({
                                  type: "crew.member.update",
                                  projectId: data.current.id,
                                  memberId: member.id,
                                  name,
                                });
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            style={{ color: role.color }}
                            onClick={() => setEditingMember(member.id)}
                          >
                            {member.name}
                          </button>
                        )}
                      </span>
                      <select
                        aria-label={
                          role.title +
                          " 모델" +
                          (member.id !== role.id ? " · " + member.name : "")
                        }
                        value={member.provider}
                        onChange={(event) => {
                          if (data.current)
                            void run({
                              type: "crew.member.update",
                              projectId: data.current.id,
                              memberId: member.id,
                              provider:
                                event.target.value === "codex"
                                  ? "codex"
                                  : "local",
                            });
                        }}
                      >
                        <option value="local">로컬 LLM</option>
                        <option value="codex">Codex</option>
                      </select>
                    </div>
                  );
                })}
                {addingMember ? (
                  <form
                    className="crew-add"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!data.current) return;
                      const form = new FormData(event.currentTarget);
                      const roleId = roles.find(
                        ({ id }) => id === form.get("role"),
                      )?.id;
                      const name = String(form.get("name") ?? "").trim();
                      if (!roleId || roleId === "assistant" || !name) return;
                      if (
                        await run({
                          type: "crew.member.add",
                          projectId: data.current.id,
                          memberId: crypto.randomUUID(),
                          roleId,
                          name,
                          provider:
                            form.get("provider") === "codex"
                              ? "codex"
                              : "local",
                        })
                      )
                        setAddingMember(false);
                    }}
                  >
                    <select name="role" aria-label="새 팀원 역할">
                      {roles
                        .filter(({ id }) => id !== "assistant")
                        .map(({ id, title }) => (
                          <option value={id} key={id}>
                            {title}
                          </option>
                        ))}
                    </select>
                    <input
                      name="name"
                      autoFocus
                      aria-label="새 팀원 별명"
                      maxLength={32}
                      required
                    />
                    <select name="provider" aria-label="새 팀원 모델">
                      <option value="local">로컬 LLM</option>
                      <option value="codex">Codex</option>
                    </select>
                    <button type="submit">고용</button>
                    <button
                      type="button"
                      onClick={() => setAddingMember(false)}
                    >
                      취소
                    </button>
                  </form>
                ) : (
                  <button
                    className="add-member"
                    type="button"
                    onClick={() => setAddingMember(true)}
                  >
                    ＋ 팀원
                  </button>
                )}
              </div>
            </details>
          )}
        </div>
        {data?.current &&
          data.members.map((member, index) => {
            const role = roles.find(({ id }) => id === member.roleId)!;
            const extra = member.id !== role.id;
            return (
              <div
                className="character"
                key={member.id}
                style={{
                  left:
                    (member.hired || workingMembers.has(member.id)
                      ? extra
                        ? 18 + ((index * 13) % 65)
                        : role.x
                      : role.x < 50
                        ? -14
                        : 114) + "%",
                  top: (extra ? 88 + (index % 3) * 4 : role.y) + "%",
                }}
              >
                <span>
                  <b style={{ color: role.color }}>{member.name}</b>
                  {role.id === "assistant" && running
                    ? " · 답변 중"
                    : workingMembers.has(member.id)
                      ? " · " + role.title
                      : ""}
                </span>
                <img src={sprites[role.sprite]} alt="" />
              </div>
            );
          })}
      </section>
      <section className="panel" aria-label="작업 패널">
        <header className="toolbar">
          <button
            type="button"
            className="camp-toggle icon-button"
            aria-label={showCamp ? "작업 보기" : "캠프 보기"}
            onClick={() => {
              setMenu(null);
              setShowCamp(!showCamp);
            }}
          >
            <Icon name="fire" />
          </button>
          <nav aria-label="작업 보기">
            <button
              type="button"
              className="icon-button"
              aria-label="대화"
              title="대화"
              aria-current={view === "chat"}
              onClick={() => {
                setMenu(null);
                setView("chat");
                setShowCamp(false);
              }}
            >
              <Icon name="chat" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="로그"
              title="로그"
              aria-current={view === "log"}
              onClick={() => {
                setMenu(null);
                setLogJob(null);
                setView("log");
                setShowCamp(false);
              }}
            >
              <Icon name="list" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="세션 목록"
              title="세션 목록"
              aria-expanded={menu === "sessions"}
              onClick={() => setMenu(menu === "sessions" ? null : "sessions")}
            >
              <Icon name="menu" />
            </button>
          </nav>
          {menu === "sessions" && (
            <div className="menu sessions" aria-label="세션 목록">
              {data?.current && (
                <button
                  type="button"
                  onClick={() =>
                    void navigate({
                      type: "session.new",
                      projectId: data.current!.id,
                    })
                  }
                >
                  ＋ 새 대화
                </button>
              )}
              {data?.sessions.map((session) => (
                <button
                  type="button"
                  key={session.id}
                  aria-current={data.session?.id === session.id}
                  onClick={() =>
                    void navigate({
                      type: "session.open",
                      sessionId: session.id,
                    })
                  }
                >
                  {session.title}
                </button>
              ))}
              {!data?.current && (
                <button
                  type="button"
                  onClick={() => void navigate({ type: "project.pick" })}
                >
                  프로젝트 폴더 열기…
                </button>
              )}
            </div>
          )}
        </header>
        {view === "log" ? (
          <div className="logs" aria-label="로그">
            {logJob && (
              <button className="log-link" onClick={() => setLogJob(null)}>
                ← 전체 기록
              </button>
            )}
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
        ) : (
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
                    ].includes(job.state) && (
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
              {approval?.plan && approval.approvalId && (
                <section className="decision" aria-label="권한 승인">
                  <div>
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
                      {approval.plan.goal} · {approval.plan.criterion}
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
                    if (revision)
                      setRevision({ ...revision, text: event.target.value });
                    else saveDraft(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    ) {
                      event.preventDefault();
                      if (!event.repeat)
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
        )}
      </section>
    </main>
  );
}

createRoot(document.querySelector("#root")!).render(<Workspace />);
