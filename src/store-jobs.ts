// Sessions, messages, jobs, follow-ups, and job revisions.

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  type Completion,
  type Job,
  type Message,
  type WorkPlan,
} from "./actions";
import { sanitizeText } from "./diagnostic-sanitizer";
import { StoreWorkspace } from "./store-workspace";
export class StoreJobs extends StoreWorkspace {
  getMessages(sessionId: string) {
    return this.db
      .prepare(
        "SELECT id, role, text, state, error, job_id AS jobId FROM messages WHERE session_id = ? ORDER BY rowid",
      )
      .all(sessionId) as Message[];
  }

  clearSession(sessionId: string, requestId: string) {
    const previous = this.db
      .prepare("SELECT session_id, text FROM requests WHERE id = ?")
      .get(requestId);
    if (previous) {
      if (previous.session_id !== sessionId || previous.text !== "/clear")
        throw new Error("다른 전송에 쓰인 요청이에요.");
      return;
    }
    const { projectId, workflowId } = this.getSession(sessionId);
    this.transaction(() => {
      this.openProject(projectId);
      this.saveDraft(sessionId, "");
      this.insertSession(projectId, workflowId);
      this.db
        .prepare(
          "INSERT INTO requests (id, session_id, text) VALUES (?, ?, '/clear')",
        )
        .run(requestId, sessionId);
    });
  }

  beginResponse(
    sessionId: string,
    requestId: string,
    text: string,
    state: "running" | "queued" = "running",
  ) {
    const prior = this.db
      .prepare("SELECT session_id, text FROM requests WHERE id = ?")
      .get(requestId);
    if (prior) {
      if (prior.session_id !== sessionId || prior.text !== text)
        throw new Error("다른 전송에 쓰인 요청이에요.");
      return null;
    }
    const responseId = randomUUID();
    this.transaction(() => {
      const add = this.db.prepare(
        "INSERT INTO messages (id, session_id, role, text, state) VALUES (?, ?, ?, ?, ?)",
      );
      add.run(requestId, sessionId, "user", text, "complete");
      add.run(responseId, sessionId, "assistant", "", state);
      this.db
        .prepare("INSERT INTO requests VALUES (?, ?, ?, ?)")
        .run(requestId, sessionId, text, responseId);
      const title = Array.from(text.replace(/\s+/g, " ")).slice(0, 60).join("");
      this.db
        .prepare(
          "UPDATE sessions SET title = CASE WHEN NOT EXISTS (SELECT 1 FROM messages WHERE session_id = ? AND role = 'user' AND id <> ?) THEN ? ELSE title END, draft = '' WHERE id = ?",
        )
        .run(sessionId, requestId, title, sessionId);
    });
    return responseId;
  }

  /** 앞선 답변이 끝난 뒤 기다리던 응답을 시작한다. */
  startResponse(id: string) {
    this.db
      .prepare(
        "UPDATE messages SET state = 'running' WHERE id = ? AND state = 'queued'",
      )
      .run(id);
  }

  append(id: string, delta: string) {
    this.db
      .prepare(
        "UPDATE messages SET text = text || ? WHERE id = ? AND state IN ('running', 'stopping')",
      )
      .run(delta, id);
  }

  finish(id: string, state: Completion, error: string | null = null) {
    this.db
      .prepare(
        "UPDATE messages SET state = ?, error = ? WHERE id = ? AND state IN ('running', 'stopping', 'queued')",
      )
      .run(state, error === null ? null : sanitizeText(error), id);
  }

  getCodexThread(sessionId: string) {
    const row = this.db
      .prepare("SELECT codex_thread FROM sessions WHERE id = ?")
      .get(sessionId);
    return row?.codex_thread as string | null;
  }

  setCodexThread(sessionId: string, id: string | null) {
    this.db
      .prepare("UPDATE sessions SET codex_thread = ? WHERE id = ?")
      .run(id, sessionId);
  }

  createJob(sessionId: string, requestId: string, request: string) {
    const session = this.getSession(sessionId);
    const { projectId } = session;
    const workflow = this.jobWorkflow(projectId, session.workflowId);
    this.db
      .prepare(
        "INSERT INTO jobs (id, project_id, session_id, request, state, workflow_id, workflow_version) VALUES (?, ?, ?, ?, 'planning', ?, ?)",
      )
      .run(
        requestId,
        projectId,
        sessionId,
        request,
        workflow?.id ?? null,
        workflow?.version ?? null,
      );
    return this.getJob(requestId);
  }

  stageFollowup(
    sessionId: string,
    id: string,
    text: string,
    candidates: string[],
    needsDetail: boolean,
  ) {
    this.transaction(() => {
      const prior = this.db
        .prepare("SELECT session_id, text FROM requests WHERE id = ?")
        .get(id);
      if (prior) {
        if (prior.session_id !== sessionId || prior.text !== text)
          throw new Error("다른 전송에 쓰인 요청이에요.");
        return;
      }
      this.db
        .prepare(
          "INSERT INTO messages (id, session_id, role, text, state) VALUES (?, ?, 'user', ?, 'complete')",
        )
        .run(randomUUID(), sessionId, text);
      this.db
        .prepare("INSERT INTO requests (id, session_id, text) VALUES (?, ?, ?)")
        .run(id, sessionId, text);
      this.db
        .prepare(
          "INSERT INTO work_followups (id, session_id, text, candidate_ids, needs_detail, state) VALUES (?, ?, ?, ?, ?, 'selecting')",
        )
        .run(
          id,
          sessionId,
          text,
          JSON.stringify(candidates),
          Number(needsDetail),
        );
      this.saveDraft(sessionId, "");
    });
  }

  selectFollowup(sessionId: string, id: string, jobId: string | null) {
    return this.transaction(() => {
      const item = this.db
        .prepare(
          "SELECT state, job_id, candidate_ids FROM work_followups WHERE id = ? AND session_id = ?",
        )
        .get(id, sessionId);
      if (!item) throw new Error("이 세션의 추가 지시를 찾을 수 없어요.");
      if (item.state !== "selecting") {
        if (item.job_id === jobId) return false;
        throw new Error("이미 처리한 추가 지시예요.");
      }
      if (!jobId) {
        this.db
          .prepare("UPDATE work_followups SET state = 'cancelled' WHERE id = ?")
          .run(id);
        return false;
      }
      if (
        !(JSON.parse(String(item.candidate_ids)) as string[]).includes(jobId) ||
        this.getJob(jobId).sessionId !== sessionId
      )
        throw new Error("질문에 표시된 업무를 선택해 주세요.");
      this.db
        .prepare(
          "UPDATE work_followups SET state = 'queued', job_id = ? WHERE id = ?",
        )
        .run(jobId, id);
      this.log(sessionId, "사용자 · 이 업무에 추가 지시 연결", jobId);
      return true;
    });
  }

  applyQueuedFollowup(job: Job) {
    return this.transaction(() => {
      const item = this.db
        .prepare(
          "SELECT id, text, needs_detail FROM work_followups WHERE job_id = ? AND state = 'queued' ORDER BY rowid LIMIT 1",
        )
        .get(job.id);
      if (!item) return null;
      this.db
        .prepare("UPDATE work_followups SET state = 'applied' WHERE id = ?")
        .run(item.id);
      if (item.needs_detail) {
        this.insertJobQuestion(
          job,
          "이 업무에서 어떻게 바꿀까요? " + (job.plan?.goal ?? job.request),
        );
        return "clarification";
      }
      this.db
        .prepare("INSERT INTO job_revisions VALUES (?, ?, ?, ?, NULL)")
        .run(
          item.id,
          job.id,
          job.request,
          job.plan && JSON.stringify(job.plan),
        );
      this.db
        .prepare(
          "UPDATE jobs SET request = ?, state = 'planning', plan = NULL, approval_id = NULL, execution_plan_id = NULL WHERE id = ?",
        )
        .run(item.text, job.id);
      this.log(
        job.sessionId,
        "비서 → 계획 · 선택한 업무에 추가 지시 반영",
        job.id,
      );
      return "planning";
    });
  }

  readFollowups(sessionId: string) {
    return this.db
      .prepare(
        "SELECT id, text, candidate_ids FROM work_followups WHERE session_id = ? AND state = 'selecting' ORDER BY rowid",
      )
      .all(sessionId)
      .map(({ id, text, candidate_ids }) => ({
        id: String(id),
        text: String(text),
        candidateIds: JSON.parse(String(candidate_ids)) as string[],
      }));
  }

  queuedFollowupJobs() {
    return this.db
      .prepare(
        "SELECT DISTINCT job_id FROM work_followups WHERE state = 'queued' AND job_id IS NOT NULL",
      )
      .all()
      .map(({ job_id }) => String(job_id));
  }

  readQueuedJobs() {
    return this.db
      .prepare("SELECT id FROM jobs WHERE state = 'queued' ORDER BY rowid")
      .all()
      .map(({ id }) => this.getJob(String(id)));
  }

  askJobQuestion(job: Job, text: string) {
    this.transaction(() => this.insertJobQuestion(job, text));
  }

  protected insertJobQuestion(job: Job, text: string) {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO job_questions VALUES (?, ?, ?)")
      .run(id, job.id, text);
    this.db
      .prepare(
        "UPDATE jobs SET state = 'clarification', approval_id = NULL WHERE id = ?",
      )
      .run(job.id);
    this.log(job.sessionId, "비서 · 사용자 확인 요청 · " + text, job.id);
    this.notify(job, "question:" + id, "question", text, id);
  }

  reviseJob(job: Job, requestId: string, text: string, questionId?: string) {
    return this.transaction(() => {
      const previous = this.db
        .prepare(
          "SELECT requests.text, job_revisions.job_id, job_revisions.question_id FROM requests LEFT JOIN job_revisions ON request_id = requests.id WHERE requests.id = ?",
        )
        .get(requestId);
      if (previous) {
        if (
          previous.job_id !== job.id ||
          previous.text !== text ||
          previous.question_id !== (questionId ?? null)
        )
          throw new Error("다른 전송에 쓰인 요청이에요.");
        return false;
      }
      if (questionId && job.clarification?.id !== questionId)
        throw new Error("이미 바뀐 질문이에요. 현재 질문을 확인해 주세요.");
      if (!questionId && job.state !== "complete")
        throw new Error("완료된 업무에 추가 지시를 보낼 수 있어요.");
      this.db
        .prepare("INSERT INTO requests (id, session_id, text) VALUES (?, ?, ?)")
        .run(requestId, job.sessionId, text);
      this.db
        .prepare("INSERT INTO job_revisions VALUES (?, ?, ?, ?, ?)")
        .run(
          requestId,
          job.id,
          job.request,
          job.plan && JSON.stringify(job.plan),
          questionId ?? null,
        );
      this.db
        .prepare(
          "INSERT INTO messages (id, session_id, role, text, state, job_id) VALUES (?, ?, 'user', ?, 'complete', ?)",
        )
        .run(randomUUID(), job.sessionId, text, job.id);
      this.db
        .prepare(
          "UPDATE jobs SET request = ?, state = 'planning', plan = NULL, approval_id = NULL, execution_plan_id = NULL WHERE id = ?",
        )
        .run(
          questionId
            ? job.request +
                "\n\n비서의 확인 질문: " +
                job.clarification!.text +
                "\n사용자 답변: " +
                text
            : text,
          job.id,
        );
      this.log(
        job.sessionId,
        questionId
          ? "비서 → 계획 · 사용자 확인 답변 전달"
          : "비서 → 계획 · 완료 업무의 추가 지시",
        job.id,
      );
      return true;
    });
  }

  previousJobInstruction(jobId: string) {
    const row = this.db
      .prepare(
        "SELECT previous_request AS request, previous_plan AS plan FROM job_revisions WHERE job_id = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(jobId) as { request: string; plan: string | null } | undefined;
    return (
      row && {
        request: row.request,
        plan: row.plan ? (JSON.parse(row.plan) as WorkPlan) : null,
      }
    );
  }

  protected jobWorkflow(projectId: string, workflowId: string | null) {
    const workflows = this.listWorkflows(projectId);
    return (
      workflows.find(({ id }) => id === workflowId) ?? workflows[0] ?? null
    );
  }
}
