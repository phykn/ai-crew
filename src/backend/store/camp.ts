import {
  roles,
  type CrewMember,
  type Job,
  type JobState,
  type RoleId,
} from "../../shared/actions";

const phaseLabels: Record<JobState, string> = {
  recovering: "파일 상태 확인 중",
  clarification: "답변 대기",
  planning: "계획",
  approval: "승인 대기",
  queued: "대기",
  developing: "개발",
  reviewing: "검증",
  stopping: "중단 중",
  stopped: "중단됨",
  denied: "거절",
  complete: "완료",
  failed: "실패",
};

const workingStates: JobState[] = [
  "planning",
  "developing",
  "reviewing",
  "recovering",
  "approval",
  "clarification",
  "queued",
  "stopping",
];

type CampMember = {
  id: string;
  roleId: RoleId;
  name: string;
  color: string;
  hired: boolean;
  jobId: string | null;
  jobTitle: string | null;
  status: string;
  working: boolean;
  highlighted: boolean;
  line: string | null;
};

type CampState = {
  members: CampMember[];
  highlightedJobId: string | null;
  activities: { id: number; text: string; jobId: string | null }[];
};

const greetings: Record<string, string[]> = {
  morning: ["아침 잘 먹었어요?", "오늘은 뭐부터 할까요?", "커피 한 잔 하고 시작하죠."],
  day: ["캠프가 조용하네요.", "필요한 게 있으면 불러 주세요.", "정리하고 있을게요."],
  evening: ["이제 좀 쉬어야지.", "오늘 일은 여기까지예요.", "모닥불이 좋네요."],
  night: ["야근은 짧게 해요.", "불을 줄여 둘게요.", "내일 이어서 하면 돼요."],
};

export function timeOfDay(hour: number) {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 23) return "evening";
  return "night";
}

/** 대기 중인 캐릭터의 짧은 대사. 실행이나 요청을 만들지 않는 순수 계산이다. */
export function idleLine(member: CrewMember, hour: number) {
  const lines = greetings[timeOfDay(hour)];
  const seed = [...member.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return lines[seed % lines.length];
}

/**
 * 저장된 업무·담당 정보로만 캠프 상태를 만든다.
 * 과거 장면을 다시 재생하거나 새 업무·메시지를 만들지 않는다.
 */
export function campState({
  members,
  jobs,
  assignees,
  selectedJobId,
  hour,
}: {
  members: CrewMember[];
  jobs: Job[];
  assignees: { jobId: string; memberId: string; roleId: RoleId }[];
  selectedJobId: string | null;
  hour: number;
}): CampState {
  const highlightedJobId =
    selectedJobId ??
    jobs.find(({ state }) => workingStates.includes(state))?.id ??
    null;
  // 예전 저장본에 남은 역할 이름은 캠프에서 건너뛴다.
  const roster = members.filter((member) =>
    roles.some(({ id }) => id === member.roleId),
  );
  return {
    members: roster.map((member) => {
      const role = roles.find(({ id }) => id === member.roleId)!;
      const assignment = assignees.find(({ memberId, jobId }) => {
        const job = jobs.find(({ id }) => id === jobId);
        return (
          memberId === member.id && job && workingStates.includes(job.state)
        );
      });
      const job = assignment
        ? (jobs.find(({ id }) => id === assignment.jobId) ?? null)
        : null;
      return {
        id: member.id,
        roleId: member.roleId,
        name: member.name,
        color: role.color,
        hired: member.hired,
        jobId: job?.id ?? null,
        jobTitle: job ? (job.plan?.goal ?? job.request) : null,
        status: !member.hired
          ? "미고용"
          : job
            ? phaseLabels[job.state]
            : "대기",
        working: Boolean(member.hired && job),
        highlighted: Boolean(job && job.id === highlightedJobId),
        line: member.hired && !job ? idleLine(member, hour) : null,
      };
    }),
    highlightedJobId,
    activities: [],
  };
}
