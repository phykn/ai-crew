import { expect, test } from "vitest";
import { filterMessages, searchCount } from "../../../../src/frontend/ui/chat/search";

const messages = [
  { id: "a", text: "캠프 배경을 새로 그렸어요." },
  { id: "b", text: "npm test 로 확인했어요." },
  { id: "c", text: "" },
];

test("leaves the transcript alone until a word is typed", () => {
  expect(filterMessages(messages, "")).toBe(messages);
  expect(filterMessages(messages, "   ")).toBe(messages);
});

test("keeps only the messages that carry the word", () => {
  expect(filterMessages(messages, "캠프").map(({ id }) => id)).toEqual(["a"]);
  expect(filterMessages(messages, "TEST").map(({ id }) => id)).toEqual(["b"]);
  expect(filterMessages(messages, "  test  ").map(({ id }) => id)).toEqual([
    "b",
  ]);
  expect(filterMessages(messages, "없는말")).toEqual([]);
});

test("counts the matches even when there are none", () => {
  expect(searchCount(3)).toBe("3건");
  expect(searchCount(0)).toBe("0건");
});
