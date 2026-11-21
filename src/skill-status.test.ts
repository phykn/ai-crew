import { expect, test } from "vitest";
import type { CrewMember, CrewSkill, McpEndpoint, McpGrant } from "./actions";
import { codexMcpConfig } from "./codex-mcp";
import { requiredTools, skillStates } from "./skill-status";

const skills: CrewSkill[] = [
  {
    id: "skill-write",
    memberId: "member-dev",
    name: "코드 작성",
    markdown: "기능을 고칩니다. `fixture/write_fixture` 도구로 초안을 저장합니다.",
  },
  {
    id: "skill-read",
    memberId: "member-dev",
    name: "프로젝트 위키",
    markdown: "위키를 읽습니다.",
  },
  {
    id: "skill-gone",
    memberId: "member-gone",
    name: "테스트 실행",
    markdown: "테스트를 돌립니다.",
  },
];
const member = (over: Partial<CrewMember>): CrewMember => ({
  id: "member-dev",
  roleId: "development",
  name: "태오",
  provider: "local",
  hired: true,
  ...over,
});
const server: McpEndpoint = {
  id: "server-1",
  name: "fixture",
  url: "http://127.0.0.1:1/mcp",
  enabled: true,
  tools: [
    {
      name: "write_fixture",
      description: "Write",
      readOnly: false,
      fingerprint: "fp-write",
      inputSchema: { type: "object" },
    },
    {
      name: "read_fixture",
      description: "Read",
      readOnly: true,
      fingerprint: "fp-read",
      inputSchema: { type: "object" },
    },
  ],
};
const grant: McpGrant = {
  memberId: "member-dev",
  serverId: "server-1",
  toolName: "write_fixture",
  fingerprint: "fp-write",
};

test("skill state reads its own tool requirement and keeps the decided order", () => {
  expect(requiredTools(skills[0].markdown)).toEqual(["fixture/write_fixture"]);
  const base = {
    members: [member({}), member({ id: "member-gone", hired: false })],
    skills,
    servers: [server],
    grants: [grant],
    uses: [],
    approvals: [],
  };
  expect(
    skillStates(base).map(({ skillId, state }) => [skillId, state]),
  ).toEqual([
    ["skill-write", "ready"],
    ["skill-read", "ready"],
    ["skill-gone", "unavailable"],
  ]);
  expect(skillStates(base)[2].reason).toBe("미고용");
});

test("a required tool without a grant, a connection or a Codex path is unavailable", () => {
  const base = {
    members: [member({}), member({ id: "member-gone", hired: false })],
    skills,
    servers: [server],
    grants: [],
    uses: [],
    approvals: [],
  };
  expect(skillStates(base)[0]).toMatchObject({
    state: "unavailable",
    tool: "fixture/write_fixture",
    reason: "필수 도구 권한 없음 · fixture/write_fixture",
  });
  expect(
    skillStates({
      ...base,
      servers: [{ ...server, enabled: false }],
      grants: [grant],
    })[0].reason,
  ).toBe("MCP 연결 끊김 · fixture");
  expect(
    skillStates({ ...base, servers: [], grants: [grant] })[0].reason,
  ).toBe("MCP 연결 없음 · fixture");
  expect(
    skillStates({ ...base, grants: [{ ...grant, fingerprint: "old" }] })[0]
      .reason,
  ).toBe("필수 도구 권한 없음 · fixture/write_fixture");
  expect(
    skillStates({
      ...base,
      members: [member({ provider: "codex" })],
      grants: [grant],
    })[0],
  ).toMatchObject({ state: "unavailable" });
});

test("a running skill outranks a pending approval and both outrank an unavailable one", () => {
  const approval = {
    id: "approval-1",
    jobId: "job-1",
    projectId: "project-1",
    serverId: "server-1",
    serverName: "fixture",
    memberId: "member-dev",
    memberName: "태오",
    toolName: "write_fixture",
    scope: "{}",
    mode: "manual" as const,
    actor: null,
    decision: null,
    requestedAt: "2026-11-20T00:00:00.000Z",
  };
  const states = skillStates({
    members: [member({})],
    skills,
    servers: [server],
    grants: [grant],
    uses: [
      {
        skillId: "skill-read",
        memberId: "member-dev",
        jobId: "job-2",
        startedAt: "2026-11-20T00:00:00.000Z",
      },
    ],
    approvals: [approval],
  });
  expect(states.find(({ skillId }) => skillId === "skill-write")).toMatchObject({
    state: "awaiting",
    approvalId: "approval-1",
    jobId: "job-1",
    tool: "fixture/write_fixture",
  });
  expect(states.find(({ skillId }) => skillId === "skill-read")).toMatchObject({
    state: "in-use",
    jobId: "job-2",
  });
});

test("Codex receives only the read-only tools this member may use", () => {
  const readGrant: McpGrant = {
    memberId: "member-dev",
    serverId: "server-1",
    toolName: "read_fixture",
    fingerprint: "fp-read",
  };
  expect(
    codexMcpConfig([server], [grant, readGrant], member({ provider: "codex" })),
  ).toEqual({
    mcp_servers: {
      fixture: {
        url: "http://127.0.0.1:1/mcp",
        enabled_tools: ["read_fixture"],
      },
    },
  });
  expect(codexMcpConfig([server], [grant], member({}))).toBeUndefined();
  expect(
    codexMcpConfig([server], [readGrant], member({ hired: false })),
  ).toBeUndefined();
  expect(
    codexMcpConfig([{ ...server, enabled: false }], [readGrant], member({})),
  ).toBeUndefined();
  expect(
    codexMcpConfig(
      [
        server,
        { ...server, id: "server-2", name: "Fixture!" },
        { ...server, id: "server-3", name: "fixture-2" },
      ],
      [
        readGrant,
        { ...readGrant, serverId: "server-2" },
        { ...readGrant, serverId: "server-3" },
      ],
      member({}),
    ),
  ).toMatchObject({
    mcp_servers: {
      fixture: { enabled_tools: ["read_fixture"] },
      "fixture-2": { enabled_tools: ["read_fixture"] },
    },
  });
});
