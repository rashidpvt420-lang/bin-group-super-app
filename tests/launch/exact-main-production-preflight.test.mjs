import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExactCurrentMain } from '../../scripts/verify-firebase-production-secrets.mjs';

const SHA = 'a'.repeat(40);
const NEXT_SHA = 'b'.repeat(40);
const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
  GITHUB_SHA: SHA,
  GITHUB_TOKEN: 'test-token',
};

const githubResponse = (sha, { ok = true, status = 200, malformed = false } = {}) => ({
  ok,
  status,
  async json() {
    if (malformed) throw new Error('malformed');
    return { object: { sha } };
  },
});

test('production preflight accepts only the exact current main SHA', async () => {
  let requestedUrl = '';
  let requestedHeaders = null;
  const fetchImpl = async (url, options) => {
    requestedUrl = String(url);
    requestedHeaders = options?.headers;
    return githubResponse(SHA);
  };
  assert.equal(await assertExactCurrentMain({ env, fetchImpl }), SHA);
  assert.match(requestedUrl, /repos\/rashidpvt420-lang\/bin-group-super-app\/git\/ref\/heads\/main$/);
  assert.equal(requestedHeaders.Authorization, 'Bearer test-token');
});

test('production preflight rejects an ancestor after main advances', async () => {
  const fetchImpl = async () => githubResponse(NEXT_SHA);
  await assert.rejects(
    () => assertExactCurrentMain({ env, fetchImpl }),
    /Refusing stale production mutation/,
  );
});

test('production preflight fails closed when current main cannot be resolved', async () => {
  const fetchImpl = async () => githubResponse('', { ok: false, status: 503 });
  await assert.rejects(
    () => assertExactCurrentMain({ env, fetchImpl }),
    /could not be resolved through GitHub API/,
  );
});

test('production preflight fails closed on malformed GitHub metadata', async () => {
  const fetchImpl = async () => githubResponse('', { malformed: true });
  await assert.rejects(
    () => assertExactCurrentMain({ env, fetchImpl }),
    /malformed current-main metadata/,
  );
});
