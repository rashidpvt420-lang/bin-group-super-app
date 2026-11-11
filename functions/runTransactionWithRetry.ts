/**
 * Retries Firestore transactions that fail due to contention, with exponential backoff.
 * Does not retry validation, permission, or failed-precondition errors.
 */
export const TRANSACTION_RETRY_ATTEMPTS = 5;
const INITIAL_DELAY_MS = 40;
const MAX_DELAY_MS = 800;

const NON_RETRYABLE_CODES = new Set([
  "ok",
  "cancelled",
  "invalid-argument",
  "not-found",
  "already-exists",
  "permission-denied",
  "failed-precondition",
  "out-of-range",
  "unimplemented",
  "data-loss",
  "unauthenticated",
  "resource-exhausted",
]);

export function isRetryableTransactionError(error: unknown): boolean {
  const code = String((error as { code?: string | number })?.code || "");
  const message = String((error as { message?: string })?.message || error || "");
  if (NON_RETRYABLE_CODES.has(code)) return false;
  return (
    code === "10" ||
    code === "aborted" ||
    code === "internal" ||
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    /ABORTED|DEADLINE_EXCEEDED|UNAVAILABLE|transaction lock|contention|too much contention|failed to commit/i.test(`${code} ${message}`)
  );
}

export async function runTransactionWithRetry<T>(
  db: FirebaseFirestore.Firestore,
  updater: (transaction: FirebaseFirestore.Transaction) => Promise<T>,
  options: { attempts?: number; maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.attempts || options.maxAttempts || TRANSACTION_RETRY_ATTEMPTS);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.runTransaction(updater);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableTransactionError(error)) throw error;
      const delay = Math.min(MAX_DELAY_MS, INITIAL_DELAY_MS * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * delay * 0.3);
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }
  throw lastError;
}
