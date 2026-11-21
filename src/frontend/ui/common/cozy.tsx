// Small pieces the work panels share: parchment disclosures, status and role
// badges, and the empty-state card.

import type { ReactNode } from "react";
import type { LogStatus } from "../panels/worklog-format";

export function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M4 6.2 8 10l4-3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A parchment disclosure; never nest another one inside it. */
export function CozyDetails({
  title,
  className,
  open,
  aside,
  children,
}: {
  title: ReactNode;
  className?: string;
  open?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className={className ? `cozy-card cozy-disclosure ${className}` : "cozy-card cozy-disclosure"} open={open}>
      <summary>
        <span className="cozy-summary-title">{title}</span>
        {aside}
        <Chevron />
      </summary>
      <div className="cozy-body">{children}</div>
    </details>
  );
}

const statusLabels: Record<LogStatus, string> = {
  done: "완료",
  running: "진행 중",
  failed: "실패",
};

/** Done (sage check), running (butter dot), failed (coral cross) as icons only. */
export function StatusBadge({ status }: { status: LogStatus }) {
  return (
    <span className={`log-status log-status-${status}`} title={statusLabels[status]}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {status === "done" && (
          <path
            d="M4.2 8.4 6.7 11l5-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {status === "running" && <circle cx="8" cy="8" r="2.7" fill="currentColor" />}
        {status === "failed" && (
          <path
            d="M5.1 5.1 10.9 10.9M10.9 5.1 5.1 10.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="visually-hidden">{statusLabels[status]}</span>
    </span>
  );
}

/** A compact pastel pill carrying the role's own colour dot. */
export function RoleBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className="log-role-badge">
      <i style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

export type EmptyIcon = "log" | "memory" | "wiki" | "bell" | "list";

const emptyPaths: Record<EmptyIcon, ReactNode> = {
  log: <path d="M3.5 4.6h9M3.5 8h9M3.5 11.4h5.2" />,
  memory: (
    <>
      <rect x="2.8" y="4.2" width="10.4" height="7.8" rx="2.2" />
      <path d="M5.4 7.2h5.2M5.4 9.4h3.2" />
    </>
  ),
  wiki: (
    <>
      <path d="M3.4 4.2h3.1c.8 0 1.5.6 1.5 1.4v6.4c0-.7-.6-1.3-1.4-1.3H3.4z" />
      <path d="M12.6 4.2H9.5c-.8 0-1.5.6-1.5 1.4v6.4c0-.7.6-1.3 1.4-1.3h3.2z" />
    </>
  ),
  bell: (
    <>
      <path d="M4.6 7.2a3.4 3.4 0 0 1 6.8 0c0 2.6.7 3.6 1.1 4H3.5c.4-.4 1.1-1.4 1.1-4z" />
      <path d="M6.7 13.1a1.4 1.4 0 0 0 2.6 0" />
    </>
  ),
  list: <path d="M4 5.2h8M4 8h8M4 10.8h4.4" />,
};

/** Icon and one short line instead of a bare grey sentence. */
export function EmptyState({
  icon,
  title,
  children,
  compact,
}: {
  icon: EmptyIcon;
  title: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "empty-state is-compact" : "empty-state"}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {emptyPaths[icon]}
        </g>
      </svg>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
