import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ActionRunner, appRead } from "./app-actions";
import { CodexConnection } from "./codex";
import { CrewMcp } from "./mcp";
import { CrewStore } from "./store";
import { CrewWorkflow } from "./workflow";

test("the screen state lives in the app store, per session", () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-view-")));
  try {
    let store = new CrewStore(join(folder, ".crew.sqlite"));
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    expect(store.snapshot().view).toEqual({
      tab: "chat",
      camp: false,
      legend: false,
      panelWidth: 340,
      logJobId: null,
      memorySection: "memory",
      memoryOwnerId: null,
    });
    const job = store.createJob(sessionId, randomUUID(), "화면을 고쳐줘");
    store.setViewState(sessionId, {
      tab: "log",
      camp: true,
      legend: true,
      panelWidth: 420,
      logJobId: job.id,
      memorySection: "wiki",
      memoryOwnerId: store.readMembers(projectId, "review")[0].id,
    });
    expect(store.snapshot().view).toMatchObject({
      tab: "log",
      camp: true,
      legend: true,
      panelWidth: 420,
      logJobId: job.id,
      memorySection: "wiki",
    });
    expect(() =>
      store.setViewState(sessionId, { logJobId: randomUUID() }),
    ).toThrow("이 대화의 업무를 선택해 주세요");
    expect(() =>
      store.setViewState(sessionId, { memoryOwnerId: randomUUID() }),
    ).toThrow("이 프로젝트의 담당자를 선택해 주세요");

    store.newSession(projectId);
    const fresh = store.snapshot().session!;
    expect(fresh.id).not.toBe(sessionId);
    expect(store.snapshot().view.tab).toBe("chat");
    store.openSession(sessionId);
    expect(store.snapshot().view).toMatchObject({ tab: "log", panelWidth: 420 });
    store.close();

    store = new CrewStore(join(folder, ".crew.sqlite"));
    store.openFolder(folder);
    expect(store.snapshot().view).toMatchObject({
      tab: "log",
      camp: true,
      panelWidth: 420,
      logJobId: job.id,
    });
    store.close();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("cancelling the folder picker keeps the same state for the screen and the helper", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-pick-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const before = store.snapshot();
    const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    const ui = new ActionRunner({
      store,
      workflow,
      mcp: new CrewMcp(store),
      pickFolder: async () => null,
    });
    const outcome = await ui.run({ type: "project.pick" });
    expect(outcome.status).toBe("applied");
    expect(store.snapshot().projects).toEqual(before.projects);
    expect(store.snapshot().current?.id).toBe(before.current?.id);
    const helper = await ui.run({ type: "project.pick" }, "app");
    expect(helper.status).toBe("waiting");
    expect(store.snapshot().projects).toEqual(before.projects);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the helper can read and change the same screen state", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-viewapp-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const sessionId = store.snapshot().session!.id;
    const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    const runner = new ActionRunner({
      store,
      workflow,
      mcp: new CrewMcp(store),
    });
    expect(appRead(store).view.tab).toBe("chat");
    const outcome = await runner.run(
      {
        type: "view.set",
        sessionId,
        patch: { tab: "workflow", camp: true, panelWidth: 512 },
      },
      "app",
      randomUUID(),
    );
    expect(outcome.status).toBe("applied");
    expect(appRead(store).view).toMatchObject({
      tab: "workflow",
      camp: true,
      panelWidth: 512,
    });
    await expect(
      runner.run({ type: "view.set", sessionId, patch: { panelWidth: 900 } }),
    ).rejects.toThrow();
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
