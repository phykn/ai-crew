import { expect, test } from "vitest";
import { changedSegments } from "./text-diff";

test("only the sentences added or changed in the new revision are marked", () => {
  const before = "테스트 방법\n화면을 열고 확인한다.\n";
  const after = "테스트 방법\n화면을 열고 확인한다.\n실행: npm test\n";
  expect(
    changedSegments(before, after).map(({ text, changed }) => [
      text.trim(),
      changed,
    ]),
  ).toEqual([
    ["테스트 방법", false],
    ["화면을 열고 확인한다.", false],
    ["실행: npm test", true],
  ]);
});

test("an unchanged revision marks nothing and a new document marks every line", () => {
  expect(changedSegments("같은 본문", "같은 본문")).toEqual([
    { text: "같은 본문", changed: false },
  ]);
  expect(changedSegments("", "새 문서")).toEqual([
    { text: "새 문서", changed: true },
  ]);
});
