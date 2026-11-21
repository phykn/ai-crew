type Segment = { text: string; changed: boolean };

function units(text: string) {
  return (
    text.match(
      /[^.!?。！？\n]*[.!?。！？]+[ \t]*\n?|[^.!?。！？\n]*\n|[^.!?。！？\n]+$/g,
    ) ?? []
  );
}

/** 문장·줄 단위로 이전 버전과 비교해 새로 추가되거나 바뀐 부분을 표시한다. */
export function changedSegments(before: string, after: string): Segment[] {
  const previous = units(before).map((unit) => unit.trim());
  const current = units(after);
  if (previous.length > 600 || current.length > 600)
    return [{ text: after, changed: false }];
  const rows = previous.length;
  const columns = current.length;
  const lengths = Array.from({ length: rows + 1 }, () =>
    new Int32Array(columns + 1),
  );
  for (let row = rows - 1; row >= 0; row--)
    for (let column = columns - 1; column >= 0; column--)
      lengths[row][column] =
        previous[row] === current[column].trim()
          ? lengths[row + 1][column + 1] + 1
          : Math.max(lengths[row + 1][column], lengths[row][column + 1]);
  const kept = new Set<number>();
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (previous[row] === current[column].trim()) {
      kept.add(column);
      row++;
      column++;
    } else if (lengths[row + 1][column] >= lengths[row][column + 1]) row++;
    else column++;
  }
  return current.map((text, index) => ({ text, changed: !kept.has(index) }));
}
