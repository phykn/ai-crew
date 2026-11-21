const costKeys = ["cost", "totalCost", "total_cost", "costUsd", "cost_usd"];

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value)))
    return Number(value);
  return undefined;
}

/**
 * 제공자가 응답 메타데이터로 실행별 비용을 돌려주는 경우 그 값을 읽는다.
 * 비용을 알리지 않는 제공자에서는 undefined를 돌려주고 화면은 '미제공'을 쓴다.
 */
export function reportedCost(
  metadata: Record<string, unknown> | undefined,
): number | undefined {
  if (!metadata) return undefined;
  for (const [key, value] of Object.entries(metadata)) {
    if (costKeys.includes(key)) {
      const cost = readNumber(value);
      if (cost !== undefined) return cost;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const cost = reportedCost(value as Record<string, unknown>);
      if (cost !== undefined) return cost;
    }
  }
  return undefined;
}
