import { useEffect, useState } from 'react';

const getMapsKey = (): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_GOOGLE_MAPS_API_KEY || env?.REACT_APP_GOOGLE_MAPS_API_KEY || '';
};

const isMapsReady = () => typeof window !== 'undefined' && Boolean((window as any).google?.maps);

export const useGoogleMaps = () => {
  const apiKey = getMapsKey();
  const [isLoaded, setIsLoaded] = useState(isMapsReady());
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const updateState = () => {
      if (cancelled) return;
      const ready = isMapsReady();
      setIsLoaded(ready);
      setLoadError(ready ? null : new Error(apiKey ? 'GOOGLE_MAPS_SCRIPT_NOT_LOADED' : 'GOOGLE_MAPS_API_KEY_MISSING'));
      return ready;
    };

    if (updateState()) return undefined;

    const timer = window.setInterval(() => {
      if (updateState()) window.clearInterval(timer);
    }, 500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiKey]);

  return { isLoaded, loadError, apiKey };
};
