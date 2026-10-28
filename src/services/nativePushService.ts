// Native (Capacitor Android / iOS) push registration.
//
// The web FCM path in pushNotificationService.ts is unchanged and still used in browsers / installed PWAs.
// Inside the native shell this module: asks for notification permission (Android 13+ POST_NOTIFICATIONS,
// iOS prompt), creates the Android notification channel, gets the FCM registration token and sends it to the
// server-authorised `registerPushToken` callable so `deliverNotificationPush` can reach the device. It also
// follows token refreshes, routes notification taps to the right screen and removes the registration on logout.
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { auth, functions, httpsCallable } from '../lib/firebase';

export type NativePushPlatform = 'android-native' | 'ios-native';

export type NativePushResult = {
  enabled: boolean;
  reason?: string;
  platform: NativePushPlatform | null;
  permission: 'granted' | 'denied' | 'prompt' | 'unsupported';
  registrationId?: string;
  registeredTokenCount?: number;
  prunedTokenCount?: number;
};

export type NativePushForegroundPayload = {
  notification: { title: string; body: string };
  data: Record<string, string>;
};

export const NATIVE_PUSH_CHANNEL_ID = 'bin_default';
export const FOREGROUND_PUSH_EVENT = 'bin:push-foreground';

const REGISTRATION_TIMEOUT_MS = 20_000;
const SERVER_ATTEMPTS = 3;
const SERVER_BASE_DELAY_MS = 1_000;
const LOGOUT_CLEANUP_TIMEOUT_MS = 4_000;
// Native registrations stay deliverable server-side for 7 days; refresh well before that on every resume.
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const STORED_TOKEN_KEY = 'bin.nativePush.registration';

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error || 'unknown'));

export function getNativePushPlatform(): NativePushPlatform | null {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    const platform = Capacitor.getPlatform();
    if (platform === 'android') return 'android-native';
    if (platform === 'ios') return 'ios-native';
  } catch {
    // fall through
  }
  return null;
}

/** Only internal app paths may be opened from a notification tap (never external URLs or protocol links). */
export function safeInternalPath(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 300) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  return raw;
}

/** Normalises whatever the OS hands the plugin into a flat string map (FCM data values are strings). */
export function flattenPushData(data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data || typeof data !== 'object') return out;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === 'string' ? value : String(value);
  }
  return out;
}

/** iOS hands back an APNs device token (hex) unless Firebase Messaging is wired into the iOS project. */
export function looksLikeFcmToken(value: string): boolean {
  return value.length >= 50 && value.includes(':');
}

async function loadPlugin() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  return PushNotifications;
}

// ---- token bookkeeping -----------------------------------------------------------------------------------
type StoredRegistration = { uid: string; at: number; value: string };

function readStored(): StoredRegistration | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORED_TOKEN_KEY) || 'null');
    if (parsed && typeof parsed.uid === 'string' && typeof parsed.value === 'string' && typeof parsed.at === 'number') return parsed;
  } catch {
    // ignore corrupt value
  }
  return null;
}
function writeStored(entry: StoredRegistration | null) {
  try {
    if (entry) window.localStorage.setItem(STORED_TOKEN_KEY, JSON.stringify(entry));
    else window.localStorage.removeItem(STORED_TOKEN_KEY);
  } catch {
    // storage unavailable: registration still works, logout cleanup falls back to unregister()
  }
}

type PendingToken = { resolve: (value: string) => void; reject: (error: Error) => void };
let pending: PendingToken | null = null;
let registrationHandles: PluginListenerHandle[] = [];
let registrationListenersReady: Promise<void> | null = null;

async function sendToServer(value: string, platform: NativePushPlatform) {
  const registerToken = httpsCallable(functions, 'registerPushToken');
  let lastError: unknown;
  for (let attempt = 1; attempt <= SERVER_ATTEMPTS; attempt += 1) {
    try {
      const response = await registerToken({ token: value, platform, permission: 'granted', isStandalone: false });
      const data = response.data as { enabled?: boolean; registrationId?: string; registeredTokenCount?: number; prunedTokenCount?: number };
      if (data.enabled !== true) throw new Error('The server did not confirm push registration.');
      return data;
    } catch (error) {
      lastError = error;
      const code = String((error as { code?: unknown })?.code || '');
      // Permission / precondition failures will not fix themselves on retry.
      if (attempt === SERVER_ATTEMPTS || /permission-denied|failed-precondition|invalid-argument|unauthenticated/.test(code)) break;
      await sleep(SERVER_BASE_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(errorMessage(lastError));
}

async function syncRefreshedToken(value: string) {
  const platform = getNativePushPlatform();
  const user = auth.currentUser;
  if (!platform || !user) return;
  if (platform === 'ios-native' && !looksLikeFcmToken(value)) return;
  const previous = readStored();
  await sendToServer(value, platform);
  writeStored({ uid: user.uid, at: Date.now(), value });
  // Token rotated: drop the old registration so the server stops fanning out to a dead token.
  if (previous && previous.uid === user.uid && previous.value !== value) {
    await httpsCallable(functions, 'unregisterPushToken')({ token: previous.value }).catch(() => undefined);
  }
}

async function ensureRegistrationListeners() {
  if (registrationListenersReady) return registrationListenersReady;
  registrationListenersReady = (async () => {
    const plugin = await loadPlugin();
    registrationHandles.push(
      await plugin.addListener('registration', (event) => {
        const value = String(event?.value || '');
        if (pending) {
          const current = pending;
          pending = null;
          current.resolve(value);
          return;
        }
        // Not requested by us: FCM rotated the token. Re-register it for the signed-in user.
        if (value) void syncRefreshedToken(value).catch((error) => console.warn('[Push] Refresh sync failed:', errorMessage(error)));
      }),
      await plugin.addListener('registrationError', (event) => {
        if (pending) {
          const current = pending;
          pending = null;
          current.reject(new Error(String(event?.error || 'Native push registration failed.')));
        }
      }),
    );
  })().catch((error) => {
    registrationListenersReady = null;
    throw error;
  });
  return registrationListenersReady;
}

function requestNativeToken(plugin: Awaited<ReturnType<typeof loadPlugin>>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (pending) pending = null;
      reject(new Error('Timed out waiting for the device push registration.'));
    }, REGISTRATION_TIMEOUT_MS);
    pending = {
      resolve: (value) => { window.clearTimeout(timer); resolve(value); },
      reject: (error) => { window.clearTimeout(timer); reject(error); },
    };
    plugin.register().catch((error) => {
      if (pending) pending = null;
      window.clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(errorMessage(error)));
    });
  });
}

// ---- public API -------------------------------------------------------------------------------------------

/**
 * Permission -> channel -> device token -> server registration.
 * `promptIfNeeded=false` is used for silent refreshes (never shows an OS prompt).
 * The caller (pushNotificationService.registerPushNotifications) has already checked the signed-in user and role.
 */
export async function registerNativePushNotifications(promptIfNeeded = true): Promise<NativePushResult> {
  const platform = getNativePushPlatform();
  if (!platform) return { enabled: false, reason: 'not_native_app', platform: null, permission: 'unsupported' };
  const user = auth.currentUser;
  if (!user) return { enabled: false, reason: 'unauthenticated', platform, permission: 'unsupported' };

  let plugin: Awaited<ReturnType<typeof loadPlugin>>;
  try {
    plugin = await loadPlugin();
  } catch (error) {
    return { enabled: false, reason: `plugin_unavailable:${errorMessage(error)}`, platform, permission: 'unsupported' };
  }

  // Android 13+ shows the POST_NOTIFICATIONS prompt here; older Android reports "granted" without a prompt.
  let permission = (await plugin.checkPermissions()).receive;
  if ((permission === 'prompt' || permission === 'prompt-with-rationale') && promptIfNeeded) {
    permission = (await plugin.requestPermissions()).receive;
  }
  if (permission !== 'granted') {
    return {
      enabled: false,
      reason: permission === 'denied' ? 'permission_denied' : 'permission_not_granted',
      platform,
      permission: permission === 'denied' ? 'denied' : 'prompt',
    };
  }

  try {
    if (platform === 'android-native') {
      // Android 8+: the channel must exist before a notification can be shown on it.
      await plugin.createChannel({
        id: NATIVE_PUSH_CHANNEL_ID,
        name: 'BIN GROUP alerts',
        description: 'Dispatch, approval, ticket and payment updates',
        importance: 4,
        visibility: 1,
        vibration: true,
      }).catch((error) => console.warn('[Push] Could not create the notification channel:', errorMessage(error)));
    }
    await ensureRegistrationListeners();
    const value = await requestNativeToken(plugin);
    if (!value) throw new Error('The device did not return a push registration.');
    if (platform === 'ios-native' && !looksLikeFcmToken(value)) {
      // Only an Apple (APNs) device token came back: Firebase Messaging is not wired into the iOS project yet.
      return { enabled: false, reason: 'ios_fcm_not_configured', platform, permission: 'granted' };
    }
    const previous = readStored();
    const data = await sendToServer(value, platform);
    writeStored({ uid: user.uid, at: Date.now(), value });
    if (previous && previous.uid === user.uid && previous.value !== value) {
      await httpsCallable(functions, 'unregisterPushToken')({ token: previous.value }).catch(() => undefined);
    }
    return {
      enabled: true,
      platform,
      permission: 'granted',
      registrationId: data.registrationId,
      registeredTokenCount: data.registeredTokenCount,
      prunedTokenCount: data.prunedTokenCount,
    };
  } catch (error) {
    return { enabled: false, reason: `registration_failed:${errorMessage(error)}`, platform, permission: 'granted' };
  }
}

/** Silent refresh used on app resume: only runs when permission is already granted and the registration is old. */
export async function refreshNativePushRegistrationIfStale(): Promise<void> {
  if (!getNativePushPlatform() || !auth.currentUser) return;
  const stored = readStored();
  if (stored && stored.uid === auth.currentUser.uid && Date.now() - stored.at < STALE_AFTER_MS) return;
  await registerNativePushNotifications(false);
}

/** Removes this device's registration (server + FCM) for the signed-in user. Best effort, never throws. */
export async function unregisterNativePushNotifications(): Promise<{ removed: boolean }> {
  const platform = getNativePushPlatform();
  if (!platform) return { removed: false };
  let removed = false;
  const stored = readStored();
  if (auth.currentUser && stored && stored.uid === auth.currentUser.uid) {
    try {
      const response = await httpsCallable(functions, 'unregisterPushToken')({ token: stored.value });
      removed = (response.data as { removed?: boolean })?.removed === true;
    } catch (error) {
      console.warn('[Push] Server push cleanup failed:', errorMessage(error));
    }
  }
  writeStored(null);
  try {
    const plugin = await loadPlugin();
    // Deleting the device token means the next account that signs in gets a fresh one.
    await plugin.unregister().catch(() => undefined);
    await plugin.removeAllDeliveredNotifications().catch(() => undefined);
  } catch {
    // plugin unavailable
  }
  return { removed };
}

let logoutCleanupInstalled = false;

/**
 * Runs the cleanup before ANY sign-out or account switch, while the user is still authenticated, so every
 * logout button in the app is covered without editing each one.
 */
export function installNativePushLogoutCleanup(): void {
  if (logoutCleanupInstalled || !getNativePushPlatform()) return;
  logoutCleanupInstalled = true;
  auth.beforeAuthStateChanged(async (next) => {
    const previous = auth.currentUser;
    if (!previous || (next && next.uid === previous.uid)) return;
    await Promise.race([
      unregisterNativePushNotifications(),
      sleep(LOGOUT_CLEANUP_TIMEOUT_MS),
    ]).catch(() => undefined);
  });
}

export type NativePushListenerOptions = {
  /** Called with an internal path when the user taps a notification. */
  onNavigate?: (path: string) => void;
  /** Called when a notification arrives while the app is open. */
  onForeground?: (payload: NativePushForegroundPayload) => void;
};

/**
 * Foreground arrival, notification taps (foreground, background and cold start) and resume refresh.
 * Returns a detach function.
 */
export async function attachNativePushListeners(options: NativePushListenerOptions = {}): Promise<() => void> {
  if (!getNativePushPlatform()) return () => undefined;
  installNativePushLogoutCleanup();
  const plugin = await loadPlugin();
  const handles: PluginListenerHandle[] = [];

  handles.push(await plugin.addListener('pushNotificationReceived', (notification) => {
    const payload: NativePushForegroundPayload = {
      notification: { title: String(notification.title || 'BIN GROUP'), body: String(notification.body || 'New update received.') },
      data: flattenPushData(notification.data),
    };
    window.dispatchEvent(new CustomEvent(FOREGROUND_PUSH_EVENT, { detail: payload }));
    options.onForeground?.(payload);
  }));

  handles.push(await plugin.addListener('pushNotificationActionPerformed', (action) => {
    const data = flattenPushData(action.notification?.data);
    const path = safeInternalPath(data.link || data.click_action);
    if (path) options.onNavigate?.(path);
  }));

  try {
    const { App } = await import('@capacitor/app');
    handles.push(await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refreshNativePushRegistrationIfStale().catch((error) => console.warn('[Push] Resume refresh failed:', errorMessage(error)));
    }));
  } catch {
    // @capacitor/app unavailable: launch-time registration still runs
  }

  return () => { handles.forEach((handle) => { void handle.remove(); }); };
}
