import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('production dispatch wrapper resolves main and forwards its SHA', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  assert.match(source, /commits\/main/);
  assert.match(source, /expected_commit_sha:\$sha/);
  assert.match(source, /firebase-production-deploy\.yml\/dispatches/);
  assert.match(source, /actions:\s*write/);
  assert.match(source, /ADMIN_MFA_BOOTSTRAP_HOSTING/);
});

test('wrapper does not contain the Firebase deployment implementation', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  assert.doesNotMatch(source, /firebase-tools/);
  assert.doesNotMatch(source, /deploy-firebase-production\.mjs/);
});
