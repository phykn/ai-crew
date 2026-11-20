import { useState, type FormEvent } from "react";
import type { Action, CrewMember, Snapshot } from "./actions";
import { crewDefinition } from "./crew-definition";

export function CrewSettings({
  member,
  data,
  run,
  close,
  error,
}: {
  member: CrewMember;
  data: Snapshot;
  run: (action: Action) => Promise<boolean>;
  close: () => void;
  error: string;
}) {
  const projectId = data.current!.id;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<"skill" | "server" | null>(null);
  const skills = data.skills.filter(({ memberId }) => memberId === member.id);
  async function save(action: Action) {
    setBusy(true);
    try {
      return await run(action);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const name = String(input.get("name") ?? "").trim();
    const value = String(input.get("value") ?? "").trim();
    if (!name || !value || busy) return;
    const id = crypto.randomUUID();
    const action: Action =
      form === "server"
        ? { type: "mcp.connect", projectId, serverId: id, name, url: value }
        : {
            type: "crew.skill.add",
            projectId,
            memberId: member.id,
            skillId: id,
            name,
            markdown: value,
          };
    if (await save(action)) setForm(null);
  }

  return (
    <section className="crew-settings" aria-label={member.name + " 설정"}>
      <header>
        <strong>{member.name}</strong>
        <button type="button" onClick={close}>
          닫기
        </button>
      </header>
      <details>
        <summary>정의 MD</summary>
        <pre>{crewDefinition(member.roleId)}</pre>
      </details>

      <section aria-label="스킬">
        <header>
          <strong>스킬</strong>
          <button
            type="button"
            disabled={busy}
            onClick={() => setForm(form === "skill" ? null : "skill")}
          >
            추가
          </button>
        </header>
        {skills.map((skill) => (
          <details key={skill.id}>
            <summary>{skill.name}</summary>
            <pre>{skill.markdown}</pre>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void save({
                  type: "crew.skill.remove",
                  projectId,
                  memberId: member.id,
                  skillId: skill.id,
                })
              }
            >
              스킬 해제
            </button>
          </details>
        ))}
      </section>

      <section aria-label="MCP">
        <header>
          <strong>MCP</strong>
          <button
            type="button"
            disabled={busy}
            onClick={() => setForm(form === "server" ? null : "server")}
          >
            연결 추가
          </button>
        </header>
        {member.provider === "codex" && (
          <p>범례의 읽기 도구는 로컬 모델에서 사용할 수 있어요.</p>
        )}
        {data.mcpServers.map((server) => (
          <details key={server.id}>
            <summary>
              {server.name} · {server.enabled ? "연결됨" : "연결 해제됨"}
            </summary>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void save({
                  type: "mcp.connect",
                  projectId,
                  serverId: server.id,
                  name: server.name,
                  url: server.url,
                })
              }
            >
              {server.enabled ? "도구 새로 고침" : "다시 연결"}
            </button>
            {server.enabled && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save({
                    type: "mcp.disconnect",
                    projectId,
                    serverId: server.id,
                  })
                }
              >
                연결 해제
              </button>
            )}
            {server.tools.map((tool) => {
              const allow = data.mcpGrants.some(
                (grant) =>
                  grant.memberId === member.id &&
                  grant.serverId === server.id &&
                  grant.toolName === tool.name &&
                  grant.fingerprint === tool.fingerprint,
              );
              const supported = member.provider === "local";
              return (
                <details key={tool.name}>
                  <summary>
                    {tool.name} · {tool.readOnly ? "읽기" : "변경 가능 도구"}
                  </summary>
                  {tool.description && <p>{tool.description}</p>}
                  <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                  {tool.readOnly && (supported || allow) && (
                    <label>
                      <input
                        type="checkbox"
                        checked={allow}
                        disabled={
                          busy ||
                          (!allow && (!supported || !server.enabled || !member.hired))
                        }
                        onChange={(event) =>
                          void save({
                            type: "mcp.grant",
                            projectId,
                            serverId: server.id,
                            memberId: member.id,
                            toolName: tool.name,
                            allow: event.currentTarget.checked,
                          })
                        }
                      />
                      읽기 허용
                    </label>
                  )}
                </details>
              );
            })}
          </details>
        ))}
      </section>

      {form && (
        <form key={form} onSubmit={(event) => void submit(event)}>
          <label>
            이름
            <input name="name" required maxLength={64} />
          </label>
          {form === "server" ? (
            <label>
              서버 주소
              <input
                name="value"
                type="url"
                required
                placeholder="http://localhost:3000/mcp"
              />
            </label>
          ) : (
            <label>
              스킬 MD
              <textarea name="value" required maxLength={16000} rows={4} />
            </label>
          )}
          <button type="submit" disabled={busy}>
            {busy ? "처리 중" : form === "server" ? "연결" : "추가"}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
