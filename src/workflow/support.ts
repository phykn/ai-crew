// Control-flow signals and the small helpers shared by the workflow steps.

import { z } from "zod";
import type { endingSchema } from "./prompts";

export type CheckOutcome = {
  passed: boolean;
  note: string;
  unavailable?: boolean;
  endingCorrection?: z.infer<typeof endingSchema>;
  findings?: { path: string; startLine: number; endLine: number; note: string }[];
};
export const maxRetries = 3;
export const finalLineBreaks = /(?:\r\n|\r|\n)+$/;
export class StalePlan extends Error {}
export class ClarificationRequired extends Error {}

export function outcome(check: PromiseSettledResult<unknown>): CheckOutcome {
  return check.status === "fulfilled"
    ? (check.value as CheckOutcome)
    : {
        passed: false,
        unavailable: true,
        note:
          "검증을 실행하지 못했어요. " +
          ((check.reason instanceof Error ? check.reason.message : "").slice(
            0,
            240,
          )),
      };
}

export function applyFileEnding(
  content: string,
  before: string | null,
  ending: z.infer<typeof endingSchema>,
) {
  if (ending === "as-written") return content;
  const original = before?.match(finalLineBreaks)?.[0] ?? "";
  const endings = {
    preserve: original,
    "one-line-break": original.startsWith("\r\n") ? "\r\n" : "\n",
    "no-line-break": "",
  };
  return content.replace(finalLineBreaks, "") + endings[ending];
}
