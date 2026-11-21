import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "vitest";
import { ActionRunner, actionCatalog, appRead } from "../../../../src/backend/server/app/actions";
import { createAppMcpServer } from "../../../../src/backend/server/app/mcp";
import { CodexConnection } from "../../../../src/backend/server/codex/connection";
import { actions } from "../../../../src/shared/actions";
import { CrewMcp } from "../../../../src/backend/server/mcp/client";
import { CrewStore } from "../../../../src/backend/store/store";
import { CrewWorkflow } from "../../../../src/backend/workflow/workflow";

async function connect(store: CrewStore) {
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  const mcp = new CrewMcp(store);
  const runner = new ActionRunner({ store, workflow, mcp });
  const server = createAppMcpServer(runner);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientTransport);
  return { client, runner, server };
}

test("the MCP catalog covers every user action the screen can run", () => {
  const ids = actionCatalog.map(({ id }) => id).sort();
  const registered = actions.options
    .map((option) => (option.shape.type as { value: string }).value)
    .sort();
  expect(ids).toEqual(registered);
  expect(new Set(ids).size).toBe(ids.length);
  expect(actionCatalog.every(({ inputSchema }) => inputSchema)).toBe(true);
});

test("the helper finds, reads and runs the same actions as the screen", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-appmcp-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const { client } = await connect(store);
    expect((await client.listTools()).tools.map(({ name }) => name).sort()).toEqual(
      ["app_act", "app_find_actions", "app_read"],
    );

    const found = await client.callTool({
      name: "app_find_actions",
      arguments: { query: "workflow" },
    });
    const listed = JSON.parse(String((found.content as { text: string }[])[0].text));
    expect(listed.map(({ id }: { id: string }) => id)).toEqual(
      expect.arrayContaining(["workflow.save", "workflow.select", "workflow.apply"]),
    );

    const read = await client.callTool({ name: "app_read", arguments: {} });
    const state = JSON.parse(String((read.content as { text: string }[])[0].text));
    expect(state).toMatchObject({
      project: { id: projectId, approvalMode: "manual" },
      session: { id: sessionId },
      tabs: ["대화", "로그", "메모리", "워크플로우"],
    });

    const acted = await client.callTool({
      name: "app_act",
      arguments: {
        action: { type: "project.approval", projectId, mode: "always" },
        requestId: randomUUID(),
      },
    });
    expect(JSON.parse(String((acted.content as { text: string }[])[0].text))).toMatchObject(
      { status: "applied", state: { project: { approvalMode: "always" } } },
    );
    expect(store.getProject(projectId).approvalMode).toBe("always");

    const waiting = await client.callTool({
      name: "app_act",
      arguments: { action: { type: "project.pick" } },
    });
    expect(JSON.parse(String((waiting.content as { text: string }[])[0].text))).toMatchObject(
      { status: "waiting" },
    );

    const page = randomUUID();
    const requestId = randomUUID();
    const create = {
      type: "wiki.save",
      sessionId,
      pageId: page,
      version: 0,
      title: "실행 방법",
      body: "npm test",
      links: [],
    };
    const first = await client.callTool({
      name: "app_act",
      arguments: { action: create, requestId },
    });
    expect(JSON.parse(String((first.content as { text: string }[])[0].text))).toMatchObject({
      status: "applied",
    });
    const again = await client.callTool({
      name: "app_act",
      arguments: { action: create, requestId },
    });
    expect(JSON.parse(String((again.content as { text: string }[])[0].text))).toMatchObject({
      status: "applied",
      state: { wiki: [{ id: page, version: 1 }] },
    });
    expect(store.snapshot().wiki[0].version).toBe(1);

    const invalid = await client.callTool({
      name: "app_act",
      arguments: { action: { type: "wiki.save", sessionId, pageId: page } },
    });
    expect(invalid.isError).toBe(true);
    expect(store.snapshot().wiki[0].version).toBe(1);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the helper view reports pending approvals and usage from one state read", () => {
  const store = new CrewStore(":memory:");
  try {
    store.openFolder("/fixture");
    const state = appRead(store);
    expect(state.jobs).toEqual([]);
    expect(state.pendingToolApprovals).toEqual([]);
    expect(state.crew.some(({ roleId, hired }) => roleId === "assistant" && hired)).toBe(
      true,
    );
    expect(state.usage).toEqual([]);
    expect(state.workflows[0]).toMatchObject({ name: "기본 개발 흐름", version: 1 });
  } finally {
    store.close();
  }
});
