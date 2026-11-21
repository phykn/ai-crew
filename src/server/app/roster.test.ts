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
} from "../../shared/actions";
import { ActionRunner } from "./actions";
import { CodexConnection } from "../codex/connection";
import { crewDefinition } from "../../shared/crew-definition";
import { CrewMcp } from "../mcp/client";
import { CrewStore } from "../../store/store";
import { defaultGraph } from "../../workflow/graph";
import { verificationPrompt } from "../../workflow/prompts";
import { CrewWorkflow } from "../../workflow/workflow";

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

test("a role definition carries its skills, its trigger and the no-chat rule", () => {
  const style = crewDefinition("style");
  expect(style).toContain("every time a file is saved");
  expect(style).toContain("report the file, the line and the evidence to the assistant");
  expect(style).toContain("- Skills: 코드, 문서");
  const assistant = crewDefinition("assistant");
  expect(assistant).toContain("only channel between the user and the crew");
  expect(assistant).not.toContain("You do not talk to the user directly");
});

test("role instructions keep the working rules: fix the cause, facts and suggestions, fast tests", () => {
  const prompt = (id: RoleId) => roles.find((role) => role.id === id)!.prompt;
  // The assistant decides the reversible things itself, hands over four cases, reports numbers.
  expect(prompt("assistant")).toContain("exactly four reasons");
  expect(prompt("assistant")).toContain("changed lines, functions and files");
  // Development: called-only code, linear flow, a one-line why, the fix at the source contract.
  expect(prompt("development")).toContain("name its callers");
  expect(prompt("development")).toContain("one-line comment");
  expect(prompt("development")).toContain("source contract");
  // Docs, review, test, build and vision keep each skill's core rule.
  expect(prompt("docs")).toContain("Put the conclusion first");
  expect(prompt("review")).toContain("a fact you confirmed");
  expect(prompt("review")).toContain("a suggestion you recommend");
  expect(prompt("test")).toContain("small double");
  expect(prompt("test")).toContain("regression test");
  expect(prompt("build")).toContain("cheapest check");
  expect(prompt("vision")).toContain("never fill in what is not visible");
  // The verification stage prompt picks the cheapest check.
  expect(verificationPrompt).toContain("cheapest check");
});

test("the user's UX and architecture preferences are built into the roles that produce work", () => {
  const prompt = (id: RoleId) => roles.find((role) => role.id === id)!.prompt;
  // Preference 2: an interface usable without a manual, direct manipulation, flat pastel.
  for (const id of ["assistant", "development", "review", "docs"] as RoleId[]) {
    expect(prompt(id)).toMatch(/without (reading |opening )?a manual/);
    expect(prompt(id)).toMatch(/direct manipulation|in the order a person takes them/);
  }
  // Preference 3: folder boundaries, non-redundant names, a one-line why, a fix at the source.
  for (const id of ["development", "review", "style"] as RoleId[]) {
    expect(prompt(id)).toMatch(/folders/);
    expect(prompt(id)).toMatch(/prefix/);
  }
});

test("every role keeps its own sprite, matching the picture order on screen", () => {
  // `roles[].sprite` indexes the `sprites` array in `src/ui/common/ui.tsx`.
  expect(
    roles.map(({ id, sprite }) => [id, sprite]),
  ).toEqual([
    ["assistant", 0],
    ["hr", 4],
    ["development", 1],
    ["build", 5],
    ["docs", 6],
    ["style", 3],
    ["review", 2],
    ["test", 7],
    ["vision", 8],
  ]);
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
