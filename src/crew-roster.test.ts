import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import {
  roleSkillNames,
  roles,
  type RoleId,
  type WorkflowGraph,
} from "./actions";
import { ActionRunner } from "./app-actions";
import { CodexConnection } from "./codex";
import { crewDefinition } from "./crew-definition";
import { CrewMcp } from "./mcp";
import { CrewStore } from "./store";
import { defaultGraph } from "./workflow-graph";
import { CrewWorkflow } from "./workflow";

const folder = () => realpathSync(mkdtempSync(join(tmpdir(), "crew-roster-")));

test("비서와 여덟 역할이 각자의 스킬과 트리거를 데이터로 갖는다", () => {
  expect(roles.map(({ id }) => id)).toEqual([
    "assistant",
    "hr",
    "development",
    "build",
    "docs",
    "style",
    "review",
    "test",
    "vision",
  ]);
  // 화면에서 캐릭터가 겹치지 않도록 스프라이트와 역할색은 1:1이다.
  expect(new Set(roles.map(({ sprite }) => sprite)).size).toBe(9);
  expect(new Set(roles.map(({ color }) => color)).size).toBe(9);
  for (const role of roles) {
    expect(role.prompt.length).toBeGreaterThan(10);
    expect(role.trigger.length).toBeGreaterThan(2);
    expect(role.skills.length).toBeGreaterThan(0);
    expect(roleSkillNames(role.id).length).toBe(role.skills.length);
  }
  const skillOf = (id: RoleId) => roles.find((role) => role.id === id)!.skills;
  expect(skillOf("style")).toEqual(["code", "docs"]);
  expect(skillOf("review")).toEqual(["code", "docs"]);
  expect(skillOf("test")).toEqual(["test"]);
  expect(skillOf("vision")).toEqual(["image"]);
  // 사용자와 대화하는 창구는 비서 하나다.
  expect(
    roles.filter((role) => (role.skills as readonly string[]).includes("chat")),
  ).toHaveLength(1);
});

test("역할 지침은 스킬·트리거와 대화 금지 규칙을 담는다", () => {
  const style = crewDefinition("style");
  expect(style).toContain("파일이 바뀔 때마다");
  expect(style).toContain("비서에게 보고");
  expect(style).toContain("- 스킬: 코드, 문서");
  const assistant = crewDefinition("assistant");
  expect(assistant).toContain("유일한 창구");
  expect(assistant).not.toContain("사용자와 직접 대화하지 않습니다");
});

test("기본 워크플로우 단계는 남아 있는 역할만 쓴다", () => {
  const graph: WorkflowGraph = defaultGraph();
  const ids = new Set(roles.map(({ id }) => id));
  for (const stage of graph.stages)
    expect(ids.has(stage.roleId)).toBe(true);
  expect(graph.stages.find(({ id }) => id === "plan")?.roleId).toBe("assistant");
});

test("인사가 크루를 내보내고 다시 뽑으면 로스터와 감사 기록에 남는다", async () => {
  const root = folder();
  const store = new CrewStore(join(root, ".crew.sqlite"));
  const runner = new ActionRunner({
    store,
    workflow: new CrewWorkflow(store, new CodexConnection(), () => {}),
    mcp: new CrewMcp(store),
  });
  try {
    store.openFolder(root);
    const projectId = store.snapshot().current!.id;
    expect(store.readMembers(projectId)).toHaveLength(9);

    await runner.run({ type: "crew.fire", projectId, memberId: "hr" });
    const fired = store.readMembers(projectId).find(({ id }) => id === "hr")!;
    expect(fired.hired).toBe(false);
    expect(store.readMembers(projectId)).toHaveLength(9);
    expect(store.readAuditLogs(projectId)[0]).toMatchObject({
      event: "crew.roster",
      actor: "인사",
      detail: "해고 · hr",
    });

    await runner.run({
      type: "crew.hire",
      projectId,
      roleId: "hr",
      name: "새 인사",
      provider: "codex",
    });
    // 이미 고용 중이면 아무것도 바뀌지 않으므로 기록도 남기지 않는다.
    await runner.run({ type: "crew.hire", projectId, roleId: "vision" });
    expect(store.readAuditLogs(projectId)[0].detail).toBe("채용 · hr");
    await runner.run({ type: "crew.fire", projectId, memberId: "vision" });
    await runner.run({ type: "crew.hire", projectId, roleId: "vision" });
    const roster = store.readMembers(projectId);
    expect(roster.find(({ id }) => id === "hr")).toMatchObject({
      hired: true,
      name: "새 인사",
      provider: "codex",
    });
    expect(roster.find(({ id }) => id === "vision")?.hired).toBe(true);
    expect(
      store
        .readAuditLogs(projectId)
        .slice(0, 4)
        .map(({ detail }) => detail),
    ).toEqual(["채용 · vision", "해고 · vision", "채용 · hr", "해고 · hr"]);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("예전 저장본의 plan 역할은 비서로 옮겨 그대로 열린다", () => {
  const root = folder();
  const database = join(root, ".crew.sqlite");
  const store = new CrewStore(database);
  store.openFolder(root);
  const projectId = store.snapshot().current!.id;
  store.close();

  // 35번 스키마에서 쓰던 흔적을 남긴다: plan 역할의 크루와 워크플로우 단계.
  const db = new DatabaseSync(database);
  db.exec("PRAGMA foreign_keys = ON;");
  db.prepare(
    "INSERT INTO crew (project_id, role, provider, hired, name) VALUES (?, 'plan', 'local', 1, '가람')",
  ).run(projectId);
  const graph = defaultGraph();
  graph.stages.find(({ id }) => id === "plan")!.roleId = "plan" as RoleId;
  db.prepare(
    "INSERT INTO workflows (id, project_id, name, created_at) VALUES ('wf-old', ?, '예전 흐름', ?)",
  ).run(projectId, new Date().toISOString());
  db.prepare(
    "INSERT INTO workflow_versions (workflow_id, version, graph, author, saved_at) VALUES ('wf-old', 1, ?, '사용자', ?)",
  ).run(JSON.stringify(graph), new Date().toISOString());
  db.exec("PRAGMA user_version = 35;");
  db.close();

  const reopened = new CrewStore(database);
  try {
    const version = reopened.getWorkflowVersion("wf-old", 1)!;
    expect(version.graph.stages.find(({ id }) => id === "plan")?.roleId).toBe(
      "assistant",
    );
    expect(reopened.getWorkflowVersion("wf-old", 1)!.graph.stages).toHaveLength(
      graph.stages.length,
    );
    expect(
      reopened
        .readMembers(projectId)
        .filter(({ roleId }) => (roleId as string) === "plan"),
    ).toEqual([]);
  } finally {
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  }
});
