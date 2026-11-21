import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import type { McpEndpoint, WorkPlan } from "../../../src/shared/actions";
import { CrewStore } from "../../../src/backend/store/store";

function folder() {
  return realpathSync(mkdtempSync(join(tmpdir(), "crew-audit-")));
}

const plan: WorkPlan = {
  path: "notice.txt",
  goal: "문구 변경",
  criterion: "After",
  baseline: null,
};

test("file approvals, tool approvals, model connections and applies are recorded", () => {
  const root = folder();
  const store = new CrewStore(join(root, ".crew.sqlite"));
  try {
    store.openFolder(root);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const job = store.createJob(sessionId, randomUUID(), "문구를 바꿔줘");
    const approval = store.proposeWorkPlan(store.getJob(job.id), plan);

    store.recordJob(job, "approval", "비서 · 수정 승인 요청", plan, approval, undefined, {
      mode: "manual",
    });
    let logs = store.readAuditLogs(projectId);
    expect(logs[0]).toMatchObject({
      event: "file.approval",
      outcome: "requested",
      actor: "비서",
      subject: "notice.txt",
      jobId: job.id,
      sessionId,
    });

    store.recordJob(
      store.getJob(job.id),
      "developing",
      "사용자 · 수정 승인",
      plan,
      approval,
      undefined,
      { id: approval, actor: "사용자", decision: "allow" },
    );
    logs = store.readAuditLogs(projectId);
    expect(logs[0]).toMatchObject({
      event: "file.approval",
      outcome: "allowed",
      actor: "사용자",
      subject: "notice.txt",
    });
    expect(logs[1].outcome).toBe("requested");

    const member = store.readMembers(projectId, "development")[0];
    const server: McpEndpoint = {
      id: randomUUID(),
      name: "노션",
      url: "https://example.com/mcp",
      enabled: true,
      tools: [],
    };
    const tool = store.requestToolApproval(
      store.getJob(job.id),
      member,
      server,
      "pages.update",
      "notice.txt",
      "manual",
    );
    store.answerToolApproval(job.id, tool.id, "사용자", "deny");
    logs = store.readAuditLogs(projectId);
    expect(logs[0]).toMatchObject({
      event: "tool.approval",
      outcome: "denied",
      actor: "사용자",
      subject: "노션/pages.update",
    });
    expect(logs[1]).toMatchObject({
      event: "tool.approval",
      outcome: "requested",
      actor: member.name,
    });

    const connection = randomUUID();
    store.addModelConnection({
      id: connection,
      name: "집 서버",
      provider: "local",
      baseUrl: "http://127.0.0.1:8082/v1",
      model: "qwen",
      enabled: true,
    });
    store.updateModelConnection(connection, { name: "집 서버 2" });
    store.removeModelConnection(connection);
    logs = store.readAuditLogs(projectId);
    expect(
      logs
        .filter(({ event }) => event === "model.connection")
        .map(({ subject, detail }) => [subject, detail]),
    ).toEqual([
      ["집 서버 2", "제거"],
      ["집 서버 2", "수정 · http://127.0.0.1:8082/v1"],
      ["집 서버", "추가 · http://127.0.0.1:8082/v1"],
    ]);

    store.recordApply(job.id, "blocked", "원본에 미커밋 변경이 있어요.");
    logs = store.readAuditLogs(projectId);
    expect(logs[0]).toMatchObject({
      event: "workspace.apply",
      outcome: "blocked",
      actor: "비서",
      detail: "원본에 미커밋 변경이 있어요.",
    });

    expect(store.readAuditLogs(projectId, 2)).toHaveLength(2);
    expect(store.readAuditLogs(randomUUID())).toEqual([]);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a database from the previous version gains the audit table", () => {
  const root = folder();
  const path = join(root, ".crew.sqlite");
  const first = new CrewStore(path);
  first.openFolder(root);
  const projectId = first.snapshot().current!.id;
  first.close();

  // 이전 버전(35 미만)에서 연 데이터베이스를 흉내 낸다.
  const raw = new DatabaseSync(path);
  raw.exec("DROP TABLE audit_logs; PRAGMA user_version = 34;");
  raw.close();

  const store = new CrewStore(path);
  try {
    expect(store.snapshot().current!.id).toBe(projectId);
    store.recordAudit({
      projectId,
      event: "workspace.apply",
      outcome: "applied",
      subject: "crew/abcdefgh",
    });
    expect(store.readAuditLogs(projectId)).toMatchObject([
      { event: "workspace.apply", outcome: "applied", subject: "crew/abcdefgh" },
    ]);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
