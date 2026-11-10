import { getAdminMapsAppCheckToken } from './firebase';

const SCRIPT_ID = 'bin-admin-google-maps-js';
let loadPromise: Promise<any> | null = null;

const mapsKey = () => String(process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '').trim();
const mapsEnabled = () => String(process.env.REACT_APP_ENABLE_EMBEDDED_GOOGLE_MAPS || 'true').toLowerCase() !== 'false';

function mapsApiReady(maps: any): boolean {
  return Boolean(maps && (typeof maps.importLibrary === 'function' || maps.Map || maps.Settings));
}

async function waitForMapsApi(w: any, timeoutMs = 8000): Promise<any> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (w.__BIN_ADMIN_MAPS_AUTH_FAILED__) {
        reject(new Error('GOOGLE_MAPS_AUTH_FAILED'));
        return;
      }
      if (mapsApiReady(w.google?.maps)) {
        resolve(w.google.maps);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('GOOGLE_MAPS_API_NOT_READY'));
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

async function configureMapsAppCheck(w: any) {
  const maps = w.google?.maps;
  if (!maps) throw new Error('GOOGLE_MAPS_SCRIPT_LOADED_WITHOUT_MAPS');
  if (typeof maps.importLibrary === 'function') {
    const { Settings } = await maps.importLibrary('core');
    Settings.getInstance().fetchAppCheckToken = () => getAdminMapsAppCheckToken();
    return;
  }
  const Settings = maps.Settings || maps.core?.Settings;
  if (Settings?.getInstance) {
    Settings.getInstance().fetchAppCheckToken = () => getAdminMapsAppCheckToken();
    return;
  }
  throw new Error('GOOGLE_MAPS_SETTINGS_UNAVAILABLE');
}

function installAuthFailureHook() {
  const w = window as any;
  if (w.__BIN_ADMIN_MAPS_AUTH_HOOK__) return;
  w.__BIN_ADMIN_MAPS_AUTH_HOOK__ = true;
  const previous = w.gm_authFailure;
  w.gm_authFailure = () => {
    w.__BIN_ADMIN_MAPS_AUTH_FAILED__ = true;
    if (typeof previous === 'function') previous();
  };
}

export function loadAdminGoogleMaps(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('WINDOW_NOT_AVAILABLE'));
  if (!mapsEnabled()) return Promise.reject(new Error('EMBEDDED_GOOGLE_MAPS_DISABLED'));
  const key = mapsKey();
  if (!key) return Promise.reject(new Error('GOOGLE_MAPS_API_KEY_MISSING'));

  const w = window as any;
  if (w.__BIN_ADMIN_MAPS_AUTH_FAILED__) return Promise.reject(new Error('GOOGLE_MAPS_AUTH_FAILED'));
  if (mapsApiReady(w.google?.maps) && typeof w.google.maps.importLibrary === 'function') {
    return configureMapsAppCheck(w).then(() => w.google.maps);
  }
  if (loadPromise) return loadPromise;

  installAuthFailureHook();
  loadPromise = new Promise((resolve, reject) => {
    let started = false;
    const complete = () => {
      if (started) return;
      started = true;
      window.setTimeout(async () => {
        if (w.__BIN_ADMIN_MAPS_AUTH_FAILED__) {
          reject(new Error('GOOGLE_MAPS_AUTH_FAILED'));
          return;
        }
        try {
          await waitForMapsApi(w);
          await configureMapsAppCheck(w);
          resolve(w.google.maps);
        } catch (error) {
          reject(error);
        }
      }, 250);
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', complete, { once: true });
      existing.addEventListener('error', () => reject(new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED')), { once: true });
      if (w.google?.maps) complete();
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry&loading=async`;
    script.onload = complete;
    script.onerror = () => reject(new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED'));
    document.head.appendChild(script);
  }).catch((error) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}

export function googleMapsSearchUrl(lat: number, lng: number) {
  const valid =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0) &&
    !(lat >= 51 && lat <= 57 && lng >= 22 && lng <= 27);
  if (!valid) return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}
