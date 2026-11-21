// Default skills: the working rules assigned once to each role when a project is
// created. Each body lives in agents/skills so the rules agents read sit with the
// other agent documents and can be edited without touching code.

import type { DatabaseSync } from "node:sqlite";
import type { RoleId } from "../../shared/actions";
import codeReview from "../../../agents/skills/code-review.md?raw";
import codeStyle from "../../../agents/skills/code-style.md?raw";
import conciseDocs from "../../../agents/skills/concise-docs.md?raw";
import docsReview from "../../../agents/skills/docs-review.md?raw";
import docsStyle from "../../../agents/skills/docs-style.md?raw";
import engineeringPrinciples from "../../../agents/skills/engineering-principles.md?raw";
import faithfulReading from "../../../agents/skills/faithful-reading.md?raw";
import fastTests from "../../../agents/skills/fast-tests.md?raw";
import frontendDesign from "../../../agents/skills/frontend-design.md?raw";
import leanVerify from "../../../agents/skills/lean-verify.md?raw";
import rosterHygiene from "../../../agents/skills/roster-hygiene.md?raw";
import workTriage from "../../../agents/skills/work-triage.md?raw";

type DefaultSkill = {
  id: string;
  roleId: RoleId;
  name: string;
  markdown: string;
};

export const defaultSkills: DefaultSkill[] = [
  { id: "work-triage", roleId: "assistant", name: "작업 조율", markdown: workTriage },
  { id: "roster-hygiene", roleId: "hr", name: "로스터 정리", markdown: rosterHygiene },
  {
    id: "engineering-principles",
    roleId: "development",
    name: "구현 원칙",
    markdown: engineeringPrinciples,
  },
  { id: "frontend-design", roleId: "development", name: "화면 설계", markdown: frontendDesign },
  { id: "lean-verify", roleId: "build", name: "단계별 검증·정리", markdown: leanVerify },
  { id: "concise-docs", roleId: "docs", name: "간결한 문서 작성", markdown: conciseDocs },
  { id: "code-style", roleId: "style", name: "코드 스타일", markdown: codeStyle },
  { id: "docs-style", roleId: "style", name: "문서 스타일", markdown: docsStyle },
  {
    id: "frontend-design-check",
    roleId: "style",
    name: "화면 설계 점검",
    markdown: frontendDesign,
  },
  { id: "code-review", roleId: "review", name: "코드 리뷰", markdown: codeReview },
  { id: "docs-review", roleId: "review", name: "문서 리뷰", markdown: docsReview },
  { id: "fast-tests", roleId: "test", name: "빠른 회귀 테스트", markdown: fastTests },
  { id: "faithful-reading", roleId: "vision", name: "보이는 것만 읽기", markdown: faithfulReading },
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
