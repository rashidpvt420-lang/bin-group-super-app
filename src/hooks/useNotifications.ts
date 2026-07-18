/**
 * Custom Hook: Push Notifications
 * Integrates server-authoritative FCM registration and local notifications.
 */

import { useEffect, useState } from 'react';
import { notificationService } from '../lib/notificationService';

export function useNotifications() {
  const [initialized, setInitialized] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        const success = await notificationService.initialize();
        setInitialized(success);

        if (success) {
          const result = await notificationService.getFCMToken();
          setRegistrationId(result ? 'sdk-token-available' : null);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Push notification initialization failed.');
      }
    };

    void initialize();
  }, []);

  const sendNotification = async (title: string, body: string, data?: Record<string, string>) => {
    try {
      await notificationService.sendLocalNotification({
        title,
        body,
        data,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Local notification failed.');
    }
  };

  return {
    initialized,
    registrationId,
    error,
    sendNotification,
  };
}
