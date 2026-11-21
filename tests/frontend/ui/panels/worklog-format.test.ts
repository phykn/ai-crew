import { expect, test } from "vitest";
import type { CrewMember } from "../../../../src/shared/actions";
import {
  formatLogTime,
  logStatus,
  parseActivity,
} from "../../../../src/frontend/ui/panels/worklog-format";

const members: CrewMember[] = [
  { id: "assistant", roleId: "assistant", name: "하나", provider: "local", hired: true },
  { id: "development", roleId: "development", name: "태오", provider: "local", hired: true },
  { id: "style", roleId: "style", name: "유진", provider: "local", hired: true },
  { id: "build", roleId: "build", name: "건우", provider: "local", hired: true },
  { id: "hr", roleId: "hr", name: "지민", provider: "local", hired: true },
  { id: "review", roleId: "review", name: "현우", provider: "local", hired: true },
];

test("formats the recorded time as 24-hour HH:MM:SS", () => {
  const at = new Date(2026, 10, 21, 9, 5, 3);
  expect(formatLogTime(at.toISOString())).toBe("09:05:03");
  expect(formatLogTime(new Date(2026, 10, 21, 23, 40, 12).toISOString())).toBe(
    "23:40:12",
  );
  expect(formatLogTime(null)).toBe("");
  expect(formatLogTime("not a time")).toBe("");
});

test("reads the status from the sentence and falls back to done", () => {
  expect(logStatus("개발 · 팔레트 검사 통과")).toBe("done");
  expect(logStatus("빌드 · 테스트 실패 · 3건")).toBe("failed");
  expect(logStatus("비서 · 사용자 확인 요청 · 격리 실행")).toBe("running");
});

test("splits a name, a role, the user and an unknown word into role and name", () => {
  const byName = parseActivity(
    { text: "태오 · camp/art/palette.ts 32색 팔레트", recordedAt: null },
    members,
  );
  expect(byName.label).toBe("개발 · 태오");
  expect(byName.color).toBe("#b4d59d");
  expect(byName.body).toBe("camp/art/palette.ts 32색 팔레트");

  expect(parseActivity({ text: "개발 · 타일맵" }, members).label).toBe("개발 · 태오");
  expect(parseActivity({ text: "인사팀 · 후보 준비" }, members).label).toBe("인사 · 지민");
  expect(parseActivity({ text: "테스트 · 183개 통과" }, members).label).toBe(
    "테스트 · 민재",
  );
  expect(parseActivity({ text: "사용자 · 리뷰 승인" }, members).label).toBe("사용자");
});

test("keeps both sides of a hand-off in the badge", () => {
  const row = parseActivity({ text: "개발 → 스타일 · 캠프 톤 확인" }, members);
  expect(row.label).toBe("개발 · 태오 → 스타일 · 유진");
  expect(row.body).toBe("캠프 톤 확인");
});

test("keeps the whole sentence when the writer is unknown", () => {
  const row = parseActivity({
    text: "모델 연결 재시도 (2/5)",
    recordedAt: null,
  });
  expect(row.label).toBe("시스템");
  expect(row.status).toBe("running");
  expect(row.body).toBe("모델 연결 재시도 (2/5)");

  const mixed = parseActivity({ text: "MCP 도구 승인 대기 · 서버 tools" }, members);
  expect(mixed.label).toBe("시스템");
  expect(mixed.body).toBe("MCP 도구 승인 대기 · 서버 tools");
});

test("splits on the first separator only", () => {
  const row = parseActivity({ text: "현우 · 팔레트 0개 · 모든 픽셀 통과" }, members);
  expect(row.label).toBe("리뷰 · 현우");
  expect(row.body).toBe("팔레트 0개 · 모든 픽셀 통과");
});
