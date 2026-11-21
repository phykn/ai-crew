// 채팅에 붙은 그림을 비전(수아)이 읽어 글로 옮긴다. 글만 보는 비서 모델 대신 그림을 읽는
// 모델을 따로 붙일 수 있고, 읽은 결과는 사용자 말풍선과 같은 자리에 설명 문장으로 들어간다.
// 읽는 모델이 없으면 저장된 파일 정보만 남기고 읽지 못했다고 솔직히 적는다.

import { readFileSync } from "node:fs";
import { generateText } from "ai";
import type { StoredMessageImage } from "../../store/jobs";
import { openChatModel } from "./local";

type VisionTarget = { baseUrl: string; model: string | null };

let configured: VisionTarget | null = null;

/** 사용자가 비전으로 표시한 모델 연결을 실행에 적용한다. */
export function setVisionConnection(next: VisionTarget | null) {
  configured = next;
}

/** 그림을 읽을 엔드포인트. 없으면 null이라 부르는 쪽이 그 사실을 그대로 전한다. */
export function visionTarget(): VisionTarget | null {
  if (configured) return configured;
  const baseUrl = process.env.AI_CREW_VISION_URL;
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model: process.env.AI_CREW_VISION_MODEL ?? null,
  };
}

// 그림을 읽는 모델에 보내는 지시. 그림에 실제로 보이는 것만 옮겨 적게 하고, 못 읽은 부분은
// 감추지 않게 한다. 그림을 만들어 내거나 보이는 것 이상을 추측하지 않는다.
const readingPrompt = [
  "Write down everything visible in this picture, in the language the user writes in (e.g., Korean).",
  "Copy any text in the picture exactly; for a screen, name the screen and its state, and for an error window, copy the error message.",
  "Do not guess at what is not visible, and say so when part of it is too blurry or cut off to read.",
  "Write the description only, with no greeting and no question back.",
].join(" ");

/** 파일 한 장의 크기를 사람이 읽는 단위로 적는다. */
function imageSize(byteSize: number) {
  if (byteSize >= 1024 * 1024) return (byteSize / 1024 / 1024).toFixed(1) + "MB";
  return Math.max(1, Math.round(byteSize / 1024)) + "KB";
}

/** 프롬프트에 넣는 한 장의 머리표. 그림이 몇 번째인지와 파일 정보를 함께 남긴다. */
function imageHeading(image: StoredMessageImage, position: number) {
  return `[attached image ${position} · ${image.name} · ${image.mediaType} · ${imageSize(image.byteSize)}]`;
}

async function readImage(
  target: VisionTarget,
  image: StoredMessageImage,
  signal: AbortSignal,
) {
  const model = await openChatModel(target, signal, "ai-crew-vision");
  const data = new Uint8Array(readFileSync(image.path));
  const result = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: readingPrompt },
          { type: "file", data, mediaType: image.mediaType },
        ],
      },
    ],
    maxOutputTokens: 900,
    maxRetries: 0,
    abortSignal: signal,
  });
  const text = result.text.trim();
  if (!text) throw new Error("읽은 내용이 비어 있어요.");
  return text;
}

/**
 * 한 메시지에 붙은 그림들을 프롬프트에 넣을 설명으로 바꾼다. 이미 읽어 둔 설명은 다시 묻지
 * 않는다. 읽을 모델이 없거나 읽다가 실패하면 그 까닭을 적은 설명을 대신 돌려준다.
 */
export async function imageNotes(
  images: StoredMessageImage[],
  signal: AbortSignal,
  save: (id: string, note: string) => void,
  log: (note: string) => void,
): Promise<string[]> {
  const target = visionTarget();
  const notes: string[] = [];
  for (const [index, image] of images.entries()) {
    // 사용자가 멈추면 그림 읽기를 그만둔다. 멈춘 응답은 어차피 모델 호출에서 끊긴다.
    if (signal.aborted) break;
    const heading = imageHeading(image, index + 1);
    if (image.note) {
      notes.push(heading + "\n" + image.note);
      continue;
    }
    let body: string;
    let read = false;
    if (!target) {
      body =
        "This picture was saved but its content could not be read. To read pictures, mark an endpoint that reads images as vision in model connections. " +
        "When the user asks about the picture, say briefly that it could not be read and that this setting is needed.";
      log("비전 · 그림 " + (index + 1) + "장을 읽을 모델 연결이 없어 설명 없이 저장");
    } else {
      try {
        body = await readImage(
          target,
          image,
          AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
        );
        read = true;
        log("비전 → 비서 · 그림 " + (index + 1) + "장 읽음 · " + image.name);
      } catch (error) {
        if (signal.aborted) break;
        const reason = (error instanceof Error ? error.message : String(error)).slice(0, 200);
        body =
          "This picture could not be read (" +
          reason +
          "). Only the stored file information remains. When the user asks about the picture, say that it could not be read.";
        log("비전 · 그림 " + (index + 1) + "장 읽기 실패 · " + reason);
      }
    }
    // 읽어 낸 설명만 남긴다. 읽지 못한 까닭은 남기지 않아, 연결을 고친 뒤 다시 읽을 수 있다.
    if (read) save(image.id, body);
    notes.push(heading + "\n" + body);
  }
  return notes;
}
