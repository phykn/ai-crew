// 응답이 도중에 끊겨도 비서가 앞맥락을 잃지 않게, 저장된 대화 턴을 프롬프트로 옮기는
// 규칙. 끊긴 응답은 그때까지 만든 글을 버리지 않고 '끊긴 지점' 표시와 함께 기록에 넣고,
// 다음 턴 지침에서 그 지점을 이어받으라고 알린다.

import type { InterruptionReason, Message } from "../../shared/actions";

const interruptionLabels: Record<InterruptionReason, string> = {
  "user-stop": "사용자가 멈춰서",
  "new-message": "사용자가 새 메시지를 보내서",
  error: "오류가 나서",
  quit: "앱을 닫아서",
};

/** 프롬프트에 넣는 대화 한 턴. */
type HistoryEntry = { role: "user" | "assistant"; content: string };

/** 끊긴 응답 조각에 붙는 표시. 다음 턴 모델이 여기서 잘렸음을 알아야 한다. */
export const cutMark = "[여기서 응답이 끊겼습니다]";

type ContinuityOptions = {
  /** 지금 답할 응답. 자기 자신은 기록에서 뺀다. */
  excludeId?: string;
  /** 아직 답하지 않은 대기열 요청. 지난 맥락에서 뺀다. */
  skip?: string[];
  /**
   * 끊긴 글 자체를 지침에 함께 넣는다. 대화 기록을 못 보는 경로(Codex 스레드가
   * 이미 있는 경우)에서 쓴다.
   */
  excerpt?: boolean;
  /** 사용자 메시지에 붙은 그림의 설명. 메시지 id별로 한 덩이다. */
  imageNotes?: Map<string, string>;
};

/** 지침에 넣을 때 길이를 묶어 둔다. 앞부분이 이어받기에 가장 중요하다. */
const excerptLimit = 2000;

/** 어시스턴트 응답이 끝까지 만들어지지 않았는지. */
export function isCutShort(message: Message) {
  if (message.role !== "assistant") return false;
  return (
    message.interrupted ||
    message.state === "stopped" ||
    message.state === "failed"
  );
}

function cutReason(message: Message) {
  return message.interruptReason
    ? interruptionLabels[message.interruptReason]
    : "응답이 끝나기 전에";
}

/** 끊긴 응답을 프롬프트에 넣을 한 덩어리로 만든다. 잘린 지점을 문장으로 밝힌다. */
function cutExcerpt(message: Message) {
  return (
    message.text.trimEnd() +
    `\n\n${cutMark} (${cutReason(message)} 이 응답은 끝까지 만들어지지 않았습니다. 여기까지의 내용만 사용자에게 전달되었습니다.)`
  );
}

/**
 * 프롬프트에 넣을 대화 기록. 빈 글은 빼고, 끊긴 응답은 끊긴 지점 표시와 함께 넣는다.
 * 실패한 응답도 그때까지의 글이 있으면 넣는다.
 */
export function conversationHistory(
  messages: Message[],
  options: ContinuityOptions = {},
): HistoryEntry[] {
  const skip = new Set(options.skip ?? []);
  const entries: HistoryEntry[] = [];
  for (const message of messages) {
    if (message.id === options.excludeId || skip.has(message.id)) continue;
    const attachment = options.imageNotes?.get(message.id);
    if (!message.text.trim() && !attachment) continue;
    if (message.role === "user") {
      // 그림은 사용자가 쓴 글 바로 뒤에 붙여, 모델이 무엇에 대한 그림인지 알게 한다.
      entries.push({
        role: "user",
        content: attachment
          ? [message.text, attachment].filter((part) => part.trim()).join("\n\n")
          : message.text,
      });
      continue;
    }
    if (message.state === "complete")
      entries.push({ role: "assistant", content: message.text });
    else if (isCutShort(message))
      entries.push({ role: "assistant", content: cutExcerpt(message) });
  }
  return entries;
}

/** 가장 마지막 비서 응답. 빈 글과 이번 응답은 빼고 찾는다. */
function lastAnswer(
  messages: Message[],
  options: ContinuityOptions = {},
): Message | null {
  const skip = new Set(options.skip ?? []);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    if (message.id === options.excludeId || skip.has(message.id)) continue;
    if (!message.text.trim() && !isCutShort(message)) continue;
    return message;
  }
  return null;
}

/** 직전 응답이 끊겼는지. 끊겼으면 그 조각을, 아니면 null. */
export function lastInterruption(
  messages: Message[],
  options: ContinuityOptions = {},
) {
  const answer = lastAnswer(messages, options);
  return answer && isCutShort(answer) ? answer : null;
}

/**
 * 다음 턴 지침에 붙이는 안내. 직전 응답이 정상적으로 끝났으면 빈 문자열이라
 * 평소 대화에는 아무것도 붙지 않는다.
 */
export function continuationNotice(
  messages: Message[],
  options: ContinuityOptions = {},
) {
  const cut = lastInterruption(messages, options);
  if (!cut) return "";
  const byNewMessage = cut.interruptReason === "new-message";
  const tail = cut.text.trimEnd();
  const excerpt = options.excerpt
    ? "\n\n중단된 지점까지의 내용:\n<<<\n" +
      (tail.length > excerptLimit
        ? tail.slice(0, excerptLimit) + "\n…(앞부분만 넣었습니다)"
        : tail) +
      "\n>>>"
    : "";
  return [
    "# 앞선 응답이 중단되었습니다",
    `직전 비서 응답은 ${cutReason(cut)} 중단되었습니다. 위 대화 기록에서 ${cutMark} 표시가 붙은 말풍선이 그 응답이고, 표시 앞까지가 실제로 사용자에게 전달된 내용입니다.`,
    "- 중단된 지점까지 이미 전한 내용을 처음부터 다시 반복하지 말고, 필요하면 그 내용을 이어받아 마무리하세요.",
    byNewMessage
      ? "- 지금 사용자가 보낸 새 메시지가 앞 응답을 끊은 이유입니다. 새 요청을 먼저 처리하고, 앞서 하려던 말은 새 요청 처리에 필요한 만큼만 짧게 마무리하세요."
      : "- 사용자의 새 메시지에 답하면서, 앞서 하려던 말이 남아 있으면 짧게 마무리하세요.",
    "- 사용자가 왜 끊겼는지 물으면 위 사유를 그대로 말하세요. 끊긴 내용을 지어내지 마세요.",
  ].join("\n") + excerpt;
}
