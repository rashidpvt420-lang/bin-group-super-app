import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

/**
 * Structured reason logging for rejected callable requests (audit 2026-11-04, fixes 6/7).
 * Before this, 4xx rejections of these callables were only visible as bare status codes,
 * so expected negative checks (post-deploy smoke tests, stale clients) could not be told
 * apart from real user failures. This wrapper changes no behaviour: it rethrows the exact
 * same error. It logs only the function name, error code, message and a coarse caller
 * shape; no request payload, tokens, coordinates or personal data.
 */
export type CallableRequestShape = {
  auth?: { uid?: string; token?: Record<string, unknown> } | null;
  app?: unknown;
};

export function rejectionLogEntry(fn: string, error: unknown, request: CallableRequestShape) {
  const isHttps = error instanceof HttpsError;
  const role = request?.auth?.token && typeof request.auth.token.role === "string" ? String(request.auth.token.role) : null;
  return {
    event: "callable_rejected",
    fn,
    code: isHttps ? (error as HttpsError).code : "internal",
    reason: String((error as { message?: unknown })?.message || "unknown").slice(0, 200),
    expected: isHttps,
    authenticated: Boolean(request?.auth?.uid),
    role,
    appCheckVerified: Boolean(request?.app),
  };
}

export function withRejectionReasonLog<Res>(
  fn: string,
  handler: (request: CallableRequest<any>) => Promise<Res> | Res,
): (request: CallableRequest<any>) => Promise<Res> {
  return async (request: CallableRequest<any>) => {
    try {
      return await handler(request);
    } catch (error) {
      const entry = rejectionLogEntry(fn, error, request as CallableRequestShape);
      if (entry.expected) console.warn(entry);
      else console.error(entry);
      throw error;
    }
  };
}
