import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  planFiles,
  roles,
  type Activity,
  type ApprovalMode,
  type Completion,
  type CrewMember,
  type Job,
  type JobState,
  type WorkPlan,
  type WorkChange,
  type WorkCheck,
  type ReviewFinding,
  type Message,
  type Project,
  type Provider,
  type RoleId,
  type Session,
  type Snapshot,
} from "./actions";

export class CrewStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    const migration = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (migration.user_version > 14)
      throw new Error("데이터를 저장한 최신 AI Crew 버전으로 열어 주세요.");
    if (migration.user_version === 0) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE projects (id TEXT PRIMARY KEY, root TEXT NOT NULL UNIQUE, name TEXT NOT NULL, last_session TEXT);
        CREATE TABLE sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, draft TEXT NOT NULL DEFAULT '', codex_thread TEXT);
        CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), role TEXT NOT NULL, text TEXT NOT NULL, state TEXT NOT NULL, error TEXT);
        CREATE TABLE requests (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), text TEXT NOT NULL, response_id TEXT REFERENCES messages(id));
        CREATE TABLE crew (project_id TEXT NOT NULL REFERENCES projects(id), role TEXT NOT NULL, provider TEXT NOT NULL, PRIMARY KEY (project_id, role));
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE activity (id INTEGER PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), text TEXT NOT NULL);
        PRAGMA user_version = 1;
        COMMIT;
      `);
    }
    if (migration.user_version < 2) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), session_id TEXT NOT NULL REFERENCES sessions(id), request TEXT NOT NULL, state TEXT NOT NULL, approval_id TEXT UNIQUE, plan TEXT);
        ALTER TABLE activity ADD COLUMN job_id TEXT REFERENCES jobs(id);
        PRAGMA user_version = 2;
        COMMIT;
      `);
    }
    if (migration.user_version < 3) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE projects ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'manual';
        ALTER TABLE crew ADD COLUMN hired INTEGER NOT NULL DEFAULT 1;
        PRAGMA user_version = 3;
        COMMIT;
      `);
    }
    if (migration.user_version < 4) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE agent_context (
          job_id TEXT NOT NULL REFERENCES jobs(id),
          role TEXT NOT NULL,
          thread_id TEXT,
          result TEXT NOT NULL,
          PRIMARY KEY (job_id, role)
        );
        PRAGMA user_version = 4;
        COMMIT;
      `);
    }
    if (migration.user_version < 5) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE peer_requests (
          id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
          sender TEXT NOT NULL, recipient TEXT NOT NULL, path TEXT NOT NULL,
          baseline TEXT, question TEXT NOT NULL, answer TEXT
        );
        PRAGMA user_version = 5;
        COMMIT;
      `);
    }
    if (migration.user_version < 6) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE messages ADD COLUMN job_id TEXT REFERENCES jobs(id);
        CREATE TABLE job_revisions (
          request_id TEXT PRIMARY KEY REFERENCES requests(id),
          job_id TEXT NOT NULL REFERENCES jobs(id),
          previous_request TEXT NOT NULL,
          previous_plan TEXT
        );
        PRAGMA user_version = 6;
        COMMIT;
      `);
    }
    if (migration.user_version < 7) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE work_plans (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL REFERENCES jobs(id),
          request TEXT NOT NULL,
          plan TEXT NOT NULL,
          review_passed INTEGER,
          review_note TEXT
        );
        PRAGMA user_version = 7;
        COMMIT;
      `);
    }
    if (migration.user_version < 8) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE agent_context ADD COLUMN revision_id TEXT REFERENCES job_revisions(request_id);
        PRAGMA user_version = 8;
        COMMIT;
      `);
    }
    if (migration.user_version < 9) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE work_changes (
          id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
          plan_id TEXT REFERENCES work_plans(id), path TEXT NOT NULL,
          before_hash TEXT, after_hash TEXT NOT NULL, before_text TEXT,
          after_text TEXT NOT NULL, saved_at TEXT
        );
        CREATE TABLE work_checks (
          change_id TEXT NOT NULL REFERENCES work_changes(id), role TEXT NOT NULL,
          passed INTEGER NOT NULL, unavailable INTEGER NOT NULL, note TEXT NOT NULL,
          command TEXT, checked_at TEXT NOT NULL, PRIMARY KEY (change_id, role)
        );
        ALTER TABLE activity ADD COLUMN recorded_at TEXT;
        PRAGMA user_version = 9;
        COMMIT;
      `);
    }
    if (migration.user_version < 10) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE crew ADD COLUMN name TEXT;
        CREATE TABLE crew_members (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          role TEXT NOT NULL, name TEXT NOT NULL, provider TEXT NOT NULL, hired INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE job_assignees (
          job_id TEXT NOT NULL REFERENCES jobs(id), role TEXT NOT NULL,
          member_id TEXT NOT NULL, PRIMARY KEY (job_id, role)
        );
        PRAGMA user_version = 10;
        COMMIT;
      `);
    }
    if (migration.user_version < 11) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE peer_requests ADD COLUMN parent_id TEXT REFERENCES peer_requests(id);
        ALTER TABLE peer_requests ADD COLUMN blocker TEXT;
        CREATE TABLE peer_messages (
          request_id TEXT NOT NULL REFERENCES peer_requests(id),
          round INTEGER NOT NULL, kind TEXT NOT NULL, sender TEXT NOT NULL,
          body TEXT NOT NULL, PRIMARY KEY(request_id, round, kind)
        );
        PRAGMA user_version = 11;
        COMMIT;
      `);
    }
    if (migration.user_version < 12) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE job_questions (
          id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
          text TEXT NOT NULL
        );
        ALTER TABLE job_revisions ADD COLUMN question_id TEXT REFERENCES job_questions(id);
        PRAGMA user_version = 12;
        COMMIT;
      `);
    }
    if (migration.user_version < 13) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE work_checks RENAME TO previous_work_checks;
        CREATE TABLE work_checks (
          change_id TEXT NOT NULL REFERENCES work_changes(id), role TEXT NOT NULL,
          passed INTEGER NOT NULL, unavailable INTEGER NOT NULL, note TEXT NOT NULL,
          command TEXT, checked_at TEXT NOT NULL, batch_id TEXT NOT NULL REFERENCES work_changes(id),
          PRIMARY KEY (change_id, batch_id, role)
        );
        INSERT INTO work_checks SELECT *, change_id FROM previous_work_checks;
        DROP TABLE previous_work_checks;
        PRAGMA user_version = 13;
        COMMIT;
      `);
    }
    if (migration.user_version < 14) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE work_checks ADD COLUMN findings TEXT NOT NULL DEFAULT '[]';
        PRAGMA user_version = 14;
        COMMIT;
      `);
    }
    this.db.exec(
      "UPDATE jobs SET state = 'stopped' WHERE state IN ('planning', 'queued', 'developing', 'reviewing', 'stopping');",
    );
    this.db.exec(
      "UPDATE messages SET state = 'stopped' WHERE state IN ('running', 'stopping');",
    );
  }

  close() {
    this.db.close();
  }

  private transaction<T>(run: () => T): T {
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
        "SELECT id, project_id AS projectId, title, draft FROM sessions WHERE id = ?",
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

  private insertSession(projectId: string) {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO sessions (id, project_id, title) VALUES (?, ?, '새 대화')",
      )
      .run(id, projectId);
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

  readMembers(projectId: string, roleId?: RoleId): CrewMember[] {
    const defaults = this.db
      .prepare(
        "SELECT role, name, provider, hired FROM crew WHERE project_id = ?",
      )
      .all(projectId);
    const members = this.db
      .prepare(
        "SELECT id, role AS roleId, name, provider, hired FROM crew_members WHERE project_id = ? ORDER BY rowid",
      )
      .all(projectId) as (Omit<CrewMember, "hired"> & { hired: number })[];
    return roles
      .filter((role) => !roleId || role.id === roleId)
      .flatMap((role) => {
        const saved = defaults.find((item) => item.role === role.id);
        return [
          {
            id: role.id,
            roleId: role.id,
            name: (saved?.name as string | null) ?? role.name,
            provider: (saved?.provider as Provider) ?? "local",
            hired: saved?.hired !== 0,
          },
          ...members
            .filter((member) => member.roleId === role.id)
            .map((member) => ({
              ...member,
              hired: Boolean(member.hired),
            })),
        ];
      });
  }

  addMember(projectId: string, member: Omit<CrewMember, "hired">) {
    this.getProject(projectId);
    this.transaction(() => {
      const existing = this.db
        .prepare("SELECT project_id, role FROM crew_members WHERE id = ?")
        .get(member.id);
      if (existing) {
        if (
          existing.project_id !== projectId ||
          existing.role !== member.roleId
        )
          throw new Error("이미 다른 팀원에게 사용된 ID예요.");
        return;
      }
      this.db
        .prepare(
          "INSERT INTO crew_members (id, project_id, role, name, provider) VALUES (?, ?, ?, ?, ?)",
        )
        .run(member.id, projectId, member.roleId, member.name, member.provider);
      this.logMemberEmployment(projectId, member.name, true);
    });
  }

  updateMember(
    projectId: string,
    memberId: string,
    patch: Partial<Pick<CrewMember, "name" | "provider" | "hired">>,
  ) {
    this.getProject(projectId);
    const member = this.readMembers(projectId).find(
      ({ id }) => id === memberId,
    );
    if (!member) throw new Error("이 프로젝트에서 해당 팀원을 찾을 수 없어요.");
    const {
      name = member.name,
      provider = member.provider,
      hired = member.hired,
    } = patch;
    this.transaction(() => {
      if (member.id === member.roleId)
        this.db
          .prepare(
            `INSERT INTO crew (project_id, role, name, provider, hired) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id, role) DO UPDATE SET name = excluded.name, provider = excluded.provider, hired = excluded.hired`,
          )
          .run(projectId, member.roleId, name, provider, Number(hired));
      else
        this.db
          .prepare(
            "UPDATE crew_members SET name = ?, provider = ?, hired = ? WHERE id = ? AND project_id = ?",
          )
          .run(name, provider, Number(hired), memberId, projectId);
      if (hired !== member.hired)
        this.logMemberEmployment(projectId, name, hired);
    });
  }

  private logMemberEmployment(projectId: string, name: string, hired: boolean) {
    const session = this.db
      .prepare("SELECT last_session FROM projects WHERE id = ?")
      .get(projectId)?.last_session;
    if (typeof session === "string")
      this.log(
        session,
        "사용자 · " + name + " · " + (hired ? "고용" : "미고용"),
      );
  }

  getAssignee(jobId: string, role: RoleId) {
    return this.db
      .prepare(
        "SELECT member_id FROM job_assignees WHERE job_id = ? AND role = ?",
      )
      .get(jobId, role)?.member_id;
  }

  assignMember(job: Job, member: CrewMember) {
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO job_assignees VALUES (?, ?, ?)
        ON CONFLICT(job_id, role) DO UPDATE SET member_id = excluded.member_id`,
        )
        .run(job.id, member.roleId, member.id);
      const title = roles.find(({ id }) => id === member.roleId)?.title;
      this.log(
        job.sessionId,
        "비서 → " + title + " · " + member.name + " 배정",
        job.id,
      );
    });
  }

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
    const { projectId } = this.getSession(sessionId);
    this.transaction(() => {
      this.openProject(projectId);
      this.saveDraft(sessionId, "");
      this.insertSession(projectId);
      this.db
        .prepare(
          "INSERT INTO requests (id, session_id, text) VALUES (?, ?, '/clear')",
        )
        .run(requestId, sessionId);
    });
  }

  beginResponse(sessionId: string, requestId: string, text: string) {
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
      add.run(responseId, sessionId, "assistant", "", "running");
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
        "UPDATE messages SET state = ?, error = ? WHERE id = ? AND state IN ('running', 'stopping')",
      )
      .run(state, error, id);
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

  log(sessionId: string, text: string, jobId: string | null = null) {
    this.db
      .prepare(
        "INSERT INTO activity (session_id, text, job_id, recorded_at) VALUES (?, ?, ?, ?)",
      )
      .run(sessionId, text, jobId, new Date().toISOString());
  }

  createJob(sessionId: string, requestId: string, request: string) {
    const { projectId } = this.getSession(sessionId);
    this.db
      .prepare(
        "INSERT INTO jobs (id, project_id, session_id, request, state) VALUES (?, ?, ?, ?, 'planning')",
      )
      .run(requestId, projectId, sessionId, request);
    return this.getJob(requestId);
  }

  readJobs(sessionId: string) {
    const rows = this.db
      .prepare(
        `SELECT id, project_id AS projectId, session_id AS sessionId, request, state, approval_id AS approvalId, plan,
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

  readQueuedJobs() {
    return this.db
      .prepare("SELECT id FROM jobs WHERE state = 'queued' ORDER BY rowid")
      .all()
      .map(({ id }) => this.getJob(String(id)));
  }

  askJobQuestion(job: Job, text: string) {
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO job_questions VALUES (?, ?, ?)")
        .run(randomUUID(), job.id, text);
      this.db
        .prepare(
          "UPDATE jobs SET state = 'clarification', approval_id = NULL WHERE id = ?",
        )
        .run(job.id);
      this.log(job.sessionId, "비서 · 사용자 확인 요청 · " + text, job.id);
    });
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
          "UPDATE jobs SET request = ?, state = 'planning', plan = NULL, approval_id = NULL WHERE id = ?",
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
          ? "비서 → 플랜 · 사용자 확인 답변 전달"
          : "비서 → 플랜 · 완료 업무의 추가 지시",
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

  prepareChange(
    job: Job,
    path: string,
    before: { hash: string | null; content: string | null },
    after: { hash: string; content: string },
  ) {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO work_changes (id, job_id, plan_id, path, before_hash, after_hash, before_text, after_text)
         VALUES (?, ?, (SELECT id FROM work_plans WHERE id = ?), ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        job.id,
        job.approvalId,
        path,
        before.hash,
        after.hash,
        before.content,
        after.content,
      );
    return id;
  }

  confirmChange(job: Job, changeId: string, hash: string) {
    this.transaction(() => {
      const saved = this.db
        .prepare(
          `UPDATE work_changes SET saved_at = ?
          WHERE id = ? AND job_id = ? AND after_hash = ? AND saved_at IS NULL RETURNING path`,
        )
        .get(new Date().toISOString(), changeId, job.id, hash);
      if (saved)
        this.log(
          job.sessionId,
          "개발 → 비서 · " + saved.path + " 저장 · " + hash,
          job.id,
        );
    });
  }

  recordCheck(
    job: Job,
    changeId: string,
    batchId: string,
    role: "review" | "style" | "test",
    label: string,
    result: {
      passed: boolean;
      note: string;
      unavailable?: boolean;
      command?: string;
      findings?: Omit<ReviewFinding, "excerpt">[];
    },
  ) {
    this.transaction(() => {
      const change = this.db
        .prepare(
          "SELECT after_hash, after_text FROM work_changes WHERE id = ? AND job_id = ? AND saved_at IS NOT NULL",
        )
        .get(changeId, job.id);
      if (!change) return;
      const lines = String(change.after_text).split(/\r\n|\r|\n/);
      if (lines.at(-1) === "") lines.pop();
      const findings = (result.findings ?? []).filter(
        ({ startLine, endLine }) =>
          Number.isInteger(startLine) &&
          Number.isInteger(endLine) &&
          startLine >= 1 &&
          endLine >= startLine &&
          endLine <= lines.length &&
          endLine - startLine < 12,
      );
      const saved = this.db
        .prepare(
          `INSERT OR IGNORE INTO work_checks
          SELECT id, ?, ?, ?, ?, ?, ?, ?, ? FROM work_changes
          WHERE id = ? AND job_id = ? AND saved_at IS NOT NULL RETURNING change_id`,
        )
        .get(
          role,
          Number(result.passed),
          Number(!!result.unavailable),
          result.note,
          result.command ?? null,
          new Date().toISOString(),
          batchId,
          JSON.stringify(findings),
          changeId,
          job.id,
        );
      if (saved) {
        this.log(
          job.sessionId,
          label + " · " + result.note + " · " + change.after_hash,
          job.id,
        );
      }
    });
  }

  readChanges(sessionId: string) {
    const changes = this.db
      .prepare(
        `SELECT c.id, c.job_id AS jobId, c.plan_id AS planId,
      c.path, c.before_hash AS beforeHash, c.after_hash AS afterHash, c.saved_at AS savedAt, c.after_text AS afterText
      FROM work_changes c JOIN jobs j ON j.id = c.job_id
      WHERE j.session_id = ? AND c.saved_at IS NOT NULL ORDER BY c.rowid DESC`,
      )
      .all(sessionId) as (Omit<WorkChange, "checks" | "previousChecks"> & {
      afterText: string;
    })[];
    const checks = this.db
      .prepare(`SELECT role, passed, unavailable, note, command, checked_at AS checkedAt, batch_id AS batchId, findings
      FROM work_checks WHERE change_id = ? ORDER BY rowid`);
    type CheckRow = Omit<
      WorkChange["checks"][number],
      "passed" | "unavailable" | "findings"
    > & {
      passed: number;
      unavailable: number;
      findings: string;
    };
    return changes.map(({ afterText, ...change }): WorkChange => {
      const batches = new Map<string, WorkCheck[]>();
      const lines = afterText.split(/\r\n|\r|\n/);
      for (const row of checks.all(change.id) as CheckRow[]) {
        const batch = batches.get(row.batchId) ?? [];
        batch.push({
          ...row,
          passed: Boolean(row.passed),
          unavailable: Boolean(row.unavailable),
          findings: (
            JSON.parse(row.findings) as Omit<ReviewFinding, "excerpt">[]
          ).map((finding) => ({
            ...finding,
            excerpt: lines
              .slice(finding.startLine - 1, finding.endLine)
              .join("\n")
              .slice(0, 1600),
          })),
        });
        batches.set(row.batchId, batch);
      }
      const [latest = [], ...previousChecks] = [...batches.values()].reverse();
      return { ...change, checks: latest, previousChecks };
    });
  }

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
        "플랜 → 리뷰 · " +
          planFiles(plan)
            .map(({ path }) => path)
            .join(", ") +
          " · " +
          plan.criterion,
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
  ) {
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE jobs SET state = ?, plan = ?, approval_id = ? WHERE id = ?",
        )
        .run(state, plan ? JSON.stringify(plan) : null, approval, job.id);
      this.log(job.sessionId, note, job.id);
      if (report)
        this.db
          .prepare(
            "INSERT INTO messages (id, session_id, role, text, state, job_id) VALUES (?, ?, 'assistant', ?, 'complete', ?)",
          )
          .run(randomUUID(), job.sessionId, report, job.id);
    });
  }

  snapshot(): Snapshot {
    const projects = this.db
      .prepare(
        "SELECT id, root, name, approval_mode AS approvalMode FROM projects ORDER BY rowid DESC",
      )
      .all() as Project[];
    const currentId = this.db
      .prepare("SELECT value FROM settings WHERE key = 'current_project'")
      .get()?.value;
    const current = projects.find(({ id }) => id === currentId) ?? null;
    const sessions = current
      ? (this.db
          .prepare(
            "SELECT id, project_id AS projectId, title, draft FROM sessions WHERE project_id = ? ORDER BY rowid DESC",
          )
          .all(current.id) as Session[])
      : [];
    const lastId =
      current &&
      this.db
        .prepare("SELECT last_session FROM projects WHERE id = ?")
        .get(current.id)?.last_session;
    const session = sessions.find(({ id }) => id === lastId) ?? null;
    return {
      projects,
      current,
      sessions,
      session,
      messages: session ? this.getMessages(session.id) : [],
      jobs: session ? this.readJobs(session.id) : [],
      members: current ? this.readMembers(current.id) : [],
      assignees: session
        ? (this.db
            .prepare(
              `SELECT a.job_id AS jobId, a.member_id AS memberId, a.role AS roleId
            FROM job_assignees a JOIN jobs j ON j.id = a.job_id WHERE j.session_id = ?`,
            )
            .all(session.id) as Snapshot["assignees"])
        : [],
      changes: session ? this.readChanges(session.id) : [],
      activity: session
        ? (this.db
            .prepare(
              "SELECT id, text, job_id AS jobId, recorded_at AS recordedAt FROM activity WHERE session_id = ? ORDER BY id DESC LIMIT 100",
            )
            .all(session.id) as Activity[])
        : [],
    };
  }
}
