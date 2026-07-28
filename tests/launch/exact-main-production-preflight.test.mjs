import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExactCurrentMain } from '../../scripts/verify-firebase-production-secrets.mjs';

const SHA = 'a'.repeat(40);
const NEXT_SHA = 'b'.repeat(40);
const env = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: SHA };

test('production preflight accepts only the exact current main SHA', () => {
  const git = () => ({ status: 0, stdout: `${SHA}\trefs/heads/main\n` });
  assert.equal(assertExactCurrentMain({ env, git, cwd: process.cwd() }), SHA);
});

test('production preflight rejects an ancestor after main advances', () => {
  const git = () => ({ status: 0, stdout: `${NEXT_SHA}\trefs/heads/main\n` });
  assert.throws(
    () => assertExactCurrentMain({ env, git, cwd: process.cwd() }),
    /Refusing stale production mutation/,
  );
});

test('production preflight fails closed when origin main cannot be resolved', () => {
  const git = () => ({ status: 2, stdout: '', stderr: 'network failure' });
  assert.throws(
    () => assertExactCurrentMain({ env, git, cwd: process.cwd() }),
    /could not be resolved/,
  );
});
