// 입력창 키보드 규칙. Enter는 바로 보내고, Ctrl+Enter(macOS는 Cmd+Enter)는 대기열에
// 넣고, Shift+Enter는 줄바꿈이다. 한글 조합 중의 Enter는 절대 전송·대기열로 쓰지 않는다.

export type ComposerAction = "send" | "queue" | "newline";

export type ComposerKey = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
};

/**
 * 키 입력 하나가 입력창에서 무엇을 하는지 돌려준다. 해당 없으면 null.
 * 조합 중(isComposing/keyCode 229)에는 null이라, 조합을 확정하는 Enter가 전송으로
 * 새지 않는다.
 */
export function composerAction(event: ComposerKey): ComposerAction | null {
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.key !== "Enter" || event.repeat) return null;
  if (event.altKey) return null;
  if (event.shiftKey) return "newline";
  if (event.ctrlKey || event.metaKey) return "queue";
  return "send";
}

/** 입력창 아래에 늘 보이는 키 안내. 실제 동작과 같은 문장을 쓴다. */
export const composerHint = "Enter 전송 · Ctrl+Enter 대기열 · Shift+Enter 줄바꿈";
