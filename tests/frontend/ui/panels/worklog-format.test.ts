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

test("기록 시각은 24시간 시:분:초로 자른다", () => {
  const at = new Date(2026, 10, 21, 9, 5, 3);
  expect(formatLogTime(at.toISOString())).toBe("09:05:03");
  expect(formatLogTime(new Date(2026, 10, 21, 23, 40, 12).toISOString())).toBe(
    "23:40:12",
  );
  expect(formatLogTime(null)).toBe("");
  expect(formatLogTime("그런 시각 없음")).toBe("");
});

test("완료 여부는 문장의 낱말로 고르고, 모르면 완료로 둔다", () => {
  expect(logStatus("개발 · 팔레트 검사 통과")).toBe("done");
  expect(logStatus("빌드 · 테스트 실패 · 3건")).toBe("failed");
  expect(logStatus("비서 · 사용자 확인 요청 · 격리 실행")).toBe("running");
});

test("이름·역할·사용자·모르는 말을 역할과 이름으로 나눈다", () => {
  const byName = parseActivity(
    { text: "태오 · camp/art/palette.ts 32색 팔레트", recordedAt: null },
    members,
  );
  expect(byName.label).toBe("개발 · 태오");
  expect(byName.color).toBe("#b4d59d");
  expect(byName.body).toBe("camp/art/palette.ts 32색 팔레트");

  // 역할 이름만 적힌 기록은 그 역할을 맡은 크루의 별명을 붙인다.
  expect(parseActivity({ text: "개발 · 타일맵" }, members).label).toBe("개발 · 태오");
  // "인사팀"처럼 역할 이름에 말을 덧붙여도 읽는다.
  expect(parseActivity({ text: "인사팀 · 후보 준비" }, members).label).toBe("인사 · 지민");
  // 크루 목록에 없는 역할 이름은 기본 별명을 쓴다.
  expect(parseActivity({ text: "테스트 · 183개 통과" }, members).label).toBe(
    "테스트 · 민재",
  );
  expect(parseActivity({ text: "사용자 · 리뷰 승인" }, members).label).toBe("사용자");
});

test("다른 단계로 넘기는 기록은 화살표를 남긴다", () => {
  const row = parseActivity({ text: "개발 → 스타일 · 캠프 톤 확인" }, members);
  expect(row.label).toBe("개발 · 태오 → 스타일 · 유진");
  expect(row.body).toBe("캠프 톤 확인");
});

test("누가 했는지 모르는 기록은 시스템 한 줄로 두고 본문을 잃지 않는다", () => {
  const row = parseActivity({
    text: "모델 연결 재시도 (2/5)",
    recordedAt: null,
  });
  expect(row.label).toBe("시스템");
  expect(row.status).toBe("running");
  expect(row.body).toBe("모델 연결 재시도 (2/5)");

  // 앞부분이 역할이 아니어도 문장을 통째로 남긴다.
  const mixed = parseActivity({ text: "MCP 도구 승인 대기 · 서버 tools" }, members);
  expect(mixed.label).toBe("시스템");
  expect(mixed.body).toBe("MCP 도구 승인 대기 · 서버 tools");
});

test("본문 안의 구분점은 그대로 둔다", () => {
  const row = parseActivity({ text: "현우 · 팔레트 0개 · 모든 픽셀 통과" }, members);
  expect(row.label).toBe("리뷰 · 현우");
  expect(row.body).toBe("팔레트 0개 · 모든 픽셀 통과");
});
