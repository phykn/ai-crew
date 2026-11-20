import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateText,
  isStepCount,
  streamText,
  tool,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import type { Project } from "./actions";

const modelList = z.object({
  data: z.array(
    z.object({ id: z.string().min(1), loaded: z.boolean().optional() }),
  ),
});

async function connectLocal(signal: AbortSignal) {
  const baseURL = (
    process.env.AI_CREW_LOCAL_URL || "http://127.0.0.1:8082/v1"
  ).replace(/\/+$/, "");
  let model = process.env.AI_CREW_LOCAL_MODEL;
  if (!model) {
    const result = await fetch(baseURL + "/models", {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      redirect: "error",
    });
    if (!result.ok) throw new Error("로컬 모델 목록을 불러오지 못했어요.");
    const { data } = modelList.parse(await result.json());
    model =
      data.find((item) => item.loaded)?.id ??
      data.find((item) => item.loaded === undefined)?.id;
  }
  if (!model)
    throw new Error("로컬 서버에서 모델을 불러온 뒤 다시 보내 주세요.");

  return createOpenAICompatible({
    name: "ai-crew-local",
    baseURL,
    apiKey: process.env.AI_CREW_LOCAL_API_KEY,
  }).chatModel(model);
}

export async function decideLocal<T extends z.ZodType>(
  system: string,
  prompt: string,
  schema: T,
  signal: AbortSignal,
): Promise<z.infer<T>> {
  const result = await generateText({
    model: await connectLocal(signal),
    system,
    prompt: prompt + "\nReturn your result using the submit_result tool.",
    tools: {
      submit_result: tool({
        description: "Return the structured result for this step.",
        inputSchema: schema,
      }),
    },
    toolChoice: { type: "tool", toolName: "submit_result" },
    maxOutputTokens: 3072,
    maxRetries: 0,
    abortSignal: signal,
  });
  return schema.parse(
    result.toolCalls.find((call) => call.toolName === "submit_result")?.input,
  );
}

export async function runLocal(
  project: Project,
  history: ModelMessage[],
  signal: AbortSignal,
  emit: (text: string) => void,
  log: (note: string) => void,
  delegate: () => { id: string; status: string },
) {
  const reply = streamText({
    model: await connectLocal(signal),
    system:
      "You are the AI Crew secretary. Respond in the user's language. Use project_info when asked for the current project details. Call delegate_work only when the user explicitly asks to create or modify a project file. The planning step and approval will be shown separately. Never claim a delegated change is already done.",
    messages: history,
    tools: {
      delegate_work: tool({
        description:
          "Ask the crew to plan an explicitly requested change to a project file.",
        inputSchema: z.object({}),
        execute: async () => {
          signal.throwIfAborted();
          return delegate();
        },
      }),
      project_info: tool({
        description: "Get the name of the current AI Crew project.",
        inputSchema: z.object({}),
        execute: async () => {
          signal.throwIfAborted();
          log("비서 · 현재 프로젝트 조회");
          return { name: project.name };
        },
      }),
    },
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 ? {} : { toolChoice: "none" },
    stopWhen: isStepCount(2),
    maxOutputTokens: 1536,
    maxRetries: 0,
    abortSignal: signal,
  });

  let answered = false;
  for await (const part of reply.fullStream) {
    if (part.type === "error") throw part.error;
    if (part.type === "abort") signal.throwIfAborted();
    if (part.type === "text-delta") {
      answered ||= !!part.text.trim();
      emit(part.text);
    }
  }
  signal.throwIfAborted();
  if (!answered) throw new Error("모델 응답에 표시할 내용이 없어요.");
}
