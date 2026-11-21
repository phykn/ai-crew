// Crew-side state: shadow members, skills, MCP endpoints and grants, tool approvals,
// and skill usage.

import { randomUUID } from "node:crypto";
import {
  roles,
  type ApprovalMode,
  type CrewMember,
  type CrewSkill,
  type Job,
  type McpEndpoint,
  type McpGrant,
  type Provider,
  type RoleId,
  type ToolApproval,
} from "../shared/actions";
import { StoreStyle } from "./store-style";
import { seedDefaultSkills } from "./skills";
export class StoreCrew extends StoreStyle {
  protected seedProject(projectId: string) {
    seedDefaultSkills(this.db, projectId);
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

  listMcpEndpoints(projectId: string): McpEndpoint[] {
    return this.db
      .prepare(
        "SELECT id, name, url, enabled, tools FROM mcp_endpoints WHERE project_id = ? ORDER BY rowid",
      )
      .all(projectId)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        url: String(item.url),
        enabled: Boolean(item.enabled),
        tools: JSON.parse(String(item.tools)) as McpEndpoint["tools"],
      }));
  }

  listSkills(projectId: string): CrewSkill[] {
    return this.db
      .prepare(
        "SELECT id, member_id AS memberId, name, markdown FROM crew_skills WHERE project_id = ? ORDER BY rowid",
      )
      .all(projectId) as CrewSkill[];
  }

  addSkill(projectId: string, skill: CrewSkill) {
    if (!this.readMembers(projectId).some(({ id }) => id === skill.memberId))
      throw new Error("이 프로젝트의 담당자를 선택해 주세요.");
    const added = this.db
      .prepare("INSERT OR IGNORE INTO crew_skills VALUES (?, ?, ?, ?, ?)")
      .run(skill.id, projectId, skill.memberId, skill.name, skill.markdown);
    if (added.changes)
      this.logMcpSetting(
        projectId,
        skill.memberId + " · 스킬 추가 · " + skill.name,
      );
  }

  removeSkill(projectId: string, memberId: string, skillId: string) {
    const removed = this.db
      .prepare(
        "DELETE FROM crew_skills WHERE id = ? AND project_id = ? AND member_id = ? RETURNING name",
      )
      .get(skillId, projectId, memberId);
    if (removed)
      this.logMcpSetting(
        projectId,
        memberId + " · 스킬 해제 · " + removed.name,
      );
  }

  listMcpGrants(projectId: string): McpGrant[] {
    return this.db
      .prepare(
        `
      SELECT g.member_id AS memberId, g.server_id AS serverId, g.tool_name AS toolName, g.fingerprint
      FROM mcp_grants g JOIN mcp_endpoints s ON s.id = g.server_id WHERE s.project_id = ?
    `,
      )
      .all(projectId) as McpGrant[];
  }

  saveMcpEndpoint(projectId: string, endpoint: McpEndpoint) {
    this.getProject(projectId);
    const existing = this.db
      .prepare("SELECT project_id, url FROM mcp_endpoints WHERE id = ?")
      .get(endpoint.id);
    if (
      existing &&
      (existing.project_id !== projectId || existing.url !== endpoint.url)
    )
      throw new Error("주소가 바뀐 서버는 별도 연결로 추가해 주세요.");
    this.db
      .prepare(
        `INSERT INTO mcp_endpoints VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, enabled = 1, tools = excluded.tools`,
      )
      .run(
        endpoint.id,
        projectId,
        endpoint.name,
        endpoint.url,
        JSON.stringify(endpoint.tools),
      );
    this.logMcpSetting(projectId, "MCP 연결 · " + endpoint.name);
  }

  disconnectMcpEndpoint(projectId: string, serverId: string) {
    const row = this.db
      .prepare(
        "UPDATE mcp_endpoints SET enabled = 0 WHERE id = ? AND project_id = ? AND enabled = 1 RETURNING name",
      )
      .get(serverId, projectId);
    if (row) this.logMcpSetting(projectId, "MCP 연결 해제 · " + row.name);
  }

  setMcpGrant(
    projectId: string,
    serverId: string,
    memberId: string,
    toolName: string,
    allow: boolean,
  ) {
    const server = this.listMcpEndpoints(projectId).find(
      ({ id }) => id === serverId,
    );
    const member = this.readMembers(projectId).find(
      ({ id }) => id === memberId,
    );
    if (!server || !member)
      throw new Error("이 프로젝트의 서버와 담당자를 선택해 주세요.");
    const tool = server.tools.find(({ name }) => name === toolName);
    if (allow && (!server.enabled || !tool || !member.hired))
      throw new Error("연결된 서버의 도구를 고용된 담당자에게 허용할 수 있어요.");
    this.transaction(() => {
      const result = allow
        ? this.db
            .prepare(
              `INSERT INTO mcp_grants VALUES (?, ?, ?, ?)
            ON CONFLICT(server_id, member_id, tool_name) DO UPDATE SET fingerprint = excluded.fingerprint
            WHERE fingerprint <> excluded.fingerprint`,
            )
            .run(serverId, memberId, toolName, tool!.fingerprint)
        : this.db
            .prepare(
              "DELETE FROM mcp_grants WHERE server_id = ? AND member_id = ? AND tool_name = ?",
            )
            .run(serverId, memberId, toolName);
      if (result.changes)
        this.logMcpSetting(
          projectId,
          member.name +
            " · " +
            server.name +
            "/" +
            toolName +
            " " +
            (allow ? "허용" : "회수"),
        );
    });
  }

  requestToolApproval(
    job: Job,
    member: CrewMember,
    server: McpEndpoint,
    toolName: string,
    scope: string,
    mode: ApprovalMode,
  ) {
    const approval: ToolApproval = {
      id: randomUUID(),
      jobId: job.id,
      projectId: job.projectId,
      serverId: server.id,
      serverName: server.name,
      memberId: member.id,
      memberName: member.name,
      toolName,
      scope,
      mode,
      actor: null,
      decision: null,
      requestedAt: new Date().toISOString(),
    };
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO tool_approvals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)",
        )
        .run(
          approval.id,
          approval.jobId,
          approval.projectId,
          approval.serverId,
          approval.serverName,
          approval.memberId,
          approval.memberName,
          approval.toolName,
          approval.scope,
          approval.mode,
          approval.requestedAt,
        );
      this.log(
        job.sessionId,
        member.name +
          " → 사용자 · MCP 변경 도구 승인 요청 · " +
          server.name +
          "/" +
          toolName +
          " · " +
          scope,
        job.id,
      );
      this.recordAudit({
        projectId: job.projectId,
        sessionId: job.sessionId,
        jobId: job.id,
        event: "tool.approval",
        outcome: "requested",
        actor: member.name,
        subject: server.name + "/" + toolName,
        detail: scope,
      });
    });
    return approval;
  }

  answerToolApproval(
    jobId: string,
    requestId: string,
    actor: string,
    decision: "allow" | "deny",
  ) {
    const row = this.db
      .prepare(
        "SELECT job_id AS jobId FROM tool_approvals WHERE id = ? AND decision IS NULL",
      )
      .get(requestId) as { jobId: string } | undefined;
    if (!row || row.jobId !== jobId) return undefined;
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE tool_approvals SET actor = ?, decision = ? WHERE id = ? AND decision IS NULL",
        )
        .run(actor, decision, requestId);
      const approval = this.readToolApproval(requestId)!;
      const job = this.getJob(jobId);
      this.log(
        job.sessionId,
        actor +
          " · MCP 변경 도구 " +
          (decision === "allow" ? "허용" : "거절") +
          " · " +
          approval.serverName +
          "/" +
          approval.toolName,
        jobId,
      );
      this.recordAudit({
        projectId: job.projectId,
        sessionId: job.sessionId,
        jobId,
        event: "tool.approval",
        outcome: decision === "allow" ? "allowed" : "denied",
        actor,
        subject: approval.serverName + "/" + approval.toolName,
        detail: approval.scope,
      });
    });
    return this.readToolApproval(requestId);
  }

  readToolApproval(id: string) {
    return this.db
      .prepare(
        `SELECT id, job_id AS jobId, project_id AS projectId, server_id AS serverId,
         server_name AS serverName, member_id AS memberId, member_name AS memberName,
         tool_name AS toolName, scope, mode, actor, decision, requested_at AS requestedAt
         FROM tool_approvals WHERE id = ?`,
      )
      .get(id) as ToolApproval | undefined;
  }

  pendingToolApprovals(projectId: string) {
    return this.db
      .prepare(
        `SELECT id, job_id AS jobId, project_id AS projectId, server_id AS serverId,
         server_name AS serverName, member_id AS memberId, member_name AS memberName,
         tool_name AS toolName, scope, mode, actor, decision, requested_at AS requestedAt
         FROM tool_approvals WHERE project_id = ? AND decision IS NULL`,
      )
      .all(projectId) as ToolApproval[];
  }

  readToolApprovals(sessionId: string) {
    return this.db
      .prepare(
        `SELECT a.id, a.job_id AS jobId, a.project_id AS projectId, a.server_id AS serverId,
         a.server_name AS serverName, a.member_id AS memberId, a.member_name AS memberName,
         a.tool_name AS toolName, a.scope, a.mode, a.actor, a.decision, a.requested_at AS requestedAt
         FROM tool_approvals a JOIN jobs j ON j.id = a.job_id
         WHERE j.session_id = ? ORDER BY a.rowid DESC LIMIT 40`,
      )
      .all(sessionId) as ToolApproval[];
  }

  startSkillUse(job: Job, memberId: string, skillIds: string[]) {
    if (!skillIds.length) return;
    const startedAt = new Date().toISOString();
    this.transaction(() => {
      const insert = this.db.prepare(
        "INSERT INTO skill_uses VALUES (?, ?, ?, ?, ?, NULL)",
      );
      for (const skillId of skillIds)
        insert.run(randomUUID(), skillId, memberId, job.id, startedAt);
    });
  }

  endSkillUse(jobId: string, memberId: string) {
    this.db
      .prepare(
        "UPDATE skill_uses SET ended_at = ? WHERE job_id = ? AND member_id = ? AND ended_at IS NULL",
      )
      .run(new Date().toISOString(), jobId, memberId);
  }

  activeSkillUses(projectId: string) {
    return this.db
      .prepare(
        `SELECT u.skill_id AS skillId, u.member_id AS memberId, u.job_id AS jobId,
         u.started_at AS startedAt
         FROM skill_uses u JOIN jobs j ON j.id = u.job_id
         WHERE j.project_id = ? AND u.ended_at IS NULL
           AND j.state IN ('planning', 'queued', 'developing', 'reviewing', 'recovering', 'stopping')`,
      )
      .all(projectId) as {
      skillId: string;
      memberId: string;
      jobId: string;
      startedAt: string;
    }[];
  }

  protected logMcpSetting(projectId: string, note: string) {
    const session = this.db
      .prepare("SELECT last_session FROM projects WHERE id = ?")
      .get(projectId)?.last_session;
    if (typeof session === "string") this.log(session, "사용자 · " + note);
  }
}
