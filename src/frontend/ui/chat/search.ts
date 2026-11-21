// 대화 안에서 찾기: 입력한 낱말이 들어간 말풍선만 남긴다. 화면과 따로 두어
// 어떤 문장이 걸리는지 테스트로 확인한다.

export function filterMessages<T extends { text: string }>(
  messages: T[],
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return messages;
  return messages.filter((message) =>
    message.text.toLocaleLowerCase().includes(needle),
  );
}

/** 한 줄에 보여 줄 찾은 건수. 0건일 때도 숫자를 보여 준다. */
export function searchCount(count: number) {
  return count + "건";
}
