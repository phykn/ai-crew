import { useState, type FormEvent } from "react";
import { roleSkillNames, type Action, type CrewMember, type Snapshot } from "../../shared/actions";
import { crewDefinition } from "../../shared/crew-definition";
import { skillStateLabels } from "../../shared/skill-status";

export function CrewSettings({
  member,
  data,
  run,
  close,
  openMemory,
  openJob,
  focusApproval,
  focusSkill,
  error,
}: {
  member: CrewMember;
  data: Snapshot;
  run: (action: Action) => Promise<boolean>;
  close: () => void;
  openMemory: () => void;
  openJob: (jobId: string) => void;
  focusApproval: (approvalId: string) => void;
  focusSkill?: string | null;
  error: string;
}) {
  const projectId = data.current!.id;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<"skill" | "server" | "model" | null>(null);
  const skills = data.skills.filter(({ memberId }) => memberId === member.id);
  const state = (skillId: string) =>
    data.skillStates.find((status) => status.skillId === skillId);
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
      form === "model"
        ? {
            type: "model.add",
            id,
            name,
            provider: "local",
            baseUrl: value,
            model: String(input.get("model") ?? "").trim() || null,
            enabled: true,
            vision: input.get("vision") === "on",
          }
        : form === "server"
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
      <p className="crew-role-skills">
        역할 스킬 · {roleSkillNames(member.roleId).join(", ")}
      </p>
      <details>
        <summary>정의 MD</summary>
        <pre>{crewDefinition(member.roleId)}</pre>
      </details>
      <button type="button" onClick={openMemory}>기억 보기</button>

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
        {skills.map((skill) => {
          const status = state(skill.id);
          return (
            <details key={skill.id} open={focusSkill === skill.id}>
              <summary>
                {skill.name} · {skillStateLabels[status?.state ?? "ready"]}
                {status?.reason ? " · " + status.reason : ""}
                {status?.tool && status.state !== "unavailable"
                  ? " · " + status.tool
                  : ""}
              </summary>
              <pre>{skill.markdown}</pre>
              <div className="skill-actions">
                {status?.state === "in-use" && status.jobId && (
                  <button type="button" onClick={() => openJob(status.jobId!)}>
                    실행 로그
                  </button>
                )}
                {status?.state === "awaiting" && status.approvalId && (
                  <button
                    type="button"
                    onClick={() => focusApproval(status.approvalId!)}
                  >
                    승인 질문
                  </button>
                )}
                {status?.state === "unavailable" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setForm(form === "server" ? null : "server")}
                  >
                    MCP 설정
                  </button>
                )}
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
              </div>
            </details>
          );
        })}
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
          <p>
            Codex 실행에는 읽기 도구만 전달돼요. 변경 도구는 앱의 승인 카드를
            거치는 로컬 모델 실행에서 쓸 수 있어요.
          </p>
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
              const supported = !tool.readOnly ? member.provider === "local" : true;
              return (
                <details key={tool.name}>
                  <summary>
                    {tool.name} · {tool.readOnly ? "읽기" : "변경 · 승인 필요"}
                  </summary>
                  {tool.description && <p>{tool.description}</p>}
                  <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                  {(tool.readOnly || supported) && (
                    <label>
                      <input
                        type="checkbox"
                        checked={allow}
                        disabled={
                          busy ||
                          (!allow &&
                            (!supported || !server.enabled || !member.hired))
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
                      {tool.readOnly ? "읽기 허용" : "변경 허용"}
                    </label>
                  )}
                  {!tool.readOnly && !supported && (
                    <p>Codex 실행에서는 이 변경 도구를 쓸 수 없어요.</p>
                  )}
                </details>
              );
            })}
          </details>
        ))}
      </section>

      <section aria-label="모델 연결">
        <header>
          <strong>모델 연결</strong>
          <button
            type="button"
            disabled={busy}
            onClick={() => setForm(form === "model" ? null : "model")}
          >
            연결 추가
          </button>
        </header>
        {data.modelConnections.length ? (
          data.modelConnections.map((connection) => (
            <div className="model-connection" key={connection.id}>
              <span>
                {connection.name} · {connection.provider}
                {connection.baseUrl ? " · " + connection.baseUrl : ""}
                {connection.model ? " · " + connection.model : ""}
                {connection.vision ? " · 비전" : ""}
                {connection.enabled ? "" : " · 사용 안 함"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save({
                    type: "model.update",
                    id: connection.id,
                    vision: !connection.vision,
                  })
                }
              >
                {connection.vision ? "비전 해제" : "비전으로"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save({
                    type: "model.update",
                    id: connection.id,
                    enabled: !connection.enabled,
                  })
                }
              >
                {connection.enabled ? "사용 중지" : "사용"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save({ type: "model.remove", id: connection.id })
                }
              >
                제거
              </button>
            </div>
          ))
        ) : (
          <p className="muted">등록한 모델 연결이 없어요. 환경의 기본 주소를 써요.</p>
        )}
      </section>

      {form && (
        <form key={form} onSubmit={(event) => void submit(event)}>
          <label>
            이름
            <input name="name" required maxLength={64} />
          </label>
          {form === "model" ? (
            <>
              <label>
                OpenAI 호환 주소
                <input
                  name="value"
                  type="url"
                  required
                  placeholder="http://127.0.0.1:8082/v1"
                />
              </label>
              <label>
                모델 이름 (선택)
                <input name="model" maxLength={120} />
              </label>
              <label>
                <input type="checkbox" name="vision" />
                그림도 읽는 모델(비전)
              </label>
            </>
          ) : form === "server" ? (
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
            {busy
              ? "처리 중"
              : form === "server"
                ? "연결"
                : form === "model"
                  ? "추가"
                  : "추가"}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
