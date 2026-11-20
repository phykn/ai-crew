// Assembles the single snapshot the renderer and the app MCP read from.

import { campState } from "./camp";
import { skillStates } from "./skill-status";
import { defaultViewState } from "./store-base";
import {
  planTargets,
  type Activity,
  type ModelRun,
  type Project,
  type Session,
  type Snapshot,
  type WorkPlan,
} from "./actions";
import { StoreMemory } from "./store-memory";
export class StoreSnapshot extends StoreMemory {
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
            "SELECT id, project_id AS projectId, title, draft, workflow_id AS workflowId FROM sessions WHERE project_id = ? ORDER BY rowid DESC",
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
      view: session ? this.viewState(session.id) : defaultViewState(),
      messages: session ? this.getMessages(session.id) : [],
      modelRuns: session
        ? (this.db
            .prepare(`
            SELECT id, job_id AS jobId, role_id AS roleId, provider, model,
                   elapsed_ms AS elapsedMs, input_tokens AS inputTokens, output_tokens AS outputTokens,
                   cost_usd AS costUsd
            FROM model_runs WHERE session_id = ? ORDER BY id DESC
          `)
            .all(session.id) as ModelRun[])
        : [],
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
      mcpServers: current ? this.listMcpEndpoints(current.id) : [],
      mcpGrants: current ? this.listMcpGrants(current.id) : [],
      skills: current ? this.listSkills(current.id) : [],
      workflows: current ? this.listWorkflows(current.id) : [],
      artifacts: current ? this.listArtifacts(current.id) : [],
      modelConnections: this.listModelConnections(),
      camp: current
        ? campState({
            members: this.readMembers(current.id),
            jobs: session ? this.readJobs(session.id) : [],
            assignees: session
              ? (this.db
                  .prepare(
                    `SELECT a.job_id AS jobId, a.member_id AS memberId,
                     CASE WHEN instr(a.role, ':') > 0 THEN substr(a.role, 1, instr(a.role, ':') - 1) ELSE a.role END AS roleId
                     FROM job_assignees a JOIN jobs j ON j.id = a.job_id WHERE j.session_id = ?`,
                  )
                  .all(session.id) as Snapshot["assignees"])
              : [],
            selectedJobId: session ? this.viewState(session.id).logJobId : null,
            hour: new Date().getHours(),
          })
        : { members: [], highlightedJobId: null },
      notifications: session ? this.readNotifications(session.id) : [],
      toolApprovals: session ? this.readToolApprovals(session.id) : [],
      skillStates: current
        ? skillStates({
            members: this.readMembers(current.id),
            skills: this.listSkills(current.id),
            servers: this.listMcpEndpoints(current.id),
            grants: this.listMcpGrants(current.id),
            uses: this.activeSkillUses(current.id),
            approvals: this.pendingToolApprovals(current.id),
          })
        : [],
      memories: current ? this.listMemories(current.id) : [],
      wiki: current ? this.listWiki(current.id) : [],
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