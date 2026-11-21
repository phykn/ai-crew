import { expect, test } from "vitest";
import { roles, type CrewMember } from "./actions";
import { crewInstructions } from "./crew-definition";
import { wikiReference } from "./wiki-reference";

const member = (role: "assistant" | "docs" | "development"): CrewMember => ({
  id: role,
  roleId: role,
  name: "테스트",
  provider: "local",
  hired: true,
});

const digest = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "실행 방법",
  version: 2,
  body: "npm run check && npm test",
  links: [],
};

test("모든 역할의 지침이 프로젝트 위키 목차를 함께 받는다", () => {
  for (const role of roles) {
    const instructions = crewInstructions(
      { ...member("assistant"), id: role.id, roleId: role.id },
      [],
      [],
      wikiReference([digest], "검사 실행"),
    );
    expect(instructions).toContain("프로젝트 위키");
    expect(instructions).toContain("실행 방법");
    // 요청과 겹치는 문서는 본문까지 들어간다.
    expect(instructions).toContain("npm run check && npm test");
  }
});

test("위키가 비어 있어도 남기는 지침은 남는다", () => {
  const instructions = crewInstructions(
    member("docs"),
    [],
    [],
    wikiReference([], ""),
  );
  expect(instructions).toContain("아직 문서가 없습니다");
  expect(instructions).toContain("wiki_save");
  expect(instructions).toContain("위키 도구");
});

test("비서와 문서 역할 지침에 위키 축적이 적혀 있다", () => {
  const assistant = roles.find(({ id }) => id === "assistant")!;
  const docs = roles.find(({ id }) => id === "docs")!;
  expect(assistant.prompt).toContain("프로젝트 위키에 남겨");
  expect(docs.prompt).toContain("프로젝트 위키에 남겨");
});
