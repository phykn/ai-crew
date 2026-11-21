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
import { StoreSnapshot } from "./store-snapshot";
import { initStoreSchema } from "./store-migrations";

export { defaultViewState } from "./store-base";

export class CrewStore extends StoreSnapshot {
  constructor(path: string) {
    const db = new DatabaseSync(path);
    initStoreSchema(db);
    super(db);
  }
}
