// Reason + user-facing note for a failed askPublicAppAssistant call (audit 2026-11-04, fixes 6/7).
// Most production 401s are App Check tokens that never verified (blocked reCAPTCHA, bots).
// App Check stays enforced; this only explains the fallback clearly and logs why.

export type PublicAssistantFailureReason = 'app_check' | 'rate_limited' | 'invalid_question' | 'network' | 'unavailable';

export function classifyPublicAssistantError(error: unknown): PublicAssistantFailureReason {
  const e = (error || {}) as { code?: unknown; message?: unknown };
  const code = String(e.code || '').toLowerCase();
  const message = String(e.message || '').toLowerCase();
  if (code.includes('unauthenticated') || message.includes('app check') || message.includes('appcheck')) return 'app_check';
  if (code.includes('resource-exhausted')) return 'rate_limited';
  if (code.includes('invalid-argument')) return 'invalid_question';
  if (message.includes('network') || message.includes('failed to fetch') || code.includes('deadline-exceeded')) return 'network';
  return 'unavailable';
}

export function publicAssistantFallbackNote(reason: PublicAssistantFailureReason): string {
  switch (reason) {
    case 'app_check':
      return 'The public assistant could not verify this browser (security check blocked, often by a privacy extension or ad blocker). Showing built-in guidance instead.';
    case 'rate_limited':
      return 'Too many questions in a short time. Please wait ten minutes. Showing built-in guidance instead.';
    case 'invalid_question':
      return 'Please type a longer question. Showing built-in guidance instead.';
    case 'network':
      return 'The public assistant could not be reached (connection problem). Showing built-in guidance instead.';
    default:
      return 'The public assistant is unavailable right now. Showing built-in guidance instead.';
  }
}
