// The workflow core: the state a run holds, the model turn loop (`decide`,
// `runAgent`) and the retry policy around it.

import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  roles,
  type CrewMember,
  type Job,
  type ModelDetails,
  type Project,
  type RoleId,
  type WorkPlan,
} from "../shared/actions";
import type { CodexConnection } from "../server/codex/connection";
import { codexMcpConfig } from "../server/codex/mcp-config";
import { crewInstructions } from "../shared/crew-definition";
import { DirectoryFence, StopFence } from "./engine-fence";
import type { CrewStore } from "../store/store";
import { decideLocal } from "../server/chat/local";
import { ModelLimitError, classifyModelFailure } from "../server/chat/errors";
import { CrewMcp } from "../server/mcp/client";
import { mentionsWiki, wikiTools } from "../server/chat/wiki-tools";
import { wikiReference } from "../shared/wiki-reference";
import { maxRetries } from "./support";

export class WorkflowBase {
  protected active = new Map<string, AbortController>();
  /** 업무별 실행 세대. 멈춘 실행의 늦은 마무리가 새 실행에 끼어들지 않게 한다. */
  protected stops = new StopFence();
  /** 진행 중인 업무가 잡고 있는 작업 경로. */
  protected directories = new DirectoryFence();
  protected agentTurns = new Map<string, Promise<void>>();
  protected toolWaiters = new Map<string, (allow: boolean | null) => void>();

  constructor(
    protected store: CrewStore,
    protected codex: CodexConnection,
    protected notify: () => void,
    protected mcp = new CrewMcp(store),
  ) {}

  protected async decide<T extends z.ZodType>(
    job: Job,
    project: Project,
    role: RoleId,
    system: string,
    prompt: string,
    schema: T,
    signal: AbortSignal,
    specialist?: WorkPlan["specialist"],
  ): Promise<z.infer<T>> {
    signal.throwIfAborted();
    const roster = this.store.readMembers(project.id, role);
    const members = roster.filter(
      (member) =>
        member.hired &&
        (!member.assignmentJobId || member.assignmentJobId === job.id) &&
        (member.specialty ?? "") === (specialist?.specialty ?? "") &&
        (!specialist?.permanent || !member.assignmentJobId),
    );
    const assignee = this.store.getAssignee(
      job.id,
      role,
      specialist?.specialty,
    );
    let member =
      members.find(({ id }) => id === assignee) ??
      members.find(({ id }) => !this.agentTurns.has(project.id + ":" + id)) ??
      members[0];
    if (!member) {
      if (role === "assistant" || !this.store.isHired(project.id, "assistant"))
        throw new Error(
          "비서가 고용되어 있어야 인사팀 후보를 채택할 수 있어요.",
        );
      const label =
        specialist?.specialty ?? roles.find(({ id }) => id === role)!.title;
      member = this.store.recruitMember(
        job,
        role,
        roster[0].provider,
        label,
        specialist?.specialty,
        specialist?.permanent,
      );
    }
    if (member.id !== assignee) {
      this.store.assignMember(job, member);
      this.notify();
    }
    const key = project.id + ":" + member.id;
    const previous = this.agentTurns.get(key);
    const turn = Promise.withResolvers<void>();
    const tail = previous ? previous.then(() => turn.promise) : turn.promise;
    this.agentTurns.set(key, tail);
    try {
      signal.throwIfAborted();
      if (previous) {
        this.store.log(
          job.sessionId,
          member.name + " · 앞 요청을 마칠 때까지 대기",
          job.id,
        );
        this.notify();
        const interrupted = Promise.withResolvers<never>();
        const abort = () => interrupted.reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        try {
          await Promise.race([previous, interrupted.promise]);
        } finally {
          signal.removeEventListener("abort", abort);
        }
      }
      signal.throwIfAborted();
      const current = this.store
        .readMembers(project.id, role)
        .find(({ id }) => id === member.id);
      if (!current?.hired)
        return await this.decide(
          job,
          project,
          role,
          system,
          prompt,
          schema,
          signal,
          specialist,
        );
      return await this.runAgent(
        job,
        project,
        current,
        specialist
          ? "You are an additional read-only specialist in " +
              JSON.stringify(specialist.specialty) +
              ". " +
              system
          : system,
        prompt,
        schema,
        signal,
      );
    } finally {
      turn.resolve();
      void tail.then(() => {
        if (this.agentTurns.get(key) === tail) this.agentTurns.delete(key);
      });
    }
  }

  protected async runAgent<T extends z.ZodType>(
    job: Job,
    project: Project,
    member: CrewMember,
    system: string,
    prompt: string,
    schema: T,
    signal: AbortSignal,
  ) {
    const skills = this.store.listSkills(job.projectId);
    const previous = this.store.getAgentContext(job.id, member.id);
    const withPrevious = () =>
      previous?.result && member.roleId !== "test"
        ? "Previous validated result for this role (use the current request for scope):\n" +
          previous.result +
          "\n\n" +
          prompt
        : prompt;
    const step = createHash("sha256")
      .update(
        JSON.stringify([
          job.request,
          member.id,
          member.provider,
          system + "\n\n" + crewInstructions(member, skills),
          prompt,
        ]),
      )
      .digest("hex");
    const wiki = wikiReference(this.store.wikiDigest(job.projectId), job.request);
    system += "\n\n" + crewInstructions(
      member,
      skills,
      this.store.listMemories(job.projectId, member.id),
      wiki,
    );
    let threadId =
      member.provider === "codex" ? (previous?.threadId ?? null) : null;
    if (member.provider === "codex" && !threadId && previous?.result)
      this.store.log(
        job.sessionId,
        member.name + " · 저장한 역할 결과를 바탕으로 새 Codex 실행 연결",
        job.id,
      );
    this.store.startSkillUse(
      job,
      member.id,
      skills.filter(({ memberId }) => memberId === member.id).map(({ id }) => id),
    );
    try {
      for (;;) {
        signal.throwIfAborted();
        try {
          let output: z.infer<T>;
          const started = performance.now();
          const details: ModelDetails = {};
          try {
            if (member.provider === "local") {
              output = await decideLocal(
                system,
                withPrevious(),
                schema,
                signal,
                this.mcp.modelTools(job, member, signal),
                details,
                // 위키에 읽을 문서가 있거나 사용자가 위키를 말했을 때만 도구를 연다.
                // 문서가 없는 평범한 업무에 도구를 열면 로컬 모델이 submit_result 전에
                // 도구를 한 번 더 부르느라 단계가 늘어난다.
                wiki.outline.length || mentionsWiki(job.request)
                  ? wikiTools(
                      this.store,
                      {
                        projectId: job.projectId,
                        sessionId: job.sessionId,
                        jobId: job.id,
                      },
                      member,
                      signal,
                      this.notify,
                    )
                  : undefined,
              );
            } else {
              let raw = "";
              const pending = this.store.readPendingModelTurn(job.id, step);
              const resumeId = pending?.threadId ?? threadId;
              await this.codex.run(
                project,
                resumeId,
                system + "\n\n" + (resumeId ? prompt : withPrevious()),
                signal,
                (text) => {
                  raw += text;
                },
                (thread) => {
                  threadId = thread;
                  if (!signal.aborted && this.active.has(job.id))
                    this.store.rememberAgentThread(job.id, member.id, thread);
                },
                z.json().parse(z.toJSONSchema(schema)),
                () => {
                  signal.throwIfAborted();
                  this.store.log(
                    job.sessionId,
                    member.name +
                      " · 이전 Codex 세션 " +
                      resumeId +
                      "을 불러올 수 없어 저장한 맥락으로 새 실행 연결",
                    job.id,
                  );
                  return system + "\n\n" + withPrevious();
                },
                {
                  resumeTurn: pending?.turnId ?? null,
                  onTurn: (thread, turn) => {
                    if (!signal.aborted)
                      this.store.savePendingModelTurn(job.id, step, thread, turn);
                  },
                },
                details,
                codexMcpConfig(
                  this.store.listMcpEndpoints(job.projectId),
                  this.store.listMcpGrants(job.projectId),
                  member,
                ),
              );
              output = schema.parse(JSON.parse(raw));
            }
          } finally {
            if (this.active.has(job.id))
              this.store.recordModelRun(
                job.sessionId,
                job.id,
                member,
                performance.now() - started,
                details,
              );
          }
          if (signal.aborted && this.active.has(job.id))
            this.store.log(
              job.sessionId,
              member.name +
                " · 중단 이후 응답 도착 · 업무 결과에는 반영하지 않았어요.",
              job.id,
            );
          signal.throwIfAborted();
          if (member.provider === "local" && previous?.threadId)
            this.store.log(
              job.sessionId,
              member.name +
                " · Codex 세션 " +
                previous.threadId +
                "에서 로컬 모델로 전환 · 저장한 맥락 사용",
              job.id,
            );
          this.store.saveAgentContext(
            job.id,
            member.id,
            threadId,
            JSON.stringify(output),
          );
          this.store.clearModelRetry(job.id, step);
          return output;
        } catch (error) {
          signal.throwIfAborted();
          const failure = classifyModelFailure(error);
          if (failure === "limit") {
            this.store.clearModelRetry(job.id, step);
            const limit = new ModelLimitError(
              member.name + " 담당 모델이 한도에 도달했어요.",
            );
            this.active.get(job.id)?.abort(limit);
            throw limit;
          }
          if (failure !== "connection") {
            this.store.clearModelRetry(job.id, step);
            throw error;
          }
          const count = this.store.scheduleModelRetry(
            job,
            step,
            member.name,
            maxRetries,
          );
          if (count === null)
            throw new Error(
              member.name +
                "의 모델 연결을 자동 재시도한 뒤에도 복구하지 못했어요.",
            );
          this.notify();
          await delay(150 * 2 ** (count - 1), undefined, { signal });
        }
      }
    } finally {
      this.store.endSkillUse(job.id, member.id);
    }
  }
}
