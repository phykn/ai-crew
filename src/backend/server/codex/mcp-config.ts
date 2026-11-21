import type { CrewMember, McpEndpoint, McpGrant } from "../../../shared/actions";

/**
 * Codex runs its own MCP client, so the app builds its server table from the
 * project servers this member may use. Only read-only tools are handed over:
 * a call that changes data has to pass the app approval card first, and Codex
 * has no way back into that card yet.
 */
export function codexMcpConfig(
  servers: McpEndpoint[],
  grants: McpGrant[],
  member: Pick<CrewMember, "id" | "hired">,
) {
  if (!member.hired) return undefined;
  const used = new Set<string>();
  const table: Record<string, { url: string; enabled_tools: string[] }> = {};
  for (const server of servers) {
    if (!server.enabled) continue;
    const tools = grants
      .filter(
        ({ memberId, serverId }) =>
          memberId === member.id && serverId === server.id,
      )
      .flatMap((grant) => {
        const tool = server.tools.find(
          ({ name, fingerprint, readOnly }) =>
            readOnly &&
            name === grant.toolName &&
            fingerprint === grant.fingerprint,
        );
        return tool ? [tool.name] : [];
      });
    if (!tools.length) continue;
    let key =
      server.name
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "server";
    for (let n = 2; used.has(key); n++) key = key.replace(/-\d+$/, "") + "-" + n;
    used.add(key);
    table[key] = { url: server.url, enabled_tools: tools };
  }
  return Object.keys(table).length ? { mcp_servers: table } : undefined;
}
