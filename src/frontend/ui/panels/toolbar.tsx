// The panel toolbar: camp toggle, view tabs, diagnostics, session list and
// notifications. The project folder lives by the composer, where work starts.

import { type Action, type Snapshot } from "../../../shared/actions";
import { PixelIcon } from "../common/pixel-icons";
import { NotificationsMenu } from "./notifications-menu";

type view = Snapshot["view"]["tab"];
type menu = "projects" | "sessions" | "notifications" | null;

const tabs: { view: view; name: string; label: string }[] = [
  { view: "chat", name: "chat", label: "대화" },
  { view: "log", name: "log", label: "로그" },
  { view: "memory", name: "gem", label: "메모리" },
  { view: "workflow", name: "flow", label: "워크플로우" },
];

export function Toolbar({
  data,
  view,
  showCamp,
  unread,
  menu,
  setMenu,
  setShowCamp,
  setView,
  setLogJob,
  setMemoryOwner,
  setFocusedApprovalId,
  navigate,
  run,
  diagnose,
  diagnosing,
}: {
  data: Snapshot | null;
  view: view;
  showCamp: boolean;
  unread: number;
  menu: menu;
  setMenu: (menu: menu) => void;
  setShowCamp: (camp: boolean) => void;
  setView: (tab: view) => void;
  setLogJob: (jobId: string | null) => void;
  setMemoryOwner: (ownerId: string | null | undefined) => void;
  setFocusedApprovalId: (jobId: string | null) => void;
  navigate: (action: Action) => Promise<void>;
  run: (action: Action, resetDraft?: boolean) => Promise<boolean>;
  /** 환경 진단 실행. 결과 배너는 캠프 위 작업 영역에 그린다. */
  diagnose: () => void;
  diagnosing: boolean;
}) {
  const open = (tab: view) => {
    setMenu(null);
    if (tab === "log") setLogJob(null);
    if (tab === "memory") setMemoryOwner(undefined);
    setView(tab);
    setShowCamp(false);
  };

  return (
    <header className="toolbar">
      <button
        type="button"
        className="camp-toggle tool-button"
        aria-label={showCamp ? "작업 보기" : "캠프 보기"}
        title={showCamp ? "작업 보기" : "캠프 보기"}
        aria-pressed={showCamp}
        onClick={() => {
          setMenu(null);
          setShowCamp(!showCamp);
        }}
      >
        <PixelIcon name="fire" />
      </button>
      <nav className="tabs" aria-label="작업 보기">
        {tabs.map((tab) => (
          <button
            key={tab.view}
            type="button"
            className="tab"
            aria-label={tab.label}
            title={tab.label}
            aria-current={!showCamp && view === tab.view}
            onClick={() => open(tab.view)}
          >
            <PixelIcon name={tab.name as "chat"} />
          </button>
        ))}
      </nav>
      <div className="tools">
        <button
          type="button"
          className="tool-button"
          aria-label="환경 진단"
          title="환경 진단 — Git · Codex · 모델 · MCP"
          aria-busy={diagnosing}
          disabled={!data?.current || diagnosing}
          onClick={() => {
            setMenu(null);
            diagnose();
          }}
        >
          <PixelIcon name="pulse" />
        </button>
        <button
          type="button"
          className="tool-button"
          aria-label={"알림" + (unread ? " " + unread + "건 읽지 않음" : "")}
          title="알림"
          aria-expanded={menu === "notifications"}
          onClick={() =>
            setMenu(menu === "notifications" ? null : "notifications")
          }
        >
          <PixelIcon name="bell" />
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <button
          type="button"
          className="tool-button"
          aria-label="세션 목록"
          title="세션 목록"
          aria-expanded={menu === "sessions"}
          onClick={() => setMenu(menu === "sessions" ? null : "sessions")}
        >
          <PixelIcon name="menu" />
        </button>
      </div>
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
        <NotificationsMenu
          data={data}
          run={run}
          setMenu={setMenu}
          setView={setView}
          setLogJob={setLogJob}
          setFocusedApprovalId={setFocusedApprovalId}
        />
      )}
    </header>
  );
}
