import { jsonSchema, tool, type ToolSet } from "ai";
import { appRead, findActions, type ActionRunner } from "./actions";

/**
 * 비서(로컬 모델)에게 주는 앱 조작 도구. 화면 IPC와 같은 실행기를 쓰며,
 * 대화 전송은 비서가 자기 대화를 다시 시작하지 않도록 막는다.
 */
export function appTools(runner: ActionRunner): ToolSet {
  return {
    app_find_actions: tool({
      description:
        "Find the ID, description and input schema of an action the screen can run. Narrow it by feature area.",
      inputSchema: jsonSchema<{ query?: string; area?: string }>({
        type: "object",
        properties: {
          query: { type: "string" },
          area: { type: "string" },
        },
      }),
      execute: ({ query, area }) => findActions(query ?? "", area),
    }),
    app_read: tool({
      description:
        "Read the current project, session, tab, jobs, waiting approvals, crew, skill states, workflow and usage.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: () => appRead(runner.store),
    }),
    app_act: tool({
      description:
        "Run an action found with app_find_actions through the same runner as the screen. An action that needs user input returns a waiting-for-input result.",
      inputSchema: jsonSchema<{
        action: Record<string, unknown>;
        requestId?: string;
      }>({
        type: "object",
        properties: {
          action: { type: "object" },
          requestId: { type: "string" },
        },
        required: ["action"],
      }),
      execute: async ({ action, requestId }) => {
        const type = String((action as { type?: unknown }).type ?? "");
        if (type.startsWith("chat."))
          return { error: "대화 전송은 화면에서 이어가 주세요." };
        const outcome = await runner.run(
          action,
          "app",
          requestId ?? crypto.randomUUID(),
        );
        return {
          status: outcome.status,
          message:
            outcome.status === "waiting"
              ? outcome.message
              : "적용했어요.",
          state: appRead(runner.store),
        };
      },
    }),
  };
}
