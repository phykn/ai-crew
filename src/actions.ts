import { z } from "zod";

export const roles = [
  {
    id: "assistant",
    title: "비서",
    name: "여울",
    color: "#efc58d",
    sprite: 0,
    x: 28,
    y: 62,
  },
  {
    id: "plan",
    title: "플랜",
    name: "가람",
    color: "#bce0da",
    sprite: 2,
    x: 48,
    y: 52,
  },
  {
    id: "development",
    title: "개발",
    name: "모루",
    color: "#b4d59d",
    sprite: 1,
    x: 64,
    y: 78,
  },
  {
    id: "review",
    title: "리뷰",
    name: "새벽",
    color: "#ddaed8",
    sprite: 3,
    x: 23,
    y: 83,
  },
  {
    id: "style",
    title: "스타일",
    name: "단풍",
    color: "#f6aa8a",
    sprite: 0,
    x: 86,
    y: 84,
  },
  {
    id: "test",
    title: "테스트",
    name: "솔잎",
    color: "#a9c7f0",
    sprite: 2,
    x: 79,
    y: 65,
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
};
export type Completion =
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
};
export function planFiles(plan: WorkPlan) {
  return plan.files ?? [{ path: plan.path, baseline: plan.baseline }];
}
export type WorkChange = {
  id: string;
  jobId: string;
  planId: string | null;
  path: string;
  beforeHash: string | null;
  afterHash: string;
  savedAt: string;
  checks: {
    role: "review" | "style" | "test";
    passed: boolean;
    unavailable: boolean;
    note: string;
    command: string | null;
    checkedAt: string;
    batchId: string;
  }[];
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
};
export type Snapshot = {
  projects: Project[];
  current: Project | null;
  sessions: Session[];
  session: Session | null;
  members: CrewMember[];
  assignees: { jobId: string; memberId: string; roleId: RoleId }[];
  messages: Message[];
  activity: Activity[];
  jobs: Job[];
  changes: WorkChange[];
};
export type ChatEvent = {
  sessionId: string;
  responseId: string;
  delta: string;
};
export type CrewApi = {
  run: (action: Action) => Promise<Snapshot>;
  subscribe: (receive: (event: ChatEvent | null) => void) => () => void;
};

declare global {
  interface Window {
    crew: CrewApi;
  }
}
