import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { maxChatImages } from "../shared/actions";
import { CrewStore } from "./store";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const png = {
  name: "screen.png",
  mediaType: "image/png" as const,
  data: Buffer.from(pngBytes).toString("base64"),
};

test("a chat picture is saved as a file, hung on its message and read back for the screen", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-image-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/images");
    const sessionId = store.snapshot().session!.id;
    const request = randomUUID();
    const response = store.beginResponse(sessionId, request, "", "running", [png])!;
    expect(response).toBeTruthy();

    const [message] = store
      .getMessages(sessionId)
      .filter(({ id }) => id === request);
    expect(message).toMatchObject({ role: "user", text: "" });
    expect(message.images).toHaveLength(1);
    expect(message.images[0]).toMatchObject({
      name: "screen.png",
      mediaType: "image/png",
      byteSize: pngBytes.byteLength,
    });

    // 파일은 저장소 옆 attachments 폴더에 실제로 남는다.
    const [stored] = store.readMessageImages(request);
    expect(existsSync(stored.path)).toBe(true);
    expect(store.imageDataUrl(stored.id)).toBe(
      "data:image/png;base64," + png.data,
    );
    expect(store.imageDataUrl(randomUUID())).toBeNull();

    // 그림만 보낸 메시지도 대화 제목을 갖는다.
    expect(store.snapshot().session?.title).toBe("1장의 그림");

    store.saveImageNote(stored.id, "오류 창이 보입니다.");
    expect(store.readMessageImages(request)[0].note).toBe("오류 창이 보입니다.");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a message still needs words or pictures, and only pictures can be attached", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-image-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/images");
    const sessionId = store.snapshot().session!.id;
    expect(() =>
      store.beginResponse(sessionId, randomUUID(), "   ", "running", []),
    ).toThrow("메시지나 그림 중 하나는");
    expect(() =>
      store.beginResponse(sessionId, randomUUID(), "봐 줘", "running", [
        {
          name: "plan.pdf",
          mediaType: "image/png",
          data: Buffer.from("not a picture").toString("base64"),
        },
      ]),
    ).not.toThrow();
    expect(() =>
      store.beginResponse(sessionId, randomUUID(), "봐 줄래", "running", [
        // 미디어 타입은 스키마가 막지만, 저장소도 한 번 더 막는다.
        { name: "a.bin", mediaType: "application/pdf" as never, data: png.data },
      ]),
    ).toThrow("그림 파일만");

    const pictures = Array.from({ length: maxChatImages }, (_, index) => ({
      ...png,
      name: `shot-${index}.png`,
    }));
    expect(
      store.beginResponse(sessionId, randomUUID(), "여러 장", "running", pictures),
    ).toBeTruthy();
    expect(store.getMessages(sessionId).at(-2)?.images).toHaveLength(
      maxChatImages,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
