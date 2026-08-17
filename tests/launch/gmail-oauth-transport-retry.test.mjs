import assert from 'node:assert/strict';
import test from 'node:test';

import { exchangeGmailAccessToken } from '../../scripts/lib/gmail-otp-reader.mjs';

const credentials = {
  clientId: 'client-id',
  clientSecret: 'client-secret-value',
  refreshToken: 'refresh-token-value',
  label: 'Broker Gmail mailbox',
};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

const fastTransport = {
  maxAttempts: 3,
  baseDelayMs: 0,
  timeoutMs: 100,
};

test('Gmail OAuth retries pre-response network failures and then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) {
      const error = new TypeError('fetch failed');
      error.cause = { code: 'ECONNRESET', message: 'socket reset' };
      throw error;
    }
    return jsonResponse(200, { access_token: 'access-token' });
  };

  const token = await exchangeGmailAccessToken({
    ...credentials,
    fetchImpl,
    transportOptions: fastTransport,
  });

  assert.equal(token, 'access-token');
  assert.equal(calls, 3);
});

test('Gmail OAuth retries HTTP 429 and 5xx responses', async () => {
  const statuses = [429, 503, 200];
  let calls = 0;
  const fetchImpl = async () => {
    const status = statuses[calls];
    calls += 1;
    return jsonResponse(status, status === 200 ? { access_token: 'recovered-token' } : {});
  };

  const token = await exchangeGmailAccessToken({
    ...credentials,
    fetchImpl,
    transportOptions: fastTransport,
  });

  assert.equal(token, 'recovered-token');
  assert.equal(calls, 3);
});

test('Gmail OAuth does not retry credential-class HTTP failures', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(401, { error: 'invalid_client' });
  };

  await assert.rejects(
    exchangeGmailAccessToken({
      ...credentials,
      fetchImpl,
      transportOptions: fastTransport,
    }),
    /Broker Gmail mailbox OAuth exchange failed with HTTP 401/,
  );
  assert.equal(calls, 1);
});

test('Gmail OAuth exhausted retry error preserves a sanitized network cause without secrets', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const error = new TypeError('fetch failed');
    error.cause = { code: 'ECONNRESET', message: 'socket reset by peer' };
    throw error;
  };

  await assert.rejects(
    exchangeGmailAccessToken({
      ...credentials,
      fetchImpl,
      transportOptions: fastTransport,
    }),
    (error) => {
      assert.match(error.message, /exhausted 3 transport attempts/);
      assert.match(error.message, /ECONNRESET/);
      assert.doesNotMatch(error.message, /client-secret-value/);
      assert.doesNotMatch(error.message, /refresh-token-value/);
      return true;
    },
  );
  assert.equal(calls, 3);
});

test('Gmail OAuth applies a bounded request timeout', async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    return await new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason || new Error('aborted')), { once: true });
    });
  };

  await assert.rejects(
    exchangeGmailAccessToken({
      ...credentials,
      fetchImpl,
      transportOptions: { maxAttempts: 1, baseDelayMs: 0, timeoutMs: 10 },
    }),
    /exhausted 1 transport attempts.*timed out after 10ms/,
  );
  assert.equal(calls, 1);
});
