// When an answer is cut off, the assistant must not lose the thread. These rules
// turn saved turns into prompt text: the partial answer is kept with a mark where
// it stopped instead of being dropped, and the next turn is told to carry on from
// that point.

import type { InterruptionReason, Message } from "../../../shared/actions";

const interruptionLabels: Record<InterruptionReason, string> = {
  "user-stop": "the user stopped it",
  "new-message": "the user sent a new message",
  error: "an error occurred",
  quit: "the app closed",
};

/** One conversation turn as it goes into the prompt. */
type HistoryEntry = { role: "user" | "assistant"; content: string };

/** The mark on a cut-off answer. The next model turn has to see where it broke. */
export const cutMark = "[the answer was cut off here]";

type ContinuityOptions = {
  /** The answer being written now. It is left out of the history. */
  excludeId?: string;
  /** Requests not answered yet. They are left out of the earlier context. */
  skip?: string[];
  /**
   * Carry the cut text itself in the instructions. Used on a path that cannot
   * read the conversation history, such as an existing Codex thread.
   */
  excerpt?: boolean;
  /** The description of the pictures on a user message, one block per message ID. */
  imageNotes?: Map<string, string>;
};

/** Bound the instructions' length. The head matters most for carrying on. */
const excerptLimit = 2000;

/** Whether an assistant answer was not finished. */
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
    : "it stopped before the end";
}

/** One block for the prompt from a cut-off answer, with the break stated. */
function cutExcerpt(message: Message) {
  const reason = cutReason(message);
  const clause = reason.charAt(0).toUpperCase() + reason.slice(1);
  return (
    message.text.trimEnd() +
    `\n\n${cutMark} (${clause}. This answer was not finished, and only the text up to here reached the user.)`
  );
}

/**
 * The conversation turns for the prompt: empty text is dropped and a cut-off
 * answer goes in with its break mark. A failed answer keeps whatever text it made.
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
      // The picture follows the text the user wrote, so the model knows what it belongs to.
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

/** The latest assistant answer, skipping empty text and the answer being written. */
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

/** The last answer if it was cut off, otherwise null. */
export function lastInterruption(
  messages: Message[],
  options: ContinuityOptions = {},
) {
  const answer = lastAnswer(messages, options);
  return answer && isCutShort(answer) ? answer : null;
}

/**
 * The notice appended to the next turn's instructions. An answer that finished
 * normally returns an empty string, so an ordinary conversation adds nothing.
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
    ? "\n\nText up to the interruption:\n<<<\n" +
      (tail.length > excerptLimit
        ? tail.slice(0, excerptLimit) + "\n…(only the beginning is included)"
        : tail) +
      "\n>>>"
    : "";
  return [
    "# The previous answer was interrupted",
    `The last assistant answer was interrupted because ${cutReason(cut)}. In the history above, the bubble marked ${cutMark} is that answer, and only what comes before the mark reached the user.`,
    "- Do not repeat from the start what already reached the user. Carry it on and finish it where the user still needs it.",
    byNewMessage
      ? "- The new message the user just sent is why the earlier answer stopped. Handle the new request first, then close the earlier thought only as far as the new request needs it."
      : "- While answering the user's new message, close briefly anything left over from the earlier answer.",
    "- If the user asks why it stopped, say the reason above as it is. Do not invent what the cut text would have said.",
  ].join("\n") + excerpt;
}
