export function isTransientSessionRestoreUrl(url: string): boolean;

export function installTransientAuthLookupRetry(options?: {
  target?: { fetch: typeof fetch };
  delayMs?: (attempt: number) => number;
  maxAttempts?: number;
}): void;
