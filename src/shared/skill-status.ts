import type {
  CrewMember,
  CrewSkill,
  McpEndpoint,
  McpGrant,
  SkillState,
  SkillStatus,
  ToolApproval,
} from "./actions";

export const skillStateLabels = {
  ready: "준비",
  "in-use": "사용 중",
  awaiting: "승인 대기",
  unavailable: "사용 불가",
} as const satisfies Record<SkillState, string>;

const priority: Record<SkillState, number> = {
  "in-use": 0,
  awaiting: 1,
  unavailable: 2,
  ready: 3,
};

export function skillStateOrder(state: SkillState) {
  return priority[state];
}

/** Required MCP tools are written in a skill as a backticked `server/tool` name. */
export function requiredTools(markdown: string) {
  return [
    ...new Set(
      [...markdown.matchAll(/`([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)`/g)].map(
        ([, server, tool]) => server + "/" + tool,
      ),
    ),
  ];
}

type SkillUse = {
  skillId: string;
  memberId: string;
  jobId: string;
  startedAt: string;
};

export function skillStates({
  members,
  skills,
  servers,
  grants,
  uses,
  approvals,
}: {
  members: CrewMember[];
  skills: CrewSkill[];
  servers: McpEndpoint[];
  grants: McpGrant[];
  uses: SkillUse[];
  approvals: ToolApproval[];
}): SkillStatus[] {
  return skills.map((skill) => {
    const member = members.find(({ id }) => id === skill.memberId);
    const use = uses.find(({ skillId }) => skillId === skill.id);
    if (use)
      return {
        skillId: skill.id,
        memberId: skill.memberId,
        state: "in-use",
        jobId: use.jobId,
        approvalId: null,
        tool: null,
        reason: null,
      };
    if (!member || !member.hired)
      return {
        skillId: skill.id,
        memberId: skill.memberId,
        state: "unavailable",
        jobId: null,
        approvalId: null,
        tool: null,
        reason: "미고용",
      };
    const tools = requiredTools(skill.markdown);
    const approval = approvals.find(
      ({ memberId, decision, serverName, toolName }) =>
        memberId === skill.memberId &&
        decision === null &&
        (!tools.length || tools.includes(serverName + "/" + toolName)),
    );
    if (approval)
      return {
        skillId: skill.id,
        memberId: skill.memberId,
        state: "awaiting",
        jobId: approval.jobId,
        approvalId: approval.id,
        tool: approval.serverName + "/" + approval.toolName,
        reason: null,
      };
    for (const name of tools) {
      const [serverName, toolName] = name.split("/");
      const server = servers.find(({ name: label }) => label === serverName);
      if (!server)
        return {
          skillId: skill.id,
          memberId: skill.memberId,
          state: "unavailable",
          jobId: null,
          approvalId: null,
          tool: name,
          reason: "MCP 연결 없음 · " + serverName,
        };
      if (!server.enabled)
        return {
          skillId: skill.id,
          memberId: skill.memberId,
          state: "unavailable",
          jobId: null,
          approvalId: null,
          tool: name,
          reason: "MCP 연결 끊김 · " + serverName,
        };
      const tool = server.tools.find(({ name: label }) => label === toolName);
      if (!tool)
        return {
          skillId: skill.id,
          memberId: skill.memberId,
          state: "unavailable",
          jobId: null,
          approvalId: null,
          tool: name,
          reason: "서버에 도구 없음 · " + name,
        };
      if (member.provider === "codex" && !tool.readOnly)
        return {
          skillId: skill.id,
          memberId: skill.memberId,
          state: "unavailable",
          jobId: null,
          approvalId: null,
          tool: name,
          reason: "변경 도구는 앱 승인 실행에서만 써요",
        };
      const granted = grants.some(
        (grant) =>
          grant.memberId === skill.memberId &&
          grant.serverId === server.id &&
          grant.toolName === toolName &&
          grant.fingerprint === tool.fingerprint,
      );
      if (!granted)
        return {
          skillId: skill.id,
          memberId: skill.memberId,
          state: "unavailable",
          jobId: null,
          approvalId: null,
          tool: name,
          reason: "필수 도구 권한 없음 · " + name,
        };
    }
    return {
      skillId: skill.id,
      memberId: skill.memberId,
      state: "ready",
      jobId: null,
      approvalId: null,
      tool: tools[0] ?? null,
      reason: null,
    };
  });
}
