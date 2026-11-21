import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { Message } from "../shared/actions";
import {
  continuationNotice,
  conversationHistory,
  cutMark,
  isCutShort,
  lastInterruption,
} from "./chat-continuity";
import { CrewStore } from "../store/store";

function message(patch: Partial<Message> & Pick<Message, "id" | "role" | "text">): Message {
  return {
    images: [],
    state: "complete",
    error: null,
    jobId: null,
    interrupted: false,
    interruptReason: null,
    ...patch,
  };
}

test("stores a cut-off answer with its reason instead of dropping it", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-continuity-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/continuity");
    const sessionId = store.snapshot().session!.id;
    const first = store.beginResponse(sessionId, randomUUID(), "앞 질문")!;
    store.append(first, "먼저 이렇게 답하다가");
    store.markInterrupted(first, "user-stop");
    store.finish(first, "stopped");
    const saved = store
      .getMessages(sessionId)
      .find(({ id }) => id === first)!;
    expect(saved).toMatchObject({
      text: "먼저 이렇게 답하다가",
      state: "stopped",
      interrupted: true,
      interruptReason: "user-stop",
    });
    // 다음 턴 기록에는 그때까지의 글이 끊긴 지점 표시와 함께 들어간다.
    const second = store.beginResponse(sessionId, randomUUID(), "새 질문")!;
    const messages = store.getMessages(sessionId);
    const history = conversationHistory(messages, { excludeId: second });
    expect(history.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(history[1].content).toContain("먼저 이렇게 답하다가");
    expect(history[1].content).toContain(cutMark);
    const notice = continuationNotice(messages, { excludeId: second });
    expect(notice).toContain("앞선 응답이 중단되었습니다");
    expect(notice).toContain("사용자가 멈춰서");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tells the model the new message itself cut the earlier answer", () => {
  const messages = [
    message({ id: "u1", role: "user", text: "긴 부탁" }),
    message({
      id: "a1",
      role: "assistant",
      text: "하나, 둘, 셋까지 했고",
      state: "stopped",
      interrupted: true,
      interruptReason: "new-message",
    }),
    message({ id: "u2", role: "user", text: "잠깐, 이것부터" }),
  ];
  const notice = continuationNotice(messages, { excludeId: "a2" });
  expect(notice).toContain("새 메시지가 앞 응답을 끊은 이유");
  expect(lastInterruption(messages, { excludeId: "a2" })?.id).toBe("a1");
});

test("keeps both pieces when two answers are cut in a row", () => {
  const messages = [
    message({ id: "u1", role: "user", text: "첫 부탁" }),
    message({
      id: "a1",
      role: "assistant",
      text: "첫 조각",
      state: "stopped",
      interrupted: true,
      interruptReason: "new-message",
    }),
    message({ id: "u2", role: "user", text: "두 번째 부탁" }),
    message({
      id: "a2",
      role: "assistant",
      text: "둘째 조각",
      state: "failed",
      interrupted: true,
      interruptReason: "error",
    }),
    message({ id: "u3", role: "user", text: "세 번째 부탁" }),
  ];
  const history = conversationHistory(messages, { excludeId: "a3" });
  const answers = history.filter(({ role }) => role === "assistant");
  expect(answers).toHaveLength(2);
  expect(answers[0].content).toContain("첫 조각");
  expect(answers[0].content).toContain(cutMark);
  expect(answers[1].content).toContain("둘째 조각");
  expect(answers[1].content).toContain("오류가 나서");
});

test("keeps both pieces in the store when two answers are cut in a row", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-continuity-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/continuity-twice");
    const sessionId = store.snapshot().session!.id;
    const first = store.beginResponse(sessionId, randomUUID(), "첫 부탁")!;
    store.append(first, "첫 조각까지 씀");
    store.markInterrupted(first, "new-message");
    store.finish(first, "stopped");
    const second = store.beginResponse(sessionId, randomUUID(), "둘째 부탁")!;
    store.append(second, "둘째 조각까지 씀");
    store.markInterrupted(second, "error");
    store.finish(second, "failed", "연결이 끊겼어요.");
    const third = store.beginResponse(sessionId, randomUUID(), "셋째 부탁")!;
    const messages = store.getMessages(sessionId);
    const answers = conversationHistory(messages, {
      excludeId: third,
    }).filter(({ role }) => role === "assistant");
    expect(answers).toHaveLength(2);
    expect(answers[0].content).toContain("첫 조각까지 씀");
    expect(answers[1].content).toContain("둘째 조각까지 씀");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("leaves a finished answer unmarked and adds no notice", () => {
  const messages = [
    message({ id: "u1", role: "user", text: "물어봄" }),
    message({ id: "a1", role: "assistant", text: "끝까지 답했어요" }),
    message({ id: "u2", role: "user", text: "또 물어봄" }),
  ];
  expect(isCutShort(messages[1])).toBe(false);
  const history = conversationHistory(messages);
  expect(history[1].content).toBe("끝까지 답했어요");
  expect(history[1].content).not.toContain(cutMark);
  expect(continuationNotice(messages)).toBe("");
});

test("drops empty answers and queued requests from the prompt", () => {
  const messages = [
    message({ id: "u1", role: "user", text: "첫 질문" }),
    message({ id: "a1", role: "assistant", text: "", state: "stopped" }),
    message({ id: "u2", role: "user", text: "아직 답하지 않은 질문" }),
    message({ id: "a2", role: "assistant", text: "", state: "queued" }),
  ];
  // 대기열에 있는 요청 ID는 아직 답하지 않은 말이므로 앞 맥락에서 뺀다.
  const history = conversationHistory(messages, {
    excludeId: "a3",
    skip: ["u2"],
  });
  expect(history).toEqual([{ role: "user", content: "첫 질문" }]);
  expect(conversationHistory(messages, { excludeId: "a3" })).toEqual([
    { role: "user", content: "첫 질문" },
    { role: "user", content: "아직 답하지 않은 질문" },
  ]);
});

test("can carry the cut-off tail itself for a thread that lost it", () => {
  const messages = [
    message({ id: "u1", role: "user", text: "부탁" }),
    message({
      id: "a1",
      role: "assistant",
      text: "여기까지 만들었어요",
      state: "stopped",
      interrupted: true,
      interruptReason: "quit",
    }),
    message({ id: "u2", role: "user", text: "이어서" }),
  ];
  const notice = continuationNotice(messages, {
    excludeId: "a2",
    excerpt: true,
  });
  expect(notice).toContain("여기까지 만들었어요");
  expect(notice).toContain("앱을 닫아서");
});

test("a picture-only message reaches the prompt with what the vision model saw", () => {
  const messages = [
    message({ id: "u1", role: "user", text: "", images: [] }),
    message({ id: "a1", role: "assistant", text: "무엇을 도와드릴까요?" }),
    message({ id: "u2", role: "user", text: "이 오류 뭐야?" }),
  ];
  const notes = new Map([
    [
      "u1",
      "[첨부 이미지 1 · shot.png · image/png · 184KB]\n'저장 실패' 오류 창이 보입니다.",
    ],
  ]);
  expect(conversationHistory(messages, { imageNotes: notes })).toEqual([
    {
      role: "user",
      content: "[첨부 이미지 1 · shot.png · image/png · 184KB]\n'저장 실패' 오류 창이 보입니다.",
    },
    { role: "assistant", content: "무엇을 도와드릴까요?" },
    { role: "user", content: "이 오류 뭐야?" },
  ]);
  // 그림 설명이 없는 빈 메시지는 그대로 빠진다.
  expect(conversationHistory(messages)).toHaveLength(2);
});
