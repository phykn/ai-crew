// The camp view: the crew roster (hiring, names, models, skills, settings) and the
// characters standing in the camp.

import { useEffect, useRef, type CSSProperties } from "react";
import { roles, type Action, type Snapshot } from "./actions";
import { CampAtmosphere } from "./camp-atmosphere";
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

// 캐릭터마다 다른 깊이를 주어 배경보다 조금 더 크게 따라 움직이게 한다.
const depthOf = (y: number) => (0.9 + Math.min(Math.max(y, 40), 92) / 130).toFixed(2);

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
  const scene = useRef<HTMLElement>(null);
  const campMembers = new Map(
    (data?.camp.members ?? []).map((member) => [member.id, member]),
  );
  const configuredMember = data?.members.find(
    ({ id }) => id === settingsMember,
  );
  const hired = data?.members.filter((member) => member.hired).length ?? 0;

  // 마우스 위치를 부드럽게 따라가는 값(--px, --py)과 랜턴 빛의 자리(--gx, --gy)를
  // CSS 변수로만 갱신한다. React 상태를 건드리지 않아 캐릭터가 다시 그려지지 않는다.
  useEffect(() => {
    const area = scene.current;
    if (!area) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let targetGlowX = 50;
    let targetGlowY = 50;
    let glowX = 50;
    let glowY = 50;
    let inside = false;
    let frame: number | null = null;

    const paint = () => {
      area.style.setProperty("--px", x.toFixed(2) + "px");
      area.style.setProperty("--py", y.toFixed(2) + "px");
      area.style.setProperty("--gx", glowX.toFixed(1) + "%");
      area.style.setProperty("--gy", glowY.toFixed(1) + "%");
      area.style.setProperty("--lantern", inside ? "1" : "0");
    };

    const tick = () => {
      frame = null;
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      glowX += (targetGlowX - glowX) * 0.18;
      glowY += (targetGlowY - glowY) * 0.18;
      paint();
      const moving =
        Math.abs(targetX - x) +
        Math.abs(targetY - y) +
        Math.abs(targetGlowX - glowX) +
        Math.abs(targetGlowY - glowY);
      if (moving > 0.08) frame = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (frame === null) frame = requestAnimationFrame(tick);
    };

    const move = (event: globalThis.PointerEvent) => {
      if (reduced.matches) return;
      const box = area.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const nx = event.clientX / box.width - 0.5;
      const ny = event.clientY / box.height - 0.5;
      const range = Math.min(box.width, box.height) * 0.05;
      targetX = -nx * range;
      targetY = -ny * range * 0.7;
      targetGlowX = (event.clientX / box.width) * 100;
      targetGlowY = (event.clientY / box.height) * 100;
      inside = true;
      wake();
    };

    const leave = () => {
      inside = false;
      targetX = 0;
      targetY = 0;
      targetGlowX = 50;
      targetGlowY = 50;
      wake();
    };

    area.addEventListener("pointermove", move);
    area.addEventListener("pointerleave", leave);
    return () => {
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerleave", leave);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section
      className="camp"
      aria-label="캠프"
      ref={scene}
    >
      <div
        className="camp-bg"
        aria-hidden="true"
        style={{ backgroundImage: `url(${camp})` }}
      />
      <CampAtmosphere />
      <div className="camp-glow" aria-hidden="true" />
      <div className="camp-tools">
        <strong className="camp-badge">
          <Icon name="fire" />
          <span>캠프</span>
          {data?.current && <em>활성 크루 {hired}</em>}
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
              <span className="roster-dots" aria-hidden="true">
                {data.members
                  .filter((member) => member.hired)
                  .slice(0, 4)
                  .map((member) => (
                    <i
                      key={member.id}
                      style={{
                        background: roles.find(({ id }) => id === member.roleId)
                          ?.color,
                      }}
                    />
                  ))}
              </span>
              크루 · {hired}
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
                      <span className="crew-role">
                        <i
                          className="role-dot"
                          aria-hidden="true"
                          style={{ background: role.color }}
                        />
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
          const state = campMembers.get(member.id);
          const status =
            role.id === "assistant" && running
              ? "답변 중"
              : state?.working
                ? state.status
                : "";
          const y = extra ? 88 + (index % 3) * 4 : role.y;
          return (
            <div
              className={
                "character" +
                (state?.highlighted ? " highlighted" : "") +
                (state?.working ? " working" : "") +
                (member.hired ? "" : " off-duty")
              }
              key={member.id}
              style={
                {
                  left:
                    (member.hired || state?.working
                      ? extra
                        ? 18 + ((index * 13) % 65)
                        : role.x
                      : role.x < 50
                        ? -14
                        : 114) + "%",
                  top: y + "%",
                  "--depth": depthOf(y),
                  "--delay": `${(index % 5) * 0.6}s`,
                } as CSSProperties
              }
            >
              <span className="character-tag">
                <b style={{ color: role.color }}>{member.name}</b>
                {status ? " · " + status : ""}
              </span>
              <span className="character-body">
                <img src={sprites[role.sprite]} alt="" />
              </span>
            </div>
          );
        })}
    </section>
  );
}

