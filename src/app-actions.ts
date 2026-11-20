import { z } from "zod";
import {
  actions,
  type Action,
  type Snapshot,
  type ToolApproval,
} from "./actions";
import type { CrewMcp } from "./mcp";
import type { CrewStore } from "./store";
import type { CrewWorkflow } from "./workflow";

export type ActionMode = "ui" | "app";

export type ActionOutcome =
  | { status: "applied"; snapshot: Snapshot }
  | { status: "waiting"; message: string; snapshot: Snapshot };

export type ActionDeps = {
  store: CrewStore;
  workflow: CrewWorkflow;
  mcp: CrewMcp;
  /** 운영체제 폴더 선택기. 앱 MCP에서는 선택기를 열지 않고 입력 대기를 돌려준다. */
  pickFolder?: () => Promise<string | null>;
  quit?: () => void;
};

const applied = new Map<string, string>();

/**
 * 화면 IPC와 앱 MCP가 함께 쓰는 사용자 동작 실행기.
 * 등록된 동작 목록, 입력 검증, 같은 조건 검사와 기록을 이 한 곳에서 처리한다.
 */
export class ActionRunner {
  constructor(private deps: ActionDeps) {}

  get store() {
    return this.deps.store;
  }

  async run(
    input: unknown,
    mode: ActionMode = "ui",
    requestId?: string,
  ): Promise<ActionOutcome> {
    const action = actions.parse(input);
    const key = requestId ? JSON.stringify([requestId, action]) : null;
    if (key) {
      const prior = applied.get(key);
      if (prior) return JSON.parse(prior) as ActionOutcome;
    }
    const outcome = await this.execute(action, mode);
    if (key) {
      applied.set(key, JSON.stringify(outcome));
      if (applied.size > 200) applied.delete(applied.keys().next().value!);
    }
    return outcome;
  }

  private async execute(
    action: Action,
    mode: ActionMode,
  ): Promise<ActionOutcome> {
    const { store, workflow, mcp } = this.deps;
    const done = (): ActionOutcome => ({
      status: "applied",
      snapshot: store.snapshot(),
    });
    switch (action.type) {
      case "app.state":
        break;
      case "project.pick": {
        if (mode === "app" || !this.deps.pickFolder)
          return {
            status: "waiting",
            message: "폴더 선택기를 열었어요. 선택이 끝난 뒤 결과를 확인해 주세요.",
            snapshot: store.snapshot(),
          };
        const selected = await this.deps.pickFolder();
        if (selected) store.openFolder(selected);
        break;
      }
      case "project.approval":
        store.setApprovalMode(action.projectId, action.mode);
        break;
      case "project.open":
        store.openProject(action.projectId);
        break;
      case "session.new":
        store.newSession(action.projectId);
        break;
      case "session.open":
        store.openSession(action.sessionId);
        break;
      case "session.draft":
        store.saveDraft(action.sessionId, action.draft);
        break;
      case "crew.member.add":
        store.addMember(action.projectId, {
          id: action.memberId,
          roleId: action.roleId,
          name: action.name,
          provider: action.provider,
        });
        break;
      case "crew.member.update":
        store.updateMember(action.projectId, action.memberId, action);
        break;
      case "crew.workspace.write":
        store.setWorkspaceWrite(
          action.projectId,
          action.memberId,
          action.allow,
        );
        break;
      case "mcp.connect":
        await mcp.connect(
          action.projectId,
          action.serverId,
          action.name,
          action.url,
        );
        break;
      case "mcp.disconnect":
        store.disconnectMcpEndpoint(action.projectId, action.serverId);
        break;
      case "mcp.grant":
        store.setMcpGrant(
          action.projectId,
          action.serverId,
          action.memberId,
          action.toolName,
          action.allow,
        );
        break;
      case "mcp.answer":
        workflow.answerTool(action.jobId, action.requestId, action.allow);
        break;
      case "crew.skill.add":
        store.addSkill(action.projectId, {
          id: action.skillId,
          memberId: action.memberId,
          name: action.name,
          markdown: action.markdown,
        });
        break;
      case "crew.skill.remove":
        store.removeSkill(action.projectId, action.memberId, action.skillId);
        break;
      case "memory.add":
        store.saveMemory(action.sessionId, action.body, action.ownerId);
        break;
      case "memory.remove":
        store.removeMemory(action.projectId, action.memoryId);
        break;
      case "wiki.save":
        store.saveWiki(action.sessionId, {
          id: action.pageId,
          version: action.version,
          title: action.title,
          body: action.body,
          links: action.links,
        });
        break;
      case "wiki.remove":
        store.removeWiki(action.projectId, action.pageId, action.version);
        break;
      case "workflow.save":
        store.saveWorkflow(action.projectId, {
          id: action.workflowId,
          version: action.version,
          name: action.name,
          graph: action.graph,
          author: "사용자",
        });
        break;
      case "workflow.select":
        store.setSessionWorkflow(action.sessionId, action.workflowId);
        break;
      case "workflow.apply":
        store.applyWorkflow(action.jobId, action.scope);
        break;
      case "view.set":
        store.setViewState(action.sessionId, action.patch);
        break;
      case "job.workspace":
        await this.prepareWorkspace(action.jobId);
        break;
      case "job.apply":
        await this.applyJob(action.jobId);
        break;
      case "job.cleanup":
        await store.cleanupWorkspace(action.jobId);
        break;
      case "chat.send":
        await this.chat(action);
        break;
      case "chat.stop":
        if (!this.stopResponse) throw new Error("지금은 멈출 응답이 없어요.");
        this.stopResponse(action.sessionId, action.responseId);
        break;
      case "job.answer":
        workflow.answer(action.jobId, action.requestId, action.allow);
        break;
      case "job.stop":
        workflow.stop(action.jobId);
        break;
      case "job.resume":
        workflow.resume(action.jobId);
        break;
      case "job.followup.select":
        workflow.selectFollowup(
          action.sessionId,
          action.requestId,
          action.jobId,
        );
        break;
      case "job.revise":
        workflow.revise(
          action.jobId,
          action.sessionId,
          action.requestId,
          action.text,
          action.questionId,
        );
        break;
    }
    return done();
  }

  /** 화면에서 시작한 응답과 중단을 메인 프로세스의 실행 관리와 연결한다. */
  attachChat(
    handlers: {
      send: (action: Extract<Action, { type: "chat.send" }>) => void;
      stop: (sessionId: string, responseId: string) => void;
    },
  ) {
    this.chatHandler = handlers.send;
    this.stopResponse = handlers.stop;
  }

  private chatHandler: ((action: Extract<Action, { type: "chat.send" }>) => void) | null =
    null;
  private stopResponse: ((sessionId: string, responseId: string) => void) | null =
    null;

  private async prepareWorkspace(jobId: string) {
    const job = this.deps.store.getJob(jobId);
    if (this.deps.workflow.isRunning(jobId))
      throw new Error("업무가 실행 중이에요. 멈춘 뒤 격리를 선택해 주세요.");
    await this.deps.store.prepareIsolatedWorkspace(job.id);
  }

  private async applyJob(jobId: string) {
    await this.deps.store.applyJob(jobId);
  }

  private async chat(action: Extract<Action, { type: "chat.send" }>) {
    if (!this.chatHandler) throw new Error("지금은 메시지를 보낼 수 없어요.");
    this.chatHandler(action);
  }
}

const descriptions: Record<string, string> = {
  "app.state": "현재 화면 상태를 읽어요.",
  "project.pick": "프로젝트 폴더 선택기를 열어요.",
  "project.open": "등록한 프로젝트로 전환해요.",
  "project.approval": "프로젝트의 승인 모드를 바꿔요.",
  "session.new": "프로젝트에서 새 대화를 시작해요.",
  "session.open": "저장된 대화를 열어요.",
  "session.draft": "입력창 초안을 저장해요.",
  "crew.member.add": "정규 팀원을 고용해요.",
  "crew.member.update": "별명·모델·고용 상태를 바꿔요.",
  "crew.workspace.write": "개발 담당의 파일 쓰기 권한을 부여·회수해요.",
  "mcp.connect": "프로젝트 MCP 서버를 연결하고 도구를 새로 읽어요.",
  "mcp.disconnect": "프로젝트 MCP 서버 연결을 해제해요.",
  "mcp.grant": "담당자에게 서버 도구 사용을 허용·회수해요.",
  "mcp.answer": "대기 중인 MCP 변경 도구 승인에 답해요.",
  "crew.skill.add": "담당자에게 스킬을 배정해요.",
  "crew.skill.remove": "담당자의 스킬 배정을 해제해요.",
  "memory.add": "기억을 기록해요.",
  "memory.remove": "기억을 삭제해요.",
  "wiki.save": "위키 문서를 저장해요.",
  "wiki.remove": "위키 문서를 삭제해요.",
  "workflow.save": "워크플로우 초안을 검사하고 저장해요.",
  "workflow.select": "세션의 워크플로우를 선택해요.",
  "workflow.apply": "저장한 워크플로우를 진행 중 업무에 적용해요.",
  "view.set": "탭·캠프 보기·범례·패널 폭·연 업무·메모리 보기를 바꿔요.",
  "job.workspace": "업무 전용 Git 브랜치와 워크트리를 만들어 격리 실행을 준비해요.",
  "job.apply": "검증을 마친 업무 브랜치를 원본에 반영해요.",
  "job.cleanup": "끝난 업무의 워크트리를 정리하고 기록은 남겨요.",
  "chat.send": "비서에게 메시지를 보내요.",
  "chat.stop": "응답 생성을 멈춰요.",
  "job.answer": "권한 요청에 허용·거절로 답해요.",
  "job.stop": "업무를 멈춰요.",
  "job.resume": "멈춘 업무를 이어가요.",
  "job.followup.select": "모호한 추가 지시의 대상 업무를 골라요.",
  "job.revise": "업무에 추가 지시를 보내요.",
};

export const actionCatalog = actions.options.map((option) => {
  const id = (option.shape.type as z.ZodLiteral<string>).value;
  return {
    id,
    description: describe(id),
    inputSchema: z.toJSONSchema(option) as object,
    changes: !id.startsWith("app.") && id !== "chat.send",
  };
});

export type CatalogEntry = (typeof actionCatalog)[number];

function describe(id: string) {
  return descriptions[id] ?? id;
}


export function findActions(query: string, area?: string) {
  const text = (query + " " + (area ?? "")).toLowerCase().trim();
  return actionCatalog.filter(
    ({ id, description }) =>
      !text ||
      id.toLowerCase().includes(text) ||
      description.includes(area ?? "") ||
      description.toLowerCase().includes(text) ||
      id.split(".")[0].includes(text),
  );
}

export type AppRead = {
  project: { id: string; name: string; root: string; approvalMode: string } | null;
  session: { id: string; title: string; workflowId: string | null } | null;
  tabs: string[];
  view: Snapshot["view"];
  jobs: Snapshot["jobs"];
  pendingApprovals: { id: string; jobId: string }[];
  pendingToolApprovals: ToolApproval[];
  crew: { id: string; roleId: string; name: string; hired: boolean }[];
  workflows: { id: string; name: string; version: number }[];
  skills: Snapshot["skills"];
  skillStates: Snapshot["skillStates"];
  memories: number;
  wiki: { id: string; title: string; version: number }[];
  usage: { roleId: string; count: number; elapsedMs: number }[];
};

export function appRead(store: CrewStore): AppRead {
  const snapshot = store.snapshot();
  const usage = new Map<string, { roleId: string; count: number; elapsedMs: number }>();
  for (const run of snapshot.modelRuns) {
    const group = usage.get(run.roleId) ?? {
      roleId: run.roleId,
      count: 0,
      elapsedMs: 0,
    };
    group.count++;
    group.elapsedMs += run.elapsedMs;
    usage.set(run.roleId, group);
  }
  return {
    project: snapshot.current
      ? {
          id: snapshot.current.id,
          name: snapshot.current.name,
          root: snapshot.current.root,
          approvalMode: snapshot.current.approvalMode,
        }
      : null,
    session: snapshot.session
      ? {
          id: snapshot.session.id,
          title: snapshot.session.title,
          workflowId: snapshot.session.workflowId,
        }
      : null,
    tabs: ["대화", "로그", "메모리", "워크플로우"],
    view: snapshot.view,
    jobs: snapshot.jobs,
    pendingApprovals: snapshot.fileApprovals
      .filter(({ decision }) => decision === null)
      .map(({ id, jobId }) => ({ id, jobId })),
    pendingToolApprovals: snapshot.toolApprovals.filter(
      ({ decision }) => decision === null,
    ),
    crew: snapshot.members.map(({ id, roleId, name, hired }) => ({
      id,
      roleId,
      name,
      hired,
    })),
    workflows: snapshot.workflows.map(({ id, name, version }) => ({
      id,
      name,
      version,
    })),
    skills: snapshot.skills,
    skillStates: snapshot.skillStates,
    memories: snapshot.memories.length,
    wiki: snapshot.wiki.map(({ id, title, version }) => ({ id, title, version })),
    usage: [...usage.values()],
  };
}
