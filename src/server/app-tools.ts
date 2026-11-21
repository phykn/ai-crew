import { jsonSchema, tool, type ToolSet } from "ai";
import { appRead, findActions, type ActionRunner } from "./app-actions";

/**
 * 비서(로컬 모델)에게 주는 앱 조작 도구. 화면 IPC와 같은 실행기를 쓰며,
 * 대화 전송은 비서가 자기 대화를 다시 시작하지 않도록 막는다.
 */
export function appTools(runner: ActionRunner): ToolSet {
  return {
    app_find_actions: tool({
      description:
        "화면에서 할 수 있는 동작의 ID, 설명, 입력 스키마를 찾는다. 기능 영역으로 좁힐 수 있다.",
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
        "현재 프로젝트·세션·탭·업무·대기 중 승인·크루·스킬 상태·워크플로우·사용량을 읽는다.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: () => appRead(runner.store),
    }),
    app_act: tool({
      description:
        "app_find_actions에서 찾은 동작을 화면과 같은 실행기로 실행한다. 사용자 입력이 필요한 동작은 '입력 대기'를 돌려준다.",
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
