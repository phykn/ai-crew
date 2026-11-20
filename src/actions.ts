import { z } from "zod";
import type { DiagnosticsReport } from "./diagnostics";

export const roles = [
  {
    id: "assistant",
    title: "비서",
    name: "여울",
    color: "#efc58d",
    sprite: 0,
    x: 33,
    y: 68,
  },
  {
    id: "plan",
    title: "플랜",
    name: "가람",
    color: "#bce0da",
    sprite: 2,
    x: 47,
    y: 57,
  },
  {
    id: "development",
    title: "개발",
    name: "모루",
    color: "#b4d59d",
    sprite: 1,
    x: 74,
    y: 74,
  },
  {
    id: "review",
    title: "리뷰",
    name: "새벽",
    color: "#ddaed8",
    sprite: 3,
    x: 26,
    y: 84,
  },
  {
    id: "style",
    title: "스타일",
    name: "단풍",
    color: "#f6aa8a",
    sprite: 0,
    x: 87,
    y: 88,
  },
  {
    id: "test",
    title: "테스트",
    name: "솔잎",
    color: "#a9c7f0",
    sprite: 2,
    x: 78,
    y: 61,
  },
] as const;

const identifier = z.uuid();
const roleId = z.enum(roles.map(({ id }) => id));
const provider = z.enum(["local", "codex"]);
const approvalMode = z.enum(["manual", "auto", "always"]);
export const approvalLabels = {
  manual: "수동",
  auto: "자동",
  always: "항상",
} as const;

export const actions = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("app.state") }),
  z.strictObject({ type: z.literal("project.pick") }),
  z.strictObject({ type: z.literal("project.open"), projectId: identifier }),
  z.strictObject({
    type: z.literal("project.approval"),
    projectId: identifier,
    mode: approvalMode,
  }),
  z.strictObject({ type: z.literal("session.new"), projectId: identifier }),
  z.strictObject({ type: z.literal("session.open"), sessionId: identifier }),
  z.strictObject({
    type: z.literal("session.draft"),
    sessionId: identifier,
    draft: z.string().max(32000),
  }),
  z.strictObject({
    type: z.literal("crew.member.add"),
    projectId: identifier,
    memberId: identifier,
    roleId: roleId.exclude(["assistant"]),
    name: z.string().trim().min(1).max(32),
    provider,
  }),
  z.strictObject({
    type: z.literal("crew.member.update"),
    projectId: identifier,
    memberId: z.union([roleId, identifier]),
    name: z.string().trim().min(1).max(32).optional(),
    provider: provider.optional(),
    hired: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("crew.workspace.write"),
    projectId: identifier,
    memberId: z.union([roleId, identifier]),
    allow: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("mcp.connect"),
    projectId: identifier,
    serverId: identifier,
    name: z.string().trim().min(1).max(64),
    url: z.url().max(2048),
  }),
  z.strictObject({
    type: z.literal("mcp.disconnect"),
    projectId: identifier,
    serverId: identifier,
  }),
  z.strictObject({
    type: z.literal("mcp.grant"),
    projectId: identifier,
    serverId: identifier,
    memberId: z.union([roleId, identifier]),
    toolName: z.string().min(1).max(200),
    allow: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("crew.skill.add"),
    projectId: identifier,
    memberId: z.union([roleId, identifier]),
    skillId: identifier,
    name: z.string().trim().min(1).max(64),
    markdown: z.string().trim().min(1).max(16000),
  }),
  z.strictObject({
    type: z.literal("crew.skill.remove"),
    projectId: identifier,
    memberId: z.union([roleId, identifier]),
    skillId: identifier,
  }),
  z.strictObject({
    type: z.literal("mcp.answer"),
    jobId: identifier,
    requestId: identifier,
    allow: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("workflow.save"),
    projectId: identifier,
    workflowId: identifier,
    version: z.int().nonnegative(),
    name: z.string().trim().min(1).max(64),
    graph: z.strictObject({
      stages: z
        .array(
          z.strictObject({
            id: z.string().min(1).max(48),
            title: z.string().trim().min(1).max(64),
            roleId: roleId,
            criterion: z.string().trim().min(1).max(300),
            artifact: z.string().trim().max(300),
            condition: z.string().trim().max(300),
            required: z.boolean(),
            x: z.number().finite(),
            y: z.number().finite(),
          }),
        )
        .max(24),
      edges: z
        .array(z.strictObject({ from: z.string().min(1).max(48), to: z.string().min(1).max(48) }))
        .max(64),
    }),
  }),
  z.strictObject({
    type: z.literal("workflow.select"),
    sessionId: identifier,
    workflowId: identifier.nullable(),
  }),
  z.strictObject({
    type: z.literal("workflow.apply"),
    jobId: identifier,
    scope: z.enum(["current", "once"]),
  }),
  z.strictObject({
    type: z.literal("job.workspace"),
    jobId: identifier,
  }),
  z.strictObject({ type: z.literal("job.apply"), jobId: identifier }),
  z.strictObject({ type: z.literal("job.cleanup"), jobId: identifier }),
  z.strictObject({
    type: z.literal("notification.read"),
    sessionId: identifier,
    notificationId: z.string().min(1).max(200),
  }),
  z.strictObject({
    type: z.literal("model.add"),
    id: identifier,
    name: z.string().trim().min(1).max(64),
    provider: z.enum(["local", "codex"]),
    baseUrl: z.url().max(2048).nullable(),
    model: z.string().trim().max(120).nullable(),
    enabled: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("model.update"),
    id: identifier,
    name: z.string().trim().min(1).max(64).optional(),
    baseUrl: z.url().max(2048).nullable().optional(),
    model: z.string().trim().max(120).nullable().optional(),
    enabled: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal("model.remove"), id: identifier }),
  z.strictObject({
    type: z.literal("diagnostics.run"),
    projectId: identifier,
  }),
  z.strictObject({ type: z.literal("app.quit") }),
  z.strictObject({
    type: z.literal("view.set"),
    sessionId: identifier,
    patch: z.strictObject({
      tab: z.enum(["chat", "log", "memory", "workflow"]).optional(),
      camp: z.boolean().optional(),
      legend: z.boolean().optional(),
      panelWidth: z.int().min(280).max(720).optional(),
      logJobId: identifier.nullable().optional(),
      memorySection: z.enum(["memory", "wiki"]).optional(),
      memoryOwnerId: identifier.nullable().optional(),
    }),
  }),
  z.strictObject({
    type: z.literal("memory.add"),
    sessionId: identifier,
    ownerId: z.union([roleId, identifier]).nullable(),
    body: z.string().trim().min(1).max(4000),
  }),
  z.strictObject({
    type: z.literal("memory.remove"),
    projectId: identifier,
    memoryId: identifier,
  }),
  z.strictObject({
    type: z.literal("wiki.save"),
    sessionId: identifier,
    pageId: identifier,
    version: z.int().nonnegative(),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(24000),
    links: z.array(identifier).max(64),
  }),
  z.strictObject({
    type: z.literal("wiki.remove"),
    projectId: identifier,
    pageId: identifier,
    version: z.int().positive(),
  }),
  z.strictObject({
    type: z.literal("chat.send"),
    sessionId: identifier,
    requestId: identifier,
    text: z.string().trim().min(1).max(32000),
  }),
  z.strictObject({
    type: z.literal("chat.stop"),
    sessionId: identifier,
    responseId: identifier,
  }),
  z.strictObject({
    type: z.literal("job.answer"),
    jobId: identifier,
    requestId: identifier,
    allow: z.boolean(),
  }),
  z.strictObject({ type: z.literal("job.stop"), jobId: identifier }),
  z.strictObject({ type: z.literal("job.resume"), jobId: identifier }),
  z.strictObject({
    type: z.literal("job.followup.select"),
    sessionId: identifier,
    requestId: identifier,
    jobId: identifier.nullable(),
  }),
  z.strictObject({
    type: z.literal("job.revise"),
    jobId: identifier,
    sessionId: identifier,
    requestId: identifier,
    questionId: identifier.optional(),
    text: z.string().trim().min(1).max(32000),
  }),
]);

export type Action = z.infer<typeof actions>;
export type Provider = z.infer<typeof provider>;
export type RoleId = z.infer<typeof roleId>;
export type CrewMember = {
  id: string;
  roleId: RoleId;
  name: string;
  provider: Provider;
  hired: boolean;
  assignmentJobId?: string;
  specialty?: string;
  writeAllowed?: boolean;
};
export type McpTool = {
  name: string;
  description: string;
  readOnly: boolean;
  fingerprint: string;
  inputSchema: object;
};
export type McpEndpoint = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  tools: McpTool[];
};
export type McpGrant = {
  memberId: string;
  serverId: string;
  toolName: string;
  fingerprint: string;
};
export type CrewSkill = {
  id: string;
  memberId: string;
  name: string;
  markdown: string;
};
export type SkillState = "ready" | "in-use" | "awaiting" | "unavailable";
export type SkillStatus = {
  skillId: string;
  memberId: string;
  state: SkillState;
  jobId: string | null;
  approvalId: string | null;
  tool: string | null;
  reason: string | null;
};
export type ToolApproval = {
  id: string;
  jobId: string;
  projectId: string;
  serverId: string;
  serverName: string;
  memberId: string;
  memberName: string;
  toolName: string;
  scope: string;
  mode: ApprovalMode;
  actor: string | null;
  decision: "allow" | "deny" | null;
  requestedAt: string;
};
export type ApprovalMode = z.infer<typeof approvalMode>;
export type Project = {
  id: string;
  root: string;
  name: string;
  approvalMode: ApprovalMode;
};
export type Session = {
  id: string;
  projectId: string;
  title: string;
  draft: string;
  workflowId: string | null;
};
export type Completion =
  | "queued"
  | "running"
  | "stopping"
  | "complete"
  | "stopped"
  | "failed";
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  state: Completion;
  error: string | null;
  jobId: string | null;
};
export type Activity = {
  id: number;
  text: string;
  jobId: string | null;
  recordedAt: string | null;
};
export type JobState =
  | "recovering"
  | "clarification"
  | "planning"
  | "approval"
  | "queued"
  | "developing"
  | "reviewing"
  | "stopping"
  | "stopped"
  | "denied"
  | "complete"
  | "failed";
export type WorkPlan = {
  path: string;
  goal: string;
  criterion: string;
  baseline: string | null;
  files?: { path: string; baseline: string | null }[];
  directories?: string[];
  moves?: { from: string; to: string; baseline: string; edit: boolean }[];
  specialist?: { specialty: string; permanent: boolean };
};
export function planFiles(plan: WorkPlan) {
  return plan.files ?? [{ path: plan.path, baseline: plan.baseline }];
}
export function planTargets(plan: WorkPlan) {
  const files = planFiles(plan);
  return files
    .map(({ path }) => {
      const move = plan.moves?.find(({ to }) => to === path);
      return move ? move.from + " → " + path : path;
    })
    .join(", ");
}
export type ReviewFinding = {
  startLine: number;
  endLine: number;
  note: string;
  excerpt: string;
};
export type WorkCheck = {
  role: string;
  label: string;
  passed: boolean;
  unavailable: boolean;
  note: string;
  command: string | null;
  checkedAt: string;
  batchId: string;
  findings: ReviewFinding[];
};
export type WorkChange = {
  id: string;
  jobId: string;
  planId: string | null;
  path: string;
  movedFrom: string | null;
  authorMemberId: string | null;
  beforeHash: string | null;
  afterHash: string;
  savedAt: string;
  checks: WorkCheck[];
  previousChecks: WorkCheck[][];
};
export type Job = {
  id: string;
  projectId: string;
  sessionId: string;
  request: string;
  state: JobState;
  approvalId: string | null;
  clarification: { id: string; text: string } | null;
  plan: WorkPlan | null;
  workflowId: string | null;
  workflowVersion: number | null;
  worktree: string | null;
  branch: string | null;
  baseCommit: string | null;
  applyState: "none" | "applied" | "blocked";
  applyNote: string | null;
};
export type AppNotification = {
  id: string;
  sessionId: string;
  jobId: string | null;
  approvalId: string | null;
  kind: "approval" | "question" | "report" | "stopped";
  text: string;
  createdAt: string;
  readAt: string | null;
};
export type Artifact = {
  id: string;
  jobId: string;
  authorId: string | null;
  changeId: string;
  name: string;
  kind: "file";
  path: string;
  hash: string;
  createdAt: string;
};
export type CampMemberState = {
  id: string;
  roleId: RoleId;
  name: string;
  color: string;
  hired: boolean;
  jobId: string | null;
  jobTitle: string | null;
  status: string;
  working: boolean;
  highlighted: boolean;
  line: string | null;
};
export type ModelConnection = {
  id: string;
  name: string;
  provider: "local" | "codex";
  baseUrl: string | null;
  model: string | null;
  enabled: boolean;
};
export type ViewState = {
  tab: "chat" | "log" | "memory" | "workflow";
  camp: boolean;
  legend: boolean;
  panelWidth: number;
  logJobId: string | null;
  memorySection: "memory" | "wiki";
  memoryOwnerId: string | null;
};
export type WorkflowStage = {
  id: string;
  title: string;
  roleId: RoleId;
  criterion: string;
  artifact: string;
  condition: string;
  required: boolean;
  x: number;
  y: number;
};
export type WorkflowGraph = {
  stages: WorkflowStage[];
  edges: { from: string; to: string }[];
};
export type Workflow = {
  id: string;
  name: string;
  version: number;
  graph: WorkflowGraph;
  author: string;
  savedAt: string;
};
export type Snapshot = {
  projects: Project[];
  current: Project | null;
  sessions: Session[];
  session: Session | null;
  view: ViewState;
  members: CrewMember[];
  mcpServers: McpEndpoint[];
  mcpGrants: McpGrant[];
  skills: CrewSkill[];
  skillStates: SkillStatus[];
  toolApprovals: ToolApproval[];
  workflows: Workflow[];
  artifacts: Artifact[];
  notifications: AppNotification[];
  camp: { members: CampMemberState[]; highlightedJobId: string | null };
  modelConnections: ModelConnection[];
  memories: CrewMemory[];
  wiki: WikiPage[];
  assignees: { jobId: string; memberId: string; roleId: RoleId }[];
  messages: Message[];
  activity: Activity[];
  modelRuns: ModelRun[];
  jobs: Job[];
  fileApprovals: {
    id: string;
    jobId: string;
    mode: ApprovalMode;
    actor: string | null;
    decision: "allow" | "deny" | null;
    scope: string;
  }[];
  followups: { id: string; text: string; candidateIds: string[] }[];
  changes: WorkChange[];
};
export type CrewMemory = {
  id: string;
  ownerId: string | null;
  authorId: string | null;
  authorName: string;
  sourceSessionId: string;
  sourceJobId: string | null;
  body: string;
  createdAt: string;
};
export type WikiPage = {
  id: string;
  title: string;
  body: string;
  version: number;
  links: string[];
  revisions: WikiRevision[];
};
export type WikiRevision = {
  version: number;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  sourceSessionId: string;
  sourceJobId: string | null;
};
export type ModelDetails = {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};
export type ModelRun = {
  id: number;
  jobId: string | null;
  roleId: RoleId;
  provider: Provider;
  model: string | null;
  elapsedMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
};
export type ChatEvent = {
  sessionId: string;
  responseId: string;
  delta: string;
};
// 화면에서 실행한 동작의 결과. 환경 진단만 점검 결과를 함께 돌려준다.
export type RunResult = Snapshot & { diagnostics?: DiagnosticsReport };
export type CrewApi = {
  run: (action: Action) => Promise<RunResult>;
  subscribe: (receive: (event: ChatEvent | null) => void) => () => void;
};

declare global {
  interface Window {
    crew: CrewApi;
  }
}
