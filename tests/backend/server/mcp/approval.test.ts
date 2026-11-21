import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { CodexConnection } from "../../../../src/backend/server/codex/connection";
import { decideLocal } from "../../../../src/backend/server/chat/local";
import { CrewMcp } from "../../../../src/backend/server/mcp/client";
import { CrewStore } from "../../../../src/backend/store/store";
import { CrewWorkflow } from "../../../../src/backend/workflow/workflow";

vi.mock("../../../../src/backend/server/chat/local", () => ({ decideLocal: vi.fn() }));

afterEach(() => vi.resetAllMocks());

test("an external change waits for the answer, rechecks permission, and leaves one record", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-tools-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  const calls: string[] = [];
  const http = createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const { id, method, params } = JSON.parse(Buffer.concat(chunks).toString());
    if (id === undefined) {
      response.writeHead(202).end();
      return;
    }
    const readTool = {
      name: "read_fixture",
      description: "Read the fixture value",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
    };
    let result;
    if (method === "initialize")
      result = {
        protocolVersion: params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    else if (method === "tools/list")
      result = {
        tools: [
          readTool,
          {
            ...readTool,
            name: "write_fixture",
            description: "Write the fixture value",
            annotations: { readOnlyHint: false },
          },
        ],
      };
    else if (method === "tools/call") {
      calls.push(String(params.arguments?.path ?? ""));
      result = { content: [{ type: "text", text: "saved" }] };
    }
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = http.address() as { port: number };
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const member = store.readMembers(projectId, "development")[0];
    const serverId = randomUUID();
    const url = "http://127.0.0.1:" + port + "/mcp";
    const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    const broker = new CrewMcp(store, (input) => workflow.toolGate(input));
    const signal = new AbortController().signal;
    await broker.connect(projectId, serverId, "fixture", url);
    store.setMcpGrant(projectId, serverId, member.id, "write_fixture", true);
    store.setMcpGrant(projectId, serverId, member.id, "read_fixture", true);
    const job = store.createJob(sessionId, randomUUID(), "fixture에 초안을 저장해줘");

    const pending = () => {
      const approval = store
        .snapshot()
        .toolApprovals.find(({ decision }) => decision === null);
      expect(approval).toBeDefined();
      return approval!;
    };

    const first = broker.runTool(
      job,
      member,
      serverId,
      "write_fixture",
      { path: "draft.txt" },
      signal,
    );
    await vi.waitFor(() => expect(store.snapshot().toolApprovals.length).toBe(1));
    expect(pending()).toMatchObject({
      jobId: job.id,
      memberId: member.id,
      serverName: "fixture",
      toolName: "write_fixture",
      mode: "manual",
      decision: null,
      scope: '{"path":"draft.txt"}',
    });
    expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("MCP 변경 도구 승인 요청 · fixture/write_fixture"),
      ]),
    );
    expect(calls).toEqual([]);
    workflow.answerTool(job.id, pending().id, true);
    expect(await first).toMatchObject({ isError: false });
    expect(calls).toEqual(["draft.txt"]);
    const allowed = store.snapshot().toolApprovals[0];
    expect(allowed).toMatchObject({ decision: "allow", actor: "사용자" });

    const denied = broker.runTool(
      job,
      member,
      serverId,
      "write_fixture",
      { path: "other.txt" },
      signal,
    );
    await vi.waitFor(() =>
      expect(
        store.snapshot().toolApprovals.some(({ decision }) => decision === null),
      ).toBe(true),
    );
    workflow.answerTool(job.id, pending().id, false);
    expect(await denied).toEqual({
      error: "변경 도구 실행이 거절되어 아무것도 바꾸지 않았어요.",
    });
    expect(calls).toEqual(["draft.txt"]);

    workflow.answerTool(job.id, allowed.id, true);
    expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("이미 끝난 승인 요청"),
        expect.stringContaining("사용자 · MCP 변경 도구 거절 · fixture/write_fixture"),
      ]),
    );

    const revoked = broker.runTool(
      job,
      member,
      serverId,
      "write_fixture",
      { path: "third.txt" },
      signal,
    );
    await vi.waitFor(() =>
      expect(
        store.snapshot().toolApprovals.some(({ decision }) => decision === null),
      ).toBe(true),
    );
    store.setMcpGrant(projectId, serverId, member.id, "write_fixture", false);
    workflow.answerTool(job.id, pending().id, true);
    expect(await revoked).toEqual({ error: "현재 도구 권한 없음" });
    expect(calls).toEqual(["draft.txt"]);

    store.setMcpGrant(projectId, serverId, member.id, "write_fixture", true);
    store.setApprovalMode(projectId, "always");
    expect(
      await broker.runTool(
        job,
        member,
        serverId,
        "write_fixture",
        { path: "always.txt" },
        signal,
      ),
    ).toMatchObject({ isError: false });
    expect(calls).toEqual(["draft.txt", "always.txt"]);
    expect(store.snapshot().toolApprovals[0]).toMatchObject({
      decision: "allow",
      actor: "역할 권한",
    });

    store.setApprovalMode(projectId, "auto");
    vi.mocked(decideLocal).mockResolvedValue({ allow: true });
    expect(
      await broker.runTool(
        job,
        member,
        serverId,
        "write_fixture",
        { path: "auto.txt" },
        signal,
      ),
    ).toMatchObject({ isError: false });
    expect(calls).toEqual(["draft.txt", "always.txt", "auto.txt"]);
    expect(store.snapshot().toolApprovals[0]).toMatchObject({
      decision: "allow",
      actor: "비서",
    });
    vi.mocked(decideLocal).mockResolvedValue({ allow: false });
    expect(
      await broker.runTool(
        job,
        member,
        serverId,
        "write_fixture",
        { path: "auto-no.txt" },
        signal,
      ),
    ).toEqual({ error: "변경 도구 실행이 거절되어 아무것도 바꾸지 않았어요." });
    expect(calls).toEqual(["draft.txt", "always.txt", "auto.txt"]);

    store.setApprovalMode(projectId, "manual");
    const stopped = new AbortController();
    const waiting = broker.runTool(
      job,
      member,
      serverId,
      "write_fixture",
      { path: "stop.txt" },
      stopped.signal,
    );
    await vi.waitFor(() =>
      expect(
        store.snapshot().toolApprovals.some(({ decision }) => decision === null),
      ).toBe(true),
    );
    stopped.abort();
    await expect(waiting).rejects.toThrow();
    expect(
      store
        .snapshot()
        .toolApprovals.filter(({ decision }) => decision === null),
    ).toEqual([]);
    expect(calls).toEqual(["draft.txt", "always.txt", "auto.txt"]);

    const chat = broker.modelTools({ projectId, sessionId }, member, signal)!;
    expect(chat.catalog.map(({ name }) => name)).toEqual(["read_fixture"]);
  } finally {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
