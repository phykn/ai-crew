// Splits one stored activity entry into the pieces a row shows.
//
// The stored `activity.text` stays a human sentence ("role · sentence") so the
// existing contract and tests hold; only the screen needs it broken apart.

import { roles, type CrewMember } from "../../../shared/actions";

export type LogStatus = "done" | "running" | "failed";

export type LogRow = {
  /** HH:MM:SS in 24-hour time; empty when the entry has no timestamp */
  time: string;
  status: LogStatus;
  /** "개발 · 태오", "비서 · 하나 → 계획", "사용자", "시스템" */
  label: string;
  /** The role colour, or the system grey when the writer is unknown */
  color: string;
  body: string;
};

const separator = " · ";
const systemColor = "#b8a78c";

const failedPattern =
  /실패|오류|에러|차단|거절|중단|취소|불가|막혀|멈춤|망가|터졌/;
const runningPattern =
  /시작|진행|대기|기다|요청|시도|받는 중|작성 중|여는 중|보내는 중|복구 중/;

export function formatLogTime(recordedAt: string | null | undefined): string {
  if (!recordedAt) return "";
  const at = new Date(recordedAt);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/** Most entries record something already finished, so an unknown sentence reads as done. */
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

function roleWho(role: (typeof roles)[number], members: CrewMember[]): Who {
  const holder = members.find(({ roleId }) => roleId === role.id);
  return holder
    ? memberWho(holder)
    : { role: role.title, name: role.name, color: role.color };
}

export function whoOf(token: string, members: CrewMember[] = []): Who | null {
  const word = token.trim();
  if (!word) return null;
  if (word === "사용자") return { role: "사용자", name: null, color: "#a9c7f0" };
  const member = members.find(({ name }) => name === word);
  if (member) return memberWho(member);
  const role = roles.find(({ title }) => title === word);
  if (role) return roleWho(role, members);
  // Some writers append a word to the role, as in "인사팀".
  const stem = word.replace(/(팀|담당|파트)$/, "");
  const stemmed = roles.find(({ title }) => title === stem);
  return stemmed ? roleWho(stemmed, members) : null;
}

/** A hand-off keeps both sides of the arrow so the badge shows the move. */
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
