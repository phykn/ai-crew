import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ChatQueue } from "./chat-queue";
import { CrewStore } from "./store";

test("keeps sent-while-answering messages in order per session", () => {
  const queue = new ChatQueue();
  queue.add("a", { responseId: "a1", requestId: "q1", text: "첫 번째" });
  queue.add("a", { responseId: "a2", requestId: "q2", text: "두 번째" });
  queue.add("b", { responseId: "b1", requestId: "q3", text: "다른 대화" });
  expect(queue.requests("a")).toEqual(["q1", "q2"]);
  expect(queue.shift("a")).toMatchObject({ text: "첫 번째" });
  expect(queue.size("a")).toBe(1);
  expect(queue.shift("a")).toMatchObject({ text: "두 번째" });
  expect(queue.shift("a")).toBeUndefined();
  expect(queue.take("b")).toHaveLength(1);
  expect(queue.size("b")).toBe(0);
});

test("stores a queued answer and starts it when the earlier reply ends", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-queue-"));
  const path = join(directory, "crew.sqlite");
  let store = new CrewStore(path);
  try {
    store.openFolder("/work/queue-test");
    const sessionId = store.snapshot().session!.id;
    const first = store.beginResponse(sessionId, randomUUID(), "먼저 물어본 일")!;
    const second = store.beginResponse(
      sessionId,
      randomUUID(),
      "답변 중에 보탠 일",
      "queued",
    )!;
    let messages = store.getMessages(sessionId);
    expect(messages.map(({ text, state }) => ({ text, state }))).toEqual([
      { text: "먼저 물어본 일", state: "complete" },
      { text: "", state: "running" },
      { text: "답변 중에 보탠 일", state: "complete" },
      { text: "", state: "queued" },
    ]);
    // 기다리는 동안에는 내용을 붙이지 않고, 시작한 뒤에만 답변이 쌓인다.
    store.append(second, "무시됨");
    expect(store.getMessages(sessionId)[3].text).toBe("");
    store.startResponse(second);
    store.append(second, "이어서 답한 내용");
    messages = store.getMessages(sessionId);
    expect(messages[3]).toMatchObject({
      text: "이어서 답한 내용",
      state: "running",
    });
    store.finish(first, "complete");
    store.finish(second, "complete");
    expect(store.getMessages(sessionId)[3].state).toBe("complete");
    // 앱을 닫는 동안 남은 대기 답변은 다음 실행에서 중단으로 정리된다.
    const pending = store.beginResponse(
      sessionId,
      randomUUID(),
      "앱을 닫으며 남은 일",
      "queued",
    )!;
    expect(pending).not.toBeNull();
    store.close();
    store = new CrewStore(path);
    expect(store.getMessages(sessionId).at(-1)).toMatchObject({
      text: "",
      state: "stopped",
    });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
