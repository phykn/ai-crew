// The camp view: the crew roster (hiring, names, models, skills, settings) and the
// characters standing in the camp.

import { roles, type Action, type Snapshot } from "./actions";
import { CrewSettings } from "./crew-settings";
import { Icon, SkillChips, sprites } from "./renderer-ui";
import camp from "../demo/assets/camp.webp";

type CampPanelProps = {
  data: Snapshot | null;
  running: Snapshot["messages"][number] | undefined;
  legend: boolean;
  error: string;
  setError: (message: string) => void;
  patchView: (patch: Partial<Snapshot["view"]>) => void;
  run: (action: Action, resetDraft?: boolean) => Promise<boolean>;
  editingMember: string | null;
  setEditingMember: (memberId: string | null) => void;
  addingMember: boolean;
  setAddingMember: (adding: boolean) => void;
  settingsMember: string | null;
  setSettingsMember: (memberId: string | null) => void;
  focusSkill: string | null;
  setFocusSkill: (skillId: string | null) => void;
  skillPreview: { memberId: string; text: string } | null;
  setSkillPreview: (preview: { memberId: string; text: string } | null) => void;
  setLogJob: (jobId: string | null) => void;
  setView: (tab: Snapshot["view"]["tab"]) => void;
  setToolFocus: (approvalId: string | null) => void;
  setMemoryOwner: (ownerId: string | null | undefined) => void;
  setMemorySection: (section: Snapshot["view"]["memorySection"]) => void;
  setShowCamp: (camp: boolean) => void;
};

export function CampPanel({
  data,
  running,
  legend,
  error,
  setError,
  patchView,
  run,
  editingMember,
  setEditingMember,
  addingMember,
  setAddingMember,
  settingsMember,
  setSettingsMember,
  focusSkill,
  setFocusSkill,
  skillPreview,
  setSkillPreview,
  setLogJob,
  setView,
  setToolFocus,
  setMemoryOwner,
  setMemorySection,
  setShowCamp,
}: CampPanelProps) {
  const campMembers = new Map(
    (data?.camp.members ?? []).map((member) => [member.id, member]),
  );
  const configuredMember = data?.members.find(
    ({ id }) => id === settingsMember,
  );
  return (
    <section
      className="camp"
      aria-label="캠프"
      style={{ backgroundImage: `url(${camp})` }}
    >
      <div className="camp-tools">
        <strong className="wordmark">
          <Icon name="fire" /> AI Crew
        </strong>
        {data?.current && (
          <details
            className="roster"
            open={legend}
            onToggle={(event) => {
              if (event.currentTarget.open !== legend)
                patchView({ legend: event.currentTarget.open });
            }}
          >
            <summary>
              크루 · {data.members.filter((member) => member.hired).length}
            </summary>
            <div className="crew-list">
              {data.members
                .filter((member) => member.hired || !member.assignmentJobId)
                .map((member) => {
                  const role = roles.find(({ id }) => id === member.roleId)!;
                  return (
                    <div key={member.id} className="crew-row">
                      <button
                        type="button"
                        className="employment"
                        aria-label={
                          role.title +
                          " " +
                          (member.hired ? "고용" : "미고용") +
                          (member.id !== role.id ? " · " + member.name : "")
                        }
                        aria-pressed={member.hired}
                        onClick={() => {
                          if (data.current)
                            void run({
                              type: "crew.member.update",
                              projectId: data.current.id,
                              memberId: member.id,
                              hired: !member.hired,
                            });
                        }}
                      >
                        {member.hired ? "고용" : "미고용"}
                      </button>
                      <span>
                        {role.title} ·{" "}
                        {editingMember === member.id ? (
                          <input
                            className="crew-name"
                            autoFocus
                            aria-label={role.title + " 별명"}
                            maxLength={32}
                            defaultValue={member.name}
                            onKeyDown={(event) => {
                              if (event.nativeEvent.isComposing) return;
                              if (event.key === "Escape")
                                event.currentTarget.value = member.name;
                              if (
                                event.key === "Escape" ||
                                event.key === "Enter"
                              )
                                event.currentTarget.blur();
                            }}
                            onBlur={(event) => {
                              const name = event.currentTarget.value.trim();
                              setEditingMember(null);
                              if (
                                data.current &&
                                name &&
                                name !== member.name
                              )
                                void run({
                                  type: "crew.member.update",
                                  projectId: data.current.id,
                                  memberId: member.id,
                                  name,
                                });
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            style={{ color: role.color }}
                            onClick={() => setEditingMember(member.id)}
                          >
                            {member.name}
                          </button>
                        )}
                      </span>
                      <select
                        aria-label={
                          role.title +
                          " 모델" +
                          (member.id !== role.id ? " · " + member.name : "")
                        }
                        value={member.provider}
                        onChange={(event) => {
                          if (data.current)
                            void run({
                              type: "crew.member.update",
                              projectId: data.current.id,
                              memberId: member.id,
                              provider:
                                event.target.value === "codex"
                                  ? "codex"
                                  : "local",
                            });
                        }}
                      >
                        <option value="local">로컬 LLM</option>
                        <option value="codex">Codex</option>
                      </select>
                      {member.roleId === "development" && (
                        <button
                          className="crew-write"
                          type="button"
                          aria-pressed={member.writeAllowed !== false}
                          aria-label={member.name + " 파일 쓰기 권한"}
                          onClick={() => {
                            if (data.current)
                              void run({
                                type: "crew.workspace.write",
                                projectId: data.current.id,
                                memberId: member.id,
                                allow: member.writeAllowed === false,
                              });
                          }}
                        >
                          {member.writeAllowed === false
                            ? "쓰기 회수됨"
                            : "쓰기 허용"}
                        </button>
                      )}
                      <SkillChips
                        member={member}
                        data={data}
                        open={(skillId) => {
                          setError("");
                          setFocusSkill(skillId);
                          setSettingsMember(member.id);
                        }}
                        preview={(text) =>
                          setSkillPreview(
                            text ? { memberId: member.id, text } : null,
                          )
                        }
                      />
                      <button
                        className="crew-configure"
                        type="button"
                        aria-label={member.name + " 스킬 및 MCP 설정"}
                        onClick={() => {
                          setError("");
                          setFocusSkill(null);
                          setSettingsMember(
                            settingsMember === member.id ? null : member.id,
                          );
                        }}
                      >
                        설정
                      </button>
                      {skillPreview?.memberId === member.id && (
                        <p className="skill-preview">{skillPreview.text}</p>
                      )}
                    </div>
                  );
                })}
              {configuredMember && (
                <CrewSettings
                  key={
                    configuredMember.id + (focusSkill ? ":" + focusSkill : "")
                  }
                  member={configuredMember}
                  data={data}
                  run={run}
                  close={() => {
                    setSettingsMember(null);
                    setFocusSkill(null);
                  }}
                  focusSkill={focusSkill}
                  openJob={(jobId) => {
                    setSettingsMember(null);
                    setFocusSkill(null);
                    setLogJob(jobId);
                    setView("log");
                  }}
                  focusApproval={(approvalId) => {
                    setSettingsMember(null);
                    setFocusSkill(null);
                    setToolFocus(approvalId);
                    setView("chat");
                  }}
                  openMemory={() => {
                    setMemoryOwner(configuredMember.id);
                    setMemorySection("memory");
                    setSettingsMember(null);
                    setView("memory");
                    setShowCamp(false);
                  }}
                  error={error}
                />
              )}
              {addingMember ? (
                <form
                  className="crew-add"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!data.current) return;
                    const form = new FormData(event.currentTarget);
                    const roleId = roles.find(
                      ({ id }) => id === form.get("role"),
                    )?.id;
                    const name = String(form.get("name") ?? "").trim();
                    if (!roleId || roleId === "assistant" || !name) return;
                    if (
                      await run({
                        type: "crew.member.add",
                        projectId: data.current.id,
                        memberId: crypto.randomUUID(),
                        roleId,
                        name,
                        provider:
                          form.get("provider") === "codex"
                            ? "codex"
                            : "local",
                      })
                    )
                      setAddingMember(false);
                  }}
                >
                  <select name="role" aria-label="새 팀원 역할">
                    {roles
                      .filter(({ id }) => id !== "assistant")
                      .map(({ id, title }) => (
                        <option value={id} key={id}>
                          {title}
                        </option>
                      ))}
                  </select>
                  <input
                    name="name"
                    autoFocus
                    aria-label="새 팀원 별명"
                    maxLength={32}
                    required
                  />
                  <select name="provider" aria-label="새 팀원 모델">
                    <option value="local">로컬 LLM</option>
                    <option value="codex">Codex</option>
                  </select>
                  <button type="submit">고용</button>
                  <button
                    type="button"
                    onClick={() => setAddingMember(false)}
                  >
                    취소
                  </button>
                </form>
              ) : (
                <button
                  className="add-member"
                  type="button"
                  onClick={() => setAddingMember(true)}
                >
                  ＋ 팀원
                </button>
              )}
            </div>
          </details>
        )}
      </div>
      {data?.current &&
        data.members.map((member, index) => {
          const role = roles.find(({ id }) => id === member.roleId)!;
          const extra = member.id !== role.id;
          return (
            <div
              className={
                "character" +
                (campMembers.get(member.id)?.highlighted
                  ? " highlighted"
                  : "")
              }
              key={member.id}
              style={{
                left:
                  (member.hired || campMembers.get(member.id)?.working
                    ? extra
                      ? 18 + ((index * 13) % 65)
                      : role.x
                    : role.x < 50
                      ? -14
                      : 114) + "%",
                top: (extra ? 88 + (index % 3) * 4 : role.y) + "%",
              }}
            >
              <span>
                <b style={{ color: role.color }}>{member.name}</b>
                {role.id === "assistant" && running
                  ? " · 답변 중"
                  : campMembers.get(member.id)?.working
                    ? " · " + campMembers.get(member.id)!.status
                    : ""}
              </span>
              <img src={sprites[role.sprite]} alt="" />
            </div>
          );
        })}
    </section>
  );
}
