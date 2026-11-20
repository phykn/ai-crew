// View state, the isolated git workspace of a job, notifications, and artifacts.

import { dirname, join } from "node:path";
import { applyBranch, createWorktree, removeWorktree, repositoryState } from "./git-workspace";
import { defaultViewState } from "./store-base";
import { type AppNotification, type Artifact, type ViewState } from "./actions";
import { StoreWorkflow } from "./store-workflow";
export class StoreWorkspace extends StoreWorkflow {
  viewState(sessionId: string): ViewState {
    const row = this.db
      .prepare(
        `SELECT tab, camp, legend, panel_width AS panelWidth, log_job_id AS logJobId,
         memory_section AS memorySection, memory_owner_id AS memoryOwnerId
         FROM view_state WHERE session_id = ?`,
      )
      .get(sessionId) as
      | (Omit<ViewState, "camp" | "legend"> & { camp: number; legend: number })
      | undefined;
    if (!row) return defaultViewState();
    return {
      ...row,
      camp: Boolean(row.camp),
      legend: Boolean(row.legend),
    };
  }

  setViewState(sessionId: string, patch: Partial<ViewState>) {
    const session = this.getSession(sessionId);
    const current = this.viewState(sessionId);
    if (
      patch.logJobId &&
      !this.readJobs(sessionId).some(({ id }) => id === patch.logJobId)
    )
      throw new Error("이 대화의 업무를 선택해 주세요.");
    if (
      patch.memoryOwnerId &&
      !this.readMembers(session.projectId).some(
        ({ id }) => id === patch.memoryOwnerId,
      )
    )
      throw new Error("이 프로젝트의 담당자를 선택해 주세요.");
    const next: ViewState = { ...current, ...patch };
    this.db
      .prepare(
        `INSERT INTO view_state (session_id, tab, camp, legend, panel_width, log_job_id, memory_section, memory_owner_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET tab = excluded.tab, camp = excluded.camp,
           legend = excluded.legend, panel_width = excluded.panel_width,
           log_job_id = excluded.log_job_id, memory_section = excluded.memory_section,
           memory_owner_id = excluded.memory_owner_id`,
      )
      .run(
        sessionId,
        next.tab,
        Number(next.camp),
        Number(next.legend),
        next.panelWidth,
        next.logJobId,
        next.memorySection,
        next.memoryOwnerId,
      );
  }

  async prepareIsolatedWorkspace(jobId: string) {
    const job = this.getJob(jobId);
    if (job.worktree) return job;
    if (["complete", "denied", "failed"].includes(job.state))
      throw new Error("끝난 업무에는 작업공간을 만들 수 없어요.");
    const project = this.getProject(job.projectId);
    const branch = "crew/" + job.id.slice(0, 8);
    const path = join(dirname(project.root), ".crew-" + job.id.slice(0, 8));
    const created = await createWorktree(project.root, {
      path,
      branch,
      base: "",
    });
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE jobs SET worktree = ?, worktree_branch = ?, base_commit = ? WHERE id = ?",
        )
        .run(created.path, created.branch, created.base, job.id);
      this.log(
        job.sessionId,
        "비서 · 격리 작업공간 준비 · " +
          created.branch +
          " @ " +
          created.base.slice(0, 8),
        job.id,
      );
    });
    return this.getJob(job.id);
  }

  async applyJob(jobId: string) {
    const job = this.getJob(jobId);
    if (!job.worktree || !job.branch)
      throw new Error("격리 작업공간이 없는 업무예요.");
    if (job.state !== "complete")
      throw new Error("검증을 마친 업무만 원본에 반영할 수 있어요.");
    const project = this.getProject(job.projectId);
    const state = await repositoryState(project.root);
    const result = await applyBranch(project.root, {
      branch: job.branch,
      target: state.branch,
      message: "crew: " + job.request.slice(0, 60),
    });
    return result.applied
      ? this.recordApply(jobId, "applied", result.commit.slice(0, 8))
      : this.recordApply(
          jobId,
          "blocked",
          result.reason +
            (result.conflicts.length
              ? " · " + result.conflicts.join(", ")
              : ""),
        );
  }

  recordApply(jobId: string, state: "applied" | "blocked", note: string) {
    const job = this.getJob(jobId);
    this.transaction(() => {
      this.db
        .prepare("UPDATE jobs SET apply_state = ?, apply_note = ? WHERE id = ?")
        .run(state, note, jobId);
      this.log(
        job.sessionId,
        state === "applied"
          ? "사용자 · 원본 반영 완료 · " + note
          : "비서 · 원본 반영 대기 · " + note,
        job.id,
      );
      this.recordAudit({
        projectId: job.projectId,
        sessionId: job.sessionId,
        jobId: job.id,
        event: "workspace.apply",
        outcome: state,
        actor: state === "applied" ? "사용자" : "비서",
        subject: job.branch ?? job.worktree,
        detail: note,
      });
    });
    return this.getJob(jobId);
  }

  async cleanupWorkspace(jobId: string) {
    const job = this.getJob(jobId);
    if (!job.worktree) return;
    if (job.state === "developing" || job.state === "reviewing")
      throw new Error("업무가 실행 중이에요. 멈춘 뒤 정리해 주세요.");
    const project = this.getProject(job.projectId);
    await removeWorktree(project.root, job.worktree);
    this.transaction(() => {
      this.db
        .prepare("UPDATE jobs SET worktree = NULL WHERE id = ?")
        .run(job.id);
      this.log(
        job.sessionId,
        "사용자 · 작업공간 정리 · 기록은 남겨 둡니다",
        job.id,
      );
    });
  }

  readNotifications(sessionId: string) {
    return this.db
      .prepare(
        `SELECT id, session_id AS sessionId, job_id AS jobId, approval_id AS approvalId,
         kind, text, created_at AS createdAt, read_at AS readAt
         FROM notifications WHERE session_id = ? ORDER BY rowid DESC LIMIT 50`,
      )
      .all(sessionId) as AppNotification[];
  }

  markNotificationRead(sessionId: string, id: string) {
    const row = this.db
      .prepare(
        "UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND session_id = ? RETURNING id",
      )
      .get(new Date().toISOString(), id, sessionId);
    if (!row) throw new Error("이 대화의 알림이 아니에요.");
  }

  listArtifacts(projectId: string) {
    return this.db
      .prepare(
        `SELECT id, job_id AS jobId, author_id AS authorId, change_id AS changeId,
         name, kind, path, hash, created_at AS createdAt
         FROM artifacts WHERE project_id = ? ORDER BY rowid DESC`,
      )
      .all(projectId) as Artifact[];
  }

  getArtifact(projectId: string, id: string) {
    return this.db
      .prepare(
        `SELECT id, job_id AS jobId, author_id AS authorId, change_id AS changeId,
         name, kind, path, hash, created_at AS createdAt
         FROM artifacts WHERE project_id = ? AND id = ?`,
      )
      .get(projectId, id) as Artifact | undefined;
  }
}
