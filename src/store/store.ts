// The store the whole app talks to. The work is split by domain into the
// Store* modules below, each one a step deeper in the chain, so `CrewStore`
// carries exactly the same public methods as before.
//
//   StoreBase      SQLite handle, transaction/log/notify helpers, projects, sessions
//   StoreAudit     the audit log of approvals and changes to the user's resources
//   StoreCrew      crew members, skills, MCP, tool approvals, skill usage
//   StoreMembers   hiring, member settings, write permissions, assignment
//   StoreWorkflow  saved workflows and versions, model connections
//   StoreWorkspace view state, isolated git workspace, notifications, artifacts
//   StoreJobs      sessions, messages, jobs, follow-ups, revisions
//   StoreChanges   prepared changes, verification checkpoints, checks
//   StoreRun       work plans, agent context, retries, peer requests, job record
//   StoreMemory    memories, wiki, model runs
//   StoreSnapshot  the single snapshot the renderer and app MCP read

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { StoreSnapshot } from "./snapshot";
import { initStoreSchema } from "./migrations";

export { defaultViewState } from "./base";

export class CrewStore extends StoreSnapshot {
  constructor(path: string) {
    const db = new DatabaseSync(path);
    initStoreSchema(db);
    // 메모리 저장소는 둘 폴더가 없다. 그때만 임시 폴더를 가리키게 하고, 그림을 저장할 때 만든다.
    super(
      db,
      path === ":memory:"
        ? join(tmpdir(), "crew-attachments", randomUUID())
        : join(dirname(path), "attachments"),
    );
  }
}
