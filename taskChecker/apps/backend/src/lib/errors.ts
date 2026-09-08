/** Stable error contract across every endpoint:
 *  { error: { code, message, request_id, retryable } }
 *  (docs/design/teamflow.md §3.)
 */
import type { Context } from "hono";
import { randomToken } from "./ids.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export function httpError(c: Context, status: number, code: string, message: string, retryable = false) {
  return c.json({ error: { code, message, request_id: c.get("requestId") ?? randomToken(8), retryable } }, status as 400);
}

export async function errorHandler(err: Error, c: Context) {
  const requestId = c.get("requestId") ?? randomToken(8);
  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message, request_id: requestId, retryable: err.retryable } },
      err.status as 400,
    );
  }
  // Dependency-unavailable: fail fast with retryable 503 (docs §7) rather than hanging.
  const dbDown = /ECONNREFUSED|Connection refused|connect ECONNREFUSED|Connection terminated/.test(err.message ?? "");
  const status = dbDown ? 503 : 500;
  console.error(`[error] ${requestId}`, err);
  return c.json(
    {
      error: {
        code: dbDown ? "dependency_unavailable" : "internal",
        message: dbDown ? "A required dependency is unavailable; retry shortly." : "Internal error",
        request_id: requestId,
        retryable: dbDown,
      },
    },
    status as 400,
  );
}

export function notFoundHandler(c: Context) {
  return c.json({ error: { code: "not_found", message: "Not found", request_id: c.get("requestId") ?? randomToken(8), retryable: false } }, 404);
}

export function badRequest(message: string): ApiError {
  return new ApiError(400, "invalid_request", message);
}

export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError(401, "unauthorized", message, false);
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError(403, "forbidden", message, false);
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, "not_found", message);
}

/** Plan/quota exceeded — surfaces the subscription tier limit (documented 429). */
export function quotaExceeded(message: string): ApiError {
  return new ApiError(429, "usage_limit_exceeded", message, false);
}