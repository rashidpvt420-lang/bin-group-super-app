import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = 'scripts/seed-staging-e2e.mjs';

function run(extraEnv) {
  return spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STAGING_PROJECT_ID: '',
      GOOGLE_CLOUD_PROJECT: '',
      GCLOUD_PROJECT: '',
      GCP_PROJECT_ID: '',
      ...extraEnv,
    },
    encoding: 'utf8',
  });
}

test('staging E2E seeder refuses production Firebase explicitly', () => {
  const result = run({ STAGING_PROJECT_ID: 'bin-group-57c60' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Refusing staging E2E seed/i);
});

test('staging E2E seeder refuses an empty or unknown project', () => {
  const result = run({ STAGING_PROJECT_ID: 'some-other-project' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /expected project 'bin-group-staging'/i);
});

test('staging E2E seeder requires isolated staging credentials before any child seeder runs', () => {
  const result = run({ STAGING_PROJECT_ID: 'bin-group-staging' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Missing STAGING_E2E_ADMIN_EMAIL or STAGING_E2E_ADMIN_PASSWORD/i);
});
