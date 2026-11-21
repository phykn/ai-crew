import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { roles } from "./actions";
import { crewInstructions } from "./crew-definition";
import { requiredTools } from "./skill-status";
import { defaultSkills } from "./skills";
import { CrewStore } from "./store";

const folder = () => realpathSync(mkdtempSync(join(tmpdir(), "crew-skills-")));

test("모든 역할에 기본 스킬이 있고, MCP 도구 권한을 요구하지 않는다", () => {
  // crew_skills.id는 저장본 전체에서 하나뿐이라 프로젝트 id가 앞에 붙는다.
  expect(new Set(defaultSkills.map(({ id }) => id)).size).toBe(
    defaultSkills.length,
  );
  for (const role of roles)
    expect(defaultSkills.some(({ roleId }) => roleId === role.id)).toBe(true);
  for (const skill of defaultSkills) {
    expect(skill.name.length).toBeGreaterThan(1);
    expect(skill.markdown.length).toBeGreaterThan(40);
    // 백틱 안에 server/tool 모양을 쓰면 skill-status가 MCP 권한 대기로 읽는다.
    expect(requiredTools(skill.markdown)).toEqual([]);
  }
});

test("새 프로젝트에 기본 스킬이 배정되어 준비 상태로 뜨고, 해제하면 돌아오지 않는다", () => {
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
    // 배정된 스킬 문장이 그 역할의 지침에 함께 들어간다.
    const development = store.readMembers(projectId, "development")[0];
    expect(
      crewInstructions(development, store.listSkills(projectId)),
    ).toContain("한 곳에서만 쓰는 값·함수·래퍼는 그 자리에 인라인한다");
    const coding = store
      .listSkills(projectId)
      .find(({ id }) => id === projectId + ":groove-coding")!;
    store.removeSkill(projectId, coding.memberId, coding.id);
  } finally {
    store.close();
  }
  const reopened = new CrewStore(path);
  try {
    const ids = reopened.listSkills(projectId).map(({ id }) => id);
    expect(ids).not.toContain(projectId + ":groove-coding");
    expect(ids).toHaveLength(defaultSkills.length - 1);
  } finally {
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("예전 저장본을 열면 이미 있는 프로젝트에 기본 스킬을 한 번 심는다", () => {
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
