import { doc, getSafeMessaging, getToken, onMessage, setDoc, auth, updateDoc, arrayUnion, serverTimestamp } from '../lib/firebase';
import { db } from '../lib/firebase';

const readEnv = (key: string): string => {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return metaEnv?.[key] || '';
};

const DEFAULT_WEB_PUSH_VAPID_KEY = 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ';

const PUSH_ENABLED_ROLES = new Set([
  'tenant',
  'technician',
  'owner',
  'broker',
  'admin',
  'super_admin',
  'ceo',
  'manager',
  'operations_admin',
  'finance_admin',
  'hr_admin',
  'support_admin',
  'hr_manager',
  'hr_staff',
  'finance_staff',
  'account_manager',
  'dispatcher',
  'operations_manager',
]);

const getVapidKey = () =>
  readEnv('VITE_FIREBASE_VAPID_KEY') ||
  readEnv('REACT_APP_FIREBASE_VAPID_KEY') ||
  DEFAULT_WEB_PUSH_VAPID_KEY;

type PushReadiness = {
  platform: 'web' | 'android-web' | 'ios-pwa' | 'ios-browser' | 'unknown';
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  supportsNotification: boolean;
  supportsServiceWorker: boolean;
  supportsMessaging: boolean | null;
  permission: NotificationPermission | 'unsupported';
};

export function getPushReadiness(): PushReadiness {
  if (typeof window === 'undefined') {
    return {
      platform: 'unknown',
      isIOS: false,
      isAndroid: false,
      isStandalone: false,
      supportsNotification: false,
      supportsServiceWorker: false,
      supportsMessaging: null,
      permission: 'unsupported',
    };
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  const supportsNotification = 'Notification' in window;
  const supportsServiceWorker = 'serviceWorker' in navigator;
  const platform = isIOS ? (isStandalone ? 'ios-pwa' : 'ios-browser') : isAndroid ? 'android-web' : 'web';

  return {
    platform,
    isIOS,
    isAndroid,
    isStandalone,
    supportsNotification,
    supportsServiceWorker,
    supportsMessaging: null,
    permission: supportsNotification ? Notification.permission : 'unsupported',
  };
}

async function persistPushReadiness(userId: string, role: string | null | undefined, readiness: PushReadiness, result: Record<string, any>) {
  try {
    await setDoc(doc(db, 'users', userId, 'deviceReadiness', 'push'), {
      ...readiness,
      role: role || 'unknown',
      result,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('[Push] Failed to persist readiness diagnostics. Firestore rules must allow users/{uid}/deviceReadiness/push:', err);
  }
}

export async function registerPushNotifications(userId: string, role?: string | null) {
  const readiness = getPushReadiness();

  if (typeof window === 'undefined') {
    return { enabled: false, reason: 'window_unavailable', readiness };
  }

  if (!readiness.supportsNotification) {
    const result = { enabled: false, reason: 'notifications_unsupported', readiness };
    await persistPushReadiness(userId, role, readiness, result);
    return result;
  }

  if (!readiness.supportsServiceWorker) {
    const result = { enabled: false, reason: 'service_worker_unsupported', readiness };
    await persistPushReadiness(userId, role, readiness, result);
    return result;
  }

  if (readiness.isIOS && !readiness.isStandalone) {
    const result = { enabled: false, reason: 'ios_requires_installed_pwa', readiness };
    await persistPushReadiness(userId, role, readiness, result);
    return result;
  }

  const vapidKey = getVapidKey();
  if (!vapidKey) {
    const result = { enabled: false, reason: 'vapid_key_missing', readiness };
    await persistPushReadiness(userId, role, readiness, result);
    return result;
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') {
    const result = { enabled: false, reason: 'permission_denied', permission, readiness: { ...readiness, permission } };
    await persistPushReadiness(userId, role, { ...readiness, permission }, result);
    return result;
  }

  const messaging = await getSafeMessaging();
  if (!messaging) {
    const result = { enabled: false, reason: 'messaging_unsupported', readiness: { ...readiness, permission, supportsMessaging: false } };
    await persistPushReadiness(userId, role, { ...readiness, permission, supportsMessaging: false }, result);
    return result;
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

  if (!token) {
    const result = { enabled: false, reason: 'token_unavailable', readiness: { ...readiness, permission, supportsMessaging: true } };
    await persistPushReadiness(userId, role, { ...readiness, permission, supportsMessaging: true }, result);
    return result;
  }

  const tokenRecord = {
    token,
    platform: readiness.platform,
    role: role || 'unknown',
    userAgent: navigator.userAgent,
    permission,
    isStandalone: readiness.isStandalone,
    lastRegisteredAt: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(db, 'users', userId, 'fcmTokens', token), tokenRecord, { merge: true }),
    updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayUnion(token),
      pushEnabled: true,
      pushPlatform: readiness.platform,
      pushRole: role || 'unknown',
      pushUpdatedAt: serverTimestamp(),
    }).catch(async () => {
      await setDoc(doc(db, 'users', userId), {
        uid: userId,
        role: role || 'unknown',
        fcmTokens: [token],
        pushEnabled: true,
        pushPlatform: readiness.platform,
        pushRole: role || 'unknown',
        pushUpdatedAt: serverTimestamp(),
      }, { merge: true });
    })
  ]);

  const result = { enabled: true, token, readiness: { ...readiness, permission, supportsMessaging: true } };
  await persistPushReadiness(userId, role, { ...readiness, permission, supportsMessaging: true }, { enabled: true, tokenPresent: true });
  return result;
}

export async function attachForegroundPushListener(onForeground?: (payload: any) => void) {
  const messaging = await getSafeMessaging();
  if (!messaging) return () => undefined;
  return onMessage(messaging, (payload) => {
    if (onForeground) onForeground(payload);
    const title = payload.notification?.title || payload.data?.title || 'BIN GROUP';
    const body = payload.notification?.body || payload.data?.body || 'New update received.';
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js').then((registration) => {
        registration?.showNotification(title, {
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          data: { url: payload.data?.link || payload.data?.click_action || '/' },
        });
      });
    }
  });
}

export function shouldRequestPushForRole(role?: string | null) {
  return PUSH_ENABLED_ROLES.has(String(role || '').toLowerCase());
}
