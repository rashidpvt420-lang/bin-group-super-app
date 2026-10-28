// User-facing messages for AI Design Studio callable failures. Pure so it can be unit tested.

/** The server render can legitimately take up to ~150s (callable limit 180s). */
export const DESIGN_SUBMIT_TIMEOUT_MS = 190_000;

type CallableErrorLike = { code?: unknown; message?: unknown; details?: unknown };

const serverMessage = (details: CallableErrorLike) => {
  const raw = String(details?.message || '').replace(/^functions\/[a-z-]+:?\s*/i, '').trim();
  return raw.length > 0 && raw.length <= 220 ? raw : '';
};

export function designErrorMessage(error: unknown): string {
  const details = (error || {}) as CallableErrorLike;
  const code = String(details.code || '').toLowerCase();
  const message = String(details.details || details.message || '').toLowerCase();
  const fromServer = serverMessage(details);

  if (code.includes('unauthenticated') || message.includes('sign in')) return 'Please sign in before submitting a design request.';
  if (code.includes('deadline-exceeded')) {
    return 'The AI render took too long to answer. It may still complete in the background; check your design requests before trying again.';
  }
  if (code.includes('resource-exhausted')) return 'AI Design Studio request limit reached. Please retry later.';
  if (code.includes('permission-denied') || message.includes('permission')) {
    if (message.includes('portal role') || message.includes('server-approved profile')) return fromServer || 'Submission blocked by server authority checks.';
    return 'Submission blocked by server authority checks.';
  }
  if (code.includes('failed-precondition')) {
    if (message.includes('not configured')) return 'AI image generation is not configured yet. Please contact BIN GROUP support.';
    if (message.includes('unit')) return 'A verified tenant unit link is required before submitting this design request.';
    if (message.includes('app check')) return 'Submission requires production App Check. Update the app and retry.';
    return fromServer || 'Submission requires production App Check and configured AI provider access.';
  }
  if (message.includes('app check')) return 'Submission requires production App Check. Update the app and retry.';
  if (code.includes('unavailable')) return 'AI image rendering is temporarily unavailable. No design workflow record was created.';
  if (code.includes('not-found') || code.includes('internal')) {
    return 'AI Design Studio service could not be reached. Check your connection and retry.';
  }
  return 'Design request could not be submitted. Please retry.';
}
