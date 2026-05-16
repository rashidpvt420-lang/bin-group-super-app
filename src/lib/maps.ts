import { useEffect, useState } from 'react';

const GOOGLE_MAPS_SCRIPT_ID = 'bin-google-maps-js';

const getMapsKey = (): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_GOOGLE_MAPS_API_KEY || env?.REACT_APP_GOOGLE_MAPS_API_KEY || '';
};

const isMapsReady = () => typeof window !== 'undefined' && Boolean((window as any).google?.maps);

let mapsLoadPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('WINDOW_NOT_AVAILABLE'));
  if (!apiKey) return Promise.reject(new Error('GOOGLE_MAPS_API_KEY_MISSING'));
  if (isMapsReady()) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry&loading=async`;

    script.onload = () => {
      if (isMapsReady()) resolve();
      else reject(new Error('GOOGLE_MAPS_SCRIPT_LOADED_WITHOUT_MAPS'));
    };
    script.onerror = () => reject(new Error('GOOGLE_MAPS_SCRIPT_LOAD_FAILED'));

    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}

export const useGoogleMaps = () => {
  const apiKey = getMapsKey();
  const [isLoaded, setIsLoaded] = useState(isMapsReady());
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!apiKey) {
      setIsLoaded(false);
      setLoadError(new Error('GOOGLE_MAPS_API_KEY_MISSING'));
      return undefined;
    }

    if (isMapsReady()) {
      setIsLoaded(true);
      setLoadError(null);
      return undefined;
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

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return { isLoaded, loadError, apiKey };
};
