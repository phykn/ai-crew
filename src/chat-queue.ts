// Messages the user sends while the assistant is still answering wait here, in
// order, until the current response ends. The queue only lives in the main
// process; each waiting message is already stored as a `queued` assistant row so
// the transcript shows it immediately.

import type { Message } from "./actions";

export type PendingChat = {
  responseId: string;
  requestId: string;
  text: string;
};

export class ChatQueue {
  private waiting = new Map<string, PendingChat[]>();

  add(sessionId: string, pending: PendingChat) {
    const list = this.waiting.get(sessionId) ?? [];
    list.push(pending);
    this.waiting.set(sessionId, list);
  }

  /** 다음에 답할 메시지 하나를 꺼낸다. */
  shift(sessionId: string) {
    const list = this.waiting.get(sessionId);
    if (!list) return undefined;
    const next = list.shift();
    if (!list.length) this.waiting.delete(sessionId);
    return next;
  }

  /** 기다리던 메시지를 모두 꺼낸다(중단할 때). */
  take(sessionId: string) {
    const list = this.waiting.get(sessionId) ?? [];
    this.waiting.delete(sessionId);
    return list;
  }

  size(sessionId: string) {
    return this.waiting.get(sessionId)?.length ?? 0;
  }

  /** 아직 답하지 않은 요청의 ID 목록. 지난 답변의 대화 맥락에서 뺀다. */
  requests(sessionId: string) {
    return (this.waiting.get(sessionId) ?? []).map(({ requestId }) => requestId);
  }

  /** 대기 중인 메시지 하나를 뺀다. 이미 시작했거나 없으면 undefined. */
  cancel(sessionId: string, responseId: string) {
    const list = this.waiting.get(sessionId);
    const index = list?.findIndex((pending) => pending.responseId === responseId) ?? -1;
    if (!list || index < 0) return undefined;
    const [removed] = list.splice(index, 1);
    if (!list.length) this.waiting.delete(sessionId);
    return removed;
  }
}

/** 대기열 칩 하나. 번호는 기다리는 순서다. */
export type QueueChip = {
  responseId: string;
  text: string;
  position: number;
};

/**
 * 입력창 위에 띄울 대기열 칩. 대기 중인 응답 바로 앞의 사용자 메시지가 그 내용이다.
 * 화면은 저장된 대화만 보고 칩을 그리므로, 대기열을 따로 복제해 두지 않는다.
 */
export function queueChips(messages: Message[]): QueueChip[] {
  const chips: QueueChip[] = [];
  let asked = "";
  for (const message of messages) {
    if (message.role === "user") {
      asked = message.text;
      continue;
    }
    if (message.state === "queued" && !message.text)
      chips.push({ responseId: message.id, text: asked, position: chips.length + 1 });
  }
  return chips;
}
