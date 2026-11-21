// The bell menu listing a session's notifications.

import type { Action, Snapshot } from "../../../shared/actions";

type NotificationsMenuProps = {
  data: Snapshot | null;
  run: (action: Action, resetDraft?: boolean) => Promise<boolean>;
  setMenu: (menu: "projects" | "sessions" | "notifications" | null) => void;
  setView: (tab: Snapshot["view"]["tab"]) => void;
  setLogJob: (jobId: string | null) => void;
  setFocusedApprovalId: (jobId: string | null) => void;
};

export function NotificationsMenu({
  data,
  run,
  setMenu,
  setView,
  setLogJob,
  setFocusedApprovalId,
}: NotificationsMenuProps) {
  if (!data?.session) return null;
  return (
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
  );
}
