// The app window. The panels below hold the views; this file owns the workspace
// state and the calls that change it.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { WorkflowPanel, type FlowDraft } from "./workflow-panel";
import { MemoryPanel } from "./memory-panel";
import { WikiPanel } from "./wiki-panel";
import { findChatCommand, suggestChatCommands } from "./chat-commands";
import { type Action, type Snapshot } from "./actions";
import { CampPanel } from "./camp-panel";
import { ChatPanel } from "./chat-panel";
import { Toolbar } from "./toolbar";
import { WorklogPanel } from "./worklog-panel";
import "../demo/tokens.css";
import "./workspace.css";

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
  const [splitLog, setSplitLog] = useState(false);
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

  // 열린 메뉴는 바깥 클릭이나 Escape로 닫는다.
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.(".menu,[aria-expanded]")) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);

  // 창이 좁아지면 나란히 보던 업무 로그를 로그 탭으로 옮긴다.
  useEffect(() => {
    if (!splitLog) return;
    const narrow = window.matchMedia("(max-width: 840px)");
    const sync = () => {
      if (!narrow.matches) return;
      setSplitLog(false);
      setView("log");
    };
    sync();
    narrow.addEventListener("change", sync);
    return () => narrow.removeEventListener("change", sync);
  }, [splitLog]);

  function patchView(patch: Partial<Snapshot["view"]>) {
    const session = dataRef.current?.session;
    if (!session) return;
    void window.crew
      .run({ type: "view.set", sessionId: session.id, patch })
      .then((snapshot) => apply(snapshot))
      .catch((problem: Error) => setError(problem.message));
  }
  const setView = (tab: Snapshot["view"]["tab"]) => {
    // 다른 탭으로 넘어가면 나란히 보던 로그 패널은 접는다.
    if (tab !== "chat") setSplitLog(false);
    if (data?.session) patchView({ tab });
    else setLocalView(tab);
  };
  const setShowCamp = (camp: boolean) => {
    // 캠프를 열어도 대화 옆의 로그 패널은 접어 둔다.
    if (camp) setSplitLog(false);
    return data?.session ? patchView({ camp }) : setLocalCamp(camp);
  };
  const setLogJob = (jobId: string | null) => patchView({ logJobId: jobId });

  // 넓은 창에서는 업무 로그를 대화 옆에 나란히 열고, 좁은 창에서는 로그 탭으로 넘긴다.
  function openLog(jobId: string) {
    if (!dataRef.current?.session) return;
    if (window.matchMedia("(max-width: 840px)").matches) {
      setSplitLog(false);
      patchView({ logJobId: jobId, tab: "log" });
      return;
    }
    setSplitLog(true);
    patchView({ logJobId: jobId, tab: "chat" });
  }
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
    setSplitLog(false);
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
    if (!data?.session || !text || sending) return;
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
  const composeText = revision?.text ?? draft;
  const clearing = !revision && findChatCommand(composeText) === "/clear";
  const commandSuggestions =
    revision || commandsDismissed || sending || clearing
      ? []
      : suggestChatCommands(composeText);

  return (
    <main
      className={
        (showCamp ? "workspace camp-visible" : "workspace") +
        (splitLog && view === "chat" ? " split-visible" : "")
      }
      style={{ "--panel-width": panelWidth + "px" } as CSSProperties}
    >
      <CampPanel
        data={data}
        running={running}
        legend={legend}
        error={error}
        setError={setError}
        patchView={patchView}
        run={run}
        editingMember={editingMember}
        setEditingMember={setEditingMember}
        addingMember={addingMember}
        setAddingMember={setAddingMember}
        settingsMember={settingsMember}
        setSettingsMember={setSettingsMember}
        focusSkill={focusSkill}
        setFocusSkill={setFocusSkill}
        skillPreview={skillPreview}
        setSkillPreview={setSkillPreview}
        setLogJob={setLogJob}
        setView={setView}
        setToolFocus={setToolFocus}
        setMemoryOwner={setMemoryOwner}
        setMemorySection={setMemorySection}
        setShowCamp={setShowCamp}
      />
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

        <Toolbar
          data={data}
          view={view}
          showCamp={showCamp}
          unread={unread}
          menu={menu}
          setMenu={setMenu}
          setShowCamp={setShowCamp}
          setView={setView}
          setLogJob={setLogJob}
          setMemoryOwner={setMemoryOwner}
          setFocusedApprovalId={setFocusedApprovalId}
          navigate={navigate}
          run={run}
        />
        <div className="pane">
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
          <WorklogPanel
            data={data}
            logJob={logJob}
            selectedLogJob={selectedLogJob}
            run={run}
            setLogJob={setLogJob}
            setView={setView}
          />
        ) : (
          <ChatPanel
            data={data}
            running={running}
            approval={approval}
            approvalEvent={approvalEvent}
            pendingTools={pendingTools}
            toolApproval={toolApproval}
            followup={followup}
            firstQuestion={firstQuestion}
            revision={revision}
            setRevision={setRevision}
            revisionJob={revisionJob}
            sending={sending}
            composeText={composeText}
            commandSuggestions={commandSuggestions}
            error={error}
            showCamp={showCamp}
            setShowCamp={setShowCamp}
            messages={messages}
            following={following}
            composer={composer}
            saveDraft={saveDraft}
            setCommandsDismissed={setCommandsDismissed}
            send={send}
            navigate={navigate}
            run={run}
            openLog={openLog}
            setToolFocus={setToolFocus}
            setFocusedApprovalId={setFocusedApprovalId}
          />
        )}
        </div>
      </section>
      {splitLog && view === "chat" && (
        <aside className="split-log" aria-label="업무 로그">
          <div className="split-log-head">
            <strong>업무 로그</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="업무 로그 닫기"
              title="업무 로그 닫기"
              onClick={() => setSplitLog(false)}
            >
              ✕
            </button>
          </div>
          <WorklogPanel
            data={data}
            logJob={logJob}
            selectedLogJob={selectedLogJob}
            run={run}
            setLogJob={setLogJob}
            setView={setView}
            close={() => setSplitLog(false)}
          />
        </aside>
      )}
    </main>
  );
}

createRoot(document.querySelector("#root")!).render(<Workspace />);
