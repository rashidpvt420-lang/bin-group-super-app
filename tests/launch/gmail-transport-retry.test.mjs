import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeGmailAccessToken } from '../../scripts/lib/gmail-otp-reader.mjs';

const credentials = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
  label: 'Broker Gmail mailbox',
};

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

test('Gmail OAuth retries a transient transport failure and then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('simulated runner transport reset');
    return jsonResponse(200, { access_token: 'access-token' });
  };

  const accessToken = await exchangeGmailAccessToken({ ...credentials, fetchImpl });
  assert.equal(accessToken, 'access-token');
  assert.equal(calls, 2);
});

test('Gmail OAuth fails closed after the bounded transport retry budget', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new TypeError('simulated persistent transport failure');
  };

  await assert.rejects(
    exchangeGmailAccessToken({ ...credentials, fetchImpl }),
    /failed before an HTTP response after 3 transport attempts\./,
  );
  assert.equal(calls, 3);
});

test('Gmail OAuth does not retry a real provider HTTP failure', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(400, { error: 'invalid_grant' });
  };

  await assert.rejects(
    exchangeGmailAccessToken({ ...credentials, fetchImpl }),
    /failed with HTTP 400\./,
  );
  assert.equal(calls, 1);
});
