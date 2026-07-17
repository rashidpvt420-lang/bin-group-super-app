import firebaseTools from 'firebase-tools';

const expectedProjectId = 'bin-group-57c60';
const configuredProjectId = String(process.env.GCP_PROJECT_ID || '').trim();
const requiredSecrets = [
  'SMTP_USER',
  'SMTP_PASS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

if (configuredProjectId !== expectedProjectId) {
  console.error(`GCP_PROJECT_ID must equal ${expectedProjectId}.`);
  process.exit(1);
}

const failures = [];
for (const secretName of requiredSecrets) {
  try {
    const result = await firebaseTools.functions.secrets.get(secretName, {
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
  console.error('Required Firebase production function secrets are unavailable:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Firebase production function secret metadata preflight passed for ${requiredSecrets.length} secret(s).`);
