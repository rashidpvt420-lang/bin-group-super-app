import { useEffect, useState } from 'react';

const GOOGLE_MAPS_SCRIPT_ID = 'bin-google-maps-js';

type MapsFailureSubscriber = (error: Error) => void;

const getMapsKey = (): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_GOOGLE_MAPS_API_KEY || env?.REACT_APP_GOOGLE_MAPS_API_KEY || '';
};

const isEmbeddedMapsEnabled = (): boolean => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_ENABLE_EMBEDDED_GOOGLE_MAPS !== 'false';
};

const isMapsReady = () => typeof window !== 'undefined' && Boolean((window as any).google?.maps);
const isMapsAuthFailed = () => typeof window !== 'undefined' && (window as any).__BIN_GOOGLE_MAPS_AUTH_FAILED__ === true;

let mapsLoadPromise: Promise<void> | null = null;
let authFailureSubscribers: MapsFailureSubscriber[] = [];

const notifyAuthFailure = () => {
  const error = new Error('GOOGLE_MAPS_AUTH_FAILED');
  authFailureSubscribers.forEach((subscriber) => subscriber(error));
};

function installAuthFailureHook() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__BIN_GOOGLE_MAPS_AUTH_HOOK_INSTALLED__) return;
  w.__BIN_GOOGLE_MAPS_AUTH_HOOK_INSTALLED__ = true;
  const previousHandler = w.gm_authFailure;
  w.gm_authFailure = () => {
    w.__BIN_GOOGLE_MAPS_AUTH_FAILED__ = true;
    console.error('[Google Maps] Authentication, billing, API enablement, or referrer restriction failure detected.');
    if (typeof previousHandler === 'function') previousHandler();
    notifyAuthFailure();
  };
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('WINDOW_NOT_AVAILABLE'));
  if (!isEmbeddedMapsEnabled()) {
    return Promise.reject(new Error('EMBEDDED_GOOGLE_MAPS_DISABLED'));
  }
  if (!apiKey) return Promise.reject(new Error('GOOGLE_MAPS_API_KEY_MISSING'));
  if (isMapsAuthFailed()) return Promise.reject(new Error('GOOGLE_MAPS_AUTH_FAILED'));
  if (isMapsReady()) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;

  installAuthFailureHook();

  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener('load', () => {
        window.setTimeout(() => {
          if (isMapsAuthFailed()) reject(new Error('GOOGLE_MAPS_AUTH_FAILED'));
          else if (isMapsReady()) resolve();
          else reject(new Error('GOOGLE_MAPS_SCRIPT_LOADED_WITHOUT_MAPS'));
        }, 250);
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry&loading=async`;

    script.onload = () => {
      window.setTimeout(() => {
        if (isMapsAuthFailed()) reject(new Error('GOOGLE_MAPS_AUTH_FAILED'));
        else if (isMapsReady()) resolve();
        else reject(new Error('GOOGLE_MAPS_SCRIPT_LOADED_WITHOUT_MAPS'));
      }, 250);
    };
    script.onerror = () => reject(new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED'));

    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}

export const buildGoogleMapsSearchUrl = (args: { lat?: number | string | null; lng?: number | string | null; address?: string; emirate?: string }) => {
  const lat = Number(args.lat);
  const lng = Number(args.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const query = hasCoords
    ? `${lat},${lng}`
    : [args.address, args.emirate, 'United Arab Emirates'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || 'United Arab Emirates')}`;
};

export const useGoogleMaps = () => {
  const apiKey = getMapsKey();
  const mapsEnabled = isEmbeddedMapsEnabled();

  const [isLoaded, setIsLoaded] = useState(mapsEnabled && isMapsReady() && !isMapsAuthFailed());
  const [loadError, setLoadError] = useState<Error | null>(
    !mapsEnabled ? new Error('EMBEDDED_GOOGLE_MAPS_DISABLED') : (isMapsAuthFailed() ? new Error('GOOGLE_MAPS_AUTH_FAILED') : null)
  );

  useEffect(() => {
    let cancelled = false;

    if (!isEmbeddedMapsEnabled()) {
      setIsLoaded(false);
      setLoadError(new Error('EMBEDDED_GOOGLE_MAPS_DISABLED'));
      return;
    }

    installAuthFailureHook();
    const onAuthFailure = (error: Error) => {
      if (cancelled) return;
      setIsLoaded(false);
      setLoadError(error);
    };
    authFailureSubscribers.push(onAuthFailure);

    const cleanup = () => {
      cancelled = true;
      authFailureSubscribers = authFailureSubscribers.filter((subscriber) => subscriber !== onAuthFailure);
    };

    if (!apiKey) {
      setIsLoaded(false);
      setLoadError(new Error('GOOGLE_MAPS_API_KEY_MISSING'));
      return cleanup;
    }

    if (isMapsAuthFailed()) {
      setIsLoaded(false);
      setLoadError(new Error('GOOGLE_MAPS_AUTH_FAILED'));
      return cleanup;
    }

    if (isMapsReady()) {
      setIsLoaded(true);
      setLoadError(null);
      return cleanup;
    }

    setIsLoaded(false);
    setLoadError(null);

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled) return;
        setIsLoaded(true);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setIsLoaded(false);
        setLoadError(error instanceof Error ? error : new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED'));
      });

    return cleanup;
  }, [apiKey]);

  if (!mapsEnabled) {
    return { isLoaded: false, loadError: new Error('EMBEDDED_GOOGLE_MAPS_DISABLED'), apiKey, authFailed: false };
  }

  return { isLoaded, loadError, apiKey, authFailed: isMapsAuthFailed() };
};