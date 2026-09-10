export const TECHNICIAN_INSTALLATION_HASH_RE = /^[a-f0-9]{64}$/;
export const TECHNICIAN_ANDROID_APP_ID_RE = /^1:123413252227:android:[a-f0-9]+$/i;
export const TECHNICIAN_ANDROID_FIREBASE_APP_ID = "1:123413252227:android:36feeed4a78c1dcf99f3b6";
export const PROTECTED_BROWSER_FIXTURE_RE = /^protected-[a-z0-9-]+-browser$/;

export type InstallationRegistrationDecision =
  | "INITIAL_REGISTRATION"
  | "IDEMPOTENT_REGISTRATION"
  | "REJECTED_ROTATION"
  | "INCONSISTENT_REGISTRATION";

const text = (value: unknown) => String(value || "").trim();

export function normalizeInstallationHash(value: unknown): string | null {
  const normalized = text(value).toLowerCase();
  return TECHNICIAN_INSTALLATION_HASH_RE.test(normalized) ? normalized : null;
}

export function classifyInstallationRegistration(
  userHashValue: unknown,
  technicianHashValue: unknown,
  requestedHashValue: unknown,
): InstallationRegistrationDecision {
  const requestedHash = normalizeInstallationHash(requestedHashValue);
  if (!requestedHash) return "REJECTED_ROTATION";

  const existingHashes = [
    normalizeInstallationHash(userHashValue),
    normalizeInstallationHash(technicianHashValue),
  ].filter((value): value is string => Boolean(value));
  const uniqueHashes = [...new Set(existingHashes)];

  if (uniqueHashes.length > 1) return "INCONSISTENT_REGISTRATION";
  if (uniqueHashes.length === 0) return "INITIAL_REGISTRATION";
  return uniqueHashes[0] === requestedHash
    ? "IDEMPOTENT_REGISTRATION"
    : "REJECTED_ROTATION";
}

export function isVerifiedAndroidAppCheckAppId(
  appIdValue: unknown,
  configuredAppIdValue: unknown = TECHNICIAN_ANDROID_FIREBASE_APP_ID,
): boolean {
  const appId = text(appIdValue);
  const configuredAppId = text(configuredAppIdValue);
  if (!TECHNICIAN_ANDROID_APP_ID_RE.test(appId)) return false;
  return Boolean(configuredAppId) && appId === configuredAppId;
}

export function protectedBrowserFixtureId(value: unknown): string | null {
  const normalized = text(value).toLowerCase();
  return PROTECTED_BROWSER_FIXTURE_RE.test(normalized) ? normalized : null;
}
