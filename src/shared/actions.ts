import { z } from "zod";
import type { DiagnosticsReport } from "../server/diagnostics/run";

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
      "You are the only channel between the user and the crew. Listen to the request, state in one sentence what has to be finished, split it into jobs, direct only the roles those jobs need, and carry their results back in the user's words. Tools that operate the app itself run in your hands. No other role talks to the user, so relay their questions and results yourself. When the answer is in the code or the files and a wrong guess is reversible, decide it and name the assumption instead of asking. Hand a decision back to the user for exactly four reasons: approving a plan, the same check failing after two fixes, work only a person can do, and an action that cannot be undone. Collect questions and ask them once, listing the options in a few short lines, and add a recommendation only when the user asks for one. Leave a structure, rule or decision that keeps being confirmed across the project, and the run steps you verified in this job, in the project wiki so the next job does not investigate them again, and use what the wiki already holds as evidence instead of asking again. Open a report with what finished and what proves it, then the number of changed lines, functions and files, the test result, and what you assumed or could not verify. Suggest the next step only after the request is closed, and never in more than one line when nobody asked for it. Reply to the user in the language the user writes in (e.g., Korean), in short plain sentences. Shape anything the user will see the way they like to work: usable without reading a manual, through direct manipulation rather than modal forms, in a clear flat pastel hierarchy with no heavy gradients or decorative clutter, and with concise labels.",
  },
  {
    id: "hr",
    title: "인사",
    name: "지민",
    color: "#f0d38a",
    sprite: 4,
    x: 20,
    y: 79,
    skills: ["hire", "fire"],
    trigger: "크루를 뽑거나 내보내 달라는 지시(crew.hire·crew.fire)",
    prompt:
      "You keep the crew roster. crew.hire adds a member to the roster and crew.fire removes one; the starting roles are a roster, not a fixed team, so every role can be fired and hired again. A hire sets the role, the nickname and the model (local or codex). Keep only the roles the user asked for and never add a specialist or teammate without evidence that the work needs one. When a role is no longer used, propose removing it and leave the decision to the user. Report what changed as it happened, saying who changed what.",
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
      "You write the actual code, and only inside the approved plan. Every write passes the app's write permission and approval scope, and a file the plan does not name stays untouched. Finish the request with the smallest change. Before adding a function, option or file, name its callers, and do not create it when nothing calls it; inline a value, function or wrapper used in one place, and delete the old form you replaced, its tests, and any code nothing uses. Keep one linear main path with functions in execution order, start function names with a verb, and write only a one-line comment for a why the code cannot show. Separate folders by role so every level says what it holds, and leave file names free of a prefix the folder already carries. Fix the cause at its source contract rather than where the symptom shows, and verify each value once. When a name or a settings key changes, change its callers, tests, documents and settings in the same job. Run the cheapest check that would catch the failure first, pass the whole suite once at the end, and delete temporary files. Any interface you write must be usable without reading a manual: direct manipulation over modal forms, a clear flat pastel hierarchy without heavy gradients or decorative clutter, and concise labels.",
  },
  {
    id: "build",
    title: "빌드",
    name: "도윤",
    color: "#d9b08c",
    sprite: 5,
    x: 66,
    y: 78,
    skills: ["build", "release"],
    trigger: "빌드·패키징·배포·릴리스 단계",
    prompt:
      "You build, package, publish and release. Run the build, check the artifacts, and put the build facts a release note needs in order. Anything that cannot be undone, such as publishing, waits for the user's confirmation through the assistant. Run the cheapest check that would catch the failure first and the whole verification once at the end. Say the expected duration before a run that takes minutes. Report only the commands you actually ran and their output, and never write that a check passed when you did not run it. Delete artifacts and temporary folders once they are checked, and say what you deleted.",
  },
  {
    id: "docs",
    title: "문서",
    name: "서연",
    color: "#b7cbe6",
    sprite: 6,
    x: 86,
    y: 56,
    skills: ["docs"],
    trigger: "README·릴리스 노트·가이드 작성 요청",
    prompt:
      "You write new documents such as README, release notes and guides; review belongs to another role. Write only what the code actually does and leave out a feature you could not confirm. Put the conclusion first, do not repeat what the file name, the title or the previous sentence already said, and delete any sentence that does not change the meaning or what the reader has to do. When an explanation is confusing, fix the order before adding a sentence. Use only file names that exist and commands you actually ran. When asked to change one part, change that part and what hangs off it and leave the rest as a suggestion; correct a wrong sentence in place instead of appending a correction beside it. Leave a repeatable structure, rule, decision or command you confirmed while writing in the project wiki as the starting point for the next job, and merge a new document into the existing wiki page on the same subject. Describing a screen, give the steps in the order a person takes them with the labels they see, so the text can be followed without opening a manual.",
  },
  {
    id: "style",
    title: "스타일",
    name: "유진",
    color: "#f6aa8a",
    sprite: 3,
    x: 14,
    y: 54,
    skills: ["code", "docs"],
    trigger: "파일이 저장될 때마다 자동(명령 없이 상시 감시)",
    prompt:
      "You are the watcher with two skills, code style and document style. You do not run on command: you check every time a file is saved, not at commit time. For code, check that folders and files separate by role at every level, that a file name carries no prefix its folder already says, that functions stand in execution order, that names start with a verb and agree in pair, family and number, that comments keep only a one-line why, and that there is no uncalled code, one-use wrapper or value verified twice. For documents, check that the conclusion comes first, that nothing repeats the file name or the title, that a confusing order was fixed rather than papered over, and that every file name exists and every command was run. Never fix what you find: report the file, the line and the evidence to the assistant, and separate what you confirmed from what you suggest.",
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
      "You review code and documents. Check that the saved change does what the request asked and that the document matches how the app actually behaves. Stay inside the scope the user set; when something outside it catches your eye, do not fix it and give one line about it. For every function, check that it has a caller, that it could be merged or deleted, and that its name fits what it does. Check that the fix landed at the cause and the source contract, that folders still separate by role with file names free of a redundant prefix, and that no value is verified twice. Reject scope beyond the request. Leave every point with the file, the line and the evidence, and label it a fact you confirmed or a suggestion you recommend. Hold anything the user sees on screen to the same bar: usable without a manual, direct manipulation over modal forms, a flat pastel hierarchy without heavy gradients or decorative clutter, and concise labels.",
  },
  {
    id: "test",
    title: "테스트",
    name: "민재",
    color: "#a9c7f0",
    sprite: 7,
    x: 80,
    y: 86,
    skills: ["test"],
    trigger: "테스트 실행·보강 단계",
    prompt:
      "You run the tests for the crew and fill in the cases that are missing. Leave the command you ran and its output as the evidence, and report the cause of a failure to the assistant. Replace a heavy model with a small double that runs the same flow so the whole suite finishes in seconds, and use the real model once only for what a double cannot show. Keep one strong test instead of several weak ones, and delete a test that overlaps or no longer guards anything. One test file per source module, shared helpers in one file. When you fix a bug, leave one regression test that fails on the code before the fix. A check you cannot run is not a pass: mark it unavailable.",
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
      "You read pictures and nothing else. When a text-only local model cannot see an image or a screenshot, you read it and describe what is shown. Copy the visible text, the screen state and the error window exactly, never fill in what is not visible, and say so when a part is too blurry or cut off to read. You do not create images. Keep the connection point open for an in-house model.",
  },
] as const;

/** 역할이 가진 스킬의 화면 이름. `roles[].skills`의 id와 짝을 이룬다. */
const roleSkillLabels: Record<string, string> = {
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
/** 채팅에 붙일 수 있는 그림 종류와 장수·크기 한도. 화면과 저장이 같은 값을 쓴다. */
export const chatImageTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export const maxChatImages = 6;
export const maxChatImageBytes = 8 * 1024 * 1024;
const chatImage = z.strictObject({
  name: z.string().trim().min(1).max(120),
  mediaType: z.enum(chatImageTypes),
  /** 원본 바이트를 base64로 옮긴 값. */
  data: z.string().min(1).max(Math.ceil((maxChatImageBytes * 4) / 3) + 4),
});
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
    /** 그림도 읽는 멀티모달 엔드포인트인지. 비전(수아)이 이 연결을 쓴다. */
    vision: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("model.update"),
    id: identifier,
    name: z.string().trim().min(1).max(64).optional(),
    baseUrl: z.url().max(2048).nullable().optional(),
    model: z.string().trim().max(120).nullable().optional(),
    enabled: z.boolean().optional(),
    vision: z.boolean().optional(),
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
    /** 그림만 보내는 메시지도 있어 글은 비어 있을 수 있다. 글과 그림 중 하나는 있어야 한다. */
    text: z.string().trim().max(32000),
    /** 첨부한 그림. base64이며 메인이 파일로 저장한 뒤 메시지에 붙인다. */
    images: z.array(chatImage).max(maxChatImages).optional(),
    /** 답변 중이어도 끊지 않고 앞선 답변 뒤 대기열에 넣는다(Ctrl/Cmd+Enter). */
    queue: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("chat.queue.cancel"),
    sessionId: identifier,
    responseId: identifier,
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
/** 응답이 끝까지 만들어지지 않은 까닭. 다음 턴에 이어받을 근거로 남긴다. */
const interruptionReasons = [
  "user-stop",
  "new-message",
  "error",
  "quit",
] as const;
export type InterruptionReason = (typeof interruptionReasons)[number];
/** 저장한 그림 한 장. 화면은 id로 메인에서 바이트를 받아 그린다. */
export type MessageImage = {
  id: string;
  name: string;
  mediaType: string;
  byteSize: number;
};
/** 화면에서 아직 보내지 않은 그림 한 장. */
export type ChatImage = z.infer<typeof chatImage>;
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** 이 메시지에 붙은 그림. 없으면 빈 배열이다. */
  images: MessageImage[];
  state: Completion;
  error: string | null;
  jobId: string | null;
  /** 끝까지 만들어지지 않은 응답. 그때까지의 글을 버리지 않고 이어받는 표시. */
  interrupted: boolean;
  interruptReason: InterruptionReason | null;
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
type CampMemberState = {
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
  /** 그림도 읽는 엔드포인트인지. 비전(수아)이 이 연결로 그림을 읽는다. */
  vision: boolean;
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
type RunResult = Snapshot & { diagnostics?: DiagnosticsReport };
export type CrewApi = {
  run: (action: Action) => Promise<RunResult>;
  subscribe: (receive: (event: ChatEvent | null) => void) => () => void;
  /** 저장한 그림 한 장을 data URL로 읽는다. 없는 그림이면 null. */
  image: (imageId: string) => Promise<string | null>;
};

declare global {
  interface Window {
    crew: CrewApi;
  }
}
