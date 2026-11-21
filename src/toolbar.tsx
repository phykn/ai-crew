// The panel toolbar: camp toggle, view buttons, diagnostics, session list and
// notifications. The project folder lives by the composer, where work starts.

import { type Action, type Snapshot } from "./actions";
import { Icon } from "./renderer-ui";
import { NotificationsMenu } from "./notifications-menu";

type ToolbarProps = {
  data: Snapshot | null;
  view: Snapshot["view"]["tab"];
  showCamp: boolean;
  unread: number;
  menu: "projects" | "sessions" | "notifications" | null;
  setMenu: (menu: "projects" | "sessions" | "notifications" | null) => void;
  setShowCamp: (camp: boolean) => void;
  setView: (tab: Snapshot["view"]["tab"]) => void;
  setLogJob: (jobId: string | null) => void;
  setMemoryOwner: (ownerId: string | null | undefined) => void;
  setFocusedApprovalId: (jobId: string | null) => void;
  navigate: (action: Action) => Promise<void>;
  run: (action: Action, resetDraft?: boolean) => Promise<boolean>;
  /** 환경 진단 실행. 결과 배너는 캠프 위 작업 영역에 그린다. */
  diagnose: () => void;
  diagnosing: boolean;
};

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
}: ToolbarProps) {
  return (
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
          aria-label="환경 진단"
          title="환경 진단 — Git · Codex · 모델 · MCP"
          aria-busy={diagnosing}
          disabled={!data?.current || diagnosing}
          onClick={() => {
            setMenu(null);
            diagnose();
          }}
        >
          <Icon name="pulse" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={
            "알림" + (unread ? " " + unread + "건 읽지 않음" : "")
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
