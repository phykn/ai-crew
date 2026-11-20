// The prompts and the zod schemas that shape the model's JSON replies.

import { z } from "zod";

export const planSchema = z.strictObject({
  specialist: z.strictObject({
    specialty: z
      .string()
      .trim()
      .max(48)
      .describe(
        "Explicit specialty to be consulted in addition to the normal crew, or empty for none.",
      ),
    permanent: z
      .boolean()
      .describe(
        "Only true when the user explicitly asks to keep the specialist on the crew.",
      ),
  }),
  paths: z
    .array(z.string().min(1).max(300))
    .max(8)
    .describe(
      "Only relative paths for ordinary file edits or creations. Do not list move sources or destinations here.",
    ),
  moves: z
    .array(
      z.strictObject({
        from: z.string().min(1).max(300),
        to: z.string().min(1).max(300),
        edit: z
          .boolean()
          .describe(
            "True only if the user also requests a content change to the moved file.",
          ),
      }),
    )
    .max(8)
    .describe(
      "Explicit in-project file moves to unused paths. Use an empty list for other requests.",
    ),
  directories: z
    .array(z.string().min(1).max(300))
    .max(8)
    .describe(
      "Existing relative directories that must be reserved as a whole because the user explicitly requested that scope. Use an empty list for ordinary file edits. Use . only when the requested scope explicitly covers the entire project. This does not authorize editing additional paths.",
    ),
  goal: z
    .string()
    .min(1)
    .max(500)
    .describe("A short plan in the user's language."),
  criterion: z
    .string()
    .min(1)
    .max(500)
    .describe("An observable acceptance criterion in the user's language."),
});
export const reviewSchema = z.strictObject({
  passed: z.boolean(),
  note: z.string().min(1).max(700),
});
export const fileReviewSchema = reviewSchema.extend({
  findings: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(300),
        startLine: z.number().int().min(1),
        endLine: z.number().int().min(1),
        note: z.string().trim().min(1).max(500),
      }),
    )
    .max(12)
    .describe(
      "Concrete findings anchored to the one-based line numbers of the saved after text. Return an empty list if there are no findings.",
    ),
});
export const endingSchema = z.enum([
  "as-written",
  "preserve",
  "one-line-break",
  "no-line-break",
]);
export const testResultSchema = z.object({
  passed: z.boolean(),
  note: z.string(),
  unavailable: z.boolean().optional(),
  command: z.string().optional(),
  endingCorrection: endingSchema.optional(),
});
export type TestResult = z.infer<typeof testResultSchema>;
export const verificationSchema = z.strictObject({
  kind: z.enum(["text", "javascript", "unavailable"]),
  expected: z
    .string()
    .max(500)
    .describe(
      "For text checks, provide the expected text without its final line breaks when ending sets them separately. Never write backslash-n to represent a line break. Otherwise return an empty string.",
    ),
  exact: z
    .boolean()
    .describe("Whether the entire file must equal the expected text."),
  ending: endingSchema.describe(
    "For an exact text check, separately record any requirement about how the file ends. Use preserve to keep the original final line breaks, one-line-break to require one final line break, or no-line-break to require no final line break. If unspecified or not an exact text check, use as-written.",
  ),
  reason: z
    .string()
    .describe(
      "If unavailable, give a short reason. For other kinds return an empty string.",
    ),
});
export const multiVerificationSchema = z.strictObject({
  checks: z
    .array(verificationSchema.extend({ path: z.string().min(1).max(300) }))
    .min(1)
    .max(8),
});
export const verificationPrompt =
  'Choose an independent executable check from the current user request, without seeing the produced file. When the plan conflicts with the current request, use the current request. For exact text, give the plain expected text and put the final line break requirement in ending. For a file containing Hello and one line break use {"expected":"Hello","exact":true,"ending":"one-line-break"}. Choose javascript only when syntax alone satisfies the criterion, or unavailable when the behavior cannot be checked.';
export const editSchema = z.strictObject({
  content: z
    .string()
    .max(24000)
    .describe(
      "Complete replacement contents of the one approved file, without code fences.",
    ),
  ending: endingSchema.describe(
    "Use preserve for an ordinary replacement in an existing file. Use one-line-break or no-line-break if the user explicitly specifies the final number of line breaks. Use as-written for new files without an ending requirement.",
  ),
});

export const editsSchema = z.strictObject({
  edits: z
    .array(editSchema.extend({ path: z.string().min(1).max(300) }))
    .min(1)
    .max(8),
});
export const consultation = z.strictObject({
  consult: z
    .enum(["none", "style", "review"])
    .describe(
      "Choose a peer before editing only when the request asks for their input or a concrete decision needs their expertise.",
    ),
  question: z
    .string()
    .describe(
      "A specific question for that peer. Use an empty string when no consultation is needed.",
    ),
});
export const developmentSchema = editSchema.extend(consultation.shape);
export const multiDevelopmentSchema = editsSchema.extend(consultation.shape);
export const peerSchema = z.strictObject({
  kind: z.enum(["answer", "clarify", "consult", "blocked"]),
  answer: z
    .string()
    .trim()
    .max(1200)
    .describe(
      "Guidance for answer, or the unresolved requirement for blocked. Otherwise empty.",
    ),
  peer: z
    .enum(["none", "plan", "development", "review", "style", "test"])
    .describe("A role for consult only. Otherwise none."),
  question: z
    .string()
    .trim()
    .max(500)
    .describe("One specific question for clarify or consult. Otherwise empty."),
});
export const supplementSchema = z.strictObject({
  answer: z
    .string()
    .trim()
    .max(1200)
    .describe(
      "Answer only from the approved scope and original evidence. Return an empty string if evidence is missing.",
    ),
});
