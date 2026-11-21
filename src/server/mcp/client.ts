import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Job, CrewMember, McpEndpoint, McpTool } from "../../shared/actions";
import { validateEndpointUrl } from "../diagnostics/run";
import type { CrewStore } from "../../store/store";

type ToolContext = Pick<Job, "projectId" | "sessionId"> & { id?: string };
export type ToolGateInput = {
  job: ToolContext;
  member: CrewMember;
  server: McpEndpoint;
  tool: McpTool;
  args: Record<string, unknown>;
  signal: AbortSignal;
};
/** Decides whether one external change may run. It records its own decision. */
type ToolGate = (
  input: ToolGateInput,
) => Promise<{ allow: boolean; actor: string }>;
function describeTool(
  tool: Awaited<ReturnType<Client["listTools"]>>["tools"][number],
): McpTool {
  const readOnly = tool.annotations?.readOnlyHint === true;
  return {
    name: tool.name,
    description: tool.description ?? "",
    readOnly,
    inputSchema: tool.inputSchema,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify([
          tool.name,
          tool.description,
          tool.inputSchema,
          readOnly,
        ]),
      )
      .digest("hex"),
  };
}

export class CrewMcp {
  constructor(
    private store: CrewStore,
    private gate?: ToolGate,
  ) {}

  setGate(gate: ToolGate) {
    this.gate = gate;
  }

  async connect(
    projectId: string,
    serverId: string,
    name: string,
    address: string,
  ) {
    this.store.getProject(projectId);
    const url = new URL(validateEndpointUrl(address, "mcp"));
    const previous = this.store
      .listMcpEndpoints(projectId)
      .find(({ id }) => id === serverId);
    if (previous && previous.url !== url.href)
      throw new Error("주소가 바뀐 서버는 별도 연결로 추가해 주세요.");
    const endpoint = {
      id: serverId,
      name,
      url: url.href,
      enabled: true,
      tools: [],
    };
    const signal = AbortSignal.timeout(12_000);
    const tools = await this.withClient(endpoint, signal, (client) =>
      this.listTools(client, signal),
    );
    this.store.saveMcpEndpoint(projectId, { ...endpoint, tools });
  }

  modelTools(job: ToolContext, member: CrewMember, signal: AbortSignal) {
    const grants = this.store
      .listMcpGrants(job.projectId)
      .filter(({ memberId }) => memberId === member.id);
    const servers = this.store.listMcpEndpoints(job.projectId);
    const catalog = grants.flatMap((grant) => {
      const server = servers.find(
        ({ id, enabled }) => id === grant.serverId && enabled,
      );
      const tool = server?.tools.find(
        ({ name, fingerprint }) =>
          name === grant.toolName && fingerprint === grant.fingerprint,
      );
      // A chat reply has no job to hold an approval request, so it only reads.
      if (tool && !tool.readOnly && !job.id) return [];
      return server && tool
        ? [
            {
              key: server.id + "/" + tool.name,
              server: server.name,
              name: tool.name,
              description: tool.description,
              readOnly: tool.readOnly,
              inputSchema: tool.inputSchema,
            },
          ]
        : [];
    });
    if (!catalog.length) return undefined;
    return {
      catalog,
      call: async (key: string, args: Record<string, unknown>) => {
        const entry = catalog.find((entry) => entry.key === key);
        if (!entry)
          return { error: "이 담당자에게 허용된 MCP 도구가 아니에요." };
        const serverId = key.slice(0, key.indexOf("/"));
        return this.runTool(job, member, serverId, entry.name, args, signal);
      },
    };
  }

  async runTool(
    job: ToolContext,
    member: CrewMember,
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    const log = (note: string) =>
      this.store.log(job.sessionId, member.name + " · MCP " + note, job.id);
    const access = () => {
      signal.throwIfAborted();
      const server = this.store
        .listMcpEndpoints(job.projectId)
        .find(({ id }) => id === serverId);
      if (!server?.enabled) throw new Error("서버 연결 해제");
      const tool = server.tools.find(({ name }) => name === toolName);
      const eligible = this.store
        .readMembers(job.projectId, member.roleId)
        .some(
          ({ id, hired, assignmentJobId }) =>
            hired && id === member.id && (!assignmentJobId || assignmentJobId === job.id),
        );
      const grant = this.store
        .listMcpGrants(job.projectId)
        .some(
          ({ memberId, serverId: id, toolName: name, fingerprint }) =>
            memberId === member.id &&
            id === serverId &&
            name === toolName &&
            fingerprint === tool?.fingerprint,
        );
      if (!eligible || !grant || !tool)
        throw new Error("현재 도구 권한 없음");
      if (!tool.readOnly && !job.id) throw new Error("현재 도구 권한 없음");
      return { server, tool };
    };
    try {
      const { server, tool } = access();
      if (!tool.readOnly) {
        const decision = this.gate
          ? await this.gate({ job, member, server, tool, args, signal })
          : { allow: false, actor: "로컬" };
        signal.throwIfAborted();
        if (!decision.allow) {
          log(
            server.name +
              "/" +
              toolName +
              " · " +
              (this.gate ? "변경 도구 거절" : "승인 절차 없음"),
          );
          return {
            error: this.gate
              ? "변경 도구 실행이 거절되어 아무것도 바꾸지 않았어요."
              : "승인 절차 없음",
          };
        }
      }
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(15_000),
      ]);
      const result = await this.withClient(
        server,
        requestSignal,
        async (client) => {
          const live = (await this.listTools(client, requestSignal)).find(
            ({ name }) => name === toolName,
          );
          const current = access();
          if (
            live?.fingerprint !== tool.fingerprint ||
            current.tool.fingerprint !== tool.fingerprint
          )
            throw new Error("도구 정의 변경 · 서버 새로 고침과 재승인 필요");
          log(server.name + "/" + toolName + " 실행");
          return client.callTool(
            { name: toolName, arguments: args },
            undefined,
            { signal: requestSignal },
          );
        },
      );
      signal.throwIfAborted();
      log(server.name + "/" + toolName + (result.isError ? " 실패" : " 완료"));
      return {
        isError: result.isError ?? false,
        data: JSON.stringify(result.structuredContent ?? result.content).slice(
          0,
          12_000,
        ),
      };
    } catch (error) {
      signal.throwIfAborted();
      const message =
        error instanceof Error &&
        /^(서버 연결 해제|현재 도구 권한 없음|도구 정의 변경|변경 도구 거절|승인 절차 없음)/.test(
          error.message,
        )
          ? error.message
          : "연결 또는 도구 실행 실패";
      log(toolName + " · " + message);
      return { error: message };
    }
  }

  private async withClient<T>(
    endpoint: McpEndpoint,
    signal: AbortSignal,
    use: (client: Client) => Promise<T>,
  ) {
    const client = new Client({ name: "ai-crew", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
      requestInit: { redirect: "error" },
      fetch: (input, options) =>
        fetch(input, {
          ...options,
          redirect: "error",
          signal: options?.signal
            ? AbortSignal.any([signal, options.signal])
            : signal,
        }),
    });
    try {
      await client.connect(transport, { signal });
      return await use(client);
    } finally {
      await client.close();
    }
  }

  private async listTools(client: Client, signal: AbortSignal) {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, {
        signal,
      });
      tools.push(...page.tools.map(describeTool));
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }
}
