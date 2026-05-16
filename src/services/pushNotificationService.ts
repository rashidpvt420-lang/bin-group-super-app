import { doc, getSafeMessaging, getToken, onMessage, setDoc, auth, updateDoc, arrayUnion, serverTimestamp } from '../lib/firebase';
import { db } from '../lib/firebase';

const readEnv = (key: string): string => {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return metaEnv?.[key] || '';
};

const getVapidKey = () => readEnv('VITE_FIREBASE_VAPID_KEY') || readEnv('REACT_APP_FIREBASE_VAPID_KEY') || '';

export async function registerPushNotifications(userId: string, role?: string | null) {
  if (typeof window === 'undefined') return { enabled: false, reason: 'window_unavailable' };
  if (!('Notification' in window)) return { enabled: false, reason: 'notifications_unsupported' };
  if (!('serviceWorker' in navigator)) return { enabled: false, reason: 'service_worker_unsupported' };

  const vapidKey = getVapidKey();
  if (!vapidKey) return { enabled: false, reason: 'vapid_key_missing' };

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') return { enabled: false, reason: 'permission_denied' };

  const messaging = await getSafeMessaging();
  if (!messaging) return { enabled: false, reason: 'messaging_unsupported' };

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

  if (!token) return { enabled: false, reason: 'token_unavailable' };

  const tokenRecord = {
    token,
    platform: 'web',
    role: role || 'unknown',
    userAgent: navigator.userAgent,
    lastRegisteredAt: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(db, 'users', userId, 'fcmTokens', token), tokenRecord, { merge: true }),
    updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayUnion(token),
      pushEnabled: true,
      pushUpdatedAt: serverTimestamp(),
    }).catch(async () => {
      await setDoc(doc(db, 'users', userId), {
        uid: userId,
        role: role || 'unknown',
        fcmTokens: [token],
        pushEnabled: true,
        pushUpdatedAt: serverTimestamp(),
      }, { merge: true });
    })
  ]);

  return { enabled: true, token };
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
  return ['tenant', 'technician', 'owner', 'admin', 'ceo', 'broker'].includes(String(role || '').toLowerCase());
}
