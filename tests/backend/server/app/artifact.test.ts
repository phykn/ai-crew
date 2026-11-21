import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ActionRunner, appRead } from "../../../../src/backend/server/app/actions";
import { CodexConnection } from "../../../../src/backend/server/codex/connection";
import { CrewMcp } from "../../../../src/backend/server/mcp/client";
import { CrewStore } from "../../../../src/backend/store/store";
import { CrewWorkflow } from "../../../../src/backend/workflow/workflow";

test("artifacts keep the change ID, survive a restart and stay readable from the helper", () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-artifact-")));
  const database = join(mkdtempSync(join(tmpdir(), "crew-db-")), "crew.sqlite");
  try {
    let store = new CrewStore(database);
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    writeFileSync(join(folder, "notice.txt"), "Before\n");
    const job = store.createJob(sessionId, randomUUID(), "문구를 고쳐줘");
    const plan = {
      path: "notice.txt",
      goal: "문구 변경",
      criterion: "After",
      baseline: createHash("sha256").update("Before\n").digest("hex"),
    };
    store.recordJob(job, "developing", "개발 시작", plan);
    const changeId = store.prepareChange(
      store.getJob(job.id),
      "notice.txt",
      { hash: plan.baseline, content: "Before\n" },
      {
        hash: createHash("sha256").update("After\n").digest("hex"),
        content: "After\n",
      },
    );
    store.confirmChange(store.getJob(job.id), changeId, createHash("sha256").update("After\n").digest("hex"));
    const [artifact] = store.snapshot().artifacts;
    expect(artifact).toMatchObject({
      id: changeId,
      changeId,
      jobId: job.id,
      name: "notice.txt",
      kind: "file",
      path: "notice.txt",
    });
    expect(appRead(store).artifacts).toEqual([artifact]);
    expect(store.getArtifact(projectId, changeId)).toEqual(artifact);
    store.close();

    store = new CrewStore(database);
    store.openFolder(folder);
    expect(store.snapshot().artifacts).toEqual([artifact]);
    expect(store.listArtifacts(projectId)).toEqual([artifact]);
    store.close();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("one event makes one notification and reading it keeps the job link", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-notify-")));
  const store = new CrewStore(join(mkdtempSync(join(tmpdir(), "crew-db-")), "crew.sqlite"));
  try {
    store.openFolder(folder);
    const sessionId = store.snapshot().session!.id;
    const job = store.createJob(sessionId, randomUUID(), "문구를 고쳐줘");
    const approval = randomUUID();
    store.recordJob(
      store.getJob(job.id),
      "approval",
      "계획 → 비서 · notice.txt",
      { path: "notice.txt", goal: "문구 변경", criterion: "After", baseline: null },
      approval,
    );
    store.recordJob(
      store.getJob(job.id),
      "approval",
      "계획 → 비서 · notice.txt",
      { path: "notice.txt", goal: "문구 변경", criterion: "After", baseline: null },
      approval,
    );
    const approvalNotes = store
      .snapshot()
      .notifications.filter(({ kind }) => kind === "approval");
    expect(approvalNotes).toHaveLength(1);
    expect(approvalNotes[0]).toMatchObject({
      jobId: job.id,
      approvalId: approval,
      kind: "approval",
      readAt: null,
    });
    store.recordJob(store.getJob(job.id), "complete", "완료", undefined, null, "다 됐어요.");
    store.recordJob(store.getJob(job.id), "complete", "완료", undefined, null, "다 됐어요.");
    const report = store
      .snapshot()
      .notifications.find(({ kind }) => kind === "report");
    expect(report?.jobId).toBe(job.id);
    expect(
      store.snapshot().notifications.filter(({ kind }) => kind === "report"),
    ).toHaveLength(1);

    const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    const runner = new ActionRunner({ store, workflow, mcp: new CrewMcp(store) });
    await runner.run({
      type: "notification.read",
      sessionId,
      notificationId: report!.id,
    });
    expect(
      store.snapshot().notifications.find(({ id }) => id === report!.id)?.readAt,
    ).toBeTruthy();
    await expect(
      runner.run({
        type: "notification.read",
        sessionId,
        notificationId: randomUUID(),
      }),
    ).rejects.toThrow("이 대화의 알림이 아니에요");
    expect(appRead(store).notifications).toHaveLength(2);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
