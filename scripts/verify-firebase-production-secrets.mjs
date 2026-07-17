import { spawnSync } from 'node:child_process';

const projectId = String(process.env.GCP_PROJECT_ID || '').trim();
const requiredSecrets = [
  'SMTP_USER',
  'SMTP_PASS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

if (!/^[a-z0-9][a-z0-9-]{4,62}$/.test(projectId)) {
  console.error('GCP_PROJECT_ID is missing or invalid.');
  process.exit(1);
}

const failures = [];
for (const secretName of requiredSecrets) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--no-install',
      'firebase',
      'functions:secrets:access',
      secretName,
      '--project',
      projectId,
      '--non-interactive',
    ],
    {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    },
  );

  const value = String(result.stdout || '').trim();
  if (result.error || result.status !== 0 || !value) {
    const reason = result.error?.message || String(result.stderr || '').trim() || `exit code ${result.status}`;
    failures.push(`${secretName}: ${reason}`);
    continue;
  }

  console.log(`Verified Firebase production secret: ${secretName}`);
}

if (failures.length) {
  console.error('Required Firebase production function secrets are unavailable:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Firebase production function secret preflight passed for ${requiredSecrets.length} secret(s).`);
