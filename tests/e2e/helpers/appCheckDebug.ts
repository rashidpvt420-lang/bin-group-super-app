import type { Page } from '@playwright/test';

/** Inject App Check debug token before navigation when running against enforced production. */
export async function injectAppCheckDebugToken(page: Page) {
  const token = process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || process.env.FIREBASE_APPCHECK_DEBUG_TOKEN;
  // `true` lets the SDK emit a console debug token (register it in Firebase Console → App Check → Manage debug tokens).
  const debugValue: string | boolean = token?.trim() || true;
  await page.addInitScript((debugToken) => {
    (window as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }, debugValue);
}

/** Mock high-accuracy GPS for technician arrival verification (≤100m accuracy required). */
export async function mockTechnicianGps(page: Page, lat = 25.2048, lng = 55.2708) {
  await page.addInitScript(({ latitude, longitude }) => {
    const position = {
      coords: {
        latitude,
        longitude,
        accuracy: 8,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
    const deliver = (success?: PositionCallback) => {
      if (typeof success === 'function') success(position as GeolocationPosition);
    };
    navigator.geolocation.getCurrentPosition = (success, _error, _options) => deliver(success);
    navigator.geolocation.watchPosition = (success) => {
      deliver(success);
      return 1;
    };
  }, { latitude: lat, longitude: lng });
}
