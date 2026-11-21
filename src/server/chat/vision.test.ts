import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CrewStore } from "../../store/store";
import { imageNotes, setVisionConnection, visionTarget } from "./vision";

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7]);
const picture = {
  name: "screen.png",
  mediaType: "image/png" as const,
  data: Buffer.from(bytes).toString("base64"),
};

/** 그림을 읽는 모델을 흉내 내는 OpenAI 호환 서버. 받은 요청 본문을 그대로 남긴다. */
async function fakeVisionServer(answer: string, status = 200) {
  const received: unknown[] = [];
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      received.push(JSON.parse(body));
      if (status !== 200) {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "그림을 읽지 못했어요" } }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion",
          created: 0,
          model: "vision-test",
          choices: [
            { index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function storeWithPicture() {
  const directory = mkdtempSync(join(tmpdir(), "crew-vision-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  store.openFolder("/work/vision");
  const sessionId = store.snapshot().session!.id;
  const request = randomUUID();
  store.beginResponse(sessionId, request, "이 화면 봐 줘", "running", [picture]);
  return {
    store,
    request,
    images: store.readMessageImages(request),
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("without a vision endpoint the note keeps the file details and says the picture was not read", async () => {
  const saved: string[] = [];
  const logged: string[] = [];
  const { images, close } = storeWithPicture();
  try {
    setVisionConnection(null);
    delete process.env.AI_CREW_VISION_URL;
    expect(visionTarget()).toBeNull();
    const notes = await imageNotes(
      images,
      new AbortController().signal,
      (id, note) => saved.push(id + ":" + note),
      (note) => logged.push(note),
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("[attached image 1 · screen.png · image/png · 1KB]");
    expect(notes[0]).toContain("could not be read");
    expect(notes[0]).toContain("as vision");
    // 읽지 못한 까닭은 남기지 않는다. 연결을 고치면 다시 읽을 수 있어야 한다.
    expect(saved).toEqual([]);
    expect(logged.join(" ")).toContain("비전");
  } finally {
    setVisionConnection(null);
    close();
  }
});

test("a marked multimodal endpoint reads the picture and the description is kept for later turns", async () => {
  const server = await fakeVisionServer("빨간 버튼과 '저장 실패' 오류 문구가 보입니다.");
  const saved: string[] = [];
  const { store, request, images, close } = storeWithPicture();
  try {
    setVisionConnection({ baseUrl: server.baseUrl, model: "vision-test" });
    const notes = await imageNotes(
      images,
      new AbortController().signal,
      (id, note) => {
        saved.push(id);
        store.saveImageNote(id, note);
      },
      () => {},
    );
    expect(notes[0]).toContain("[attached image 1 · screen.png · image/png · 1KB]");
    expect(notes[0]).toContain("빨간 버튼과 '저장 실패' 오류 문구가 보입니다.");
    expect(saved).toEqual([images[0].id]);

    // 그림 바이트는 base64 data URL로, 읽으라는 지시와 함께 모델에 간다.
    const sent = JSON.stringify(server.received[0]);
    expect(sent).toContain("data:image/png;base64," + picture.data);
    expect(sent).toContain("visible in this picture");

    // 두 번째 턴에서는 다시 묻지 않고 남긴 설명을 쓴다.
    await imageNotes(
      store.readMessageImages(request),
      new AbortController().signal,
      () => {},
      () => {},
    );
    expect(server.received).toHaveLength(1);
  } finally {
    setVisionConnection(null);
    await server.close();
    close();
  }
});

test("a failing vision endpoint leaves an honest note instead of a made-up description", async () => {
  const server = await fakeVisionServer("", 500);
  const saved: string[] = [];
  const { images, close } = storeWithPicture();
  try {
    setVisionConnection({ baseUrl: server.baseUrl, model: "vision-test" });
    const notes = await imageNotes(
      images,
      new AbortController().signal,
      (id) => saved.push(id),
      () => {},
    );
    expect(notes[0]).toContain("could not be read");
    expect(notes[0]).toContain("screen.png");
    expect(saved).toEqual([]);
  } finally {
    setVisionConnection(null);
    await server.close();
    close();
  }
});

test("a stopped response does not keep reading pictures", async () => {
  const server = await fakeVisionServer("읽었습니다.");
  const controller = new AbortController();
  const { images, close } = storeWithPicture();
  try {
    setVisionConnection({ baseUrl: server.baseUrl, model: "vision-test" });
    controller.abort();
    const notes = await imageNotes(
      images,
      controller.signal,
      () => {},
      () => {},
    );
    expect(notes).toEqual([]);
    expect(server.received).toHaveLength(0);
  } finally {
    setVisionConnection(null);
    await server.close();
    close();
  }
});
