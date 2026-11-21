import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ActionRunner, actionCatalog, appRead } from "./actions";
import { CodexConnection } from "../codex/connection";
import { localTarget, setLocalConnection } from "../chat/local";
import { CrewMcp } from "../mcp/client";
import { CrewStore } from "../../store/store";
import { CrewWorkflow } from "../../workflow/workflow";

test("model connections are added, paused, changed and removed through the same runner", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-model-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const applied: string[][] = [];
    let quit = 0;
    const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    const runner = new ActionRunner({
      store,
      workflow,
      mcp: new CrewMcp(store),
      applyModelConnections: (connections) =>
        applied.push(connections.map(({ name }) => name)),
      quit: () => quit++,
    });
    const id = randomUUID();
    expect(
      (
        await runner.run({
          type: "model.add",
          id,
          name: "집 Qwen",
          provider: "local",
          baseUrl: "http://127.0.0.1:8082/v1",
          model: "qwen3",
          enabled: true,
        })
      ).status,
    ).toBe("applied");
    expect(store.snapshot().modelConnections).toMatchObject([
      { id, name: "집 Qwen", provider: "local", model: "qwen3", enabled: true },
    ]);
    expect(applied).toEqual([["집 Qwen"]]);

    await runner.run({ type: "model.update", id, enabled: false });
    expect(store.snapshot().modelConnections[0].enabled).toBe(false);
    // 그림도 읽는 연결은 비전으로 표시해 두고, 비전(수아)이 그 연결을 쓴다.
    expect(store.snapshot().modelConnections[0].vision).toBe(false);
    await runner.run({ type: "model.update", id, vision: true });
    expect(store.snapshot().modelConnections[0].vision).toBe(true);
    await runner.run({ type: "model.update", id, vision: false });
    expect(() =>
      store.addModelConnection({
        id: randomUUID(),
        name: "자격증명",
        provider: "local",
        baseUrl: "http://user:pass@127.0.0.1:8082/v1",
        model: null,
        enabled: true,
      }),
    ).toThrow("인증값을 포함하지 않은");
    expect(() =>
      store.addModelConnection({
        id: randomUUID(),
        name: "주소 없음",
        provider: "local",
        baseUrl: null,
        model: null,
        enabled: true,
      }),
    ).toThrow("OpenAI 호환 주소");

    await runner.run({ type: "model.remove", id });
    expect(store.snapshot().modelConnections).toEqual([]);
    expect(applied.at(-1)).toEqual([]);
    await expect(
      runner.run({ type: "model.remove", id }),
    ).rejects.toThrow("모델 연결을 찾을 수 없어요");

    await runner.run({ type: "app.quit" });
    expect(quit).toBe(1);
    expect(
      store.snapshot().activity.map(({ text }) => text),
    ).toEqual(expect.arrayContaining([expect.stringContaining("앱 종료 요청")]));
    expect(actionCatalog.map(({ id: actionId }) => actionId)).toEqual(
      expect.arrayContaining(["model.add", "model.update", "model.remove", "app.quit"]),
    );
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("a saved local connection replaces the environment default for runs", () => {
  const previous = {
    url: process.env.AI_CREW_LOCAL_URL,
    model: process.env.AI_CREW_LOCAL_MODEL,
  };
  try {
    delete process.env.AI_CREW_LOCAL_URL;
    delete process.env.AI_CREW_LOCAL_MODEL;
    setLocalConnection(null);
    expect(localTarget()).toEqual({
      baseUrl: "http://127.0.0.1:8082/v1",
      model: undefined,
    });
    setLocalConnection({ baseUrl: "http://127.0.0.1:9000/v1/", model: "qwen" });
    expect(localTarget()).toEqual({
      baseUrl: "http://127.0.0.1:9000/v1",
      model: "qwen",
    });
  } finally {
    setLocalConnection(null);
    if (previous.url) process.env.AI_CREW_LOCAL_URL = previous.url;
    if (previous.model) process.env.AI_CREW_LOCAL_MODEL = previous.model;
  }
  expect(appRead(new CrewStore(":memory:")).modelConnections).toEqual([]);
});
