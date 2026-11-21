import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { appRead, actionCatalog, findActions, type ActionRunner } from "./actions";

/**
 * 앱 도우미가 쓰는 세 도구. 도구 표면은 좁게 두고, 동작 목록과 입력 스키마는
 * 화면과 같은 등록 정보(`actionCatalog`)에서 찾는다.
 */
export function createAppMcpServer(runner: ActionRunner) {
  const server = new McpServer({ name: "ai-crew-app", version: "0.1.0" });

  server.registerTool(
    "app_find_actions",
    {
      title: "동작 찾기",
      description:
        "화면에서 할 수 있는 동작의 ID, 설명, 입력 스키마를 찾는다. 기능 영역(화면, 프로젝트, 세션, 업무, 로그, 크루, 모델, 위키, 기억, 워크플로우)으로 좁힐 수 있다.",
      inputSchema: {
        query: z.string().max(200).optional(),
        area: z.string().max(60).optional(),
      },
    },
    async ({ query, area }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(findActions(query ?? "", area), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "app_read",
    {
      title: "상태 읽기",
      description:
        "현재 프로젝트·세션·탭·업무·대기 중 승인·크루·스킬 상태·워크플로우·사용량을 읽는다. 파일 범위나 승인 기록은 동작 결과의 업무 로그에서 확인한다.",
      inputSchema: {},
    },
    async () => ({
      content: [
        { type: "text", text: JSON.stringify(appRead(runner.store), null, 2) },
      ],
    }),
  );

  server.registerTool(
    "app_act",
    {
      title: "동작 실행",
      description:
        "app_find_actions에서 찾은 동작을 화면과 같은 실행기로 실행한다. 변경·전송에는 requestId를 붙이고, 사용자 입력이 필요한 동작은 '입력 대기'를 돌려준다.",
      inputSchema: {
        action: z.record(z.string(), z.unknown()),
        requestId: z.string().max(100).optional(),
      },
    },
    async ({ action, requestId }) => {
      const outcome = await runner.run(action, "app", requestId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: outcome.status,
                message:
                  outcome.status === "waiting" ? outcome.message : "적용했어요.",
                ...(outcome.status === "diagnostics"
                  ? { report: outcome.report }
                  : {}),
                actions: actionCatalog.length,
                state: appRead(runner.store),
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    },
  );

  return server;
}
