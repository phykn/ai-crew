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

test("every role's instructions carry the project wiki contents", () => {
  for (const role of roles) {
    const instructions = crewInstructions(
      { ...member("assistant"), id: role.id, roleId: role.id },
      [],
      [],
      wikiReference([digest], "검사 실행"),
    );
    expect(instructions).toContain("Project wiki");
    expect(instructions).toContain("실행 방법");
    // 요청과 겹치는 문서는 본문까지 들어간다.
    expect(instructions).toContain("npm run check && npm test");
  }
});

test("an empty wiki still keeps the instruction to write one", () => {
  const instructions = crewInstructions(
    member("docs"),
    [],
    [],
    wikiReference([], ""),
  );
  expect(instructions).toContain("There are no pages yet");
  expect(instructions).toContain("wiki_save");
  expect(instructions).toContain("the wiki tools");
});

test("the assistant and docs instructions say to build up the wiki", () => {
  const assistant = roles.find(({ id }) => id === "assistant")!;
  const docs = roles.find(({ id }) => id === "docs")!;
  expect(assistant.prompt).toContain("in the project wiki");
  expect(docs.prompt).toContain("in the project wiki");
});
