// A one-line status banner above the conversation. It keeps the working crew,
// the current job phase and goal, and any waiting decision visible without
// opening the camp view.

import { type ReactNode } from "react";
import { roles, type Snapshot } from "../../../shared/actions";
import { Icon, phase, sprites } from "../common/ui";

type ChatStatusProps = {
  data: Snapshot | null;
  jobs: Snapshot["jobs"];
  pendingTools: Snapshot["toolApprovals"];
  followup: Snapshot["followups"][number] | undefined;
  showCamp: boolean;
  setShowCamp: (camp: boolean) => void;
  openLog: (jobId: string) => void;
  /** 대화 안 찾기 막대를 열었는지. */
  searching: boolean;
  toggleSearch: () => void;
  // 업무가 한 건일 때는 그 업무의 버튼을 배너 안에 붙여 줄을 하나로 유지한다.
  jobActions?: ReactNode;
};

export function ChatStatus({
  data,
  jobs,
  pendingTools,
  followup,
  showCamp,
  setShowCamp,
  openLog,
  searching,
  toggleSearch,
  jobActions,
}: ChatStatusProps) {
  if (!data?.session) return null;
  const active = jobs[0];
  const working = data.camp.members.filter((member) => member.working);
  const assigned = active
    ? working.filter(({ jobId }) => jobId === active.id)
    : [];
  const crew = (assigned.length ? assigned : working).slice(0, 3);
  const assistant = data.members.find(
    ({ roleId, hired }) => roleId === "assistant" && hired,
  );
  const sprite = (roleId: string) =>
    sprites[roles.find(({ id }) => id === roleId)?.sprite ?? 0];
  const approvalWaits =
    data.jobs.filter(({ state }) => state === "approval").length +
    pendingTools.length;
  const questionWaits = data.jobs.filter(
    ({ clarification }) => clarification,
  ).length;
  const waits = [
    approvalWaits ? "승인 " + approvalWaits + "건" : "",
    questionWaits ? "질문 " + questionWaits + "건" : "",
    followup ? "업무 선택" : "",
  ].filter(Boolean);
  if (!active && !waits.length) return null;
  return (
    <section className="chat-status" aria-label="진행 상태" aria-live="polite">
      <button
        type="button"
        className="chat-status-main"
        disabled={!active}
        title={active ? "업무 로그 열기" : undefined}
        onClick={() => {
          if (active) openLog(active.id);
        }}
      >
        <span className="chat-status-crew" aria-hidden="true">
          {crew.length ? (
            crew.map((member) => (
              <img key={member.id} src={sprite(member.roleId)} alt="" />
            ))
          ) : (
            <img src={sprite("assistant")} alt="" />
          )}
        </span>
        <span className="chat-status-text">
          <strong>
            {crew.length
              ? crew.map(({ name }) => name).join(", ")
              : (assistant?.name ?? "비서")}
            {active ? " · " + phase[active.state] : " · 대기"}
          </strong>
          <small>
            {active
              ? (active.plan?.goal ?? active.request)
              : "다음 지시를 기다리고 있어요"}
          </small>
        </span>
      </button>
      {!!waits.length && <span className="chat-status-wait">{waits.join(" · ")}</span>}
      {!!jobActions && (
        <span className="chat-status-actions">{jobActions}</span>
      )}
      <button
        type="button"
        className="icon-button chat-status-search"
        aria-label={searching ? "대화 찾기 닫기" : "대화에서 찾기"}
        title="대화에서 찾기 (⌘/Ctrl+F)"
        aria-pressed={searching}
        onClick={toggleSearch}
      >
        <Icon name="search" />
      </button>
      <button
        type="button"
        className="chat-status-camp"
        aria-label="캠프 보기 전환"
        aria-pressed={showCamp}
        onClick={() => setShowCamp(!showCamp)}
      >
        캠프
      </button>
    </section>
  );
}
