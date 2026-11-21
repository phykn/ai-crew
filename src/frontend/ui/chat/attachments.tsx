// 채팅에 그림을 붙이는 규칙과, 붙인 그림을 보여 주는 작은 조각들. 붙이는 길은 세 가지다:
// 첨부 버튼, 입력창에 붙여넣기(Ctrl/Cmd+V), 입력창 위로 끌어다 놓기. 어느 길이든 여기의
// 같은 검사와 변환을 거친다.

import { useEffect, useState } from "react";
import {
  chatImageTypes,
  maxChatImageBytes,
  type ChatImage,
  type MessageImage,
} from "../../../shared/actions";
import { Icon } from "../common/ui";

/** 보내기 전 화면이 들고 있는 그림 한 장. 받은 그대로의 바이트와 미리보기 글자를 함께 든다. */
export type ChatAttachment = ChatImage & { id: string; preview: string; byteSize: number };

/** 첨부 버튼이 여는 파일 선택기의 허용 목록. */
export const imageAccept = chatImageTypes.join(",");

/** 그림 한 장의 크기를 사람이 읽는 단위로 적는다. */
export function imageSizeLabel(byteSize: number) {
  if (byteSize >= 1024 * 1024) return (byteSize / 1024 / 1024).toFixed(1) + "MB";
  return Math.max(1, Math.round(byteSize / 1024)) + "KB";
}

/** 붙일 수 없는 파일이면 그 까닭을, 붙일 수 있으면 null을 돌려준다. */
export function attachmentProblem(file: { name: string; type: string; size: number }) {
  if (!chatImageTypes.includes(file.type as ChatImage["mediaType"]))
    return `${file.name} · png·jpeg·webp·gif 그림만 붙일 수 있어요.`;
  if (file.size > maxChatImageBytes)
    return `${file.name} · 그림이 ${imageSizeLabel(maxChatImageBytes)}보다 커요.`;
  return null;
}

/** 클립보드·끌어다 놓기에서 그림 파일만 골라낸다. 글만 붙인 경우에는 빈 배열이다. */
export function imageFiles(files: FileList | File[] | null | undefined) {
  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
}

/** 끌어온 것 중 그림 파일이 있는지. 없으면 글 끌어오기라 기본 동작을 그대로 둔다. */
export function dragHasImages(transfer: DataTransfer | null) {
  return Array.from(transfer?.items ?? []).some(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );
}

/** 붙여넣은 것 중 그림만. 파일 목록이 빈 클립보드에서는 항목에서 꺼낸다. */
export function pastedImages(transfer: DataTransfer | null) {
  const files = imageFiles(transfer?.files);
  if (files.length) return files;
  return Array.from(transfer?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
}

function base64(bytes: Uint8Array) {
  let text = "";
  // 긴 배열을 한 번에 펼치면 인자 한도에 걸린다. 32KB씩 나눠 붙인다.
  for (let index = 0; index < bytes.length; index += 0x8000)
    text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(text);
}

/** 파일 하나를 보낼 수 있는 모양으로 읽는다. 미리보기는 같은 바이트로 만든다. */
export async function readAttachment(file: File): Promise<ChatAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const data = base64(bytes);
  return {
    id: crypto.randomUUID(),
    name: file.name || "붙여넣은 그림",
    mediaType: file.type as ChatImage["mediaType"],
    data,
    byteSize: bytes.byteLength,
    preview: `data:${file.type};base64,${data}`,
  };
}

/**
 * 고른 파일들을 붙인다. 붙일 수 없는 파일과 넘친 장수는 까닭과 함께 돌려주고,
 * 붙인 것은 `added`로 돌려준다.
 */
export async function collectAttachments(
  files: File[],
  current: ChatAttachment[],
  limit: number,
) {
  const added: ChatAttachment[] = [];
  const problems: string[] = [];
  for (const file of files) {
    if (current.length + added.length >= limit) {
      problems.push(`그림은 한 번에 ${limit}장까지 붙일 수 있어요.`);
      break;
    }
    const problem = attachmentProblem(file);
    if (problem) {
      problems.push(problem);
      continue;
    }
    added.push(await readAttachment(file));
  }
  return { added, problems };
}

/** 입력창 바로 위에 붙인 그림을 작은 썸네일로 보여 준다. */
export function AttachmentStrip({
  attachments,
  onRemove,
  disabled,
}: {
  attachments: ChatAttachment[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <ul className="compose-attachments" aria-label="붙인 그림">
      {attachments.map((attachment, index) => (
        <li className="compose-attachment" key={attachment.id}>
          <img src={attachment.preview} alt="" />
          <span className="attachment-name" title={attachment.name}>
            {attachment.name}
          </span>
          <span className="attachment-size">{imageSizeLabel(attachment.byteSize)}</span>
          <button
            type="button"
            className="attachment-remove"
            aria-label={`${attachment.name} 빼기`}
            title="빼기"
            disabled={disabled}
            onClick={() => onRemove(index)}
          >
            <Icon name="close" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 말풍선 안에 붙은 그림. 바이트는 메인에서 id로 받아 온다. */
function StoredImage({ image }: { image: MessageImage }) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve(
      typeof window === "undefined" ? null : window.crew?.image(image.id),
    )
      .then((data) => {
        if (active) setSource(data ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [image.id]);

  return (
    <figure className="bubble-image">
      {source ? (
        <img src={source} alt={image.name} />
      ) : (
        <figcaption>
          {image.name} · {imageSizeLabel(image.byteSize)}
        </figcaption>
      )}
    </figure>
  );
}

/** 한 메시지에 붙은 그림들. 그림만 보낸 메시지에서는 이것만 보인다. */
export function MessageImages({ images }: { images: MessageImage[] }) {
  if (!images.length) return null;
  return (
    <div className="bubble-images">
      {images.map((image) => (
        <StoredImage key={image.id} image={image} />
      ))}
    </div>
  );
}
