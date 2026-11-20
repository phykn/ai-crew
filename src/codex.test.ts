import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { CodexConnection } from "./codex";
import { ModelConnectionError } from "./model-errors";

test("reconnecting to Codex reads the exact turn and does not start a duplicate", async () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-codex-test-"));
  const executable = join(directory, "fake-codex");
  const transcript = join(directory, "rpc.log");
  writeFileSync(
    executable,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      'const readline = require("node:readline");',
      'readline.createInterface({ input: process.stdin }).on("line", (line) => {',
      "  const {id, method, params} = JSON.parse(line);",
      '  if (method) fs.appendFileSync(process.env.CREW_TEST_RPC_LOG, JSON.stringify({ method, params }) + "\\n");',
      "  if (id === undefined) return;",
      "  const result = {",
      "    initialize: {},",
      '    "thread/resume": { thread: { id: "saved-thread" }, model: "codex-test" },',
      '    "turn/start": { turn: { id: "new-turn", status: "inProgress" } },',
      '    "thread/turns/list": { data: [',
      '      { id: "finished", status: "completed", items: [',
      '        { type: "agentMessage", text: "중간 내용", phase: "commentary" },',
      '        { type: "agentMessage", text: "{\\"answer\\":true}", phase: "final_answer" },',
      "      ] },",
      '      { id: "active", status: "inProgress", items: [] },',
      "    ] },",
      "  }[method];",
      '  const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");',
      '  if (method === "turn/start") {',
      '    const usage = (turnId, input, output, lastIn, lastOut) => send({ method: "thread/tokenUsage/updated", params: {',
      '      threadId: "saved-thread", turnId, tokenUsage: { total: { inputTokens: input, outputTokens: output }, last: { inputTokens: lastIn, outputTokens: lastOut } },',
      '    }});',
      '    usage("new-turn", 1010, 505, 10, 5);',
      '    usage("new-turn", 1020, 508, 10, 3);',
      '    usage("other-turn", 2000, 800, 980, 292);',
      '    send({ method: "turn/completed", params: { threadId: "saved-thread", turn: { id: "new-turn", status: "completed" } } });',
      '  }',
      '  send({ id, result });',
      "});",
    ].join("\n"),
  );
  chmodSync(executable, 0o700);
  vi.stubEnv("AI_CREW_CODEX_BIN", executable);
  vi.stubEnv("CREW_TEST_RPC_LOG", transcript);
  const codex = new CodexConnection();
  try {
    const project = {
      id: "test",
      root: directory,
      name: "test",
      approvalMode: "manual",
    } as const;
    const emit = vi.fn();
    const remember = vi.fn();
    const onTurn = vi.fn();
    const signal = new AbortController().signal;
    await codex.run(
      project,
      "saved-thread",
      "work",
      signal,
      emit,
      remember,
      undefined,
      undefined,
      { resumeTurn: "finished", onTurn },
    );
    expect(emit).toHaveBeenCalledExactlyOnceWith('{"answer":true}');
    expect(remember).toHaveBeenCalledExactlyOnceWith("saved-thread");

    await expect(
      codex.run(
        project,
        "saved-thread",
        "work",
        signal,
        emit,
        remember,
        undefined,
        undefined,
        { resumeTurn: "active", onTurn },
      ),
    ).rejects.toBeInstanceOf(ModelConnectionError);
    expect(onTurn).not.toHaveBeenCalled();
    const requests = readFileSync(transcript, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(
      requests.filter(({ method }) => method === "thread/turns/list"),
    ).toHaveLength(2);
    expect(requests.some(({ method }) => method === "turn/start")).toBe(false);
    const usage = {};
    await codex.run(
      project,
      "saved-thread",
      "new work",
      signal,
      emit,
      remember,
      undefined,
      undefined,
      undefined,
      usage,
    );
    expect(usage).toEqual({ model: "codex-test", inputTokens: 20, outputTokens: 8 });
  } finally {
    codex.close();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
});
