import { APICallError } from "ai";

export class ModelConnectionError extends Error {}
export class ModelLimitError extends Error {}

export function classifyModelFailure(
  error: unknown,
): "limit" | "connection" | "other" {
  if (error instanceof ModelLimitError) return "limit";
  if (error instanceof ModelConnectionError) return "connection";
  if (APICallError.isInstance(error)) {
    if (
      error.statusCode === 429 ||
      error.statusCode === 402 ||
      /insufficient.quota|usage.limit|context.length.exceeded/i.test(
        error.responseBody ?? "",
      )
    )
      return "limit";
    if (
      error.statusCode === 408 ||
      (error.statusCode !== undefined && error.statusCode >= 500)
    )
      return "connection";
    if (error.statusCode !== undefined) return "other";
  }
  if (!(error instanceof Error)) return "other";
  if (
    /usage limit|rate limit|quota exceeded|insufficient_quota|context (?:window|length) exceeded/i.test(
      error.message,
    )
  )
    return "limit";
  if (error.name === "TimeoutError") return "connection";
  if (
    "code" in error &&
    typeof error.code === "string" &&
    /^(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT)$/.test(
      error.code,
    )
  )
    return "connection";
  return error.cause && error.cause !== error
    ? classifyModelFailure(error.cause)
    : "other";
}
