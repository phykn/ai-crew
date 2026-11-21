import { expect, test } from "vitest";
import {
  attachmentProblem,
  collectAttachments,
  imageFiles,
  imageSizeLabel,
  pastedImages,
  readAttachment,
} from "./attachments";
import { maxChatImageBytes, maxChatImages } from "../../shared/actions";

/** 붙일 그림 한 장을 흉내 낸다. 바이트는 실제 PNG 머리와 채운 값이다. */
function imageFile(name = "shot.png", type = "image/png", bytes = 8) {
  return new File([new Uint8Array(bytes).fill(7)], name, { type });
}

test("only png, jpeg, webp and gif pictures within the size limit are accepted", () => {
  expect(attachmentProblem(imageFile())).toBeNull();
  expect(attachmentProblem(imageFile("a.pdf", "application/pdf"))).toContain(
    "png·jpeg·webp·gif 그림만",
  );
  expect(
    attachmentProblem(imageFile("big.png", "image/png", maxChatImageBytes + 1)),
  ).toContain("커요");
  expect(imageSizeLabel(2048)).toBe("2KB");
  expect(imageSizeLabel(3 * 1024 * 1024)).toBe("3.0MB");
});

test("a pasted or dropped batch keeps only pictures", () => {
  const files = [
    imageFile("one.png"),
    new File(["글"], "note.txt", { type: "text/plain" }),
    imageFile("two.webp", "image/webp"),
  ];
  expect(imageFiles(files).map(({ name }) => name)).toEqual([
    "one.png",
    "two.webp",
  ]);
  expect(imageFiles(null)).toEqual([]);
});

test("a file is read into base64 with a matching preview", async () => {
  const attachment = await readAttachment(imageFile("shot.png", "image/png", 3));
  expect(attachment).toMatchObject({
    name: "shot.png",
    mediaType: "image/png",
    byteSize: 3,
  });
  expect(attachment.preview).toBe("data:image/png;base64," + attachment.data);
  expect(atob(attachment.data)).toBe("\u0007\u0007\u0007");
});

test("the batch stops at the picture limit and says why the rest were dropped", async () => {
  const files = Array.from({ length: maxChatImages + 2 }, (_, index) =>
    imageFile(`shot-${index}.png`),
  );
  const { added, problems } = await collectAttachments(files, [], maxChatImages);
  expect(added).toHaveLength(maxChatImages);
  expect(problems.join(" ")).toContain(`${maxChatImages}장까지`);

  const overLimit = await collectAttachments(files.slice(0, 1), added, maxChatImages);
  expect(overLimit.added).toHaveLength(0);
  expect(overLimit.problems.join(" ")).toContain(`${maxChatImages}장까지`);
});

test("a file that is not a picture is reported and not added", async () => {
  const { added, problems } = await collectAttachments(
    [new File(["x"], "plan.txt", { type: "text/plain" })],
    [],
    maxChatImages,
  );
  expect(added).toHaveLength(0);
  expect(problems.join(" ")).toContain("plan.txt");
});

test("a pasted screenshot is found even when the clipboard only lists items", () => {
  const shot = imageFile("CLIPBOARD.png");
  const transfer = {
    files: [],
    items: [
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => shot },
    ],
  } as unknown as DataTransfer;
  expect(pastedImages(transfer).map(({ name }) => name)).toEqual(["CLIPBOARD.png"]);
  expect(pastedImages(null)).toEqual([]);
});
