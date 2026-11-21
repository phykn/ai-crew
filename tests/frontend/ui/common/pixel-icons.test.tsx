import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PixelIcon, type PixelIconName } from "../../../../src/frontend/ui/common/pixel-icons";

const names: PixelIconName[] = [
  "chat",
  "log",
  "book",
  "gem",
  "flow",
  "bell",
  "menu",
  "fire",
  "pulse",
];

test("every toolbar icon renders as a 16px pixel image", () => {
  for (const name of names) {
    const html = renderToStaticMarkup(<PixelIcon name={name} />);
    expect(html).toContain('class="pixel-icon"');
    expect(html).toContain('width="16"');
    expect(html).toContain("data:image/svg+xml;base64,");
    expect(html).toContain('aria-hidden="true"');
  }
});

test("a drawn icon keeps its own pixels instead of one shared bitmap", () => {
  const chat = renderToStaticMarkup(<PixelIcon name="chat" />);
  const gem = renderToStaticMarkup(<PixelIcon name="gem" />);
  expect(chat).not.toEqual(gem);
});
