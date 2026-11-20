// 진단·감사 기록에 남는 문자열에서 비밀값을 지운다. 저장한 로그와 오류는 나중에
// 사람이 읽고 다른 곳으로 옮길 수 있으므로, 남기기 전에 이 함수를 거친다.

const REPLACEMENT = "[REDACTED]";

/** `Authorization: Bearer …`처럼 헤더에 실린 토큰. */
const bearer = /(\bBearer\s+)[A-Za-z0-9\-._~+/]+=*/gi;

/**
 * 서비스가 발급하는 키의 접두사. 값의 길이만 보고 자르므로 접두사 뒤에 오는
 * 짧은 조각은 건드리지 않는다.
 */
const keyPatterns = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{16,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{8,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
];

/** `https://user:pass@host`처럼 주소 자체에 실린 자격증명. */
const urlCredentials = /(\bhttps?:\/\/)[^\s/@]+@/gi;

/**
 * 로그·오류·감사 기록에 넣을 문자열에서 토큰, API 키, 주소에 실린 자격증명을
 * `[REDACTED]`로 바꾼다. 같은 문자열을 여러 번 거쳐도 결과가 달라지지 않는다.
 */
export function sanitizeText(input: string): string {
  let text = input.replace(urlCredentials, "$1" + REPLACEMENT + "@");
  text = text.replace(bearer, "$1" + REPLACEMENT);
  for (const pattern of keyPatterns) text = text.replace(pattern, REPLACEMENT);
  return text;
}

/** 오류를 저장할 문자열로 바꾸면서 비밀값을 지운다. */
export function sanitizeError(error: unknown): string {
  return sanitizeText(error instanceof Error ? error.message : String(error));
}
