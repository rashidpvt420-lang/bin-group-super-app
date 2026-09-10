import {
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

    const registerTechnicianDevice = httpsCallable(functions, 'registerTechnicianDevice');
    await registerTechnicianDevice({ installationHash });
    return installationHash;
  })().finally(() => {
    registrationInFlight = null;
  });
  return registrationInFlight;
}
