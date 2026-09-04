import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { exchangeGmailAccessToken } from '../../scripts/lib/gmail-otp-reader.mjs';
import { resolveProductionMailboxIdentities } from '../../scripts/resolve-production-mailbox-identities.mjs';

const credentials = {
  clientId: 'fixture-client-id', clientSecret: 'fixture-client-secret',
  refreshToken: 'fixture-refresh-token', label: 'Broker Gmail mailbox',
  transportOptions: { maxAttempts: 3, baseDelayMs: 0, timeoutMs: 100 },
};
const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const sensitive = 'fixture-client-secret fixture-refresh-token fixture-access-token broker-private@example.test';
const assertPrivate = (error) => {
  assert.doesNotMatch(inspect(error, { depth: 8 }), /fixture-client-secret|fixture-refresh-token|fixture-access-token|broker-private/);
  assert.equal(error.cause, undefined, 'Never retain raw provider or transport causes.');
};

for (const [code, hint] of [
  ['invalid_grant', /mailbox owner reauthorize/],
  ['invalid_client', /client ID and client secret belong to the same active/],
  ['deleted_client', /deleted OAuth client/],
  ['admin_policy_enforced', /do not bypass/],
]) {
  test(`OAuth ${code} produces actionable, value-free diagnostics without retries`, async () => {
    let calls = 0;
    await assert.rejects(exchangeGmailAccessToken({ ...credentials, fetchImpl: async () => {
      calls++;
      return json(400, { error: code, error_description: sensitive, access_token: sensitive });
    } }), (error) => {
      assert.equal(error.oauthErrorCode, code);
      assert.equal(error.httpStatus, 400);
      assert.match(error.message, hint);
      assertPrivate(error);
      return true;
    });
    assert.equal(calls, 1);
  });
}

test('OAuth session-policy reauthentication is distinguished without echoing arbitrary subtypes', async () => {
  for (const subtype of ['invalid_rapt', sensitive]) {
    await assert.rejects(exchangeGmailAccessToken({ ...credentials, fetchImpl: async () =>
      json(400, { error: 'invalid_grant', error_subtype: subtype }) }), (error) => {
      if (subtype === 'invalid_rapt') assert.match(error.message, /Interactive reauthentication/);
      else assert.doesNotMatch(error.message, /Interactive reauthentication/);
      assertPrivate(error);
      return true;
    });
  }
});

test('unknown, malformed and prototype-key OAuth errors never echo provider payloads', async () => {
  for (const body of [null, { error: sensitive }, { error: { message: sensitive } }, { error: 'constructor' }, { error: '__proto__' }]) {
    await assert.rejects(exchangeGmailAccessToken({ ...credentials, fetchImpl: async () => json(400, body) }), (error) => {
      assert.equal(error.oauthErrorCode, 'unclassified_oauth_error');
      assertPrivate(error);
      return true;
    });
  }
  await assert.rejects(exchangeGmailAccessToken({ ...credentials, fetchImpl: async () => ({
    ok: false, status: 400, json: async () => { throw new Error(sensitive); },
  }) }), /unclassified_oauth_error/);
});

test('raw network exception messages and nested causes cannot leak OAuth credentials', async () => {
  await assert.rejects(exchangeGmailAccessToken({ ...credentials, fetchImpl: async () => {
    throw Object.assign(new Error(sensitive), { name: sensitive, cause: { code: 'ECONNRESET', message: sensitive } });
  } }), (error) => {
    assert.match(error.message, /exhausted 3 transport attempts/);
    assert.match(error.message, /ECONNRESET/);
    assertPrivate(error);
    return true;
  });
});

function mailboxFixture(t, { brokerError, brokerEmail = 'broker@example.test' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bin-mailbox-recovery-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const githubEnv = path.join(dir, 'github-env');
  writeFileSync(githubEnv, 'EXISTING=value\n');
  const env = { GITHUB_ENV: githubEnv, E2E_ADMIN_EMAIL: 'admin@example.test', E2E_TENANT_EMAIL: 'tenant@example.test', E2E_TECHNICIAN_EMAIL: 'tech@example.test' };
  for (const role of ['OWNER', 'BROKER']) {
    env[`E2E_${role}_MAILBOX_CLIENT_ID`] = `${role}-client`;
    env[`E2E_${role}_MAILBOX_CLIENT_SECRET`] = 'fixture-client-secret';
    env[`E2E_${role}_MAILBOX_REFRESH_TOKEN`] = 'fixture-refresh-token';
  }
  const fetchImpl = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const role = new URLSearchParams(options.body).get('client_id').split('-')[0];
      if (role === 'BROKER' && brokerError) return json(400, { error: brokerError, error_description: sensitive });
      return json(200, { access_token: `${role}-access` });
    }
    assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/profile');
    return json(200, { emailAddress: options.headers.Authorization === 'Bearer OWNER-access' ? 'owner@example.test' : brokerEmail });
  };
  return { env, fetchImpl, output: () => readFileSync(githubEnv, 'utf8') };
}

test('Broker OAuth rejection names the correct secret set and publishes no partial identities', async (t) => {
  const f = mailboxFixture(t, { brokerError: 'invalid_grant' });
  await assert.rejects(resolveProductionMailboxIdentities(f.env, { fetchImpl: f.fetchImpl }), (error) => {
    assert.match(error.message, /Broker Gmail mailbox OAuth exchange failed with HTTP 400/);
    for (const name of ['CLIENT_ID', 'CLIENT_SECRET', 'REFRESH_TOKEN']) assert.ok(error.message.includes(`E2E_BROKER_MAILBOX_${name}`));
    assertPrivate(error);
    return true;
  });
  assert.equal(f.output(), 'EXISTING=value\n');
});

test('recovery never allows Owner/Broker collisions or an incorrect configured mailbox', async (t) => {
  const collision = mailboxFixture(t, { brokerEmail: 'owner@example.test' });
  await assert.rejects(resolveProductionMailboxIdentities(collision.env, { fetchImpl: collision.fetchImpl }), /E2E role email collision/);
  assert.equal(collision.output(), 'EXISTING=value\n');
  const mismatch = mailboxFixture(t);
  mismatch.env.E2E_BROKER_MAILBOX_EMAIL_CONFIGURED = 'different@example.test';
  await assert.rejects(resolveProductionMailboxIdentities(mismatch.env, { fetchImpl: mismatch.fetchImpl }), /identity does not match/);
  assert.equal(mismatch.output(), 'EXISTING=value\n');
});

test('both verified and distinct mock profiles are required before publishing identities', async (t) => {
  const f = mailboxFixture(t);
  t.mock.method(console, 'log', () => {});
  const result = await resolveProductionMailboxIdentities(f.env, { fetchImpl: f.fetchImpl });
  assert.deepEqual(result, { ownerEmail: 'owner@example.test', brokerEmail: 'broker@example.test' });
  assert.match(f.output(), /E2E_OWNER_EMAIL=owner@example.test/);
  assert.match(f.output(), /E2E_BROKER_MAILBOX_EMAIL=broker@example.test/);
  assert.doesNotMatch(f.output(), /secret|token|access/);
});
