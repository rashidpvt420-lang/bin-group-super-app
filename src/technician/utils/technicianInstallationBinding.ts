import { getToken as getAppCheckToken } from 'firebase/app-check';
import {
  appCheck,
  auth,
  forceNativeAppCheckRefresh,
  functions,
  getNativeAndroidInstallationHash,
  httpsCallable,
} from '../../lib/firebase';

let registrationInFlight: Promise<string | null> | null = null;

export async function readNativeTechnicianInstallationHash(): Promise<string | null> {
  return getNativeAndroidInstallationHash();
}

export function ensureTechnicianInstallationRegistered(
  knownInstallationHash?: string | null,
): Promise<string | null> {
  if (registrationInFlight) return registrationInFlight;
  registrationInFlight = (async () => {
    const installationHash = knownInstallationHash || await readNativeTechnicianInstallationHash();
    if (!installationHash) return null;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      const error = new Error('Technician authentication is required before device registration.') as Error & { code?: string };
      error.code = 'functions/unauthenticated';
      throw error;
    }

    // The callable is sent by the Firebase Web SDK inside the Capacitor WebView.
    // Refresh all three proof layers immediately before the request so the Web
    // SDK attaches the current native Play Integrity App Check token rather than
    // a stale/missing cached token.
    await currentUser.getIdToken(true);
    await forceNativeAppCheckRefresh();
    if (!appCheck) {
      const error = new Error('Firebase App Check is unavailable for Technician registration.') as Error & { code?: string };
      error.code = 'app-check/unavailable';
      throw error;
    }
    await getAppCheckToken(appCheck, true);

    const registerTechnicianDevice = httpsCallable(functions, 'registerTechnicianDevice');
    await registerTechnicianDevice({ installationHash });
    return installationHash;
  })().finally(() => {
    registrationInFlight = null;
  });
  return registrationInFlight;
}
