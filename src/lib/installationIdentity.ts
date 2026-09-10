import { Capacitor } from '@capacitor/core';
import { getId, getInstallations } from 'firebase/installations';
import { app, forceNativeAppCheckRefresh, functions, httpsCallable } from './firebase';

const INSTALLATION_CACHE_KEY = 'bin_technician_installation_hash_v1';
const SHA256_RE = /^[0-9a-f]{64}$/;

export type AndroidInstallationIdentity = {
  platform: 'android';
  installationHash: string;
};

export const isNativeAndroidPlatform = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const sha256Hex = async (value: string): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Secure installation identity hashing is unavailable on this device.');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const cacheInstallationHash = (installationHash: string) => {
  if (!SHA256_RE.test(installationHash)) return;
  try {
    globalThis.localStorage?.setItem(INSTALLATION_CACHE_KEY, installationHash);
  } catch {
    // The secure hash can always be recomputed from Firebase Installations.
  }
};

export const getCachedAndroidInstallationIdentity = (): AndroidInstallationIdentity | null => {
  if (!isNativeAndroidPlatform()) return null;
  try {
    const installationHash = String(globalThis.localStorage?.getItem(INSTALLATION_CACHE_KEY) || '').trim();
    return SHA256_RE.test(installationHash) ? { platform: 'android', installationHash } : null;
  } catch {
    return null;
  }
};

export const getAndroidInstallationIdentity = async (): Promise<AndroidInstallationIdentity | null> => {
  if (!isNativeAndroidPlatform()) return null;

  const rawInstallationId = String(await getId(getInstallations(app)) || '').trim();
  if (!rawInstallationId) {
    throw new Error('Firebase installation identity is unavailable.');
  }

  const installationHash = await sha256Hex(rawInstallationId);
  if (!SHA256_RE.test(installationHash)) {
    throw new Error('Secure installation identity hashing failed.');
  }

  // Never persist or log the raw Firebase Installation ID. Only its one-way SHA-256
  // representation is cached and sent across the protected lifecycle contract.
  cacheInstallationHash(installationHash);
  return { platform: 'android', installationHash };
};

export const syncTechnicianDeviceRegistration = async (): Promise<AndroidInstallationIdentity | null> => {
  const identity = await getAndroidInstallationIdentity();
  if (!identity) return null;

  // Force the existing native bridge to obtain a fresh Play Integrity-backed App
  // Check token before device registration. The bridge itself rejects non-Play or
  // incorrectly signed installations, while the callable also validates appId.
  await forceNativeAppCheckRefresh();

  const registerTechnicianDevice = httpsCallable(functions, 'registerTechnicianDevice');
  await registerTechnicianDevice({
    platform: identity.platform,
    installationHash: identity.installationHash,
  });

  return identity;
};
