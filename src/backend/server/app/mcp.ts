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
      title: "Find actions",
      description:
        "Find the ID, description and input schema of an action the screen can run. Narrow it by feature area: screen, project, session, job, log, crew, model, wiki, memory or workflow.",
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
      title: "Read state",
      description:
        "Read the current project, session, tab, jobs, waiting approvals, crew, skill states, workflow and usage. A file scope or an approval record is found in the job log of an action result.",
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
      title: "Run action",
      description:
        "Run an action found with app_find_actions through the same runner as the screen. A change or a send carries a requestId, and an action that needs user input returns a waiting-for-input result.",
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
