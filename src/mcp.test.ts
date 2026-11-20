import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { expect, test } from "vitest";
import { CrewMcp } from "./mcp";
import { CrewStore } from "./store";

test("MCP calls enforce the current grant and tool definition after joining the server", async () => {
  const store = new CrewStore(":memory:");
  const broker = new CrewMcp(store);
  let calls = 0;
  let description = "Read the fixture value";
  let wait:
    | {
        entered: PromiseWithResolvers<void>;
        release: PromiseWithResolvers<void>;
      }
    | undefined;
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
    if (method === "tools/list" && wait) {
      const pause = wait;
      wait = undefined;
      pause.entered.resolve();
      await pause.release.promise;
    }
    const readTool = {
      name: "read_fixture",
      description,
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
            annotations: { readOnlyHint: false },
          },
        ],
      };
    else if (method === "tools/call") {
      calls++;
      result = { content: [{ type: "text", text: "fixture value" }] };
    }
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = http.address() as { port: number };
    store.openFolder("/fixture");
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const job = store.createJob(sessionId, randomUUID(), "Read fixture");
    const member = store.readMembers(projectId, "review")[0];
    const serverId = randomUUID();
    const url = "http://127.0.0.1:" + port + "/mcp";
    const signal = new AbortController().signal;
    await broker.connect(projectId, serverId, "fixture", url);
    expect(store.snapshot().mcpServers[0].tools).toHaveLength(2);
    store.setMcpGrant(projectId, serverId, member.id, "write_fixture", true);
    const writeAccess = broker.modelTools(job, member, signal)!;
    expect(writeAccess.catalog.map(({ name }) => name)).toEqual([
      "write_fixture",
    ]);
    const writeKey = writeAccess.catalog.find(
      ({ name }) => name === "write_fixture",
    )!.key;
    expect(await writeAccess.call(writeKey, { path: "notice.txt" })).toEqual({
      error: "승인 절차 없음",
    });
    expect(calls).toBe(0);
    expect(
      store.snapshot().activity.map(({ text }) => text),
    ).toEqual(expect.arrayContaining([expect.stringContaining("승인 절차 없음")]));

    store.setMcpGrant(projectId, serverId, member.id, "read_fixture", true);
    const access = broker.modelTools(job, member, signal)!;
    expect(access.catalog.map(({ name }) => name)).toEqual([
      "read_fixture",
      "write_fixture",
    ]);
    expect(await access.call(access.catalog[0].key, {})).toMatchObject({
      isError: false,
      data: expect.stringContaining("fixture value"),
    });
    expect(calls).toBe(1);

    const pending = {
      entered: Promise.withResolvers<void>(),
      release: Promise.withResolvers<void>(),
    };
    wait = pending;
    const running = access.call(access.catalog[0].key, {});
    await pending.entered.promise;
    store.setMcpGrant(projectId, serverId, member.id, "read_fixture", false);
    pending.release.resolve();
    expect(await running).toEqual({ error: "현재 도구 권한 없음" });
    expect(calls).toBe(1);

    store.setMcpGrant(projectId, serverId, member.id, "read_fixture", true);
    description = "Changed tool definition";
    expect(await access.call(access.catalog[0].key, {})).toMatchObject({
      error: expect.stringContaining("도구 정의 변경"),
    });
    expect(calls).toBe(1);
    await broker.connect(projectId, serverId, "fixture", url);
    expect(broker.modelTools(job, member, signal)).toBeUndefined();
    store.setMcpGrant(projectId, serverId, member.id, "read_fixture", true);
    store.disconnectMcpEndpoint(projectId, serverId);
    expect(await access.call(access.catalog[0].key, {})).toEqual({
      error: "서버 연결 해제",
    });
    expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("현재 도구 권한 없음"),
        expect.stringContaining("서버 연결 해제"),
      ]),
    );
  } finally {
    wait?.release.resolve();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    store.close();
  }
});
