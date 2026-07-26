const SCRIPT_ID = 'bin-admin-google-maps-js';
let loadPromise: Promise<any> | null = null;

const mapsKey = () => String(process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '').trim();
const mapsEnabled = () => String(process.env.REACT_APP_ENABLE_EMBEDDED_GOOGLE_MAPS || 'true').toLowerCase() !== 'false';

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
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (loadPromise) return loadPromise;

  installAuthFailureHook();
  loadPromise = new Promise((resolve, reject) => {
    const complete = () => window.setTimeout(() => {
      if (w.__BIN_ADMIN_MAPS_AUTH_FAILED__) reject(new Error('GOOGLE_MAPS_AUTH_FAILED'));
      else if (w.google?.maps) resolve(w.google.maps);
      else reject(new Error('GOOGLE_MAPS_SCRIPT_LOADED_WITHOUT_MAPS'));
    }, 250);

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', complete, { once: true });
      existing.addEventListener('error', () => reject(new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED')), { once: true });
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
  });

  return loadPromise;
}

export function googleMapsSearchUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}
