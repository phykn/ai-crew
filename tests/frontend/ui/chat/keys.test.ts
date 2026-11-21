import { expect, test } from "vitest";
import { composerAction, composerHint } from "../../../../src/frontend/ui/chat/keys";

test("Enter sends now, Ctrl/Cmd+Enter queues, Shift+Enter breaks the line", () => {
  expect(composerAction({ key: "Enter" })).toBe("send");
  expect(composerAction({ key: "Enter", ctrlKey: true })).toBe("queue");
  expect(composerAction({ key: "Enter", metaKey: true })).toBe("queue");
  expect(composerAction({ key: "Enter", shiftKey: true })).toBe("newline");
  expect(composerAction({ key: "Enter", altKey: true })).toBeNull();
  expect(composerAction({ key: "a", ctrlKey: true })).toBeNull();
  // 키를 누르고 있어 생긴 자동 반복은 한 번만 센다.
  expect(composerAction({ key: "Enter", repeat: true })).toBeNull();
});

test("a Korean composition Enter never sends or queues", () => {
  // 조합을 확정하는 Enter가 전송으로 새면 글자가 반쯤 나가고 Enter가 두 번 먹는다.
  expect(composerAction({ key: "Enter", isComposing: true })).toBeNull();
  expect(composerAction({ key: "Enter", keyCode: 229 })).toBeNull();
  expect(
    composerAction({ key: "Enter", ctrlKey: true, isComposing: true }),
  ).toBeNull();
  expect(
    composerAction({ key: "Enter", metaKey: true, keyCode: 229 }),
  ).toBeNull();
  expect(
    composerAction({ key: "Enter", shiftKey: true, isComposing: true }),
  ).toBeNull();
});

test("the key hint matches the shortcut that actually runs", () => {
  expect(composerHint).toContain("Enter 전송");
  expect(composerHint).toContain("Ctrl+Enter 대기열");
  expect(composerHint).toContain("Shift+Enter 줄바꿈");
});
