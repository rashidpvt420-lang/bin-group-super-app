import firebaseTools from 'firebase-tools';

const expectedProjectId = 'bin-group-57c60';

export const requiredFirebaseBankPilotSecrets = Object.freeze([
  'SMTP_USER',
  'SMTP_PASS',
]);

export const requiredFirebasePublicSecrets = Object.freeze([
  ...requiredFirebaseBankPilotSecrets,
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
]);

export function requiredFirebaseProductionSecretsForMode(launchMode) {
  const normalizedMode = String(launchMode || '').trim();
  if (!['bank-pilot', 'public'].includes(normalizedMode)) {
    throw new Error('LAUNCH_MODE must be bank-pilot or public.');
  }
  return normalizedMode === 'public'
    ? requiredFirebasePublicSecrets
    : requiredFirebaseBankPilotSecrets;
}

export async function verifyFirebaseProductionSecrets({
  projectId = String(process.env.GCP_PROJECT_ID || '').trim(),
  launchMode = String(process.env.LAUNCH_MODE || '').trim(),
  firebaseClient = firebaseTools,
} = {}) {
  if (projectId !== expectedProjectId) {
    throw new Error(`GCP_PROJECT_ID must equal ${expectedProjectId}.`);
  }

  const requiredSecrets = requiredFirebaseProductionSecretsForMode(launchMode);
  const failures = [];
  for (const secretName of requiredSecrets) {
    try {
      const result = await firebaseClient.functions.secrets.get(secretName, {
        project: expectedProjectId,
        nonInteractive: true,
      });
      const versions = Array.isArray(result?.secrets) ? result.secrets : [];
      const hasAvailableVersion = versions.some((version) => {
        const state = String(version?.state || '').toUpperCase();
        return state === 'ENABLED';
      });
      if (!hasAvailableVersion) {
        failures.push(`${secretName}: no enabled secret version is available`);
        continue;
      }
      console.log(`Verified Firebase production secret metadata: ${secretName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'metadata lookup failed';
      failures.push(`${secretName}: ${message}`);
    }
  }

  if (failures.length) {
    throw new Error(`Required Firebase production function secrets are unavailable: ${failures.join('; ')}`);
  }

  console.log(
    `Firebase production function secret metadata preflight passed for ${requiredSecrets.length} secret(s) in ${launchMode} mode.`,
  );
  return {
    projectId: expectedProjectId,
    launchMode,
    verifiedSecrets: requiredSecrets.length,
  };
}
