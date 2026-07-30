import { auth, functions, getSafeMessaging, getToken, httpsCallable, onMessage } from '../lib/firebase';

const readEnv = (key: string): string => {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return metaEnv?.[key] || '';
};

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
  readEnv('REACT_APP_FIREBASE_VAPID_KEY');

const PUSH_REGISTRATION_ATTEMPTS = 4;
const PUSH_REGISTRATION_BASE_DELAY_MS = 1_000;
const SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 20_000;

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error || 'unknown');

const isRetryableRegistrationError = (error: unknown) => {
  const value = `${(error as { code?: unknown })?.code || ''} ${errorMessage(error)}`.toLowerCase();
  return value.includes('network')
    || value.includes('fetch')
    || value.includes('timeout')
    || value.includes('service worker')
    || value.includes('service-worker')
    || value.includes('messaging/token')
    || value.includes('push service')
    || value.includes('registration');
};

async function activeMessagingServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  await registration.update().catch(() => undefined);
  if (registration.active) return registration;

  const startedAt = Date.now();
  while (Date.now() - startedAt < SERVICE_WORKER_ACTIVATION_TIMEOUT_MS) {
    if (registration.active) return registration;
    await sleep(250);
  }

  const ready = await navigator.serviceWorker.ready;
  if (!ready.active || !ready.active.scriptURL.endsWith('/firebase-messaging-sw.js')) {
    throw new Error('The BIN GROUP Firebase Messaging service worker did not become active.');
  }
  return ready;
}

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

type PushRegistrationResult = {
  enabled: boolean;
  reason?: string;
  registrationId?: string;
  registeredTokenCount?: number;
  prunedTokenCount?: number;
  readiness: PushReadiness;
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

export async function registerPushNotifications(userId: string, role?: string | null): Promise<PushRegistrationResult> {
  const readiness = getPushReadiness();
  const activeUser = auth.currentUser;

  if (!activeUser || activeUser.uid !== userId) {
    return { enabled: false, reason: 'authenticated_user_mismatch', readiness };
  }
  if (!shouldRequestPushForRole(role)) {
    return { enabled: false, reason: 'role_not_push_enabled', readiness };
  }
  if (typeof window === 'undefined') {
    return { enabled: false, reason: 'window_unavailable', readiness };
  }
  if (!readiness.supportsNotification) {
    return { enabled: false, reason: 'notifications_unsupported', readiness };
  }
  if (!readiness.supportsServiceWorker) {
    return { enabled: false, reason: 'service_worker_unsupported', readiness };
  }
  if (readiness.isIOS && !readiness.isStandalone) {
    return { enabled: false, reason: 'ios_requires_installed_pwa', readiness };
  }

  const vapidKey = getVapidKey();
  if (!vapidKey) {
    return { enabled: false, reason: 'vapid_key_missing', readiness };
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  const permissionReadiness = { ...readiness, permission };
  if (permission !== 'granted') {
    return { enabled: false, reason: 'permission_denied', readiness: permissionReadiness };
  }

  const messaging = await getSafeMessaging();
  if (!messaging) {
    return {
      enabled: false,
      reason: 'messaging_unsupported',
      readiness: { ...permissionReadiness, supportsMessaging: false },
    };
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= PUSH_REGISTRATION_ATTEMPTS; attempt += 1) {
    try {
      const registration = await activeMessagingServiceWorker();
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
      if (!token) throw new Error('Firebase Messaging did not return a registration token.');

      const registerToken = httpsCallable(functions, 'registerPushToken');
      const response = await registerToken({
        token,
        platform: readiness.platform,
        permission,
        isStandalone: readiness.isStandalone,
      });
      const data = response.data as {
        enabled?: boolean;
        registrationId?: string;
        registeredTokenCount?: number;
        prunedTokenCount?: number;
      };
      if (data.enabled !== true) throw new Error('The server did not confirm push registration.');

      return {
        enabled: true,
        registrationId: data.registrationId,
        registeredTokenCount: data.registeredTokenCount,
        prunedTokenCount: data.prunedTokenCount,
        readiness: { ...permissionReadiness, supportsMessaging: true },
      };
    } catch (error) {
      lastError = error;
      if (attempt === PUSH_REGISTRATION_ATTEMPTS || !isRetryableRegistrationError(error)) break;
      console.warn(`[Push] Registration attempt ${attempt}/${PUSH_REGISTRATION_ATTEMPTS} failed: ${errorMessage(error)}`);
      await sleep(PUSH_REGISTRATION_BASE_DELAY_MS * attempt);
    }
  }

  return {
    enabled: false,
    reason: `registration_failed:${errorMessage(lastError)}`,
    readiness: { ...permissionReadiness, supportsMessaging: true },
  };
}

export async function unregisterPushNotifications(): Promise<{ removed: boolean; registeredTokenCount?: number }> {
  if (!auth.currentUser || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { removed: false };
  }
  const vapidKey = getVapidKey();
  const messaging = await getSafeMessaging();
  if (!vapidKey || !messaging) return { removed: false };
  const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return { removed: false };
  const unregisterToken = httpsCallable(functions, 'unregisterPushToken');
  const response = await unregisterToken({ token });
  const data = response.data as { removed?: boolean; registeredTokenCount?: number };
  return { removed: data.removed === true, registeredTokenCount: data.registeredTokenCount };
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
