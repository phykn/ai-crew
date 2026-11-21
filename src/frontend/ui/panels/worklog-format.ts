// 활동 기록 한 줄을 화면이 그릴 수 있는 모양으로 나눈다.
//
// 저장되는 값(`activity.text`)은 "역할 · 내용"처럼 사람이 읽는 한 문장이고, 그 계약은
// 그대로 둔다. 여기서는 그 문장을 시간·완료 여부·역할 배지·본문으로 나누기만 한다.

import { roles, type CrewMember } from "../../../shared/actions";

export type LogStatus = "done" | "running" | "failed";

export type LogRow = {
  /** HH:MM:SS (24시간) — 기록 시각이 없으면 빈 문자열 */
  time: string;
  status: LogStatus;
  /** "개발 · 태오", "비서 · 하나 → 계획", "사용자", "시스템" */
  label: string;
  /** 역할 고유 색. 알 수 없으면 시스템 회색 */
  color: string;
  body: string;
};

const separator = " · ";
const systemColor = "#b8a78c";

const failedPattern =
  /실패|오류|에러|차단|거절|중단|취소|불가|막혀|멈춤|망가|터졌/;
const runningPattern =
  /시작|진행|대기|기다|요청|시도|받는 중|작성 중|여는 중|보내는 중|복구 중/;

/** 기록 시각을 화면용 24시간 시:분:초로 만든다. */
export function formatLogTime(recordedAt: string | null | undefined): string {
  if (!recordedAt) return "";
  const at = new Date(recordedAt);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/** 문장에 담긴 낱말로 완료 여부를 고른다. 기록은 대개 이미 끝난 일이라 기본은 완료다. */
export function logStatus(text: string): LogStatus {
  if (failedPattern.test(text)) return "failed";
  if (runningPattern.test(text)) return "running";
  return "done";
}

type Who = { role: string; name: string | null; color: string };

function memberWho(member: CrewMember): Who {
  const role = roles.find(({ id }) => id === member.roleId);
  return {
    role: role?.title ?? member.roleId,
    name: member.name,
    color: role?.color ?? systemColor,
  };
}

/** 역할 이름 하나를 그 역할을 맡은 크루로 바꾼다. */
function roleWho(role: (typeof roles)[number], members: CrewMember[]): Who {
  const holder = members.find(({ roleId }) => roleId === role.id);
  return holder
    ? memberWho(holder)
    : { role: role.title, name: role.name, color: role.color };
}

/** 이름이나 역할 이름 하나를 크루의 역할·이름으로 바꾼다. 모르는 말이면 null. */
export function whoOf(token: string, members: CrewMember[] = []): Who | null {
  const word = token.trim();
  if (!word) return null;
  if (word === "사용자") return { role: "사용자", name: null, color: "#a9c7f0" };
  const member = members.find(({ name }) => name === word);
  if (member) return memberWho(member);
  const role = roles.find(({ title }) => title === word);
  if (role) return roleWho(role, members);
  // "인사팀"처럼 역할 이름에 말을 덧붙인 기록이 있다.
  const stem = word.replace(/(팀|담당|파트)$/, "");
  const stemmed = roles.find(({ title }) => title === stem);
  return stemmed ? roleWho(stemmed, members) : null;
}

/** 맨 앞의 "누가" 부분을 역할 배지로 만든다. 다음 단계로 넘기는 기록은 화살표를 남긴다. */
function badgeOf(
  head: string,
  members: CrewMember[],
): { label: string; color: string } | null {
  const parts = head.split("→").map((part) => part.trim());
  const who = parts.map((part) => whoOf(part, members));
  if (!who.some(Boolean)) return null;
  const label = parts
    .map((part, index) => {
      const found = who[index];
      if (!found) return part;
      return found.name ? found.role + " · " + found.name : found.role;
    })
    .join(" → ");
  return { label, color: who.find(Boolean)!.color };
}

/** 활동 기록 하나를 한 줄로 나눈다. 누가 했는지 알 수 없으면 "시스템"으로 둔다. */
export function parseActivity(
  entry: { text: string; recordedAt?: string | null },
  members: CrewMember[] = [],
): LogRow {
  const time = formatLogTime(entry.recordedAt);
  const status = logStatus(entry.text);
  const cut = entry.text.indexOf(separator);
  if (cut < 0)
    return { time, status, label: "시스템", color: systemColor, body: entry.text };
  const badge = badgeOf(entry.text.slice(0, cut), members);
  if (!badge)
    return { time, status, label: "시스템", color: systemColor, body: entry.text };
  return {
    time,
    status,
    label: badge.label,
    color: badge.color,
    body: entry.text.slice(cut + separator.length),
  };
}
