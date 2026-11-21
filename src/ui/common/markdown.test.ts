import { expect, test } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "./markdown";

test("splits assistant text into headings, paragraphs and rules", () => {
  const blocks = parseMarkdown(
    "# 결과\n\n첫 줄\n둘째 줄\n\n---\n## 다음 단계",
  );
  expect(blocks).toEqual([
    { type: "heading", level: 1, children: [{ type: "text", text: "결과" }] },
    {
      type: "paragraph",
      children: [{ type: "text", text: "첫 줄\n둘째 줄" }],
    },
    { type: "rule" },
    { type: "heading", level: 2, children: [{ type: "text", text: "다음 단계" }] },
  ]);
});

test("reads fenced code blocks with their language label", () => {
  const blocks = parseMarkdown(
    "고치기 전:\n```ts\nconst a = 1;\nconsole.log(a);\n```\n끝",
  );
  expect(blocks).toEqual([
    { type: "paragraph", children: [{ type: "text", text: "고치기 전:" }] },
    { type: "code", language: "ts", code: "const a = 1;\nconsole.log(a);" },
    { type: "paragraph", children: [{ type: "text", text: "끝" }] },
  ]);
  // 닫는 표시가 없어도 스트리밍 중인 코드로 읽는다.
  expect(parseMarkdown("```\nnpm test")).toEqual([
    { type: "code", language: null, code: "npm test" },
  ]);
});

test("keeps list kinds, items and indented continuations", () => {
  expect(
    parseMarkdown("- 하나\n- **둘**\n  이어지는 설명\n\n1. 먼저\n2) 다음"),
  ).toEqual([
    {
      type: "list",
      ordered: false,
      items: [
        [{ type: "text", text: "하나" }],
        [
          { type: "strong", children: [{ type: "text", text: "둘" }] },
          { type: "text", text: "\n이어지는 설명" },
        ],
      ],
    },
    {
      type: "list",
      ordered: true,
      items: [
        [{ type: "text", text: "먼저" }],
        [{ type: "text", text: "다음" }],
      ],
    },
  ]);
});

test("reads emphasis, inline code and links without producing HTML", () => {
  expect(
    parseInline("**굵게** *기울임* `npm test` [문서](https://example.com/a)"),
  ).toEqual([
    { type: "strong", children: [{ type: "text", text: "굵게" }] },
    { type: "text", text: " " },
    { type: "em", children: [{ type: "text", text: "기울임" }] },
    { type: "text", text: " " },
    { type: "code", text: "npm test" },
    { type: "text", text: " " },
    {
      type: "link",
      href: "https://example.com/a",
      children: [{ type: "text", text: "문서" }],
    },
  ]);
  expect(parseInline("<b>그대로</b>")).toEqual([
    { type: "text", text: "<b>그대로</b>" },
  ]);
});

test("keeps only web and mail links", () => {
  expect(safeHref("https://example.com")).toBe("https://example.com/");
  expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
  expect(safeHref("javascript:alert(1)")).toBeNull();
  expect(safeHref("data:text/html,<script>")).toBeNull();
  expect(parseInline("[누르기](javascript:alert(1))")).toEqual([
    { type: "text", text: "[누르기](javascript:alert(1))" },
  ]);
});

test("renders quotes and leaves unknown text alone", () => {
  expect(parseMarkdown("> 확인 필요\n> 둘째 줄")).toEqual([
    {
      type: "quote",
      children: [{ type: "text", text: "확인 필요\n둘째 줄" }],
    },
  ]);
  expect(parseMarkdown("")).toEqual([]);
});
