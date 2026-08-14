type SmtpError = Error & {
  code?: string;
  responseCode?: number;
  smtpAttempts?: number;
};

const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "ESOCKET",
]);

function normalizedError(error: unknown): SmtpError {
  if (error instanceof Error) return error as SmtpError;
  return new Error(String(error || "SMTP delivery failed")) as SmtpError;
}

export function isTransientSmtpError(error: unknown) {
  const smtpError = normalizedError(error);
  const responseCode = Number(smtpError.responseCode || 0);
  if (responseCode >= 400 && responseCode < 500) return true;
  if (RETRYABLE_CODES.has(String(smtpError.code || "").toUpperCase())) return true;
  return /temporar|timeout|timed out|connection (?:closed|reset)|try again|rate limit/i.test(smtpError.message);
}

export function smtpAttemptCount(error: unknown) {
  const attempts = Number((error as SmtpError | undefined)?.smtpAttempts || 1);
  return Number.isInteger(attempts) && attempts > 0 ? attempts : 1;
}

export async function sendSmtpWithRetry<T>(operation: () => Promise<T>, maxAttempts = 3) {
  const attempts = Math.max(1, Math.min(5, Math.floor(maxAttempts)));
  let lastError: SmtpError = new Error("SMTP delivery failed") as SmtpError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { value: await operation(), attempts: attempt };
    } catch (error) {
      lastError = normalizedError(error);
      lastError.smtpAttempts = attempt;
      if (attempt === attempts || !isTransientSmtpError(lastError)) throw lastError;
      const delayMs = 500 * (2 ** (attempt - 1));
      console.warn(`[smtp] transient provider failure on attempt ${attempt}; retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
