import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { sanitizeError, sanitizeText } from "../../../../src/backend/server/diagnostics/sanitizer";
import { CrewStore } from "../../../../src/backend/store/store";

test("tokens, keys and credentials inside a url are redacted", () => {
  expect(sanitizeText("Authorization: Bearer abc123.def-456/_ghi")).toBe(
    "Authorization: Bearer [REDACTED]",
  );
  expect(sanitizeText("키 sk-proj-abcdefgh12345 로 실패")).toBe(
    "키 [REDACTED] 로 실패",
  );
  expect(sanitizeText("ghp_0123456789abcdefghijKL")).toBe("[REDACTED]");
  expect(sanitizeText("github_pat_11ABCDEFG0_abcdefghijklmn")).toBe(
    "[REDACTED]",
  );
  expect(sanitizeText("xoxb-1234567890-abcdefghij")).toBe("[REDACTED]");
  expect(sanitizeText("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED]");
  expect(sanitizeText("https://user:pw@example.com/v1/models")).toBe(
    "https://[REDACTED]@example.com/v1/models",
  );
  expect(sanitizeText("http://ghp_0123456789abcdefghijKL@host/repo")).toBe(
    "http://[REDACTED]@host/repo",
  );
});

test("ordinary words and paths are left alone", () => {
  const text =
    "notice.txt: 문구를 고쳤어요 (task-list 3건, risk-free, 22:30) — 확인 필요";
  expect(sanitizeText(text)).toBe(text);
  expect(sanitizeText("")).toBe("");
});

test("sanitizing twice changes nothing more", () => {
  const once = sanitizeText(
    "Bearer abcdefghijkl sk-abcdefghijkl https://u:p@host/x",
  );
  expect(once).toBe("Bearer [REDACTED] [REDACTED] https://[REDACTED]@host/x");
  expect(sanitizeText(once)).toBe(once);
});

test("stored logs, errors and reports carry no secrets", () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-secret-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;

    store.log(sessionId, "비서 · 연결 실패 · Bearer abcdefghijkl");
    expect(store.snapshot().activity.at(-1)!.text).toBe(
      "비서 · 연결 실패 · Bearer [REDACTED]",
    );

    const requestId = randomUUID();
    const responseId = store.beginResponse(sessionId, requestId, "질문")!;
    store.finish(
      responseId,
      "failed",
      "sk-abcdefghijkl 주소를 확인해 주세요.",
    );
    expect(
      store.getMessages(sessionId).find(({ id }) => id === responseId)!.error,
    ).toBe("[REDACTED] 주소를 확인해 주세요.");

    const job = store.createJob(sessionId, randomUUID(), "요청");
    store.recordJob(
      job,
      "failed",
      "비서 · 실패",
      undefined,
      null,
      "ghp_0123456789abcdefghijKL 때문에 멈췄어요.",
    );
    expect(
      store
        .getMessages(sessionId)
        .filter(({ role }) => role === "assistant")
        .at(-1)!.text,
    ).toBe("[REDACTED] 때문에 멈췄어요.");

    store.recordAudit({
      projectId,
      event: "model.connection",
      outcome: "changed",
      detail: "https://user:pw@example.com/v1",
    });
    expect(store.readAuditLogs(projectId)[0].detail).toBe(
      "https://[REDACTED]@example.com/v1",
    );
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("sanitizeError keeps the message and drops the token", () => {
  expect(sanitizeError(new Error("Bearer abcdefghijkl 거절"))).toBe(
    "Bearer [REDACTED] 거절",
  );
  expect(sanitizeError("xoxb-1234567890-abcdefghij")).toBe("[REDACTED]");
});
