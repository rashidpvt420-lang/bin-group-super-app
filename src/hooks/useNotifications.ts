/**
 * Custom Hook: Push Notifications
 * Integrates FCM and local notifications
 */

import { useEffect, useState } from 'react';
import { notificationService } from '../lib/notificationService';

export function useNotifications() {
  const [initialized, setInitialized] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        const success = await notificationService.initialize();
        setInitialized(success);

        if (success) {
          const token = await notificationService.getFCMToken();
          setFcmToken(token);
          console.log('[Notifications] FCM Token:', token);
        }
      } catch (err: any) {
        setError(err.message);
      }
    };

    initialize();
  }, []);

  const sendNotification = async (title: string, body: string, data?: Record<string, string>) => {
    try {
      await notificationService.sendLocalNotification({
        title,
        body,
        data
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  return {
    initialized,
    fcmToken,
    error,
    sendNotification
  };
}
