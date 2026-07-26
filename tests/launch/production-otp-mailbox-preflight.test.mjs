/**
 * tests/launch/production-otp-mailbox-preflight.test.mjs
 *
 * Mocked Node --test suite for scripts/production-otp-mailbox-preflight.mjs
 *
 * Validates every error branch and the two success paths without making any
 * real network calls.  Verifies the security contract:
 *   - errors report only operation + status + category (never response body)
 *   - success logs never print email addresses
 *   - identity mismatch is detected and reported without disclosing addresses
 *   - gmail.readonly scope is probed via messages.list and messages.get?format=full
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// ─── Minimal fetch mock infrastructure ───────────────────────────────────────

/**
 * Install a minimal global.fetch mock that returns fixed responses per URL pattern.
 * Returns a restore function.
 *
 * @param {Array<{match: RegExp|string, status: number, body: object|Function}>} routes
 */
function mockFetch(routes) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    for (const route of routes) {
      const matched = typeof route.match === 'string'
        ? urlStr.includes(route.match)
        : route.match.test(urlStr);
      if (matched) {
        const body = typeof route.body === 'function' ? route.body(urlStr, opts) : route.body;
        return {
          ok:     route.status >= 200 && route.status < 300,
          status: route.status,
          statusText: route.statusText ?? (route.status === 200 ? 'OK' : 'Error'),
          async json() { return body ?? {}; },
        };
      }
    }
    throw new Error(`[mock-fetch] No route matched for: ${urlStr}`);
  };
  return () => { globalThis.fetch = original; };
}

/** Build a minimal env containing all required mailbox secrets for both roles. */
function fullEnv(overrides = {}) {
  return {
    E2E_OWNER_MAILBOX_EMAIL:   'owner-e2e@example.com',
    E2E_OWNER_MAILBOX_CLIENT_ID:     'owner-client-id',
    E2E_OWNER_MAILBOX_CLIENT_SECRET: 'owner-client-secret',
    E2E_OWNER_MAILBOX_REFRESH_TOKEN: 'owner-refresh-token',
    E2E_OWNER_MAILBOX_SENTINEL_MESSAGE_ID: 'owner-sentinel-id',
    E2E_BROKER_MAILBOX_EMAIL:  'broker-e2e@example.com',
    E2E_BROKER_MAILBOX_CLIENT_ID:     'broker-client-id',
    E2E_BROKER_MAILBOX_CLIENT_SECRET: 'broker-client-secret',
    E2E_BROKER_MAILBOX_REFRESH_TOKEN: 'broker-refresh-token',
    E2E_BROKER_MAILBOX_SENTINEL_MESSAGE_ID: 'broker-sentinel-id',
    ...overrides,
  };
}

/**
 * Import the preflight module with a patched process.env.
 * We re-import each time to get a fresh module that reads the patched env.
 * Because Node caches ESM modules, we use a cache-busting query string.
 */
async function importPreflight(env) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  // Strip all vars not present in env (clear leftover mailbox vars from prior runs)
  for (const key of Object.keys(saved)) {
    if (!(key in env)) delete process.env[key];
  }

  // Re-import with a unique cache-buster so env is re-read.
  const bust = `?bust=${Date.now()}-${Math.random()}`;
  const modUrl = new URL(`../../scripts/production-otp-mailbox-preflight.mjs${bust}`, import.meta.url).href;
  const mod = await import(modUrl);

  // Restore env
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, saved);

  return mod;
}

// ─── Success routes ───────────────────────────────────────────────────────────

function successRoutes() {
  let profileCallCount = 0;
  return [
    {
      match: 'oauth2.googleapis.com/token',
      status: 200,
      body: { access_token: 'mock-access-token' },
    },
    {
      match: /gmail.*profile/,
      status: 200,
      body: () => ({
        emailAddress: profileCallCount++ === 0 ? 'owner-e2e@example.com' : 'broker-e2e@example.com',
        messagesTotal: 10,
      }),
    },
    {
      match: /gmail.*messages\/(?:owner|broker)-sentinel-id\?format=full/,
      status: 200,
      body: {
        payload: {
          mimeType: 'text/plain',
          body: { data: Buffer.from('BIN_GROUP_E2E_MAILBOX_SENTINEL', 'utf8').toString('base64url') },
        },
      },
    },
    {
      match: /gmail.*messages\?maxResults=10/,
      status: 200,
      body: { messages: [{ id: 'owner-sentinel-id' }, { id: 'broker-sentinel-id' }] },
    },
  ];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('throws when E2E_OWNER_MAILBOX_EMAIL is missing', async () => {
  const env = fullEnv({ E2E_OWNER_MAILBOX_EMAIL: '' });
  const restore = mockFetch([]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    process.env.E2E_OWNER_MAILBOX_EMAIL = '';
    process.env.E2E_OWNER_MAILBOX_CLIENT_ID = env.E2E_OWNER_MAILBOX_CLIENT_ID;
    process.env.E2E_OWNER_MAILBOX_CLIENT_SECRET = env.E2E_OWNER_MAILBOX_CLIENT_SECRET;
    process.env.E2E_OWNER_MAILBOX_REFRESH_TOKEN = env.E2E_OWNER_MAILBOX_REFRESH_TOKEN;
    process.env.E2E_OWNER_MAILBOX_SENTINEL_MESSAGE_ID = env.E2E_OWNER_MAILBOX_SENTINEL_MESSAGE_ID;
    process.env.E2E_BROKER_MAILBOX_EMAIL = env.E2E_BROKER_MAILBOX_EMAIL;
    process.env.E2E_BROKER_MAILBOX_CLIENT_ID = env.E2E_BROKER_MAILBOX_CLIENT_ID;
    process.env.E2E_BROKER_MAILBOX_CLIENT_SECRET = env.E2E_BROKER_MAILBOX_CLIENT_SECRET;
    process.env.E2E_BROKER_MAILBOX_REFRESH_TOKEN = env.E2E_BROKER_MAILBOX_REFRESH_TOKEN;
    process.env.E2E_BROKER_MAILBOX_SENTINEL_MESSAGE_ID = env.E2E_BROKER_MAILBOX_SENTINEL_MESSAGE_ID;
    await assert.rejects(verifyOtpMailboxes, /OTP Mailbox verification failed/);
  } finally {
    restore();
  }
});

test('throws when E2E_BROKER_MAILBOX_EMAIL is missing', async () => {
  const env = fullEnv({ E2E_BROKER_MAILBOX_EMAIL: '' });
  const restore = mockFetch([]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    await assert.rejects(verifyOtpMailboxes, /OTP Mailbox verification failed/);
  } finally {
    restore();
  }
});

test('throws when Owner OAuth credentials are missing', async () => {
  const env = fullEnv({ E2E_OWNER_MAILBOX_CLIENT_ID: '' });
  const restore = mockFetch([]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    await assert.rejects(verifyOtpMailboxes, /OTP Mailbox verification failed/);
  } finally {
    restore();
  }
});

test('error message does not include response body when token exchange returns HTTP 400', async () => {
  const env = fullEnv();
  const restore = mockFetch([
    {
      match: 'oauth2.googleapis.com/token',
      status: 400,
      statusText: 'Bad Request',
      body: { error: 'invalid_grant', error_description: 'refresh token revoked — SECRET CONTENT' },
    },
  ]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    const err = await verifyOtpMailboxes().then(() => null, (e) => e);
    assert.ok(err, 'should throw');
    assert.match(err.message, /status=400/, 'error must include HTTP status');
    assert.match(err.message, /category=oauth_failure/, 'error must include category');
    assert.doesNotMatch(err.message, /SECRET CONTENT/, 'error must not contain response body');
    assert.doesNotMatch(err.message, /invalid_grant/, 'error must not echo OAuth error codes from body');
  } finally {
    restore();
  }
});

test('error message does not include response body when token exchange returns missing access_token', async () => {
  const env = fullEnv();
  const restore = mockFetch([
    {
      match: 'oauth2.googleapis.com/token',
      status: 200,
      body: { token_type: 'Bearer' }, // deliberately missing access_token
    },
  ]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    const err = await verifyOtpMailboxes().then(() => null, (e) => e);
    assert.ok(err, 'should throw');
    assert.match(err.message, /category=missing_access_token/);
  } finally {
    restore();
  }
});

test('reports controlled error when Gmail profile returns HTTP 401', async () => {
  const env = fullEnv();
  const restore = mockFetch([
    { match: 'oauth2.googleapis.com/token', status: 200, body: { access_token: 'tok' } },
    { match: /gmail.*profile/, status: 401, statusText: 'Unauthorized', body: { error: 'unauthenticated' } },
  ]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    const err = await verifyOtpMailboxes().then(() => null, (e) => e);
    assert.ok(err);
    assert.match(err.message, /status=401/);
    assert.match(err.message, /category=gmail_api_failure/);
    assert.doesNotMatch(err.message, /unauthenticated/); // body must not leak
  } finally {
    restore();
  }
});

test('reports controlled error when Gmail profile returns HTTP 403 (insufficient scope)', async () => {
  const env = fullEnv();
  const restore = mockFetch([
    { match: 'oauth2.googleapis.com/token', status: 200, body: { access_token: 'tok' } },
    { match: /gmail.*profile/, status: 403, statusText: 'Forbidden', body: { error: 'insufficientPermissions' } },
  ]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    const err = await verifyOtpMailboxes().then(() => null, (e) => e);
    assert.ok(err);
    assert.match(err.message, /status=403/);
    assert.doesNotMatch(err.message, /insufficientPermissions/);
  } finally {
    restore();
  }
});

test('reports identity mismatch without disclosing expected or actual address', async () => {
  const env = fullEnv();
  const restore = mockFetch([
    { match: 'oauth2.googleapis.com/token', status: 200, body: { access_token: 'tok' } },
    // Profile returns a different address than E2E_OWNER_MAILBOX_EMAIL
    { match: /gmail.*profile/, status: 200, body: { emailAddress: 'wrong-address@example.com' } },
  ]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    const err = await verifyOtpMailboxes().then(() => null, (e) => e);
    assert.ok(err);
    assert.match(err.message, /identity mismatch/i, 'must indicate a mismatch occurred');
    assert.doesNotMatch(err.message, /owner-e2e@example\.com/, 'must not disclose expected email');
    assert.doesNotMatch(err.message, /wrong-address@example\.com/, 'must not disclose actual email');
  } finally {
    restore();
  }
});

test('reports controlled error when messages.list returns HTTP 403 (missing gmail.readonly scope)', async () => {
  const env = fullEnv();
  let profileCallCount = 0;
  const restore = mockFetch([
    { match: 'oauth2.googleapis.com/token', status: 200, body: { access_token: 'tok' } },
    {
      match: /gmail.*profile/,
      status: 200,
      body: { emailAddress: 'owner-e2e@example.com' },
    },
    {
      match: /gmail.*messages/,
      status: 403,
      statusText: 'Forbidden',
      body: { error: 'insufficientPermissions' },
    },
  ]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    const err = await verifyOtpMailboxes().then(() => null, (e) => e);
    assert.ok(err);
    assert.match(err.message, /status=403/);
    assert.match(err.message, /category=insufficient_scope_or_permission_denied/);
    assert.doesNotMatch(err.message, /insufficientPermissions/);
  } finally {
    restore();
  }
});

test('reports controlled error when the sentinel is absent from messages.list', async () => {
  const env = fullEnv();
  const restore = mockFetch([
    { match: 'oauth2.googleapis.com/token', status: 200, body: { access_token: 'tok' } },
    { match: /gmail.*profile/, status: 200, body: { emailAddress: 'owner-e2e@example.com' } },
    { match: /gmail.*messages\?maxResults=10/, status: 200, body: { messages: [] } },
  ]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    const err = await verifyOtpMailboxes().then(() => null, (e) => e);
    assert.ok(err);
    assert.match(err.message, /category=sentinel_absent/);
    assert.doesNotMatch(err.message, /owner-e2e@example\.com/);
  } finally {
    restore();
  }
});

test('reports controlled error when the sentinel full body is unreadable', async () => {
  const env = fullEnv();
  const restore = mockFetch([
    { match: 'oauth2.googleapis.com/token', status: 200, body: { access_token: 'tok' } },
    { match: /gmail.*profile/, status: 200, body: { emailAddress: 'owner-e2e@example.com' } },
    { match: /gmail.*messages\?maxResults=10/, status: 200, body: { messages: [{ id: 'owner-sentinel-id' }] } },
    { match: /gmail.*messages\/owner-sentinel-id\?format=full/, status: 403, body: { error: 'insufficientPermissions' } },
  ]);
  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    const err = await verifyOtpMailboxes().then(() => null, (e) => e);
    assert.ok(err);
    assert.match(err.message, /operation=messages_get_full status=403 category=insufficient_scope_or_permission_denied/);
    assert.doesNotMatch(err.message, /insufficientPermissions/);
  } finally {
    restore();
  }
});

test('success path for Owner passes without logging email address in controlled output', async () => {
  const env = fullEnv();
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  const restore = mockFetch(successRoutes());

  try {
    const { verifyOtpMailboxes } = await importPreflight(env);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    await verifyOtpMailboxes();

    // Confirm success log does not contain email addresses
    const allLogs = logs.join('\n');
    assert.doesNotMatch(allLogs, /owner-e2e@example\.com/, 'success log must not contain email addresses');
    assert.match(allLogs, /verified/, 'success log must indicate successful verification');
  } finally {
    restore();
    console.log = origLog;
  }
});

test('preflight script source uses E2E_OWNER_MAILBOX_EMAIL and E2E_BROKER_MAILBOX_EMAIL', () => {
  const src = readFileSync('scripts/production-otp-mailbox-preflight.mjs', 'utf8');
  assert.match(src, /E2E_OWNER_MAILBOX_EMAIL/, 'preflight must read E2E_OWNER_MAILBOX_EMAIL');
  assert.match(src, /E2E_BROKER_MAILBOX_EMAIL/, 'preflight must read E2E_BROKER_MAILBOX_EMAIL');
  assert.doesNotMatch(src, /E2E_OWNER_MAILBOX_EMAIL\s*\|\|\s*process\.env\.E2E_OWNER_EMAIL/, 'preflight must not fall back from mailbox to app login email');
  assert.doesNotMatch(src, /E2E_BROKER_MAILBOX_EMAIL\s*\|\|\s*process\.env\.E2E_BROKER_EMAIL/, 'preflight must not fall back from mailbox to app login email');
  assert.match(src, /messages\/\$\{encodeURIComponent\(sentinelMessageId\)\}\?format=full/, 'preflight must fetch sentinel with messages.get format=full');
  assert.doesNotMatch(src, /firebase-tools/, 'preflight must not import firebase-tools');
  assert.doesNotMatch(src, /functions\.secrets\.get/, 'preflight must not call Firebase Secret Manager');
});
