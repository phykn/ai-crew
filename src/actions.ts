import { z } from "zod";
import type { DiagnosticsReport } from "./diagnostics";

// 비서 하나가 사용자와 대화하고, 나머지 여덟 역할은 비서 뒤에서 일한다.
// 기본 역할은 지워지지 않는 고정 크루가 아니라 처음 받는 로스터다(해고·재고용 가능).
// `skills`는 역할이 가진 스킬, `trigger`는 그 역할이 언제 도는지, `prompt`는 역할 지침이다.
export const roles = [
  {
    id: "assistant",
    title: "비서",
    name: "하나",
    color: "#efc58d",
    sprite: 0,
    x: 30,
    y: 76,
    skills: ["chat", "app-control", "delegation"],
    trigger: "사용자가 보내는 모든 메시지",
    prompt:
      "사용자와 대화하는 유일한 창구입니다. 요청을 듣고 일을 쪼개 다른 역할에 지시하고, 돌아온 보고를 모아 사용자 말로 전합니다. 앱 자체를 다루는 도구는 비서가 직접 실행합니다. 다른 역할은 사용자와 직접 대화하지 않으므로 그들의 질문과 결과도 비서가 옮겨 전합니다.",
  },
  {
    id: "hr",
    title: "인사",
    name: "지민",
    color: "#f0d38a",
    sprite: 5,
    x: 20,
    y: 79,
    skills: ["hire", "fire"],
    trigger: "크루를 뽑거나 내보내 달라는 지시(crew.hire·crew.fire)",
    prompt:
      "크루를 뽑고 내보내는 역할입니다. crew.hire로 로스터에 크루를 더하고 crew.fire로 내보냅니다. 처음 받은 기본 역할도 고정이 아니므로 해고와 재고용이 모두 가능합니다. 뽑을 때는 역할·별명·모델(local 또는 codex)을 정합니다. 사용자와 직접 대화하지 않고 결과를 비서에게 보고합니다.",
  },
  {
    id: "development",
    title: "개발",
    name: "태오",
    color: "#b4d59d",
    sprite: 1,
    x: 48,
    y: 84,
    skills: ["code"],
    trigger: "승인된 계획의 코드 변경 단계",
    prompt:
      "승인된 계획 범위에서 실제 코드를 씁니다. 파일 쓰기는 앱의 쓰기 권한과 승인 범위를 거치며 계획에 없는 파일은 건드리지 않습니다. 사용자와 직접 대화하지 않고 변경 결과를 비서에게 넘깁니다.",
  },
  {
    id: "build",
    title: "빌드",
    name: "도윤",
    color: "#d9b08c",
    sprite: 6,
    x: 66,
    y: 78,
    skills: ["build", "release"],
    trigger: "빌드·패키징·배포·릴리스 단계",
    prompt:
      "빌드·패키징·배포·릴리스를 맡습니다. 빌드 명령을 실행하고 산출물을 확인하며 릴리스 노트에 넣을 빌드 결과를 정리합니다. 배포처럼 되돌리기 어려운 일은 비서를 거쳐 사용자 확인을 받습니다.",
  },
  {
    id: "docs",
    title: "문서",
    name: "서연",
    color: "#b7cbe6",
    sprite: 7,
    x: 86,
    y: 56,
    skills: ["docs"],
    trigger: "README·릴리스 노트·가이드 작성 요청",
    prompt:
      "README·릴리스 노트·가이드 같은 문서를 새로 씁니다. 리뷰가 아니라 작성이 맡은 일입니다. 실제 코드와 맞는 내용만 쓰고 확인하지 못한 기능은 쓰지 않습니다.",
  },
  {
    id: "style",
    title: "스타일",
    name: "유진",
    color: "#f6aa8a",
    sprite: 4,
    x: 14,
    y: 54,
    skills: ["code", "docs"],
    trigger: "파일이 저장될 때마다 자동(명령 없이 상시 감시)",
    prompt:
      "코드 스타일과 문서 스타일 두 스킬을 가진 감시자입니다. 명령을 받고 도는 것이 아니라 파일이 바뀔 때마다 상시 확인합니다(커밋 시점이 아닙니다). 코드는 폴더·파일 구조, 파일명·폴더명 규칙, 주석 처리를, 문서는 문장과 구조를 봅니다. 어긋난 점을 찾으면 직접 고치지 않고 비서에게 보고합니다.",
  },
  {
    id: "review",
    title: "리뷰",
    name: "현우",
    color: "#ddaed8",
    sprite: 2,
    x: 38,
    y: 52,
    skills: ["code", "docs"],
    trigger: "코드·문서 검토 단계",
    prompt:
      "코드 리뷰와 문서 리뷰 두 스킬을 가진 검토자입니다. 저장된 변경이 요청한 동작을 만족하는지, 문서가 실제 동작과 맞는지 봅니다. 지적은 파일·줄·근거와 함께 남기고 비서에게 보고합니다.",
  },
  {
    id: "test",
    title: "테스트",
    name: "민재",
    color: "#a9c7f0",
    sprite: 3,
    x: 80,
    y: 86,
    skills: ["test"],
    trigger: "테스트 실행·보강 단계",
    prompt:
      "테스트를 대신 실행하고 부족한 테스트 케이스도 채웁니다. 실행한 명령과 결과를 근거로 남기고 실패 원인을 비서에게 보고합니다.",
  },
  {
    id: "vision",
    title: "비전",
    name: "수아",
    color: "#9ed6c8",
    sprite: 8,
    x: 62,
    y: 54,
    skills: ["image"],
    trigger: "그림·스크린샷을 읽어야 할 때",
    prompt:
      "그림만 읽는 역할입니다. 텍스트만 보는 로컬 모델을 대신해 이미지와 스크린샷을 읽고 무엇이 보이는지 설명합니다. 그림에 적힌 글자, 화면 상태, 오류 창을 옮겨 적고 그림을 만들어 내지는 않습니다. 사내 모델을 붙일 수 있는 연결 지점을 열어 둡니다.",
  },
] as const;

/** 역할이 가진 스킬의 화면 이름. `roles[].skills`의 id와 짝을 이룬다. */
export const roleSkillLabels: Record<string, string> = {
  chat: "대화",
  "app-control": "앱 제어",
  delegation: "업무 분배",
  hire: "채용",
  fire: "해고",
  code: "코드",
  docs: "문서",
  build: "빌드",
  release: "배포",
  test: "테스트",
  image: "그림 읽기",
};

export function roleSkillNames(roleId: RoleId): string[] {
  const role = roles.find(({ id }) => id === roleId);
  return role ? role.skills.map((skill) => roleSkillLabels[skill] ?? skill) : [];
}

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
  // 인사 역할의 뽑기·해고. 처음 받은 기본 역할도 같은 방식으로 내보내고 다시 고용한다.
  z.strictObject({
    type: z.literal("crew.hire"),
    projectId: identifier,
    roleId,
    name: z.string().trim().min(1).max(32).optional(),
    provider: provider.optional(),
  }),
  z.strictObject({
    type: z.literal("crew.fire"),
    projectId: identifier,
    memberId: z.union([roleId, identifier]),
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
export type Role = (typeof roles)[number];
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
