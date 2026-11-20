import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { z } from "zod";
import type { Project } from "./actions";

import type { InitializeParams } from "./codex-protocol/InitializeParams";
import type { ThreadStartParams } from "./codex-protocol/v2/ThreadStartParams";
import type { ThreadResumeParams } from "./codex-protocol/v2/ThreadResumeParams";
import type { TurnStartParams } from "./codex-protocol/v2/TurnStartParams";
import type { TurnInterruptParams } from "./codex-protocol/v2/TurnInterruptParams";
import type { CommandExecParams } from "./codex-protocol/v2/CommandExecParams";
import type { CommandExecTerminateParams } from "./codex-protocol/v2/CommandExecTerminateParams";

type RequestParams = {
  initialize: InitializeParams;
  "thread/start": ThreadStartParams;
  "thread/resume": ThreadResumeParams;
  "turn/start": TurnStartParams;
  "turn/interrupt": TurnInterruptParams;
  "command/exec": CommandExecParams;
  "command/exec/terminate": CommandExecTerminateParams;
};

const messageSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  result: z.unknown().optional(),
  params: z.unknown().optional(),
  error: z.object({ message: z.string() }).optional(),
});
const deltaSchema = z.object({
  threadId: z.string(),
  turnId: z.string(),
  delta: z.string(),
});
const turnResult = z.object({
  turn: z.object({
    id: z.string(),
    status: z.string(),
    error: z.object({ message: z.string() }).nullable().optional(),
  }),
});
const turnNotification = turnResult.extend({ threadId: z.string() });
const threadResult = z.object({ thread: z.object({ id: z.string() }) });

type Notification = (method: string, params: unknown) => void;

export class CodexConnection {
  private process?: ChildProcessWithoutNullStreams;
  private initialized?: Promise<unknown>;
  private id = 0;
  private replies = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  private listeners = new Set<Notification>();

  close() {
    this.process?.kill();
  }

  private disconnect(process: ChildProcessWithoutNullStreams, reason: Error) {
    if (this.process !== process) return;
    this.process = undefined;
    this.initialized = undefined;
    for (const { reject } of this.replies.values()) reject(reason);
    this.replies.clear();
    for (const notify of this.listeners) notify("disconnect", reason);
  }

  private connect() {
    if (this.initialized) return this.initialized;
    const installed = ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"].find(
      existsSync,
    );
    const process = spawn(
      globalThis.process.env.AI_CREW_CODEX_BIN || installed || "codex",
      ["app-server", "--stdio"],
    );
    this.process = process;
    process.stderr.resume();
    process.stdin.on("error", (ex) => this.disconnect(process, ex));
    process.on("error", () =>
      this.disconnect(process, new Error("Codex CLI를 실행할 수 없어요.")),
    );
    process.on("exit", () =>
      this.disconnect(process, new Error("Codex 연결이 종료됐어요.")),
    );
    createInterface({ input: process.stdout }).on("line", (line) => {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        return;
      }
      const decoded = messageSchema.safeParse(raw);
      if (!decoded.success) return;
      const message = decoded.data;
      if (message.method && message.id !== undefined) {
        this.write({
          id: message.id,
          error: {
            code: -32601,
            message: "Approval requires the AI Crew workflow.",
          },
        });
        return;
      }
      if (message.method) {
        for (const receive of this.listeners)
          receive(message.method, message.params);
        return;
      }
      if (typeof message.id !== "number") return;
      const reply = this.replies.get(message.id);
      if (!reply) return;
      this.replies.delete(message.id);
      if (message.error) reply.reject(new Error(message.error.message));
      else reply.resolve(message.result);
    });

    this.initialized = this.rpc("initialize", {
      clientInfo: { name: "ai-crew", title: "AI Crew", version: "0.1.0" },
      capabilities: null,
    })
      .then(() => this.write({ method: "initialized" }))
      .catch((error) => {
        this.disconnect(process, error);
        process.kill();
        throw error;
      });
    return this.initialized;
  }

  private write(payload: object) {
    if (!this.process) throw new Error("Codex 연결이 종료됐어요.");
    this.process.stdin.write(JSON.stringify(payload) + "\n");
  }

  private rpc<M extends keyof RequestParams>(
    method: M,
    params: RequestParams[M],
  ) {
    const id = ++this.id;
    return new Promise<unknown>((resolve, reject) => {
      this.replies.set(id, { resolve, reject });
      try {
        this.write({ id, method, params });
      } catch (error) {
        this.replies.delete(id);
        reject(error);
      }
    });
  }

  async checkJavaScript(project: Project, file: string, signal: AbortSignal) {
    await this.connect();
    signal.throwIfAborted();
    const processId = randomUUID();
    const terminate = () =>
      void this.rpc("command/exec/terminate", { processId }).catch(() => {});
    signal.addEventListener("abort", terminate, { once: true });
    try {
      const result = await this.rpc("command/exec", {
        processId,
        command: [process.execPath, "--check", file],
        cwd: project.root,
        env: { ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: null },
        timeoutMs: 10_000,
        outputBytesCap: 2_048,
        sandboxPolicy: { type: "readOnly", networkAccess: false },
      });
      signal.throwIfAborted();
      return z
        .object({ exitCode: z.number(), stderr: z.string() })
        .parse(result);
    } finally {
      signal.removeEventListener("abort", terminate);
    }
  }

  async run(
    project: Project,
    previousThread: string | null,
    prompt: string,
    signal: AbortSignal,
    emit: (text: string) => void,
    rememberThread: (id: string) => void,
    outputSchema?: TurnStartParams["outputSchema"],
    recover?: () => string,
  ) {
    await this.connect();
    signal.throwIfAborted();
    const policy = {
      cwd: project.root,
      sandbox: "read-only",
      approvalPolicy: "never",
    } as const;
    let thread: string | undefined;
    if (previousThread) {
      try {
        thread = threadResult.parse(
          await this.rpc("thread/resume", {
            threadId: previousThread,
            excludeTurns: true,
            ...policy,
          }),
        ).thread.id;
      } catch (error) {
        if (
          !recover ||
          !(error instanceof Error) ||
          !/thread not found|no rollout found|no rollout path|unknown thread|could not find|thread .* not found/i.test(
            error.message,
          )
        )
          throw error;
        signal.throwIfAborted();
        prompt = recover();
      }
    }
    thread ??= threadResult.parse(
      await this.rpc("thread/start", {
        ...policy,
        ephemeral: !!outputSchema && !previousThread && !recover,
        developerInstructions: outputSchema
          ? "Return structured output for the delegated AI Crew role."
          : "You are the AI Crew secretary. Reply to the user in chat. Project changes are performed by delegated crew workflows.",
      }),
    ).thread.id;
    const activeThread = thread;
    rememberThread(activeThread);
    signal.throwIfAborted();

    let turnId: string | undefined;
    let finish: (error?: Error) => void = () => {};
    const interrupt = () => {
      if (turnId)
        void this.rpc("turn/interrupt", {
          threadId: activeThread,
          turnId,
        }).catch(() => {});
    };
    const complete = new Promise<void>((resolve, reject) => {
      finish = (error) => (error ? reject(error) : resolve());
    });
    void complete.catch(() => {});
    const early: [string, unknown][] = [];
    const off = (method: string, params: unknown) => {
      if (method === "disconnect") return finish(params as Error);
      if (
        !turnId &&
        (method === "item/agentMessage/delta" || method === "turn/completed") &&
        params &&
        typeof params === "object" &&
        "threadId" in params &&
        params.threadId === activeThread
      ) {
        early.push([method, params]);
        return;
      }
      if (method === "item/agentMessage/delta") {
        const delta = deltaSchema.safeParse(params);
        if (
          delta.success &&
          delta.data.threadId === activeThread &&
          (!turnId || turnId === delta.data.turnId)
        )
          emit(delta.data.delta);
      }
      if (method === "turn/completed") {
        const result = turnNotification.safeParse(params);
        if (
          !result.success ||
          result.data.threadId !== activeThread ||
          (turnId && result.data.turn.id !== turnId)
        )
          return;
        const { turn } = result.data;
        finish(
          turn.status === "failed"
            ? new Error(turn.error?.message || "Codex 응답이 실패했어요.")
            : undefined,
        );
      }
    };

    this.listeners.add(off);
    signal.addEventListener("abort", interrupt);
    try {
      const turn = turnResult.parse(
        await this.rpc("turn/start", {
          threadId: activeThread,
          input: [{ type: "text", text: prompt, text_elements: [] }],
          outputSchema,
        }),
      ).turn;
      turnId = turn.id;
      for (const event of early) off(...event);
      if (signal.aborted) interrupt();
      await complete;
      signal.throwIfAborted();
    } finally {
      this.listeners.delete(off);
      signal.removeEventListener("abort", interrupt);
    }
  }
}
