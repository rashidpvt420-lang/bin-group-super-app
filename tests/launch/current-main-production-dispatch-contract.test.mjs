import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('production dispatch wrapper atomically binds current main and retries races', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  assert.match(source, /name: START HERE - Firebase Production Deploy/);
  assert.match(source, /for attempt in 1 2 3 4 5/);
  assert.match(source, /main_before=.*commits\/main/);
  assert.match(source, /main_before.*!=.*main_sha/);
  assert.match(source, /expected_commit_sha:\$sha/);
  assert.match(source, /firebase-production-deploy\.yml\/dispatches/);
  assert.match(source, /actions\/workflows\/firebase-production-deploy\.yml\/runs/);
  assert.match(source, /run_sha.*==.*main_sha/);
  assert.match(source, /actions\/runs\/\$run_id\/cancel/);
  assert.match(source, /Dispatch race detected/);
  assert.match(source, /ADMIN_MFA_BOOTSTRAP_HOSTING/);
});

test('wrapper remains GitHub-only and does not implement Firebase deployment', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  assert.match(source, /actions:\s*write/);
  assert.doesNotMatch(source, /firebase-tools/);
  assert.doesNotMatch(source, /deploy-firebase-production\.mjs/);
  assert.doesNotMatch(source, /workload_identity_provider/);
  assert.doesNotMatch(source, /service_account/);
});
