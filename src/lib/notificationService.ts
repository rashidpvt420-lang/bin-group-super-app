/**
 * BIN GROUP Cloud Messaging Service
 * Real-time push notifications & in-app alerts
 */

import { getSafeMessaging, getToken, onMessage } from './firebase';

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, string>;
}

class BinGroupNotificationService {
  private messaging: any = null;
  private initialized = false;
  private tokenCache: string | null = null;

  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      this.messaging = await getSafeMessaging();
      if (!this.messaging) {
        console.warn('[Notifications] FCM not supported in this browser');
        return false;
      }

      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('[Notifications] User denied notification permission');
          return false;
        }
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        throw new Error('VITE_FIREBASE_VAPID_KEY not configured for production');
      }

      // Get FCM token
      this.tokenCache = await getToken(this.messaging, {
        vapidKey: vapidKey
      });

      console.log('[Notifications] FCM initialized successfully');

      // Listen for incoming messages
      onMessage(this.messaging, (payload) => {
        this.handleIncomingMessage(payload);
      });

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[Notifications] Initialization failed:', error);
      return false;
    }
  }

  private handleIncomingMessage(payload: any) {
    const notification = payload.notification || {};
    const data = payload.data || {};

    // Show in-app notification
    if ('Notification' in window) {
      new Notification(notification.title || 'BIN GROUP', {
        body: notification.body,
        icon: notification.icon || '/bin-group-logo.png',
        badge: '/bin-group-badge.png',
        tag: data.type || 'notification',
        data: data
      });
    }

    // Emit custom event for app handling
    window.dispatchEvent(
      new CustomEvent('bin-notification', {
        detail: { notification, data }
      })
    );
  }

  async getFCMToken(): Promise<string | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.tokenCache;
  }

  async sendLocalNotification(payload: NotificationPayload) {
    if ('Notification' in window) {
      new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/bin-group-logo.png',
        badge: payload.badge || '/bin-group-badge.png',
        tag: payload.tag || 'bin-notification',
        data: payload.data
      });
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const notificationService = new BinGroupNotificationService();
export default notificationService;
