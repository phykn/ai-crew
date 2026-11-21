// 감사 기록: 파일 승인, MCP 도구 승인, 모델 연결 변경, 워크트리 반영처럼
// 사용자 자원에 닿는 결정을 남긴다. 남기는 문구는 저장 전에 비밀값을 지운다.

import { sanitizeText } from "../server/diagnostics/sanitizer";
import { StoreBase } from "./base";

export class StoreAudit extends StoreBase {
  recordAudit(entry: {
    projectId: string;
    event: AuditEvent;
    outcome: AuditOutcome;
    actor?: string | null;
    sessionId?: string | null;
    jobId?: string | null;
    subject?: string | null;
    detail?: string | null;
  }) {
    this.getProject(entry.projectId);
    this.db
      .prepare(
        `INSERT INTO audit_logs (project_id, session_id, job_id, event, outcome, actor, subject, detail, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.projectId,
        entry.sessionId ?? null,
        entry.jobId ?? null,
        entry.event,
        entry.outcome,
        entry.actor ? sanitizeText(entry.actor) : null,
        entry.subject ? sanitizeText(entry.subject) : null,
        entry.detail ? sanitizeText(entry.detail).slice(0, 2000) : null,
        new Date().toISOString(),
      );
  }

  readAuditLogs(projectId: string, limit = 50): AuditLog[] {
    return this.db
      .prepare(
        `SELECT id, project_id AS projectId, session_id AS sessionId, job_id AS jobId,
         event, outcome, actor, subject, detail, recorded_at AS recordedAt
         FROM audit_logs WHERE project_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(projectId, Math.max(1, Math.min(500, Math.floor(limit)))) as AuditLog[];
  }
}

/** 감사 기록에 남기는 사건 종류. */
type AuditEvent =
  | "file.approval"
  | "tool.approval"
  | "model.connection"
  | "workspace.apply"
  | "crew.roster";

type AuditOutcome = "requested" | "allowed" | "denied" | "changed" | "applied" | "blocked";

type AuditLog = {
  id: number;
  projectId: string;
  sessionId: string | null;
  jobId: string | null;
  event: AuditEvent;
  outcome: AuditOutcome;
  actor: string | null;
  subject: string | null;
  detail: string | null;
  recordedAt: string;
};
