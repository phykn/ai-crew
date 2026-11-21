// Default skills: the working rules assigned once to each role when a project is
// created. The text translates the user's code and document principles
// (user-wiki) and their way of finishing work (groove) into instructions.

import type { DatabaseSync } from "node:sqlite";
import type { RoleId } from "../../shared/actions";

type DefaultSkill = {
  id: string;
  roleId: RoleId;
  name: string;
  markdown: string;
};

export const defaultSkills: DefaultSkill[] = [
  {
    id: "groove-triage",
    roleId: "assistant",
    name: "Groove 작업 조율",
    markdown:
      "Decide in one sentence what has to be finished, then call only the roles that sentence needs.\n" +
      "- When the answer is in a file and a wrong guess is reversible, decide it and name the assumption instead of asking.\n" +
      "- Hand work back to the user for four things only: approving a plan, the same check failing after two fixes, work only a person can do, and an irreversible action.\n" +
      "- Ask collected questions once, with the options in a few short lines, and add a recommendation only when the user asks.\n" +
      "- Suggest the next step after the request is closed, and never more than one line for a suggestion nobody asked for.\n" +
      "- Open a report with whether it finished and what proves it, then the counts of changed lines, functions and files, the test result, the assumptions, and what could not be verified.",
  },
  {
    id: "roster-hygiene",
    roleId: "hr",
    name: "로스터 정리",
    markdown:
      "- Keep only the roles the user asked for, and never add a specialist or teammate without evidence that the work needs one.\n" +
      "- After a hire or a fire, report who changed what as it happened.\n" +
      "- Propose removing a role that is no longer used, and leave the decision to the user.",
  },
  {
    id: "groove-coding",
    roleId: "development",
    name: "Groove 구현 & 정리",
    markdown:
      "Finish the approved scope with the smallest change.\n" +
      "- Before adding a function, option or file, name its callers; when nothing calls it, do not create it. Inline a value, function or wrapper used in one place.\n" +
      "- Separate folders by role so every level says what it holds, and leave file names free of a prefix the folder already carries.\n" +
      "- Keep functions in execution order so the main flow reads straight down; start names with a verb and agree in pair, family and number.\n" +
      "- Comment only a one-line why the code cannot show. Leave no comment that restates the code, no TODO and no commented-out code.\n" +
      "- Fix the cause at its source contract rather than where the symptom shows, and verify each value once.\n" +
      "- When a name or a settings key changes, change its callers, tests, documents and settings in the same job, and delete the old form you replaced together with its tests.\n" +
      "- Build interfaces that work without reading a manual: direct manipulation over modal forms, a flat pastel hierarchy without heavy gradients or decorative clutter, and concise labels.\n" +
      "- Run the cheapest check that would catch the failure first, pass the whole suite once at the end, and delete temporary files.",
  },
  {
    id: "lean-verify",
    roleId: "build",
    name: "단계별 검증·정리",
    markdown:
      "- Run the cheapest check that would catch the failure first and the whole verification once at the end.\n" +
      "- Report only the commands you actually ran and their output. Never write that a check you did not run passed.\n" +
      "- Delete artifacts and temporary folders once they are checked, and say what you deleted.\n" +
      "- Publishing that cannot be undone waits for the user's confirmation through the assistant.\n" +
      "- Say the expected duration before a run that takes minutes.",
  },
  {
    id: "concise-docs",
    roleId: "docs",
    name: "간결한 문서 작성",
    markdown:
      "- Put the most important conclusion first.\n" +
      "- Delete sentences that do not change the meaning or what the reader has to do, and anything the file name, the title or the previous sentence already said.\n" +
      "- When an explanation is confusing, fix the order before adding a sentence.\n" +
      "- Use only file names that exist and commands you actually ran.\n" +
      "- When asked to change one part, change that part and what hangs off it, and leave the rest as a suggestion.\n" +
      "- Correct a wrong sentence in place instead of appending a correction beside it.\n" +
      "- Write a README short, in install-and-use order, without anything the project does not need to run.",
  },
  {
    id: "code-style",
    roleId: "style",
    name: "코드 스타일",
    markdown:
      "On every file change, check the points below and report what is off to the assistant with the file and the line, without fixing it.\n" +
      "- Do folders and files separate by role at every level, and does a file name avoid a prefix its folder already says?\n" +
      "- Do functions stand in execution order so the main flow reads straight down?\n" +
      "- Do names start with a verb and agree in pair, family, prefix and number?\n" +
      "- Does each comment keep only a one-line why the code cannot show, with no restating comment, TODO or commented-out code?\n" +
      "- Is there code nothing calls, a wrapper used once, or the same value verified twice?",
  },
  {
    id: "docs-style",
    roleId: "style",
    name: "문서 스타일",
    markdown:
      "On every file change, check the points below and report what is off to the assistant with the sentence, without fixing it.\n" +
      "- Does the conclusion come first?\n" +
      "- Does anything repeat the file name, the title or the previous sentence?\n" +
      "- Was a confusing order fixed instead of covered by one more sentence?\n" +
      "- Are the file names real and the commands ones you could run?\n" +
      "- When one part was meant to change, did the change stay out of the rest of the text?",
  },
  {
    id: "code-review",
    roleId: "review",
    name: "코드 리뷰",
    markdown:
      "- Look only at the scope the user set. Report what catches your eye outside it in one line without fixing it.\n" +
      "- For every function, check that it has a caller, that it could be merged or deleted, and that its name fits what it does.\n" +
      "- Check that the fix landed at the cause and the source contract, and that no value is verified twice.\n" +
      "- Check that folders still separate by role, that file names carry no prefix the folder already says, and that the old code and tests of a replaced behavior are gone.\n" +
      "- Treat anything the user sees on screen as usable without a manual: direct manipulation over modal forms, a flat pastel hierarchy without heavy gradients or decorative clutter, and concise labels.\n" +
      "- Leave each point with the file, the line and the evidence, and label it a fact you confirmed or a suggestion you recommend.\n" +
      "- Reject scope beyond the request.",
  },
  {
    id: "docs-review",
    roleId: "review",
    name: "문서 리뷰",
    markdown:
      "- Check that the document matches the code and the screen as they actually work, and do not accept an unconfirmed feature as fact.\n" +
      "- Check that the conclusion comes first and that nothing repeats the file name or the title.\n" +
      "- Check that no file name is made up and no command is written that was never run.\n" +
      "- Separate each point into a fact and a suggestion, and write the sentence you would change.",
  },
  {
    id: "fast-tests",
    roleId: "test",
    name: "빠른 회귀 테스트",
    markdown:
      "- Replace a heavy model with a small double that runs the same flow, and call main inside the process instead of spawning a subprocess for a script.\n" +
      "- Use the real model once only for what a double cannot show.\n" +
      "- Keep one strong test instead of several weak ones, and delete tests that overlap or no longer guard anything.\n" +
      "- One test file per source module, shared helpers in one file.\n" +
      "- When you fix a bug, leave one regression test that fails on the code before the fix.\n" +
      "- Keep the whole suite finishing in seconds, and when it slows down, start by shrinking the tests you just wrote.\n" +
      "- Report the command you ran and its result as they are, and never count a check you cannot run as a pass.",
  },
  {
    id: "faithful-reading",
    roleId: "vision",
    name: "보이는 것만 읽기",
    markdown:
      "- Copy the text, the state and the error message that are actually visible in the picture.\n" +
      "- Do not fill in what is not visible, and say so when a part is too blurry or cut off to read.\n" +
      "- Do not create images.",
  },
];

/**
 * Assign the default skills to one project. Only called when a project is first
 * created or a saved database is upgraded, so a skill the user removed never
 * comes back.
 */
export function seedDefaultSkills(db: DatabaseSync, projectId: string) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO crew_skills VALUES (?, ?, ?, ?, ?)",
  );
  // crew_skills.id is unique across the whole database, so the project id leads.
  for (const { id, roleId, name, markdown } of defaultSkills)
    insert.run(projectId + ":" + id, projectId, roleId, name, markdown);
}
