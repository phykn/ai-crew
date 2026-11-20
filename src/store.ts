import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  roles,
  type Activity,
  type ApprovalMode,
  type Completion,
  type Job,
  type JobState,
  type WorkPlan,
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
    if (migration.user_version > 4)
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
    this.db.exec(
      "UPDATE jobs SET state = 'stopped' WHERE state IN ('planning', 'developing', 'reviewing', 'stopping');",
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

  setProvider(projectId: string, roleId: RoleId, provider: Provider) {
    this.getProject(projectId);
    this.db
      .prepare(
        "INSERT INTO crew (project_id, role, provider) VALUES (?, ?, ?) ON CONFLICT(project_id, role) DO UPDATE SET provider = excluded.provider",
      )
      .run(projectId, roleId, provider);
  }

  setApprovalMode(projectId: string, mode: ApprovalMode) {
    this.getProject(projectId);
    this.db
      .prepare("UPDATE projects SET approval_mode = ? WHERE id = ?")
      .run(mode, projectId);
  }

  setEmployment(projectId: string, roleId: RoleId, hired: boolean) {
    this.getProject(projectId);
    this.db
      .prepare(
        "INSERT INTO crew (project_id, role, provider, hired) VALUES (?, ?, 'local', ?) ON CONFLICT(project_id, role) DO UPDATE SET hired = excluded.hired",
      )
      .run(projectId, roleId, Number(hired));
  }

  isHired(projectId: string, roleId: RoleId) {
    return (
      this.db
        .prepare("SELECT hired FROM crew WHERE project_id = ? AND role = ?")
        .get(projectId, roleId)?.hired !== 0
    );
  }

  getProviders(projectId: string) {
    const rows = this.db
      .prepare("SELECT role, provider FROM crew WHERE project_id = ?")
      .all(projectId) as { role: RoleId; provider: Provider }[];
    return Object.fromEntries(
      roles.map(({ id }) => [
        id,
        rows.find((row) => row.role === id)?.provider ?? "local",
      ]),
    ) as Record<RoleId, Provider>;
  }

  getMessages(sessionId: string) {
    return this.db
      .prepare(
        "SELECT id, role, text, state, error FROM messages WHERE session_id = ? ORDER BY rowid",
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
        "INSERT INTO activity (session_id, text, job_id) VALUES (?, ?, ?)",
      )
      .run(sessionId, text, jobId);
  }

  report(sessionId: string, text: string) {
    this.db
      .prepare(
        "INSERT INTO messages (id, session_id, role, text, state) VALUES (?, ?, 'assistant', ?, 'complete')",
      )
      .run(randomUUID(), sessionId, text);
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
        "SELECT id, project_id AS projectId, session_id AS sessionId, request, state, approval_id AS approvalId, plan FROM jobs WHERE session_id = ? ORDER BY rowid",
      )
      .all(sessionId) as (Omit<Job, "plan"> & { plan: string | null })[];
    return rows.map(
      (row): Job => ({
        ...row,
        plan: row.plan ? (JSON.parse(row.plan) as WorkPlan) : null,
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

  getAgentContext(jobId: string, role: RoleId) {
    return this.db
      .prepare(
        "SELECT thread_id AS threadId, result FROM agent_context WHERE job_id = ? AND role = ?",
      )
      .get(jobId, role) as
      | { threadId: string | null; result: string }
      | undefined;
  }

  saveAgentContext(
    jobId: string,
    role: RoleId,
    threadId: string | null,
    result: string,
  ) {
    this.db
      .prepare(
        "INSERT INTO agent_context VALUES (?, ?, ?, ?) ON CONFLICT(job_id, role) DO UPDATE SET thread_id = excluded.thread_id, result = excluded.result",
      )
      .run(jobId, role, threadId, result);
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
      if (report) this.report(job.sessionId, report);
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
      crew: current ? this.getProviders(current.id) : null,
      employment: current
        ? (Object.fromEntries(
            roles.map(({ id }) => [id, this.isHired(current.id, id)]),
          ) as Record<RoleId, boolean>)
        : null,
      messages: session ? this.getMessages(session.id) : [],
      jobs: session ? this.readJobs(session.id) : [],
      activity: session
        ? (this.db
            .prepare(
              "SELECT id, text, job_id AS jobId FROM activity WHERE session_id = ? ORDER BY id DESC LIMIT 100",
            )
            .all(session.id) as Activity[])
        : [],
    };
  }
}
