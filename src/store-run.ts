// Per-job work plans, agent context, model retries, peer requests, and the final job record.

import { randomUUID } from "node:crypto";
import {
  planTargets,
  roles,
  type ApprovalMode,
  type Job,
  type JobState,
  type RoleId,
  type WorkPlan,
} from "./actions";
import { sanitizeText } from "./diagnostic-sanitizer";
import { StoreChanges } from "./store-changes";
export class StoreRun extends StoreChanges {
  proposeWorkPlan(job: Job, plan: WorkPlan) {
    const id = randomUUID();
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO work_plans (id, job_id, request, plan) VALUES (?, ?, ?, ?)",
        )
        .run(id, job.id, job.request, JSON.stringify(plan));
      this.log(
        job.sessionId,
        "플랜 → 리뷰 · " + planTargets(plan) + " · " + plan.criterion,
        job.id,
      );
    });
    return id;
  }

  reviewWorkPlan(job: Job, id: string, passed: boolean, note: string) {
    this.transaction(() => {
      const saved = this.db
        .prepare(
          "UPDATE work_plans SET review_passed = ?, review_note = ? WHERE id = ? AND job_id = ? AND review_passed IS NULL",
        )
        .run(passed ? 1 : 0, note, id, job.id);
      if (saved.changes)
        this.log(
          job.sessionId,
          "리뷰 → 플랜 · " + (passed ? "계획 확인 · " : "계획 보완 · ") + note,
          job.id,
        );
    });
  }

  getAgentContext(jobId: string, memberId: string) {
    return this.db
      .prepare(
        `SELECT thread_id AS threadId,
          CASE WHEN revision_id IS (
            SELECT request_id FROM job_revisions WHERE job_id = context.job_id ORDER BY rowid DESC LIMIT 1
          ) THEN result ELSE '' END AS result
        FROM agent_context AS context WHERE job_id = ? AND role = ?`,
      )
      .get(jobId, memberId) as
      | { threadId: string | null; result: string }
      | undefined;
  }

  rememberAgentThread(jobId: string, memberId: string, threadId: string) {
    this.db
      .prepare(
        `
      INSERT INTO agent_context (job_id, role, thread_id, result) VALUES (?, ?, ?, '')
      ON CONFLICT(job_id, role) DO UPDATE SET thread_id = excluded.thread_id
    `,
      )
      .run(jobId, memberId, threadId);
  }

  scheduleModelRetry(job: Job, step: string, label: string, limit: number) {
    return this.transaction(() => {
      const row = this.db
        .prepare(
          `
        INSERT INTO model_retries VALUES (?, ?, 1)
        ON CONFLICT(job_id, step) DO UPDATE SET count = count + 1
        WHERE count < ? RETURNING count
      `,
        )
        .get(job.id, step, limit);
      if (!row) return null;
      const count = Number(row.count);
      this.log(
        job.sessionId,
        label + " · 모델 연결 재시도 " + count + "/" + limit,
        job.id,
      );
      return count;
    });
  }

  readPendingModelTurn(jobId: string, step: string) {
    return this.db
      .prepare(
        "SELECT thread_id AS threadId, turn_id AS turnId FROM pending_model_turns WHERE job_id = ? AND step = ?",
      )
      .get(jobId, step) as { threadId: string; turnId: string } | undefined;
  }

  savePendingModelTurn(
    jobId: string,
    step: string,
    threadId: string,
    turnId: string,
  ) {
    this.db
      .prepare(
        `INSERT INTO pending_model_turns VALUES (?, ?, ?, ?)
      ON CONFLICT(job_id, step) DO UPDATE SET thread_id = excluded.thread_id, turn_id = excluded.turn_id`,
      )
      .run(jobId, step, threadId, turnId);
  }

  clearModelRetry(jobId: string, step: string) {
    this.transaction(() => {
      this.db
        .prepare("DELETE FROM model_retries WHERE job_id = ? AND step = ?")
        .run(jobId, step);
      this.db
        .prepare(
          "DELETE FROM pending_model_turns WHERE job_id = ? AND step = ?",
        )
        .run(jobId, step);
    });
  }

  saveAgentContext(
    jobId: string,
    memberId: string,
    threadId: string | null,
    result: string,
  ) {
    this.db
      .prepare(
        `INSERT INTO agent_context (job_id, role, thread_id, result, revision_id)
        VALUES (?, ?, ?, ?, (SELECT request_id FROM job_revisions WHERE job_id = ? ORDER BY rowid DESC LIMIT 1))
        ON CONFLICT(job_id, role) DO UPDATE SET
          thread_id = excluded.thread_id, result = excluded.result, revision_id = excluded.revision_id`,
      )
      .run(jobId, memberId, threadId, result, jobId);
  }

  openPeerRequest(
    id: string,
    job: Job,
    sender: RoleId,
    recipient: RoleId,
    path: string,
    baseline: string | null,
    question: string,
    parentId: string | null,
  ) {
    return this.transaction(() => {
      const cycle =
        sender === recipient ||
        (parentId &&
          this.db
            .prepare(
              `
        WITH RECURSIVE ancestors AS (
          SELECT sender, recipient, parent_id FROM peer_requests WHERE id = ? AND job_id = ?
          UNION ALL
          SELECT p.sender, p.recipient, p.parent_id FROM peer_requests p JOIN ancestors a ON p.id = a.parent_id
        )
        SELECT 1 FROM ancestors WHERE sender = ? OR recipient = ? LIMIT 1
      `,
            )
            .get(parentId, job.id, recipient, recipient));
      if (cycle) {
        const from = roles.find(({ id }) => id === sender)!.title;
        const to = roles.find(({ id }) => id === recipient)!.title;
        this.log(
          job.sessionId,
          "비서 · " +
            from +
            " → " +
            to +
            " 순환 요청 보류 · 기존 인계 범위에서 답변 요청",
          job.id,
        );
        return { cyclic: true, answer: null, blocker: null };
      }
      const inserted = this.db
        .prepare(
          "INSERT OR IGNORE INTO peer_requests (id, job_id, sender, recipient, path, baseline, question, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, job.id, sender, recipient, path, baseline, question, parentId);
      if (inserted.changes) {
        const from = roles.find(({ id }) => id === sender)!.title;
        const to = roles.find(({ id }) => id === recipient)!.title;
        this.log(
          job.sessionId,
          from + " → " + to + " · " + path + " · " + question,
          job.id,
        );
      }
      const row = this.db
        .prepare("SELECT answer, blocker FROM peer_requests WHERE id = ?")
        .get(id);
      return {
        cyclic: false,
        answer: (row?.answer ?? null) as string | null,
        blocker: (row?.blocker ?? null) as string | null,
      };
    });
  }

  recordPeerMessage(
    job: Job,
    id: string,
    round: number,
    kind: "question" | "supplement" | "guidance",
    sender: RoleId,
    body: string,
  ) {
    this.transaction(() => {
      const saved = this.db
        .prepare(
          `
        INSERT OR IGNORE INTO peer_messages
        SELECT id, ?, ?, ?, ? FROM peer_requests WHERE id = ? AND job_id = ? AND answer IS NULL AND blocker IS NULL
      `,
        )
        .run(round, kind, sender, body, id, job.id);
      if (saved.changes) {
        const title = roles.find(({ id }) => id === sender)!.title;
        this.log(
          job.sessionId,
          title +
            " · " +
            (kind === "question" ? "보완 질문" : "보완 내용") +
            " · " +
            body,
          job.id,
        );
      }
    });
  }

  answerPeerRequest(id: string, job: Job, text: string, blocked: boolean) {
    this.transaction(() => {
      const saved = this.db
        .prepare(
          "UPDATE peer_requests SET answer = ?, blocker = ? WHERE id = ? AND job_id = ? AND answer IS NULL AND blocker IS NULL RETURNING sender, recipient",
        )
        .get(blocked ? null : text, blocked ? text : null, id, job.id);
      if (saved) {
        const from = roles.find(({ id }) => id === saved.recipient)!.title;
        const to = roles.find(({ id }) => id === saved.sender)!.title;
        this.log(
          job.sessionId,
          from + " → " + to + " · " + (blocked ? "확인 필요 · " : "") + text,
          job.id,
        );
      }
    });
  }

  recordJob(
    job: Job,
    state: JobState,
    note: string,
    plan = job.plan,
    approval: string | null = null,
    report?: string,
    approvalEvent?:
      | { mode: ApprovalMode }
      | { id: string; actor: string; decision: "allow" | "deny" },
  ) {
    this.transaction(() => {
      if (approvalEvent && "mode" in approvalEvent) {
        this.db
          .prepare(
            "INSERT INTO file_approvals (id, job_id, mode) VALUES (?, ?, ?)",
          )
          .run(approval, job.id, approvalEvent.mode);
        this.recordAudit({
          projectId: job.projectId,
          sessionId: job.sessionId,
          jobId: job.id,
          event: "file.approval",
          outcome: "requested",
          actor: "비서",
          subject: describeTargets(plan ?? job.plan),
          detail: note,
        });
      } else if (approvalEvent) {
        this.db
          .prepare(
            "UPDATE file_approvals SET actor = ?, decision = ? WHERE id = ? AND job_id = ? AND decision IS NULL",
          )
          .run(
            approvalEvent.actor,
            approvalEvent.decision,
            approvalEvent.id,
            job.id,
          );
        this.recordAudit({
          projectId: job.projectId,
          sessionId: job.sessionId,
          jobId: job.id,
          event: "file.approval",
          outcome:
            approvalEvent.decision === "allow" ? "allowed" : "denied",
          actor: approvalEvent.actor,
          subject: describeTargets(job.plan),
          detail: note,
        });
      }
      this.db
        .prepare(
          `UPDATE jobs SET execution_plan_id = CASE
            WHEN ? = 'developing' AND state IN ('approval', 'queued') THEN approval_id
            WHEN ? IN ('planning', 'complete', 'denied') THEN NULL
            ELSE execution_plan_id END,
            state = ?, plan = ?, approval_id = ? WHERE id = ?`,
        )
        .run(
          state,
          state,
          state,
          plan ? JSON.stringify(plan) : null,
          approval,
          job.id,
        );
      this.log(job.sessionId, note, job.id);
      if (state === "approval" && approval)
        this.notify(job, "approval:" + approval, "approval", note, approval);
      if (state === "complete") this.notify(job, "report:" + job.id, "report", note);
      if (state === "stopped")
        this.notify(job, "stopped:" + job.id, "stopped", note);
      if (state === "complete" || state === "denied")
        this.releaseTemporaryMembers(job);
      if (report)
        this.db
          .prepare(
            "INSERT INTO messages (id, session_id, role, text, state, job_id) VALUES (?, ?, 'assistant', ?, 'complete', ?)",
          )
          .run(randomUUID(), job.sessionId, sanitizeText(report), job.id);
    });
  }
}

/** 감사 기록에 남길 승인 대상 파일 목록. 계획이 없으면 비워 둔다. */
function describeTargets(plan: WorkPlan | null | undefined) {
  return plan ? planTargets(plan) : null;
}
