import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { roles } from "../../../src/shared/actions";
import { crewInstructions } from "../../../src/shared/crew-definition";
import { requiredTools } from "../../../src/shared/skill-status";
import { defaultSkills } from "../../../src/backend/store/skills";
import { CrewStore } from "../../../src/backend/store/store";

const folder = () => realpathSync(mkdtempSync(join(tmpdir(), "crew-skills-")));

test("every role starts with a default skill that asks for no MCP tool", () => {
  // crew_skills.id is unique across the store, so the project id leads each id.
  expect(new Set(defaultSkills.map(({ id }) => id)).size).toBe(
    defaultSkills.length,
  );
  for (const role of roles)
    expect(defaultSkills.some(({ roleId }) => roleId === role.id)).toBe(true);
  for (const skill of defaultSkills) {
    expect(skill.name.length).toBeGreaterThan(1);
    expect(skill.markdown.length).toBeGreaterThan(40);
    // A backticked server/tool shape would read as an MCP permission wait.
    expect(requiredTools(skill.markdown)).toEqual([]);
  }
});

test("the interface skill reaches both the builder and the style check", () => {
  const design = defaultSkills.filter(({ markdown }) =>
    markdown.includes("one named art direction"),
  );
  expect(design.map(({ roleId }) => roleId).sort()).toEqual([
    "development",
    "style",
  ]);
  for (const skill of design)
    expect(skill.markdown).not.toContain("card inside");
});

test("a new project gets every default skill ready, and a removed one stays gone", () => {
  const root = folder();
  const path = join(root, ".crew.sqlite");
  const store = new CrewStore(path);
  let projectId: string;
  try {
    store.openFolder(root);
    projectId = store.snapshot().current!.id;
    expect(store.listSkills(projectId).map(({ id }) => id)).toEqual(
      defaultSkills.map(({ id }) => projectId + ":" + id),
    );
    expect(
      store.snapshot().skillStates.map(({ state }) => state),
    ).toEqual(defaultSkills.map(() => "ready"));
    // The planted body reaches the role's instruction.
    const development = store.readMembers(projectId, "development")[0];
    expect(
      crewInstructions(development, store.listSkills(projectId)),
    ).toContain("Inline a value, function or wrapper used in one place");
    const coding = store
      .listSkills(projectId)
      .find(({ id }) => id === projectId + ":engineering-principles")!;
    store.removeSkill(projectId, coding.memberId, coding.id);
  } finally {
    store.close();
  }
  const reopened = new CrewStore(path);
  try {
    const ids = reopened.listSkills(projectId).map(({ id }) => id);
    expect(ids).not.toContain(projectId + ":engineering-principles");
    expect(ids).toHaveLength(defaultSkills.length - 1);
  } finally {
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("opening an older store plants the defaults once", () => {
  const root = folder();
  const path = join(root, ".crew.sqlite");
  const store = new CrewStore(path);
  store.openFolder(root);
  const projectId = store.snapshot().current!.id;
  store.close();

  // 38번 스키마(기본 스킬 이전)의 저장본을 흉내 낸다.
  const db = new DatabaseSync(path);
  db.exec("DELETE FROM crew_skills; PRAGMA user_version = 38;");
  db.close();

  const upgraded = new CrewStore(path);
  try {
    expect(upgraded.listSkills(projectId)).toHaveLength(defaultSkills.length);
  } finally {
    upgraded.close();
    rmSync(root, { recursive: true, force: true });
  }
});
