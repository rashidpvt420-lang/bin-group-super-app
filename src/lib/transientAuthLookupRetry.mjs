// Firebase Auth 12.19 (@firebase/auth 1.13.6) deletes a persisted session when
// the startup accounts:lookup call returns HTTP 5xx with a JSON error body.
// Only auth/network-request-failed keeps the user; a 503 is treated as an
// invalid token and ProtectedRoute then sends the browser to /login.
// Later SDKs (auth 1.13.8+) fixed this. Until then, retry the two session
// restore calls. 400/401/403 still pass through so disabled and expired
// accounts fail closed inside the Auth SDK.

const TRANSIENT_STATUS = new Set([502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 3;

export function isTransientSessionRestoreUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.hostname === 'identitytoolkit.googleapis.com' && parsed.pathname === '/v1/accounts:lookup') return true;
    if (parsed.hostname === 'securetoken.googleapis.com' && parsed.pathname === '/v1/token') return true;
    return false;
  } catch {
    return false;
  }
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href;
  if (input && typeof input.url === 'string') return input.url;
  return '';
}

function callOriginal(original, input, init) {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return original(input.clone(), init);
  }
  return original(input, init);
}

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export function installTransientAuthLookupRetry(options = {}) {
  const target = options.target || globalThis;
  const delayMs = options.delayMs || ((attempt) => 300 * attempt);
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const current = target.fetch;
  if (typeof current !== 'function' || current.__binTransientAuthLookupRetry) return;

  const original = current.bind(target);

  async function wrapped(input, init) {
    const url = requestUrl(input);
    if (!isTransientSessionRestoreUrl(url)) return original(input, init);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (init?.signal?.aborted) return original(input, init);
      try {
        const response = await callOriginal(original, input, init);
        if (!TRANSIENT_STATUS.has(response.status) || attempt === maxAttempts) return response;
      } catch (error) {
        if (attempt === maxAttempts || error?.name === 'AbortError') throw error;
      }
      await wait(delayMs(attempt));
    }

    return original(input, init);
  }

  Object.defineProperty(wrapped, '__binTransientAuthLookupRetry', { value: true });
  target.fetch = wrapped;
}
