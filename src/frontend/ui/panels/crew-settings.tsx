import { useState, type FormEvent } from "react";
import { roleSkillNames, roles, type Action, type CrewMember, type Snapshot } from "../../../shared/actions";
import { crewDefinition } from "../../../shared/crew-definition";
import { skillStateLabels } from "../../../shared/skill-status";
import { Chevron, CozyDetails } from "../common/cozy";

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
  const [openSkill, setOpenSkill] = useState<string | null>(
    focusSkill ?? null,
  );
  const [openTool, setOpenTool] = useState<string | null>(null);
  const skills = data.skills.filter(({ memberId }) => memberId === member.id);
  const role = roles.find(({ id }) => id === member.roleId);
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
    <section className="crew-settings cozy-scope" aria-label={member.name + " 설정"}>
      <header className="cozy-card settings-profile">
        <span
          className="settings-avatar"
          style={{ background: role?.color ?? "#d8cab2" }}
          aria-hidden="true"
        >
          {member.name.slice(0, 1)}
        </span>
        <div className="settings-identity">
          <strong>{member.name}</strong>
          <span className="settings-badges">
            <span className="cozy-badge">{role?.title ?? member.roleId}</span>
            <span className="cozy-badge">
              {member.provider === "codex" ? "Codex" : "로컬 모델"}
            </span>
            <span className={member.hired ? "cozy-badge is-on" : "cozy-badge is-off"}>
              {member.hired ? "고용 중" : "미고용"}
            </span>
          </span>
        </div>
        <div className="settings-head-actions">
          <button type="button" onClick={openMemory}>
            기억 보기
          </button>
          <button type="button" onClick={close}>
            닫기
          </button>
        </div>
      </header>

      <CozyDetails className="settings-section" title="정의 MD">
        <pre>{crewDefinition(member.roleId)}</pre>
      </CozyDetails>

      <section className="cozy-card settings-section" aria-label="스킬">
        <header className="settings-section-head">
          <h3>스킬</h3>
          <span className="cozy-badge">{skills.length}</span>
          <button
            type="button"
            className="settings-add"
            disabled={busy}
            onClick={() => setForm(form === "skill" ? null : "skill")}
          >
            ＋ 추가
          </button>
        </header>
        <p className="settings-note">
          역할 스킬 · {roleSkillNames(member.roleId).join(", ")}
        </p>
        <div className="cozy-stack">
          {skills.map((skill) => {
            const status = state(skill.id);
            const open = openSkill === skill.id;
            return (
              <article className="skill-card" key={skill.id}>
                <header>
                  <strong>{skill.name}</strong>
                  <span
                    className={
                      status?.state === "unavailable"
                        ? "cozy-badge is-off"
                        : "cozy-badge is-on"
                    }
                  >
                    {skillStateLabels[status?.state ?? "ready"]}
                  </span>
                  <button
                    type="button"
                    className="settings-toggle"
                    aria-expanded={open}
                    onClick={() => setOpenSkill(open ? null : skill.id)}
                  >
                    내용
                    <Chevron />
                  </button>
                </header>
                {status?.reason && <p className="settings-note">{status.reason}</p>}
                {status?.tool && status.state !== "unavailable" && (
                  <p className="settings-note">{status.tool}</p>
                )}
                {open && <pre>{skill.markdown}</pre>}
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
              </article>
            );
          })}
          {!skills.length && (
            <p className="settings-note">
              아직 붙인 스킬이 없어요. 추가를 눌러 이 크루만의 스킬을 적어 주세요.
            </p>
          )}
        </div>
      </section>

      <section className="cozy-card settings-section" aria-label="MCP">
        <header className="settings-section-head">
          <h3>MCP</h3>
          <span className="cozy-badge">{data.mcpServers.length}</span>
          <button
            type="button"
            className="settings-add"
            disabled={busy}
            onClick={() => setForm(form === "server" ? null : "server")}
          >
            ＋ 연결 추가
          </button>
        </header>
        {member.provider === "codex" && (
          <p className="settings-note">
            Codex 실행에는 읽기 도구만 전달돼요. 변경 도구는 앱의 승인 카드를
            거치는 로컬 모델 실행에서 쓸 수 있어요.
          </p>
        )}
        <div className="cozy-stack">
          {data.mcpServers.map((server) => (
            <article className="server-card" key={server.id}>
              <header>
                <strong>{server.name}</strong>
                <span className={server.enabled ? "cozy-badge is-on" : "cozy-badge is-off"}>
                  {server.enabled ? "연결됨" : "연결 해제됨"}
                </span>
                <span className="settings-server-actions">
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
                </span>
              </header>
              {!!server.tools.length && (
                <ul className="tool-list">
                  {server.tools.map((tool) => {
                    const allow = data.mcpGrants.some(
                      (grant) =>
                        grant.memberId === member.id &&
                        grant.serverId === server.id &&
                        grant.toolName === tool.name &&
                        grant.fingerprint === tool.fingerprint,
                    );
                    const supported = !tool.readOnly ? member.provider === "local" : true;
                    const open = openTool === server.id + "/" + tool.name;
                    return (
                      <li className="tool-row" key={tool.name}>
                        <label className="tool-grant">
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
                          <code>{tool.name}</code>
                        </label>
                        <span className={tool.readOnly ? "cozy-badge" : "cozy-badge is-off"}>
                          {tool.readOnly ? "읽기" : "변경 · 승인"}
                        </span>
                        <button
                          type="button"
                          className="settings-toggle"
                          aria-expanded={open}
                          onClick={() => setOpenTool(open ? null : server.id + "/" + tool.name)}
                        >
                          스키마
                          <Chevron />
                        </button>
                        {open && (
                          <div className="tool-detail">
                            {tool.description && <p>{tool.description}</p>}
                            <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                          </div>
                        )}
                        {!tool.readOnly && !supported && (
                          <p className="settings-note">
                            Codex 실행에서는 이 변경 도구를 쓸 수 없어요.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          ))}
          {!data.mcpServers.length && (
            <p className="settings-note">연결한 MCP 서버가 없어요.</p>
          )}
        </div>
      </section>

      <section className="cozy-card settings-section" aria-label="모델 연결">
        <header className="settings-section-head">
          <h3>모델 연결</h3>
          <span className="cozy-badge">{data.modelConnections.length}</span>
          <button
            type="button"
            className="settings-add"
            disabled={busy}
            onClick={() => setForm(form === "model" ? null : "model")}
          >
            ＋ 연결 추가
          </button>
        </header>
        <div className="cozy-stack">
          {data.modelConnections.map((connection) => (
            <article className="model-connection" key={connection.id}>
              <header>
                <strong>{connection.name}</strong>
                <span className="cozy-badge">{connection.provider}</span>
                {connection.vision && <span className="cozy-badge is-on">비전</span>}
                <span className={connection.enabled ? "cozy-badge is-on" : "cozy-badge is-off"}>
                  {connection.enabled ? "사용 중" : "사용 안 함"}
                </span>
              </header>
              <p className="settings-note">
                {[connection.baseUrl, connection.model].filter(Boolean).join(" · ") ||
                  "환경의 기본 주소를 써요."}
              </p>
              <div className="cozy-actions">
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
            </article>
          ))}
          {!data.modelConnections.length && (
            <p className="settings-note">등록한 모델 연결이 없어요. 환경의 기본 주소를 써요.</p>
          )}
        </div>
      </section>

      {form && (
        <form className="cozy-card settings-form" key={form} onSubmit={(event) => void submit(event)}>
          <header className="settings-section-head">
            <h3>
              {form === "model" ? "모델 연결" : form === "server" ? "MCP 서버" : "스킬"}
            </h3>
            <button type="button" className="settings-toggle" onClick={() => setForm(null)}>
              닫기
            </button>
          </header>
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
              <label className="settings-check">
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
          <button type="submit" className="settings-submit" disabled={busy}>
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
