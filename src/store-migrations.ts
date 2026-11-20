// SQLite schema creation and the incremental migrations that bring an older database
// up to the current version.

import { DatabaseSync } from "node:sqlite";

/**
 * Creates the SQLite schema or migrates an older database, then clears work that a
 * previous run left half-done. Called once whenever the store is opened.
 */
export function initStoreSchema(db: DatabaseSync) {
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    const migration = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (migration.user_version > 36)
      throw new Error("데이터를 저장한 최신 AI Crew 버전으로 열어 주세요.");
    if (migration.user_version === 0) {
      db.exec(`
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
      db.exec(`
        BEGIN;
        CREATE TABLE jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), session_id TEXT NOT NULL REFERENCES sessions(id), request TEXT NOT NULL, state TEXT NOT NULL, approval_id TEXT UNIQUE, plan TEXT);
        ALTER TABLE activity ADD COLUMN job_id TEXT REFERENCES jobs(id);
        PRAGMA user_version = 2;
        COMMIT;
      `);
    }
    if (migration.user_version < 3) {
      db.exec(`
        BEGIN;
        ALTER TABLE projects ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'manual';
        ALTER TABLE crew ADD COLUMN hired INTEGER NOT NULL DEFAULT 1;
        PRAGMA user_version = 3;
        COMMIT;
      `);
    }
    if (migration.user_version < 4) {
      db.exec(`
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
      db.exec(`
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
      db.exec(`
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
      db.exec(`
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
      db.exec(`
        BEGIN;
        ALTER TABLE agent_context ADD COLUMN revision_id TEXT REFERENCES job_revisions(request_id);
        PRAGMA user_version = 8;
        COMMIT;
      `);
    }
    if (migration.user_version < 9) {
      db.exec(`
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
      db.exec(`
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
      db.exec(`
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
      db.exec(`
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
      db.exec(`
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
      db.exec(`
        BEGIN;
        ALTER TABLE work_checks ADD COLUMN findings TEXT NOT NULL DEFAULT '[]';
        PRAGMA user_version = 14;
        COMMIT;
      `);
    }
    if (migration.user_version < 15) {
      db.exec(`
        BEGIN;
        ALTER TABLE work_changes ADD COLUMN moved_from TEXT;
        PRAGMA user_version = 15;
        COMMIT;
      `);
    }
    if (migration.user_version < 16) {
      db.exec(`
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
      db.exec(`
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
      db.exec(`
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
      db.exec(`
        BEGIN;
        ALTER TABLE crew_members ADD COLUMN assignment_job_id TEXT REFERENCES jobs(id);
        ALTER TABLE crew_members ADD COLUMN specialty TEXT;
        ALTER TABLE work_changes ADD COLUMN author_member_id TEXT;
        PRAGMA user_version = 19;
        COMMIT;
      `);
    }
    if (migration.user_version < 20) {
      db.exec(`
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
      db.exec(`
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
    if (migration.user_version < 22) {
      db.exec(`
        BEGIN;
        CREATE TABLE mcp_endpoints (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          name TEXT NOT NULL, url TEXT NOT NULL, enabled INTEGER NOT NULL,
          tools TEXT NOT NULL
        );
        CREATE TABLE mcp_grants (
          server_id TEXT NOT NULL REFERENCES mcp_endpoints(id),
          member_id TEXT NOT NULL, tool_name TEXT NOT NULL, fingerprint TEXT NOT NULL,
          PRIMARY KEY (server_id, member_id, tool_name)
        );
        PRAGMA user_version = 22;
        COMMIT;
      `);
    }
    if (migration.user_version < 23) {
      db.exec(`
        BEGIN;
        CREATE TABLE crew_skills (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          member_id TEXT NOT NULL, name TEXT NOT NULL, markdown TEXT NOT NULL
        );
        PRAGMA user_version = 23;
        COMMIT;
      `);
    }
    if (migration.user_version < 24) {
      db.exec(`
        BEGIN;
        CREATE TABLE model_runs (
          id INTEGER PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
          job_id TEXT REFERENCES jobs(id), role_id TEXT NOT NULL, provider TEXT NOT NULL,
          model TEXT, elapsed_ms INTEGER NOT NULL, input_tokens INTEGER, output_tokens INTEGER
        );
        CREATE INDEX model_runs_by_session ON model_runs(session_id);
        PRAGMA user_version = 24;
        COMMIT;
      `);
    }
    if (migration.user_version < 25) {
      db.exec(`
        BEGIN;
        CREATE TABLE crew_memories (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          owner_id TEXT, author_id TEXT, author_name TEXT NOT NULL,
          source_session_id TEXT NOT NULL, source_job_id TEXT,
          body TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX crew_memories_by_project ON crew_memories(project_id, owner_id);
        PRAGMA user_version = 25;
        COMMIT;
      `);
    }
    if (migration.user_version < 26) {
      db.exec(`
        BEGIN;
        CREATE TABLE wiki_pages (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL, body TEXT NOT NULL, version INTEGER NOT NULL,
          links TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX wiki_pages_by_project ON wiki_pages(project_id, deleted);
        CREATE TABLE wiki_revisions (
          page_id TEXT NOT NULL REFERENCES wiki_pages(id), version INTEGER NOT NULL,
          title TEXT NOT NULL, body TEXT NOT NULL, author_name TEXT NOT NULL,
          created_at TEXT NOT NULL, source_session_id TEXT NOT NULL, source_job_id TEXT,
          PRIMARY KEY(page_id, version)
        );
        PRAGMA user_version = 26;
        COMMIT;
      `);
    }
    if (migration.user_version < 27) {
      db.exec(`
        BEGIN;
        CREATE TABLE tool_approvals (
          id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          server_id TEXT NOT NULL, server_name TEXT NOT NULL,
          member_id TEXT NOT NULL, member_name TEXT NOT NULL,
          tool_name TEXT NOT NULL, scope TEXT NOT NULL, mode TEXT NOT NULL,
          actor TEXT, decision TEXT, requested_at TEXT NOT NULL
        );
        CREATE INDEX tool_approvals_by_job ON tool_approvals(job_id, decision);
        CREATE TABLE skill_uses (
          id TEXT PRIMARY KEY, skill_id TEXT NOT NULL, member_id TEXT NOT NULL,
          job_id TEXT NOT NULL REFERENCES jobs(id), started_at TEXT NOT NULL,
          ended_at TEXT
        );
        CREATE INDEX skill_uses_by_job ON skill_uses(job_id, ended_at);
        PRAGMA user_version = 27;
        COMMIT;
      `);
    }
    if (migration.user_version < 28) {
      db.exec(`
        BEGIN;
        CREATE TABLE workflows (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          name TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE workflow_versions (
          workflow_id TEXT NOT NULL REFERENCES workflows(id), version INTEGER NOT NULL,
          graph TEXT NOT NULL, author TEXT NOT NULL, saved_at TEXT NOT NULL,
          PRIMARY KEY(workflow_id, version)
        );
        ALTER TABLE sessions ADD COLUMN workflow_id TEXT;
        ALTER TABLE jobs ADD COLUMN workflow_id TEXT;
        ALTER TABLE jobs ADD COLUMN workflow_version INTEGER;
        PRAGMA user_version = 28;
        COMMIT;
      `);
    }
    if (migration.user_version < 29) {
      db.exec(`
        BEGIN;
        ALTER TABLE model_runs ADD COLUMN cost_usd REAL;
        PRAGMA user_version = 29;
        COMMIT;
      `);
    }
    if (migration.user_version < 30) {
      db.exec(`
        BEGIN;
        CREATE TABLE view_state (
          session_id TEXT PRIMARY KEY REFERENCES sessions(id),
          tab TEXT NOT NULL DEFAULT 'chat', camp INTEGER NOT NULL DEFAULT 0,
          legend INTEGER NOT NULL DEFAULT 0, panel_width INTEGER NOT NULL DEFAULT 340,
          log_job_id TEXT, memory_section TEXT NOT NULL DEFAULT 'memory',
          memory_owner_id TEXT
        );
        PRAGMA user_version = 30;
        COMMIT;
      `);
    }
    if (migration.user_version < 31) {
      db.exec(`
        BEGIN;
        ALTER TABLE jobs ADD COLUMN worktree TEXT;
        ALTER TABLE jobs ADD COLUMN worktree_branch TEXT;
        ALTER TABLE jobs ADD COLUMN base_commit TEXT;
        ALTER TABLE jobs ADD COLUMN apply_state TEXT NOT NULL DEFAULT 'none';
        ALTER TABLE jobs ADD COLUMN apply_note TEXT;
        PRAGMA user_version = 31;
        COMMIT;
      `);
    }
    if (migration.user_version < 32) {
      db.exec(`
        BEGIN;
        CREATE TABLE artifacts (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          job_id TEXT NOT NULL REFERENCES jobs(id), author_id TEXT, change_id TEXT NOT NULL,
          name TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX artifacts_by_project ON artifacts(project_id);
        CREATE TABLE notifications (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          session_id TEXT NOT NULL REFERENCES sessions(id), job_id TEXT, approval_id TEXT,
          kind TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT
        );
        CREATE INDEX notifications_by_session ON notifications(session_id);
        PRAGMA user_version = 32;
        COMMIT;
      `);
    }
    if (migration.user_version < 33) {
      db.exec(`
        BEGIN;
        ALTER TABLE work_checks ADD COLUMN label TEXT NOT NULL DEFAULT '';
        PRAGMA user_version = 33;
        COMMIT;
      `);
    }
    if (migration.user_version < 34) {
      db.exec(`
        BEGIN;
        CREATE TABLE model_connections (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL,
          base_url TEXT, model TEXT, enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );
        PRAGMA user_version = 34;
        COMMIT;
      `);
    }
    if (migration.user_version < 35) {
      db.exec(`
        BEGIN;
        CREATE TABLE audit_logs (
          id INTEGER PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          session_id TEXT, job_id TEXT, event TEXT NOT NULL, outcome TEXT NOT NULL,
          actor TEXT, subject TEXT, detail TEXT, recorded_at TEXT NOT NULL
        );
        CREATE INDEX audit_logs_by_project ON audit_logs(project_id, id);
        PRAGMA user_version = 35;
        COMMIT;
      `);
    }
    if (migration.user_version < 36) {
      // 'plan' 역할은 비서가 계획까지 맡는 구성으로 바뀌었다. 예전 기록의 역할 이름을
      // 새 역할로 옮겨 저장된 업무·크루·워크플로우를 그대로 열 수 있게 한다.
      const versions = db
        .prepare("SELECT workflow_id, version, graph FROM workflow_versions")
        .all() as { workflow_id: string; version: number; graph: string }[];
      const graphs: { id: string; version: number; graph: string }[] = [];
      for (const row of versions) {
        const graph = JSON.parse(row.graph) as {
          stages?: { roleId?: string }[];
        };
        const stages = graph.stages ?? [];
        if (!stages.some(({ roleId }) => roleId === "plan")) continue;
        for (const stage of stages)
          if (stage.roleId === "plan") stage.roleId = "assistant";
        graphs.push({
          id: row.workflow_id,
          version: row.version,
          graph: JSON.stringify(graph),
        });
      }
      db.exec("BEGIN;");
      try {
        db.exec(`
          DELETE FROM crew WHERE role = 'plan';
          UPDATE crew_members SET role = 'assistant' WHERE role = 'plan';
          UPDATE job_assignees SET role = 'assistant' WHERE role = 'plan';
          UPDATE model_runs SET role_id = 'assistant' WHERE role_id = 'plan';
        `);
        const update = db.prepare(
          "UPDATE workflow_versions SET graph = ? WHERE workflow_id = ? AND version = ?",
        );
        for (const { graph, id, version } of graphs)
          update.run(graph, id, version);
        db.exec("PRAGMA user_version = 36; COMMIT;");
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
    }
    db.exec(
      "UPDATE jobs SET state = 'stopped' WHERE state IN ('planning', 'queued', 'developing', 'reviewing', 'recovering', 'stopping');",
    );
    db.exec(
      "UPDATE messages SET state = 'stopped' WHERE state IN ('running', 'stopping', 'queued');",
    );
    db.exec(
      "UPDATE tool_approvals SET decision = 'deny', actor = COALESCE(actor, '앱 종료') WHERE decision IS NULL;",
    );
    db.exec(
      "UPDATE skill_uses SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE ended_at IS NULL;",
    );
}
