// The MCP tool gate: asks the user before a crew member runs a tool that changes
// data.

import { z } from "zod";
import type { CodexConnection } from "../server/codex";
import { CrewMcp, type ToolGateInput } from "../server/mcp";
import type { CrewStore } from "../store/store";
import { WorkflowBase } from "./workflow-base";

export class WorkflowTools extends WorkflowBase {
  constructor(
    store: CrewStore,
    codex: CodexConnection,
    notify: () => void,
    mcp = new CrewMcp(store),
  ) {
    super(store, codex, notify, mcp);
    this.mcp.setGate((input) => this.toolGate(input));
  }

  answerTool(id: string, requestId: string, allow: boolean) {
    const job = this.store.getJob(id);
    const record = this.store.answerToolApproval(
      id,
      requestId,
      "사용자",
      allow ? "allow" : "deny",
    );
    if (record) {
      this.toolWaiters.get(requestId)?.(allow);
      this.notify();
      return;
    }
    this.store.log(
      job.sessionId,
      "사용자 · 이미 끝난 승인 요청 · 현재 요청을 다시 확인해 주세요.",
      job.id,
    );
    this.notify();
  }

  async toolGate({
    job,
    member,
    server,
    tool,
    args,
    signal,
  }: ToolGateInput) {
    if (!job.id) return { allow: false, actor: "앱" };
    const current = this.store.getJob(job.id);
    const project = this.store.getProject(job.projectId);
    const scope = JSON.stringify(args).slice(0, 220);
    const mode = project.approvalMode;
    const request = () => {
      const approval = this.store.requestToolApproval(
        current,
        member,
        server,
        tool.name,
        scope,
        mode,
      );
      this.notify();
      return approval;
    };
    if (mode === "always") {
      const approval = request();
      this.store.answerToolApproval(job.id, approval.id, "역할 권한", "allow");
      this.notify();
      return { allow: true, actor: "역할 권한" };
    }
    if (mode === "auto") {
      try {
        const decision = await this.decide(
          current,
          project,
          "assistant",
          "Decide whether one external MCP tool may change data for this request. Allow only when the original user request clearly authorizes this exact tool and target, and the crew member is permitted to use it. Otherwise deny.",
          JSON.stringify({
            request: current.request,
            member: member.name,
            tool: server.name + "/" + tool.name,
            purpose: tool.description,
            arguments: args,
          }),
          z.strictObject({ allow: z.boolean() }),
          signal,
        );
        signal.throwIfAborted();
        const approval = request();
        this.store.answerToolApproval(
          job.id,
          approval.id,
          "비서",
          decision.allow ? "allow" : "deny",
        );
        this.notify();
        return { allow: decision.allow, actor: "비서" };
      } catch (error) {
        if (signal.aborted) throw error;
      }
    }
    const approval = request();
    const answer = await this.waitForTool(approval.id, signal);
    if (answer === null)
      this.store.answerToolApproval(job.id, approval.id, "업무 중단", "deny");
    this.notify();
    return { allow: answer === true, actor: "사용자" };
  }

  protected waitForTool(requestId: string, signal: AbortSignal) {
    return new Promise<boolean | null>((resolve) => {
      const done = (allow: boolean | null) => {
        if (this.toolWaiters.get(requestId) !== done) return;
        this.toolWaiters.delete(requestId);
        signal.removeEventListener("abort", abort);
        resolve(allow);
      };
      const abort = () => done(null);
      this.toolWaiters.set(requestId, done);
      if (signal.aborted) done(null);
      else signal.addEventListener("abort", abort, { once: true });
    });
  }
}
