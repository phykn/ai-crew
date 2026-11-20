// Messages the user sends while the assistant is still answering wait here, in
// order, until the current response ends. The queue only lives in the main
// process; each waiting message is already stored as a `queued` assistant row so
// the transcript shows it immediately.

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
}
