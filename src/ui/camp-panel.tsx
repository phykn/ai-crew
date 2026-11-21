// The camp view: the crew roster (hiring, names, models, skills, settings) and the
// characters standing in the camp.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { roles, type Action, type Snapshot } from "../shared/actions";
import {
  campFire,
  campObjects,
  initialActors,
  stepActor,
  type CampActor,
  type CampActorSeed,
} from "./camp-behavior";
import { CampAtmosphere } from "./camp-atmosphere";
import { createCampStage, type CampStage } from "./camp-pixi";
import { crewHeight, depthScale } from "./camp-pixi-layout";
import { CrewSettings } from "./crew-settings";
import { Icon, SkillChips, sprites } from "./renderer-ui";
import camp from "../../demo/assets/camp.webp";

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

// 모닥불 가까이 서면 따뜻한 빛을 받는다.
const fireGlow = (x: number, y: number) =>
  Math.max(0, 1 - Math.hypot(x - 59.7, y - 61.8) / 15).toFixed(2);

const objectNotes: Record<string, string> = {
  campfire: "🔥 모닥불 · 장작이 타고 있어요",
  workbench: "🛠 작업대 · 크루가 여기서 일해요",
  lantern: "🏮 오두막 등불 · 해가 지면 더 밝아져요",
};

function bubbleFor(id: string, label: string) {
  return objectNotes[id] ?? "🪵 " + label + " · 걸터앉아 쉬는 자리";
}

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

  const [poked, setPoked] = useState<string | null>(null);
  const characterRefs = useRef(new Map<string, HTMLDivElement>());
  const objectRefs = useRef(new Map<string, HTMLButtonElement>());
  const runtime = useRef<CampActor[]>([]);
  // PixiJS 캔버스가 그리는 캠프. WebGL을 못 쓰면 "css"로 떨어져 CSS 캠프를 그린다.
  const stageHost = useRef<HTMLDivElement>(null);
  const stageRef = useRef<CampStage | null>(null);
  const [stageMode, setStageMode] = useState<"pending" | "canvas" | "css">(
    "pending",
  );
  const anyWorking = data?.camp.members.some((member) => member.working) ?? false;

  // 캠프에 보이는 크루의 배정 상태만 순수 계산의 씨앗으로 넘긴다.
  const hiredSeeds = (data?.members ?? [])
    .filter((member) => member.hired)
    .map((member): CampActorSeed => {
      const state = campMembers.get(member.id);
      const job = state?.jobId
        ? data?.jobs.find(({ id }) => id === state.jobId)
        : undefined;
      return {
        memberId: member.id,
        roleId: member.roleId,
        hired: member.hired,
        working: Boolean(state?.working),
        jobId: state?.jobId ?? null,
        jobState: job?.state ?? null,
      };
    });
  const seedsKey = hiredSeeds
    .map((seed) =>
      [seed.memberId, seed.roleId, seed.working, seed.jobId, seed.jobState].join(
        ":",
      ),
    )
    .join("|");
  // 처음 그릴 좌표. 사람이 바뀔 때만 다시 잡아, 움직이는 중에 React가 자리를
  // 되돌리지 않게 한다. 실제 이동은 아래 effect가 DOM에 직접 쓴다.
  const memberKey = hiredSeeds.map(({ memberId }) => memberId).join("|");
  const positions = useMemo(
    () =>
      initialActors(
        hiredSeeds.map((seed) => ({
          ...seed,
          working: false,
          jobId: null,
          jobState: null,
        })),
      ),
    // 배정이 바뀌어도 처음 자리는 유지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberKey],
  );

  // 캔버스에 올릴 크루 스프라이트. 고용된 크루만 캠프를 걷는다.
  const crewSprites = (data?.members ?? [])
    .filter((member) => member.hired)
    .map((member) => ({
      id: member.id,
      url: sprites[roles.find(({ id }) => id === member.roleId)?.sprite ?? 0],
    }));
  const spriteKey = crewSprites.map(({ id, url }) => id + ":" + url).join("|");

  useEffect(() => {
    const now = Date.now();
    const base = initialActors(
      hiredSeeds.map((seed) => ({
        ...seed,
        working: false,
        jobId: null,
        jobState: null,
      })),
      now,
    );
    const previous = runtime.current;
    runtime.current = base.map((actor) => {
      const seed = hiredSeeds.find((item) => item.memberId === actor.memberId);
      if (!seed) return actor;
      const old = previous.find((item) => item.memberId === actor.memberId);
      if (!old) return { ...actor, ...seed, nextDecisionAt: now + 600 };
      const changed = old.working !== seed.working || old.jobId !== seed.jobId;
      return {
        ...old,
        ...seed,
        nextDecisionAt: changed ? now : old.nextDecisionAt,
        ...(changed
          ? {
              route: [],
              intent: "idle" as const,
              workSpotId: null,
              targetMemberId: null,
              watching: null,
              bubble: null,
              posture: old.spotId ? ("sit" as const) : ("stand" as const),
            }
          : {}),
      };
    });

    const paint = () => {
      for (const actor of runtime.current) {
        const element = characterRefs.current.get(actor.memberId);
        if (!element) continue;
        element.style.left = actor.x.toFixed(2) + "%";
        // 앉으면 발이 통나무 아래로 살짝 내려가 걸터앉은 높이가 된다.
        const sink = actor.posture === "sit" ? 1.6 : 0;
        element.style.top = (actor.y + sink).toFixed(2) + "%";
        element.style.zIndex = String(
          Math.round(actor.y * 10) + (actor.posture === "sit" ? 3 : 2),
        );
        element.dataset.facing = actor.facing;
        element.dataset.posture = actor.posture;
        element.style.setProperty("--scale", depthScale(actor.y).toFixed(3));
        element.style.setProperty("--depth", depthOf(actor.y));
        element.style.setProperty("--fire-glow", fireGlow(actor.x, actor.y));
        element.classList.toggle("is-sitting", actor.posture === "sit");
        element.classList.toggle("is-walking", actor.posture === "walk");
        element.classList.toggle("is-watching", actor.posture === "watch");
        element.classList.toggle("is-handing", actor.posture === "handoff");
        const bubble = element.querySelector<HTMLElement>(".character-bubble");
        if (bubble) {
          if (bubble.textContent !== (actor.bubble ?? ""))
            bubble.textContent = actor.bubble ?? "";
          bubble.classList.toggle("show", Boolean(actor.bubble));
        }
      }
      for (const seat of campObjects) {
        if (seat.kind !== "seat") continue;
        const element = objectRefs.current.get(seat.id);
        if (!element) continue;
        element.classList.toggle(
          "is-taken",
          runtime.current.some((actor) => actor.spotId === seat.id),
        );
      }
      // 캔버스가 그리는 캐릭터도 같은 좌표를 쓴다.
      stageRef.current?.render(
        runtime.current,
        runtime.current.some((actor) => actor.working),
      );
    };

    // 캐릭터 키를 캠프 높이에 맞춰 한 곳에서 정한다. 이름표(DOM)와 그림(캔버스)이
    // 같은 `--crew-h`를 쓰므로 어느 화면 크기에서도 머리 위에 붙어 있다.
    const measure = () => {
      const area = scene.current;
      if (!area) return;
      const box = area.getBoundingClientRect();
      if (!box.width || !box.height) return;
      area.style.setProperty(
        "--crew-h",
        crewHeight({ width: box.width, height: box.height }).toFixed(2) + "px",
      );
      stageRef.current?.resize();
    };
    measure();

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // 움직임을 줄이면 걷지 않고, 일하는 크루는 작업 자리에 선 채로 둔다.
    if (reduced) runtime.current = initialActors(hiredSeeds, now);
    paint();
    const observer = new ResizeObserver(measure);
    observer.observe(scene.current!);
    if (reduced)
      return () => {
        observer.disconnect();
      };
    let frame = 0;
    let last = performance.now();
    const tick = (time: number) => {
      const seconds = Math.min(0.06, Math.max(0, (time - last) / 1000));
      last = time;
      if (seconds > 0) {
        const stamp = Date.now();
        // 한 명씩 차례로 옮겨, 같은 틱에 두 사람이 같은 자리를 고르지 않게 한다.
        const actors = [...runtime.current];
        for (let index = 0; index < actors.length; index += 1) {
          actors[index] = stepActor(actors[index], seconds, {
            now: stamp,
            actors,
            random: Math.random,
          });
        }
        runtime.current = actors;
      }
      paint();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // seedsKey가 바뀔 때만 캐릭터 배정을 다시 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedsKey]);

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
      // 캔버스가 떠 있으면 배경 패럴랙스와 랜턴 빛은 PixiJS 스테이지가 맡는다.
      if (stageRef.current) return;
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

  // 캠프 그림·조명·캐릭터·불티를 PixiJS 캔버스에 맡긴다. 캔버스를 만들지 못하는
  // 환경(서버 렌더, WebGL 없음)에서는 stageMode가 "css"로 남아 기존 CSS 캠프가
  // 그대로 보인다.
  useEffect(() => {
    const host = stageHost.current;
    if (!host) return;
    let alive = true;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    void createCampStage({
      host,
      surface: scene.current,
      background: camp,
      crew: crewSprites,
      fire: campFire,
      objects: campObjects.map(({ id, kind, x, y }) => ({ id, kind, x, y })),
      reducedMotion: reduced,
    }).then((stage) => {
      if (!alive) {
        stage?.destroy();
        return;
      }
      if (!stage) {
        setStageMode("css");
        return;
      }
      stageRef.current = stage;
      setStageMode("canvas");
      stage.resize();
      stage.render(
        runtime.current,
        runtime.current.some((actor) => actor.working),
      );
    });
    return () => {
      alive = false;
      stageRef.current?.destroy();
      stageRef.current = null;
    };
    // 크루 구성이 바뀔 때만 스테이지를 다시 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spriteKey]);

  return (
    <section
      className={"camp" + (stageMode === "canvas" ? " camp-pixi" : "")}
      aria-label="캠프"
      ref={scene}
    >
      <div
        className="camp-bg"
        aria-hidden="true"
        style={{ backgroundImage: `url(${camp})` }}
      />
      {stageMode !== "canvas" && <CampAtmosphere />}
      <div className="camp-glow" aria-hidden="true" />
      <div className="camp-canvas-host" aria-hidden="true" ref={stageHost} />
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
      <div className="camp-stage">
      <div className="camp-objects" role="group" aria-label="캠프 오브젝트">
        {campObjects.map((object) => (
          <button
            key={object.id}
            type="button"
            className={
              "camp-object " +
              object.kind +
              (poked === object.id ? " is-poked" : "") +
              (object.kind === "workbench" && anyWorking ? " is-active" : "") +
              (object.kind === "lantern" && anyWorking ? " is-lit" : "")
            }
            ref={(element) => {
              if (element) objectRefs.current.set(object.id, element);
              else objectRefs.current.delete(object.id);
            }}
            style={
              {
                left: object.x + "%",
                top: object.y + "%",
                width: object.w + "%",
                height: object.h + "%",
                zIndex: Math.round(object.y * 10),
              } as CSSProperties
            }
            aria-label={object.label}
            title={object.label}
            onClick={() => {
              setPoked(object.id);
              stageRef.current?.poke(object.id);
              window.setTimeout(
                () =>
                  setPoked((current) =>
                    current === object.id ? null : current,
                  ),
                1500,
              );
            }}
          >
            <span className="camp-object-sign" aria-hidden="true">
              {poked === object.id ? bubbleFor(object.id, object.label) : object.label}
            </span>
            {object.kind === "campfire" && (
              <span className="camp-object-glow" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      {data?.current &&
        data.members.map((member) => {
          const role = roles.find(({ id }) => id === member.roleId)!;
          const state = campMembers.get(member.id);
          const actor = positions.find((item) => item.memberId === member.id);
          const status =
            role.id === "assistant" && running
              ? "답변 중"
              : state?.working
                ? state.status
                : "";
          const offDuty = !member.hired;
          const posture = actor?.posture ?? "stand";
          const classes =
            "character" +
            (state?.highlighted ? " highlighted" : "") +
            (state?.working ? " working" : "") +
            (offDuty ? " off-duty" : "") +
            (posture === "sit" ? " is-sitting" : "") +
            (posture === "walk" ? " is-walking" : "") +
            (posture === "watch" ? " is-watching" : "") +
            (posture === "handoff" ? " is-handing" : "");
          const left = offDuty ? (role.x < 50 ? -12 : 112) : (actor?.x ?? role.x);
          const top = offDuty ? 86 : (actor?.y ?? role.y);
          return (
            <div
              className={classes}
              key={member.id}
              ref={(element) => {
                if (element) characterRefs.current.set(member.id, element);
                else characterRefs.current.delete(member.id);
              }}
              style={
                {
                  left: left + "%",
                  top: top + "%",
                  zIndex: Math.round(top * 10) + 2,
                  "--depth": depthOf(top),
                  "--scale": depthScale(top).toFixed(3),
                  "--fire-glow": fireGlow(left, top),
                  "--delay": `${(member.id.length % 5) * 0.6}s`,
                } as CSSProperties
              }
              data-facing={actor?.facing ?? "right"}
              data-posture={posture}
            >
              <span className="character-tag">
                <b style={{ color: role.color }}>{member.name}</b>
                {status ? " · " + status : ""}
              </span>
              <span className="character-bubble" aria-hidden="true" />
              <span className="character-body">
                <img src={sprites[role.sprite]} alt="" />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

