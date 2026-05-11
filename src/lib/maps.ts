import { useEffect, useState } from 'react';

const getMapsKey = (): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_GOOGLE_MAPS_API_KEY || env?.REACT_APP_GOOGLE_MAPS_API_KEY || '';
};

export const useGoogleMaps = () => {
  const apiKey = getMapsKey();
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    const googleReady = typeof window !== 'undefined' && Boolean((window as any).google?.maps);
    setIsLoaded(googleReady);
    setLoadError(googleReady ? null : new Error(apiKey ? 'GOOGLE_MAPS_SCRIPT_NOT_LOADED' : 'GOOGLE_MAPS_API_KEY_MISSING'));
  }, [apiKey]);

  return { isLoaded, loadError, apiKey };
};
