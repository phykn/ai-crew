// Small presentational pieces shared by the workspace panels: icons, crew sprites,
// job phase labels, skill chips, check lists and model usage.

import {
  roles,
  type CrewMember,
  type Job,
  type ModelRun,
  type SkillState,
  type Snapshot,
  type WorkCheck,
} from "../../shared/actions";
import { skillStateLabels, skillStateOrder } from "../../shared/skill-status";
import { crewPortrait } from "../camp/art/scene";

// `roles[].sprite`는 이 목록의 위치다. 캠프의 크루 그림에서 머리만 잘라 낸
// 같은 픽셀아트를 data URL로 쓴다.
export const sprites = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((role) =>
  crewPortrait(role),
);
export const phase = {
  recovering: "파일 상태 확인 중",
  clarification: "답변 대기",
  planning: "계획",
  approval: "승인 대기",
  queued: "같은 파일 작업 대기",
  developing: "개발",
  reviewing: "검증",
  stopping: "중단 중",
  stopped: "중단됨",
  denied: "거절",
  complete: "완료",
  failed: "실패",
} satisfies Record<Job["state"], string>;
const icons = {
  fire: "M13 2c1 6-4 7-2 11 2-1 3-3 3-6 4 3 6 6 5 10-1 4-5 6-9 5-5-1-7-5-6-9 1-2 2-4 5-7-1 5 0 6 1 6-1-4 4-6 3-10Z",
  chat: "M3 4h18v13H9l-5 4v-4H3Z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1",
  book: "M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15",
  menu: "M3 6h18M3 12h18M3 18h18",
  folder: "M3 7V5h6l2 2h10v12H3Z",
  send: "m3 11 18-8-7 18-3-8-8-2Zm8 2 10-10",
  stop: "M6 6h12v12H6Z",
  flow: "M6 4h12v5H6Zm0 11h5v5H6Zm7 0h5v5h-5Zm-3.5-6v3h6v3",
  bell: "M12 3a5 5 0 0 0-5 5v4l-2 4h14l-2-4V8a5 5 0 0 0-5-5Zm-2 15a2 2 0 0 0 4 0",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm4.9 11.9L21 21",
  close: "M6 6l12 12M18 6 6 18",
  image: "M3 5h18v14H3Zm0 12 5-5 4 4 3-3 6 6M8.2 10a1 1 0 1 0 .1 0",
  pulse: "M2 12h4.2l2.4-6 4 12 2.4-6H22",
  refresh: "M20 11a8 8 0 1 0-2.4 5.7M20 4v6h-6",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.2 5.8-1.8 5.4-5.4 1.8 1.8-5.4Z",
  bug: "M9 9a3 3 0 0 1 6 0v4a3 3 0 0 1-6 0V9Zm-5 3h4m8 0h4M4 16h5m6 0h5M7 6l2 2m8-2-2 2M12 3v3",
  flask: "M9 3h6M10 3v5.2L5.4 17A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.8-3L14 8.2V3",
  pencil: "M4 20h4L20.5 7.5l-4-4L4 16v4Zm9.5-14.5 4 4",
  shield: "M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6Zm-1 5h2v4h2l-3 4-3-4h2Z",
};
export function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

export function CheckList({ checks }: { checks: WorkCheck[] }) {
  return (
    <ul>
      {checks.map((check) => (
        <li key={check.role}>
          {check.label || roles.find(({ id }) => id === check.role)?.title} ·{" "}
          {check.passed ? "통과" : check.unavailable ? "미검증" : "실패"}
          {check.command && (
            <>
              {" "}
              · <code>{check.command}</code>
            </>
          )}
          {" · "}
          {check.note}
          {check.findings.map((finding, index) => (
            <details className="review-finding" key={index}>
              <summary>
                {finding.startLine === finding.endLine
                  ? `${finding.startLine}줄`
                  : `${finding.startLine}–${finding.endLine}줄`}
                {" · "}
                {finding.note}
              </summary>
              <pre>{finding.excerpt}</pre>
            </details>
          ))}
        </li>
      ))}
    </ul>
  );
}

export function SkillChips({
  member,
  data,
  open,
  preview,
}: {
  member: CrewMember;
  data: Snapshot;
  open: (skillId: string | null) => void;
  preview: (text: string | null) => void;
}) {
  const owned = data.skills.filter(({ memberId }) => memberId === member.id);
  if (!owned.length) return null;
  const status = (skillId: string) =>
    data.skillStates.find((item) => item.skillId === skillId);
  const ordered = [...owned].sort(
    (left, right) =>
      skillStateOrder(status(left.id)?.state ?? "ready") -
      skillStateOrder(status(right.id)?.state ?? "ready"),
  );
  const glyphs: Record<SkillState, string> = {
    ready: "◇",
    "in-use": "◆",
    awaiting: "◔",
    unavailable: "⊘",
  };
  const shown = ordered.slice(0, 3);
  const read = (skillId: string) => {
    const skill = owned.find(({ id }) => id === skillId)!;
    const state = status(skillId);
    const purpose =
      skill.markdown
        .split("\n")
        .map((line) => line.replace(/^#+\s*/, "").trim())
        .find(Boolean)
        ?.slice(0, 60) ?? "";
    return {
      skill,
      state,
      text:
        skill.name +
        " · " +
        skillStateLabels[state?.state ?? "ready"] +
        (state?.reason ? " · " + state.reason : "") +
        (purpose ? " · " + purpose : ""),
    };
  };
  return (
    <span className="crew-skills" aria-label={member.name + " 스킬"}>
      {shown.map(({ id }) => {
        const { state, text } = read(id);
        return (
          <button
            key={id}
            type="button"
            className="skill-chip"
            data-state={state?.state ?? "ready"}
            title={text}
            aria-label={text}
            onFocus={() => preview(text)}
            onMouseEnter={() => preview(text)}
            onBlur={() => preview(null)}
            onMouseLeave={() => preview(null)}
            onClick={() => open(id)}
          >
            <span aria-hidden="true">{glyphs[state?.state ?? "ready"]}</span>
          </button>
        );
      })}
      {owned.length > shown.length && (
        <button
          type="button"
          className="skill-chip more"
          aria-label={
            member.name + " 스킬 " + (owned.length - shown.length) + "개 더 보기"
          }
          onFocus={() =>
            preview(
              ordered
                .slice(shown.length)
                .map(({ id }) => read(id).skill.name)
                .join(", "),
            )
          }
          onMouseEnter={() =>
            preview(
              ordered
                .slice(shown.length)
                .map(({ id }) => read(id).skill.name)
                .join(", "),
            )
          }
          onBlur={() => preview(null)}
          onMouseLeave={() => preview(null)}
          onClick={() => open(null)}
        >
          +{owned.length - shown.length}
        </button>
      )}
    </span>
  );
}

export function ModelUsage({
  runs,
  jobId,
}: {
  runs: ModelRun[];
  jobId: string | null;
}) {
  const groups = new Map<
    string,
    {
      roleId: ModelRun["roleId"];
      model: string;
      count: number;
      elapsedMs: number;
      tokens: number | null;
      costUsd: number | null;
    }
  >();
  for (const run of runs) {
    if (jobId && run.jobId !== jobId) continue;
    const key = JSON.stringify([run.roleId, run.provider, run.model]);
    const group = groups.get(key) ?? {
      roleId: run.roleId,
      model: run.model ?? (run.provider === "codex" ? "Codex" : "로컬 LLM"),
      count: 0,
      elapsedMs: 0,
      tokens: null,
      costUsd: null,
    };
    group.count++;
    group.elapsedMs += run.elapsedMs;
    if (run.inputTokens !== null || run.outputTokens !== null)
      group.tokens =
        (group.tokens ?? 0) + (run.inputTokens ?? 0) + (run.outputTokens ?? 0);
    if (run.costUsd !== null)
      group.costUsd = (group.costUsd ?? 0) + run.costUsd;
    groups.set(key, group);
  }
  if (!groups.size) return null;
  return (
    <details className="change-log model-usage">
      <summary>모델 실행</summary>
      <ul>
        {[...groups].map(([key, group]) => (
          <li key={key}>
            {roles.find(({ id }) => id === group.roleId)?.title} ·{" "}
            {group.model}
            <br />
            {group.count}회 · {(group.elapsedMs / 1000).toFixed(1)}초
            {group.tokens !== null &&
              ` · 확인된 토큰 ${group.tokens.toLocaleString()}`}
            {" · "}
            {group.costUsd !== null
              ? "비용 $" + group.costUsd.toFixed(4)
              : "비용 미제공"}
          </li>
        ))}
      </ul>
    </details>
  );
}
