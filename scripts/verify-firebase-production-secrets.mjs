import { spawnSync } from 'node:child_process';

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
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--no-install',
      'firebase',
      'functions:secrets:get',
      secretName,
      '--project',
      expectedProjectId,
      '--non-interactive',
    ],
    {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 60_000,
    },
  );

  if (result.error || result.status !== 0) {
    const reason = result.error?.message || String(result.stderr || '').trim() || `exit code ${result.status}`;
    failures.push(`${secretName}: ${reason}`);
    continue;
  }

  console.log(`Verified Firebase production secret metadata: ${secretName}`);
}

if (failures.length) {
  console.error('Required Firebase production function secrets are unavailable:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Firebase production function secret metadata preflight passed for ${requiredSecrets.length} secret(s).`);
