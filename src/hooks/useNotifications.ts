/**
 * Custom Hook: Push Notifications
 * Integrates foreground messaging without exposing registration tokens.
 */

import { useEffect, useState } from 'react';
import { notificationService } from '../lib/notificationService';

export function useNotifications() {
  const [initialized, setInitialized] = useState(false);
  const [registrationAvailable, setRegistrationAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        const success = await notificationService.initialize();
        setInitialized(success);
        setRegistrationAvailable(success ? await notificationService.hasRegistrationToken() : false);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Push notification initialization failed.');
      }
    };

    void initialize();
  }, []);

  const sendNotification = async (title: string, body: string, data?: Record<string, string>) => {
    try {
      await notificationService.sendLocalNotification({ title, body, data });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Local notification failed.');
    }
  };

  return {
    initialized,
    registrationAvailable,
    error,
    sendNotification,
  };
}
