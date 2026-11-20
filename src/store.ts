import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  planFiles,
  planTargets,
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
    if (migration.user_version > 21)
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
    if (migration.user_version < 15) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE work_changes ADD COLUMN moved_from TEXT;
        PRAGMA user_version = 15;
        COMMIT;
      `);
    }
    if (migration.user_version < 16) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE jobs ADD COLUMN execution_plan_id TEXT REFERENCES work_plans(id);
        CREATE TABLE verification_checkpoints (
          job_id TEXT NOT NULL REFERENCES jobs(id),
          version TEXT NOT NULL,
          role TEXT NOT NULL,
          path TEXT NOT NULL,
          result TEXT NOT NULL,
          PRIMARY KEY (job_id, version, role, path)
        );
        UPDATE jobs AS j SET execution_plan_id = (
          SELECT p.id FROM work_plans p JOIN work_changes c ON c.plan_id = p.id
          WHERE p.job_id = j.id AND p.request = j.request AND p.plan = j.plan
          ORDER BY c.rowid DESC LIMIT 1
        ) WHERE j.state IN ('stopped', 'failed', 'developing', 'reviewing', 'stopping');
        PRAGMA user_version = 16;
        COMMIT;
      `);
    }
    if (migration.user_version < 17) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE model_retries (
          job_id TEXT NOT NULL REFERENCES jobs(id),
          step TEXT NOT NULL,
          count INTEGER NOT NULL,
          PRIMARY KEY(job_id, step)
        );
        CREATE TABLE pending_model_turns (
          job_id TEXT NOT NULL REFERENCES jobs(id), step TEXT NOT NULL,
          thread_id TEXT NOT NULL, turn_id TEXT NOT NULL, PRIMARY KEY(job_id, step)
        );
        PRAGMA user_version = 17;
        COMMIT;
      `);
    }
    if (migration.user_version < 18) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE work_followups (
          id TEXT PRIMARY KEY REFERENCES requests(id),
          session_id TEXT NOT NULL REFERENCES sessions(id),
          text TEXT NOT NULL, candidate_ids TEXT NOT NULL,
          needs_detail INTEGER NOT NULL, job_id TEXT REFERENCES jobs(id),
          state TEXT NOT NULL
        );
        PRAGMA user_version = 18;
        COMMIT;
      `);
    }
    if (migration.user_version < 19) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE crew_members ADD COLUMN assignment_job_id TEXT REFERENCES jobs(id);
        ALTER TABLE crew_members ADD COLUMN specialty TEXT;
        ALTER TABLE work_changes ADD COLUMN author_member_id TEXT;
        PRAGMA user_version = 19;
        COMMIT;
      `);
    }
    if (migration.user_version < 20) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE file_approvals (
          id TEXT PRIMARY KEY REFERENCES work_plans(id),
          job_id TEXT NOT NULL REFERENCES jobs(id),
          mode TEXT NOT NULL, actor TEXT, decision TEXT
        );
        PRAGMA user_version = 20;
        COMMIT;
      `);
    }
    if (migration.user_version < 21) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE crew_workspace_write (
          project_id TEXT NOT NULL REFERENCES projects(id),
          member_id TEXT NOT NULL,
          allowed INTEGER NOT NULL,
          PRIMARY KEY (project_id, member_id)
        );
        PRAGMA user_version = 21;
        COMMIT;
      `);
    }
    this.db.exec(
      "UPDATE jobs SET state = 'stopped' WHERE state IN ('planning', 'queued', 'developing', 'reviewing', 'recovering', 'stopping');",
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
        "SELECT id, role AS roleId, name, provider, hired, assignment_job_id AS assignmentJobId, specialty FROM crew_members WHERE project_id = ? ORDER BY rowid",
      )
      .all(projectId) as (Omit<CrewMember, "hired" | "writeAllowed"> & {
      hired: number;
    })[];
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
            ...(role.id === "development"
              ? {
                  writeAllowed: this.isWorkspaceWriteAllowed(
                    projectId,
                    role.id,
                  ),
                }
              : {}),
          },
          ...members
            .filter((member) => member.roleId === role.id)
            .map(({ assignmentJobId, specialty, ...member }) => ({
              ...member,
              hired: Boolean(member.hired),
              ...(role.id === "development"
                ? {
                    writeAllowed: this.isWorkspaceWriteAllowed(
                      projectId,
                      member.id,
                    ),
                  }
                : {}),
              ...(assignmentJobId ? { assignmentJobId } : {}),
              ...(specialty ? { specialty } : {}),
            })),
        ];
      });
  }

  private isWorkspaceWriteAllowed(projectId: string, memberId: string) {
    return (
      this.db
        .prepare(
          "SELECT allowed FROM crew_workspace_write WHERE project_id = ? AND member_id = ?",
        )
        .get(projectId, memberId)?.allowed !== 0
    );
  }

  setWorkspaceWrite(projectId: string, memberId: string, allow: boolean) {
    const member = this.readMembers(projectId, "development").find(
      ({ id }) => memberId === id,
    );
    if (!member)
      throw new Error("개발 역할의 파일 쓰기 권한만 변경할 수 있어요.");
    if (member.writeAllowed === allow) return;
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO crew_workspace_write VALUES (?, ?, ?)
        ON CONFLICT(project_id, member_id) DO UPDATE SET allowed = excluded.allowed`,
        )
        .run(projectId, memberId, Number(allow));
      const session = this.db
        .prepare("SELECT last_session FROM projects WHERE id = ?")
        .get(projectId)?.last_session;
      if (typeof session === "string")
        this.log(
          session,
          "사용자 · " +
            member.name +
            " · 파일 쓰기 권한 " +
            (allow ? "부여" : "회수"),
        );
    });
  }

  requireWorkspaceWrite(job: Job, path: string) {
    const current = this.getJob(job.id);
    if (
      current.state !== "developing" ||
      !current.plan ||
      !planFiles(current.plan).some((file) => file.path === path)
    )
      throw new Error("현재 승인 범위에서 파일을 쓸 수 없어요. " + path);
    const writer = this.getAssignee(job.id, "development");
    if (
      typeof writer !== "string" ||
      !this.isWorkspaceWriteAllowed(job.projectId, writer)
    )
      throw new Error("개발 담당의 파일 쓰기 권한이 없어요. " + path);
  }

  recruitMember(
    job: Job,
    role: RoleId,
    provider: Provider,
    label: string,
    specialty?: string,
    permanent = false,
  ) {
    return this.transaction(() => {
      const id = randomUUID();
      const name = label + (permanent ? " 담당" : " 알바");
      this.log(job.sessionId, "인사팀 · " + label + " 후보 준비", job.id);
      this.db
        .prepare(
          `
        INSERT INTO crew_members (id, project_id, role, name, provider, assignment_job_id, specialty)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          id,
          job.projectId,
          role,
          name,
          provider,
          permanent ? null : job.id,
          specialty ?? null,
        );
      this.log(job.sessionId, "비서 · " + name + " 채택·고용", job.id);
      return {
        id,
        name,
        roleId: role,
        provider,
        hired: true,
        ...(permanent ? {} : { assignmentJobId: job.id }),
        ...(specialty ? { specialty } : {}),
      } satisfies CrewMember;
    });
  }

  private releaseTemporaryMembers(job: Job) {
    const members = this.db
      .prepare(
        "UPDATE crew_members SET hired = 0 WHERE assignment_job_id = ? AND hired = 1 RETURNING name",
      )
      .all(job.id);
    for (const { name } of members)
      this.log(job.sessionId, "비서 · " + name + " 업무 종료 · 미고용", job.id);
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
    if (hired && !member.hired && member.assignmentJobId)
      throw new Error("종료한 알바는 새 업무에 다시 배정할 수 없어요.");
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
      if (hired !== member.hired) {
        this.logMemberEmployment(projectId, name, hired);
        if (!hired) {
          const affected = this.db
            .prepare(
              `
            SELECT j.id, j.session_id FROM job_assignees a JOIN jobs j ON j.id = a.job_id
            WHERE a.member_id = ? AND j.project_id = ? AND j.state NOT IN ('complete','denied','failed','stopped')
            GROUP BY j.id
          `,
            )
            .all(memberId, projectId);
          for (const { id, session_id } of affected)
            this.log(
              String(session_id),
              "비서 · " +
                name +
                " 새 배정 종료 · 진행 단계 정리 후 다음 담당자에게 인계",
              String(id),
            );
        }
      }
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

  getAssignee(jobId: string, role: RoleId, specialty?: string) {
    return this.db
      .prepare(
        "SELECT member_id FROM job_assignees WHERE job_id = ? AND role = ?",
      )
      .get(jobId, specialty ? role + ":" + specialty : role)?.member_id;
  }

  assignMember(job: Job, member: CrewMember) {
    this.transaction(() => {
      const previous = this.getAssignee(
        job.id,
        member.roleId,
        member.specialty,
      );
      if (typeof previous === "string" && previous !== member.id) {
        const prior = this.readMembers(job.projectId, member.roleId).find(
          ({ id }) => id === previous,
        );
        this.log(
          job.sessionId,
          "비서 · " +
            (prior?.name ?? previous) +
            " → " +
            member.name +
            " 담당 인계",
          job.id,
        );
      }
      this.db
        .prepare(
          `INSERT INTO job_assignees VALUES (?, ?, ?)
        ON CONFLICT(job_id, role) DO UPDATE SET member_id = excluded.member_id`,
        )
        .run(
          job.id,
          member.specialty
            ? member.roleId + ":" + member.specialty
            : member.roleId,
          member.id,
        );
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
        "비서 → 플랜 · 선택한 업무에 추가 지시 반영",
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

  private insertJobQuestion(job: Job, text: string) {
    this.db
      .prepare("INSERT INTO job_questions VALUES (?, ?, ?)")
      .run(randomUUID(), job.id, text);
    this.db
      .prepare(
        "UPDATE jobs SET state = 'clarification', approval_id = NULL WHERE id = ?",
      )
      .run(job.id);
    this.log(job.sessionId, "비서 · 사용자 확인 요청 · " + text, job.id);
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
    movedFrom?: string,
  ) {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO work_changes (id, job_id, plan_id, path, before_hash, after_hash, before_text, after_text, moved_from, author_member_id)
         VALUES (?, ?, (SELECT id FROM work_plans WHERE id = ?), ?, ?, ?, ?, ?, ?, ?)`,
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
        movedFrom ?? null,
        this.getAssignee(job.id, "development") ?? null,
      );
    return id;
  }

  readRecoveryJournal(jobId: string) {
    return this.db
      .prepare(
        `
      SELECT c.id, c.path, c.after_hash AS afterHash, c.before_text AS beforeText, c.saved_at AS savedAt
      FROM work_changes c JOIN jobs j ON j.id = c.job_id AND c.plan_id = j.execution_plan_id
      WHERE j.id = ? ORDER BY c.rowid
    `,
      )
      .all(jobId) as {
      id: string;
      path: string;
      afterHash: string;
      beforeText: string | null;
      savedAt: string | null;
    }[];
  }

  readVerificationCheckpoint(
    jobId: string,
    version: string,
    role: RoleId,
    path = "",
  ) {
    const row = this.db
      .prepare(
        `
      SELECT result FROM verification_checkpoints WHERE job_id = ? AND version = ? AND role = ? AND path = ?
    `,
      )
      .get(jobId, version, role, path);
    return row ? (JSON.parse(String(row.result)) as unknown) : undefined;
  }

  saveVerificationCheckpoint(
    jobId: string,
    version: string,
    role: RoleId,
    result: object,
    path = "",
  ) {
    this.db
      .prepare(
        `
      INSERT INTO verification_checkpoints VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(job_id, version, role, path) DO NOTHING
    `,
      )
      .run(jobId, version, role, path, JSON.stringify(result));
  }

  confirmChange(job: Job, changeId: string, hash: string) {
    this.transaction(() => {
      const saved = this.db
        .prepare(
          `UPDATE work_changes SET saved_at = ?
          WHERE id = ? AND job_id = ? AND after_hash = ? AND saved_at IS NULL RETURNING path, moved_from`,
        )
        .get(new Date().toISOString(), changeId, job.id, hash);
      if (saved)
        this.log(
          job.sessionId,
          "개발 → 비서 · " +
            (saved.moved_from ? saved.moved_from + " → " : "") +
            saved.path +
            " 저장 · " +
            hash,
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
      c.path, c.moved_from AS movedFrom, c.author_member_id AS authorMemberId,
      c.before_hash AS beforeHash, c.after_hash AS afterHash, c.saved_at AS savedAt, c.after_text AS afterText
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
      if (approvalEvent && "mode" in approvalEvent)
        this.db
          .prepare(
            "INSERT INTO file_approvals (id, job_id, mode) VALUES (?, ?, ?)",
          )
          .run(approval, job.id, approvalEvent.mode);
      else if (approvalEvent)
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
      if (state === "complete" || state === "denied")
        this.releaseTemporaryMembers(job);
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
      fileApprovals: session
        ? (
            this.db
              .prepare(
                `
        SELECT a.id, a.job_id AS jobId, a.mode, a.actor, a.decision, p.plan
        FROM file_approvals a JOIN jobs j ON j.id = a.job_id JOIN work_plans p ON p.id = a.id
        WHERE j.session_id = ? ORDER BY a.rowid DESC
      `,
              )
              .all(session.id) as (Omit<
              Snapshot["fileApprovals"][number],
              "scope"
            > & { plan: string })[]
          ).map(({ plan, ...item }) => ({
            ...item,
            scope: planTargets(JSON.parse(plan) as WorkPlan),
          }))
        : [],
      followups: session ? this.readFollowups(session.id) : [],
      members: current ? this.readMembers(current.id) : [],
      assignees: session
        ? (this.db
            .prepare(
              `SELECT a.job_id AS jobId, a.member_id AS memberId,
                 CASE WHEN instr(a.role, ':') > 0 THEN substr(a.role, 1, instr(a.role, ':') - 1) ELSE a.role END AS roleId
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
