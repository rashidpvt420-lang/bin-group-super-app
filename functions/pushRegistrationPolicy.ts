// Which client platforms may register an FCM token, and how long a registration stays deliverable.
//
// Web / installed-PWA registrations must be refreshed every day (CURRENT_PUSH_TOKEN_MAX_AGE_MS, kept in the callers).
// Native app registrations (Capacitor Android / iOS) are for users who are NOT looking at the app, so
// they stay deliverable for longer; the app refreshes them whenever it opens or returns to the
// foreground, and FCM tells us when a token is dead (it is then deleted by deliverNotificationPush).

export const WEB_PUSH_PLATFORMS = ["web", "android-web", "ios-pwa"] as const;
export const NATIVE_PUSH_PLATFORMS = ["android-native", "ios-native"] as const;
export const PUSH_PLATFORMS: ReadonlySet<string> = new Set<string>([...WEB_PUSH_PLATFORMS, ...NATIVE_PUSH_PLATFORMS]);

export const NATIVE_REGISTRATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isNativePushPlatform(platform: unknown): boolean {
  return (NATIVE_PUSH_PLATFORMS as readonly string[]).includes(String(platform || "").trim().toLowerCase());
}
