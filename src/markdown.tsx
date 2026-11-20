// A small Markdown renderer for assistant bubbles. Messages from the model are
// plain text that usually contains headings, lists, inline code and fenced code
// blocks, so they are parsed here and rendered as React elements. Nothing is
// turned into HTML: `dangerouslySetInnerHTML` is never used, and links only keep
// http, https and mailto targets.

import { Fragment, useMemo, useState, type ElementType } from "react";
import { copyText } from "./clipboard";

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] };

export type MarkdownBlock =
  | { type: "heading"; level: number; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "code"; language: string | null; code: string }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "quote"; children: InlineNode[] }
  | { type: "rule" };

const inlineToken =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]*\]\((?:[^()\s]|\([^()\s]*\))*\))/;
const listItem = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const fenceOpen = /^\s*```\s*([^\s`]*)\s*$/;
const fenceClose = /^\s*```\s*$/;
const headingLine = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const ruleLine = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const quoteLine = /^\s{0,3}>\s?/;

/** 링크로 열어도 안전한 주소만 돌려준다. */
export function safeHref(raw: string) {
  try {
    const url = new URL(raw);
    return ["http:", "https:", "mailto:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function isOrdered(marker: string) {
  return /\d/.test(marker);
}

/** 굵게·기울임·인라인 코드·링크를 노드 목록으로 나눈다. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;
  while (rest.length) {
    const match = inlineToken.exec(rest);
    if (!match) break;
    if (match.index > 0)
      nodes.push({ type: "text", text: rest.slice(0, match.index) });
    const token = match[0];
    rest = rest.slice(match.index + token.length);
    if (token.startsWith("`")) {
      nodes.push({ type: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push({ type: "strong", children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push({ type: "em", children: parseInline(token.slice(1, -1)) });
    } else {
      const link = /^\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)$/.exec(token);
      const href = link ? safeHref(link[2]) : null;
      if (link && href)
        nodes.push({ type: "link", href, children: parseInline(link[1]) });
      else nodes.push({ type: "text", text: token });
    }
  }
  if (rest) nodes.push({ type: "text", text: rest });
  return nodes;
}

/** 줄 단위로 문단·제목·목록·인용·코드 블록을 만든다. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }
    const fence = fenceOpen.exec(line);
    if (fence) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !fenceClose.test(lines[index])) {
        code.push(lines[index]);
        index++;
      }
      index++;
      blocks.push({
        type: "code",
        language: fence[1] || null,
        code: code.join("\n"),
      });
      continue;
    }
    const heading = headingLine.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        children: parseInline(heading[2]),
      });
      index++;
      continue;
    }
    if (ruleLine.test(line)) {
      blocks.push({ type: "rule" });
      index++;
      continue;
    }
    if (quoteLine.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && quoteLine.test(lines[index])) {
        quote.push(lines[index].replace(quoteLine, ""));
        index++;
      }
      blocks.push({ type: "quote", children: parseInline(quote.join("\n")) });
      continue;
    }
    const item = listItem.exec(line);
    if (item) {
      const ordered = isOrdered(item[2]);
      const items: InlineNode[][] = [];
      while (index < lines.length) {
        const next = listItem.exec(lines[index]);
        if (next) {
          if (isOrdered(next[2]) !== ordered) break;
          items.push(parseInline(next[3]));
          index++;
          continue;
        }
        const continuation = lines[index];
        if (
          items.length &&
          continuation.trim() &&
          /^\s{2,}/.test(continuation) &&
          !fenceOpen.test(continuation)
        ) {
          items[items.length - 1].push({
            type: "text",
            text: "\n" + continuation.trim(),
          });
          index++;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const text = lines[index];
      if (
        paragraph.length &&
        (fenceOpen.test(text) ||
          headingLine.test(text) ||
          listItem.test(text) ||
          quoteLine.test(text) ||
          ruleLine.test(text))
      )
        break;
      paragraph.push(text);
      index++;
    }
    if (!paragraph.length) {
      // 방어적 처리: 어떤 이유로도 줄을 소비하지 못하면 다음 줄로 넘어간다.
      index++;
      continue;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
  }
  return blocks;
}

function Inlines({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === "text")
          return <Fragment key={index}>{node.text}</Fragment>;
        if (node.type === "code")
          return (
            <code className="md-inline-code" key={index}>
              {node.text}
            </code>
          );
        if (node.type === "strong")
          return (
            <strong key={index}>
              <Inlines nodes={node.children} />
            </strong>
          );
        if (node.type === "em")
          return (
            <em key={index}>
              <Inlines nodes={node.children} />
            </em>
          );
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Inlines nodes={node.children} />
          </a>
        );
      })}
    </>
  );
}

function CodeBlock({
  language,
  code,
}: {
  language: string | null;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span>{language || "코드"}</span>
        <button
          type="button"
          className="md-code-copy"
          aria-label={language ? language + " 코드 복사" : "코드 복사"}
          onClick={async () => {
            if (await copyText(code)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="md">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const level = Math.min(6, Math.max(1, block.level));
          const Tag = ("h" + level) as ElementType;
          return (
            <Tag key={index}>
              <Inlines nodes={block.children} />
            </Tag>
          );
        }
        if (block.type === "code")
          return (
            <CodeBlock
              key={index}
              language={block.language}
              code={block.code}
            />
          );
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inlines nodes={item} />
                </li>
              ))}
            </Tag>
          );
        }
        if (block.type === "quote")
          return (
            <blockquote key={index}>
              <Inlines nodes={block.children} />
            </blockquote>
          );
        if (block.type === "rule") return <hr key={index} />;
        return (
          <p key={index}>
            <Inlines nodes={block.children} />
          </p>
        );
      })}
    </div>
  );
}
