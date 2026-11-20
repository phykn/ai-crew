// Core of the store: the SQLite handle, the transaction and logging helpers every domain
// uses, the project/session basics, and `defaultViewState`.

import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type AppNotification,
  type ApprovalMode,
  type Job,
  type Project,
  type RoleId,
  type Session,
  type ViewState,
  type WorkPlan,
} from "./actions";

export const defaultViewState = (): ViewState => ({
  tab: "chat",
  camp: false,
  legend: false,
  panelWidth: 340,
  logJobId: null,
  memorySection: "memory",
  memoryOwnerId: null,
});

export class StoreBase {
  constructor(protected db: DatabaseSync) {}

  close() {
    this.db.close();
  }

  protected transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const data = run();
      this.db.exec("COMMIT");
      return data;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getProject(id: string) {
    const project = this.db
      .prepare(
        "SELECT id, root, name, approval_mode AS approvalMode FROM projects WHERE id = ?",
      )
      .get(id) as Project | undefined;
    if (!project) throw new Error("프로젝트를 찾을 수 없어요.");
    return project;
  }

  getSession(id: string) {
    const session = this.db
      .prepare(
        "SELECT id, project_id AS projectId, title, draft, workflow_id AS workflowId FROM sessions WHERE id = ?",
      )
      .get(id) as Session | undefined;
    if (!session) throw new Error("세션을 찾을 수 없어요.");
    return session;
  }

  openFolder(root: string) {
    this.transaction(() => {
      const existing = this.db
        .prepare("SELECT id FROM projects WHERE root = ?")
        .get(root) as { id: string } | undefined;
      const id = existing?.id ?? randomUUID();
      if (!existing) {
        this.db
          .prepare("INSERT INTO projects (id, root, name) VALUES (?, ?, ?)")
          .run(id, root, basename(root) || root);
        this.insertSession(id);
      }
      this.openProject(id);
    });
  }

  openProject(id: string) {
    this.getProject(id);
    this.db
      .prepare(
        "INSERT INTO settings VALUES ('current_project', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(id);
  }

  protected insertSession(projectId: string, workflowId: string | null = null) {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO sessions (id, project_id, title, workflow_id) VALUES (?, ?, '새 대화', ?)",
      )
      .run(id, projectId, workflowId);
    this.db
      .prepare("UPDATE projects SET last_session = ? WHERE id = ?")
      .run(id, projectId);
  }

  newSession(projectId: string) {
    this.transaction(() => {
      this.openProject(projectId);
      this.insertSession(projectId);
    });
  }

  openSession(id: string) {
    const { projectId } = this.getSession(id);
    this.transaction(() => {
      this.openProject(projectId);
      this.db
        .prepare("UPDATE projects SET last_session = ? WHERE id = ?")
        .run(id, projectId);
    });
  }

  saveDraft(id: string, draft: string) {
    this.getSession(id);
    this.db
      .prepare("UPDATE sessions SET draft = ? WHERE id = ?")
      .run(draft, id);
  }

  setApprovalMode(projectId: string, mode: ApprovalMode) {
    this.getProject(projectId);
    this.db
      .prepare("UPDATE projects SET approval_mode = ? WHERE id = ?")
      .run(mode, projectId);
  }

  isHired(projectId: string, roleId: RoleId) {
    return (
      this.db
        .prepare("SELECT hired FROM crew WHERE project_id = ? AND role = ?")
        .get(projectId, roleId)?.hired !== 0
    );
  }

  protected isWorkspaceWriteAllowed(projectId: string, memberId: string) {
    return (
      this.db
        .prepare(
          "SELECT allowed FROM crew_workspace_write WHERE project_id = ? AND member_id = ?",
        )
        .get(projectId, memberId)?.allowed !== 0
    );
  }

  protected notify(
    job: Job,
    event: string,
    kind: AppNotification["kind"],
    text: string,
    approvalId: string | null = null,
  ) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO notifications (id, project_id, session_id, job_id, approval_id, kind, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event,
        job.projectId,
        job.sessionId,
        job.id,
        approvalId,
        kind,
        text,
        new Date().toISOString(),
      );
  }

  log(sessionId: string, text: string, jobId: string | null = null) {
    this.db
      .prepare(
        "INSERT INTO activity (session_id, text, job_id, recorded_at) VALUES (?, ?, ?, ?)",
      )
      .run(sessionId, text, jobId, new Date().toISOString());
  }

  readJobs(sessionId: string) {
    const rows = this.db
      .prepare(
        `SELECT id, project_id AS projectId, session_id AS sessionId, request, state, approval_id AS approvalId, plan,
          workflow_id AS workflowId, workflow_version AS workflowVersion,
          worktree, worktree_branch AS branch, base_commit AS baseCommit,
          apply_state AS applyState, apply_note AS applyNote,
          CASE WHEN j.state = 'clarification' THEN (
            SELECT json_object('id', q.id, 'text', q.text) FROM job_questions q WHERE q.job_id = j.id ORDER BY q.rowid DESC LIMIT 1
          ) END AS clarification
         FROM jobs j WHERE session_id = ? ORDER BY rowid`,
      )
      .all(sessionId) as (Omit<Job, "plan" | "clarification"> & {
      plan: string | null;
      clarification: string | null;
    })[];
    return rows.map(
      (row): Job => ({
        ...row,
        plan: row.plan ? (JSON.parse(row.plan) as WorkPlan) : null,
        clarification: row.clarification
          ? (JSON.parse(row.clarification) as Job["clarification"])
          : null,
      }),
    );
  }

  getJob(id: string) {
    const row = this.db
      .prepare("SELECT session_id FROM jobs WHERE id = ?")
      .get(id);
    const job =
      row &&
      this.readJobs(String(row.session_id)).find((item) => item.id === id);
    if (!job) throw new Error("업무를 찾을 수 없어요.");
    return job;
  }

}