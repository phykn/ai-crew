import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { CrewSettings } from "./crew-settings";
import { MemoryPanel } from "./memory-panel";
import { WikiPanel } from "./wiki-panel";
import { WorkflowPanel, type FlowDraft } from "./workflow-panel";
import { findChatCommand, suggestChatCommands } from "./chat-commands";
import { skillStateLabels, skillStateOrder } from "./skill-status";
import {
  approvalLabels,
  planFiles,
  roles,
  type Action,
  type ApprovalMode,
  type CrewMember,
  type Job,
  type ModelRun,
  type SkillState,
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
  book: "M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15",
  menu: "M3 6h18M3 12h18M3 18h18",
  folder: "M3 7V5h6l2 2h10v12H3Z",
  send: "m3 11 18-8-7 18-3-8-8-2Zm8 2 10-10",
  stop: "M6 6h12v12H6Z",
  flow: "M6 4h12v5H6Zm0 11h5v5H6Zm7 0h5v5h-5Zm-3.5-6v3h6v3",
  bell: "M12 3a5 5 0 0 0-5 5v4l-2 4h14l-2-4V8a5 5 0 0 0-5-5Zm-2 15a2 2 0 0 0 4 0",
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
          {check.label || roles.find(({ id }) => id === check.role)?.title} ·{" "}
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

function SkillChips({
  member,
  data,
  open,
  preview,
}: {
  member: CrewMember;
  data: Snapshot;
  open: (skillId: string | null) => void;
  preview: (text: string | null) => void;
}) {
  const owned = data.skills.filter(({ memberId }) => memberId === member.id);
  if (!owned.length) return null;
  const status = (skillId: string) =>
    data.skillStates.find((item) => item.skillId === skillId);
  const ordered = [...owned].sort(
    (left, right) =>
      skillStateOrder(status(left.id)?.state ?? "ready") -
      skillStateOrder(status(right.id)?.state ?? "ready"),
  );
  const glyphs: Record<SkillState, string> = {
    ready: "◇",
    "in-use": "◆",
    awaiting: "◔",
    unavailable: "⊘",
  };
  const shown = ordered.slice(0, 3);
  const read = (skillId: string) => {
    const skill = owned.find(({ id }) => id === skillId)!;
    const state = status(skillId);
    const purpose =
      skill.markdown
        .split("\n")
        .map((line) => line.replace(/^#+\s*/, "").trim())
        .find(Boolean)
        ?.slice(0, 60) ?? "";
    return {
      skill,
      state,
      text:
        skill.name +
        " · " +
        skillStateLabels[state?.state ?? "ready"] +
        (state?.reason ? " · " + state.reason : "") +
        (purpose ? " · " + purpose : ""),
    };
  };
  return (
    <span className="crew-skills" aria-label={member.name + " 스킬"}>
      {shown.map(({ id }) => {
        const { state, text } = read(id);
        return (
          <button
            key={id}
            type="button"
            className="skill-chip"
            data-state={state?.state ?? "ready"}
            title={text}
            aria-label={text}
            onFocus={() => preview(text)}
            onMouseEnter={() => preview(text)}
            onBlur={() => preview(null)}
            onMouseLeave={() => preview(null)}
            onClick={() => open(id)}
          >
            <span aria-hidden="true">{glyphs[state?.state ?? "ready"]}</span>
          </button>
        );
      })}
      {owned.length > shown.length && (
        <button
          type="button"
          className="skill-chip more"
          aria-label={
            member.name + " 스킬 " + (owned.length - shown.length) + "개 더 보기"
          }
          onFocus={() =>
            preview(
              ordered
                .slice(shown.length)
                .map(({ id }) => read(id).skill.name)
                .join(", "),
            )
          }
          onMouseEnter={() =>
            preview(
              ordered
                .slice(shown.length)
                .map(({ id }) => read(id).skill.name)
                .join(", "),
            )
          }
          onBlur={() => preview(null)}
          onMouseLeave={() => preview(null)}
          onClick={() => open(null)}
        >
          +{owned.length - shown.length}
        </button>
      )}
    </span>
  );
}

function ModelUsage({
  runs,
  jobId,
}: {
  runs: ModelRun[];
  jobId: string | null;
}) {
  const groups = new Map<
    string,
    {
      roleId: ModelRun["roleId"];
      model: string;
      count: number;
      elapsedMs: number;
      tokens: number | null;
      costUsd: number | null;
    }
  >();
  for (const run of runs) {
    if (jobId && run.jobId !== jobId) continue;
    const key = JSON.stringify([run.roleId, run.provider, run.model]);
    const group = groups.get(key) ?? {
      roleId: run.roleId,
      model: run.model ?? (run.provider === "codex" ? "Codex" : "로컬 LLM"),
      count: 0,
      elapsedMs: 0,
      tokens: null,
      costUsd: null,
    };
    group.count++;
    group.elapsedMs += run.elapsedMs;
    if (run.inputTokens !== null || run.outputTokens !== null)
      group.tokens =
        (group.tokens ?? 0) + (run.inputTokens ?? 0) + (run.outputTokens ?? 0);
    if (run.costUsd !== null)
      group.costUsd = (group.costUsd ?? 0) + run.costUsd;
    groups.set(key, group);
  }
  if (!groups.size) return null;
  return (
    <details className="change-log model-usage">
      <summary>모델 실행</summary>
      <ul>
        {[...groups].map(([key, group]) => (
          <li key={key}>
            {roles.find(({ id }) => id === group.roleId)?.title} ·{" "}
            {group.model}
            <br />
            {group.count}회 · {(group.elapsedMs / 1000).toFixed(1)}초
            {group.tokens !== null &&
              ` · 확인된 토큰 ${group.tokens.toLocaleString()}`}
            {" · "}
            {group.costUsd !== null
              ? "비용 $" + group.costUsd.toFixed(4)
              : "비용 미제공"}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Workspace() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [commandsDismissed, setCommandsDismissed] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [revision, setRevision] = useState<{
    id: string;
    text: string;
    questionId?: string;
  } | null>(null);
  const [focusedApprovalId, setFocusedApprovalId] = useState<string | null>(
    null,
  );
  const [resizing, setResizing] = useState<number | null>(null);
  const [localView, setLocalView] = useState<Snapshot["view"]["tab"]>("chat");
  const [localCamp, setLocalCamp] = useState(false);
  const [localMemorySection, setLocalMemorySection] = useState<
    Snapshot["view"]["memorySection"]
  >("memory");
  const [localMemoryOwner, setLocalMemoryOwner] = useState<string | undefined>(
    undefined,
  );
  const [flowDraft, setFlowDraft] = useState<FlowDraft | null>(null);
  const [menu, setMenu] = useState<
    "projects" | "sessions" | "notifications" | null
  >(null);
  const [addingMember, setAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [settingsMember, setSettingsMember] = useState<string | null>(null);
  const [focusSkill, setFocusSkill] = useState<string | null>(null);
  const [skillPreview, setSkillPreview] = useState<{
    memberId: string;
    text: string;
  } | null>(null);
  const [toolFocus, setToolFocus] = useState<string | null>(null);
  const dataRef = useRef<Snapshot | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  function apply(next: Snapshot, resetDraft = false) {
    if (next.current?.id !== dataRef.current?.current?.id) setFlowDraft(null);
    if (next.session?.id !== dataRef.current?.session?.id) setRevision(null);
    if (resetDraft || next.session?.id !== dataRef.current?.session?.id) {
      setDraft(next.session?.draft ?? "");
      setCommandsDismissed(false);
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

  const view = data?.session ? data.view.tab : localView;
  const logJob = data?.view.logJobId ?? null;
  const showCamp = data?.session ? data.view.camp : localCamp;
  const legend = data?.view.legend ?? false;
  const memorySection = data?.session
    ? data.view.memorySection
    : localMemorySection;
  const memoryOwner = data?.session
    ? (data.view.memoryOwnerId ?? undefined)
    : localMemoryOwner;
  const panelWidth = resizing ?? data?.view.panelWidth ?? 380;
  const unread =
    data?.notifications.filter(({ readAt }) => readAt === null).length ?? 0;

  useEffect(() => {
    const area = messages.current;
    if (area && following.current) area.scrollTop = area.scrollHeight;
  }, [data?.messages, view]);

  function patchView(patch: Partial<Snapshot["view"]>) {
    const session = dataRef.current?.session;
    if (!session) return;
    void window.crew
      .run({ type: "view.set", sessionId: session.id, patch })
      .then((snapshot) => apply(snapshot))
      .catch((problem: Error) => setError(problem.message));
  }
  const setView = (tab: Snapshot["view"]["tab"]) =>
    data?.session ? patchView({ tab }) : setLocalView(tab);
  const setShowCamp = (camp: boolean) =>
    data?.session ? patchView({ camp }) : setLocalCamp(camp);
  const setLogJob = (jobId: string | null) => patchView({ logJobId: jobId });
  const setMemorySection = (section: Snapshot["view"]["memorySection"]) =>
    data?.session
      ? patchView({ memorySection: section })
      : setLocalMemorySection(section);
  const setMemoryOwner = (ownerId: string | null | undefined) =>
    data?.session
      ? patchView({ memoryOwnerId: ownerId ?? null })
      : setLocalMemoryOwner(ownerId ?? undefined);

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
    setFocusedApprovalId(null);
    setAddingMember(false);
    setEditingMember(null);
    setSettingsMember(null);
    if (await run(action)) {
      setView("chat");
      setShowCamp(false);
      requestAnimationFrame(() => composer.current?.focus());
    }
  }

  async function openMemorySource({ sourceSessionId, sourceJobId }: {
    sourceSessionId: string;
    sourceJobId: string | null;
  }) {
    await navigate({ type: "session.open", sessionId: sourceSessionId });
    if (sourceJobId && dataRef.current?.session?.id === sourceSessionId) {
      setLogJob(sourceJobId);
      setView("log");
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
      (running && (revision || !findChatCommand(text)))
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
  const approval =
    data?.jobs.find(
      (job) => job.id === focusedApprovalId && job.state === "approval",
    ) ?? data?.jobs.find((job) => job.state === "approval");
  const selectedLogJob = data?.jobs.find((job) => job.id === logJob);
  const approvalEvent = data?.fileApprovals.find(
    (item) => item.id === approval?.approvalId,
  );
  const pendingTools =
    data?.toolApprovals.filter(({ decision }) => decision === null) ?? [];
  const toolApproval =
    pendingTools.find(({ id }) => id === toolFocus) ?? pendingTools[0];
  const revisionJob = data?.jobs.find((job) => job.id === revision?.id);
  const firstQuestion = data?.jobs.find((job) => job.clarification);
  const followup = data?.followups[0];
  const configuredMember = data?.members.find(
    ({ id }) => id === settingsMember,
  );
  const composeText = revision?.text ?? draft;
  const clearing = !revision && findChatCommand(composeText) === "/clear";
  const commandSuggestions =
    revision || commandsDismissed || sending || clearing
      ? []
      : suggestChatCommands(composeText);
  const currentJobs =
    data?.jobs.filter((job) => !["complete", "denied"].includes(job.state)) ||
    [];
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
      style={{ "--panel-width": panelWidth + "px" } as CSSProperties}
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
            <details
              className="roster"
              open={legend}
              onToggle={(event) => {
                if (event.currentTarget.open !== legend)
                  patchView({ legend: event.currentTarget.open });
              }}
            >
              <summary>
                크루 · {data.members.filter((member) => member.hired).length}
              </summary>
              <div className="crew-list">
                {data.members
                  .filter((member) => member.hired || !member.assignmentJobId)
                  .map((member) => {
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
                                if (
                                  data.current &&
                                  name &&
                                  name !== member.name
                                )
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
                        {member.roleId === "development" && (
                          <button
                            className="crew-write"
                            type="button"
                            aria-pressed={member.writeAllowed !== false}
                            aria-label={member.name + " 파일 쓰기 권한"}
                            onClick={() => {
                              if (data.current)
                                void run({
                                  type: "crew.workspace.write",
                                  projectId: data.current.id,
                                  memberId: member.id,
                                  allow: member.writeAllowed === false,
                                });
                            }}
                          >
                            {member.writeAllowed === false
                              ? "쓰기 회수됨"
                              : "쓰기 허용"}
                          </button>
                        )}
                        <SkillChips
                          member={member}
                          data={data}
                          open={(skillId) => {
                            setError("");
                            setFocusSkill(skillId);
                            setSettingsMember(member.id);
                          }}
                          preview={(text) =>
                            setSkillPreview(
                              text ? { memberId: member.id, text } : null,
                            )
                          }
                        />
                        <button
                          className="crew-configure"
                          type="button"
                          aria-label={member.name + " 스킬 및 MCP 설정"}
                          onClick={() => {
                            setError("");
                            setFocusSkill(null);
                            setSettingsMember(
                              settingsMember === member.id ? null : member.id,
                            );
                          }}
                        >
                          설정
                        </button>
                        {skillPreview?.memberId === member.id && (
                          <p className="skill-preview">{skillPreview.text}</p>
                        )}
                      </div>
                    );
                  })}
                {configuredMember && (
                  <CrewSettings
                    key={
                      configuredMember.id + (focusSkill ? ":" + focusSkill : "")
                    }
                    member={configuredMember}
                    data={data}
                    run={run}
                    close={() => {
                      setSettingsMember(null);
                      setFocusSkill(null);
                    }}
                    focusSkill={focusSkill}
                    openJob={(jobId) => {
                      setSettingsMember(null);
                      setFocusSkill(null);
                      setLogJob(jobId);
                      setView("log");
                    }}
                    focusApproval={(approvalId) => {
                      setSettingsMember(null);
                      setFocusSkill(null);
                      setToolFocus(approvalId);
                      setView("chat");
                    }}
                    openMemory={() => {
                      setMemoryOwner(configuredMember.id);
                      setMemorySection("memory");
                      setSettingsMember(null);
                      setView("memory");
                      setShowCamp(false);
                    }}
                    error={error}
                  />
                )}
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
        <div
          className="panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="작업 패널 폭"
          aria-valuenow={panelWidth}
          aria-valuemin={280}
          aria-valuemax={720}
          tabIndex={0}
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowLeft"
                ? -24
                : event.key === "ArrowRight"
                  ? 24
                  : 0;
            if (!step) return;
            event.preventDefault();
            patchView({
              panelWidth: Math.min(720, Math.max(280, panelWidth + step)),
            });
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(panelWidth);
          }}
          onPointerMove={(event) => {
            if (resizing === null) return;
            setResizing(
              Math.min(
                720,
                Math.max(280, window.innerWidth - event.clientX),
              ),
            );
          }}
          onPointerUp={() => {
            if (resizing === null) return;
            const next = Math.min(720, Math.max(280, resizing));
            setResizing(null);
            patchView({ panelWidth: next });
          }}
        />
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
              aria-label="메모리"
              title="메모리"
              aria-current={view === "memory"}
              onClick={() => {
                setMenu(null);
                setMemoryOwner(undefined);
                setView("memory");
                setShowCamp(false);
              }}
            >
              <Icon name="book" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="워크플로우"
              title="워크플로우"
              aria-current={view === "workflow"}
              onClick={() => {
                setMenu(null);
                setView("workflow");
                setShowCamp(false);
              }}
            >
              <Icon name="flow" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={
                "알림" +
                (unread ? " " + unread + "건 읽지 않음" : "")
              }
              title="알림"
              aria-expanded={menu === "notifications"}
              onClick={() =>
                setMenu(menu === "notifications" ? null : "notifications")
              }
            >
              <Icon name="bell" />
              {unread > 0 && <span className="badge">{unread}</span>}
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
          {menu === "notifications" && data?.session && (
            <div className="menu notifications" aria-label="알림">
              {data.notifications.length ? (
                data.notifications.map((note) => (
                  <button
                    type="button"
                    key={note.id}
                    aria-current={note.readAt === null}
                    onClick={() => {
                      setMenu(null);
                      if (data.session)
                        void run({
                          type: "notification.read",
                          sessionId: data.session.id,
                          notificationId: note.id,
                        });
                      if (note.approvalId && note.kind === "approval") {
                        if (note.jobId) setFocusedApprovalId(note.jobId);
                        setView("chat");
                      } else if (note.jobId) {
                        setLogJob(note.jobId);
                        setView("log");
                      }
                    }}
                  >
                    {note.kind === "approval"
                      ? "승인"
                      : note.kind === "question"
                        ? "질문"
                        : note.kind === "report"
                          ? "보고"
                          : "중단"}{" "}
                    · {note.text.slice(0, 60)}
                    {note.readAt === null && " · 새 알림"}
                  </button>
                ))
              ) : (
                <small className="muted">아직 알림이 없어요.</small>
              )}
            </div>
          )}
        </header>
        {view === "workflow" ? (
          data && (
            <WorkflowPanel
              data={data}
              draft={flowDraft}
              setDraft={setFlowDraft}
              run={run}
              error={error}
              openJob={(jobId) => {
                setLogJob(jobId);
                setView("log");
              }}
            />
          )
        ) : view === "memory" ? (
          <section className="knowledge-view" aria-label="메모리 작업 공간">
            <div className="wiki-controls knowledge-nav">
              <button type="button" aria-pressed={memorySection === "memory"} onClick={() => setMemorySection("memory")}>기억</button>
              <button type="button" aria-pressed={memorySection === "wiki"} onClick={() => setMemorySection("wiki")}>프로젝트 위키</button>
            </div>
            {memorySection === "wiki" && data ? (
              <WikiPanel key={data.current?.id} data={data} run={run} source={(revision) => void openMemorySource(revision)} openRule={() => { setView("workflow"); setShowCamp(false); }} error={error} />
            ) : (
              <MemoryPanel
                data={data}
                owner={memoryOwner}
                select={setMemoryOwner}
                remove={(memoryId) => data?.current
                  ? run({ type: "memory.remove", projectId: data.current.id, memoryId })
                  : Promise.resolve(false)}
                source={(memory) => void openMemorySource(memory)}
              />
            )}
          </section>
        ) : view === "log" ? (
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
        )}
      </section>
    </main>
  );
}

createRoot(document.querySelector("#root")!).render(<Workspace />);
