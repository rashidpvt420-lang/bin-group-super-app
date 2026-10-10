import type { BrowserContext } from '@playwright/test';

type Position = { latitude: number; longitude: number; accuracy: number };

// Chromium's fixed context location can become stale after navigation. Arrival
// asks for maximumAge=0, so emit fresh CDP positions while requesting arrival.
// This supplies the browser fixture; the app and server still verify GPS.
export async function withFreshGeolocation<T>(
  context: Pick<BrowserContext, 'setGeolocation'>,
  position: Position,
  action: () => Promise<T>,
): Promise<T> {
  await context.setGeolocation(position);
  let pending: Promise<void> | undefined;
  let refreshError: unknown;
  const timer = setInterval(() => {
    if (pending || refreshError) return;
    pending = context.setGeolocation(position)
      .catch((error: unknown) => { refreshError = error; })
      .finally(() => { pending = undefined; });
  }, 500);

  let result: T;
  try {
    result = await action();
  } finally {
    clearInterval(timer);
    await pending;
  }
  if (refreshError) throw refreshError;
  return result;
}
