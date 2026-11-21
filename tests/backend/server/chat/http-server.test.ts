import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { ChatEvent } from "../../../../src/shared/actions";
import { ActionRunner } from "../../../../src/backend/server/app/actions";
import { CodexConnection } from "../../../../src/backend/server/codex/connection";
import { createCrewHttpServer } from "../../../../src/backend/server/chat/http-server";
import { CrewMcp } from "../../../../src/backend/server/mcp/client";
import { CrewStore } from "../../../../src/backend/store/store";
import { CrewWorkflow } from "../../../../src/backend/workflow/workflow";

type Listener = (event: ChatEvent | null) => void;

function setup() {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-http-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  store.openFolder(folder);
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  const mcp = new CrewMcp(store);
  const runner = new ActionRunner({ store, workflow, mcp });
  const listeners = new Set<Listener>();
  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const publish = (event: ChatEvent | null) => {
    for (const listener of listeners) listener(event);
  };
  return { folder, store, runner, subscribe, publish, listeners };
}

/** 스트림에서 다음 조각이 올 때까지 기다린다. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  matches: (text: string) => boolean,
  timeoutMs = 3000,
) {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  while (!matches(text)) {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error("시간 안에 받지 못했어요: " + JSON.stringify(text));
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("시간 초과: " + JSON.stringify(text))), left),
      ),
    ]);
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}

test("the local server answers health, snapshot and actions behind a token", async () => {
  const { folder, store, runner, subscribe } = setup();
  const server = await createCrewHttpServer({
    runner,
    subscribe,
    token: "test-token",
  });
  try {
    expect(server.url).toBe("http://127.0.0.1:" + server.port);

    const health = await fetch(server.url + "/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, name: "ai-crew" });

    const denied = await fetch(server.url + "/api/snapshot");
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toBe("Bearer");

    const auth = { authorization: "Bearer test-token" };
    const snapshot = await fetch(server.url + "/api/snapshot", { headers: auth });
    expect(snapshot.status).toBe(200);
    const state = (await snapshot.json()) as { current: { id: string } };
    const projectId = state.current.id;
    expect(projectId).toBe(store.snapshot().current!.id);

    const acted = await fetch(server.url + "/api/action", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ type: "project.approval", projectId, mode: "auto" }),
    });
    expect(acted.status).toBe(200);
    const outcome = (await acted.json()) as { status: string; state: { current: { approvalMode: string } } };
    expect(outcome.status).toBe("applied");
    expect(outcome.state.current.approvalMode).toBe("auto");
    expect(store.getProject(projectId).approvalMode).toBe("auto");

    const invalid = await fetch(server.url + "/api/action", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ type: "project.approval", projectId }),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toHaveProperty("error");

    const missing = await fetch(server.url + "/api/nothing", { headers: auth });
    expect(missing.status).toBe(404);
    const wrongMethod = await fetch(server.url + "/api/snapshot", {
      method: "POST",
      headers: auth,
    });
    expect(wrongMethod.status).toBe(405);
  } finally {
    await server.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the event stream sends a heartbeat and the app's updates", async () => {
  const { folder, store, runner, subscribe, publish, listeners } = setup();
  const server = await createCrewHttpServer({
    runner,
    subscribe,
    token: "stream-token",
    heartbeatMs: 40,
  });
  const controller = new AbortController();
  try {
    const response = await fetch(
      server.url + "/api/events?token=stream-token",
      { signal: controller.signal },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    let text = await readUntil(reader, (chunk) => chunk.includes("event: ready"));
    expect(text).toContain("retry: 3000");
    expect(listeners.size).toBe(1);

    text = await readUntil(reader, (chunk) => chunk.includes(": ping"));
    expect(text).not.toContain("event: delta");

    publish({ sessionId: randomUUID(), responseId: randomUUID(), delta: "안녕" });
    text = await readUntil(reader, (chunk) => chunk.includes("event: delta"));
    expect(text).toContain('"delta":"안녕"');

    publish(null);
    text = await readUntil(reader, (chunk) => chunk.includes("event: change"));
    expect(text).toContain("event: change");

    controller.abort();
    reader.cancel().catch(() => {});
    await vi.waitFor(() => expect(listeners.size).toBe(0));
  } finally {
    controller.abort();
    await server.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the stream needs the token and a closed server releases its listeners", async () => {
  const { folder, store, runner, subscribe, listeners } = setup();
  const server = await createCrewHttpServer({ runner, subscribe, token: "t" });
  try {
    const denied = await fetch(server.url + "/api/events");
    expect(denied.status).toBe(401);
    expect(listeners.size).toBe(0);

    const response = await fetch(server.url + "/api/events", {
      headers: { authorization: "Bearer t" },
    });
    const reader = response.body!.getReader();
    await readUntil(reader, (chunk) => chunk.includes("event: ready"));
    expect(listeners.size).toBe(1);
  } finally {
    await server.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

