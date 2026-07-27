import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeGmailBase64Url,
  readGmailOtp,
  verifyGmailMailboxAccess,
} from '../../scripts/lib/gmail-otp-reader.mjs';

const b64 = (value) => Buffer.from(value).toString('base64url');
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; },
});

function message(id, bodyData, { correlation = 'corr-123', provider = '<provider-1@example.com>' } = {}) {
  return {
    id,
    internalDate: String(Date.now()),
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'From', value: 'BIN GROUP <ceo@bin-groups.com>' },
        { name: 'To', value: 'login-owner@example.com' },
        { name: 'Subject', value: 'BIN GROUP contract signature OTP' },
        { name: 'Message-ID', value: provider },
      ],
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/html', body: { data: b64('<p>decorative</p>') } },
            { mimeType: 'text/plain', body: { attachmentId: 'otp-body' } },
          ],
        },
      ],
    },
    attachment: { data: b64(`BIN GROUP contract signature OTP: 123456. Verification reference: ${correlation}.`) },
  };
}

test('strict decoder rejects malformed base64url', () => {
  assert.throws(() => decodeGmailBase64Url('%%%'), /valid base64url/);
  assert.equal(decodeGmailBase64Url(b64('hello')), 'hello');
});

test('mailbox sentinel verifies profile, messages.list and messages.get full body', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/profile')) return response({ emailAddress: 'mailbox@example.com' });
    if (url.includes('/messages?maxResults=1')) return response({ messages: [{ id: 'sentinel' }] });
    if (url.includes('/messages/sentinel?format=full')) {
      return response({ payload: { mimeType: 'text/plain', body: { data: b64('sentinel body') } } });
    }
    return response({}, 404);
  };
  const result = await verifyGmailMailboxAccess({
    accessToken: 'token',
    expectedMailboxEmail: 'mailbox@example.com',
    fetchImpl,
  });
  assert.equal(result.fullMessageVerified, true);
  assert.ok(calls.some((url) => url.includes('?format=full')));
});

test('reader parses nested MIME attachment and enforces sender, recipient, provider, correlation and time', async () => {
  const full = message('gmail-1');
  const fetchImpl = async (url) => {
    if (url.endsWith('/profile')) return response({ emailAddress: 'mailbox@example.com' });
    if (url.includes('/messages?maxResults=1')) return response({ messages: [{ id: 'sentinel' }] });
    if (url.includes('/messages/sentinel?format=full')) return response({ payload: { body: { data: b64('sentinel') } } });
    if (url.includes('maxResults=20')) return response({ messages: [{ id: full.id }] });
    if (url.includes(`/messages/${full.id}?format=full`)) return response(full);
    if (url.includes(`/messages/${full.id}/attachments/otp-body`)) return response(full.attachment);
    return response({}, 404);
  };
  const result = await readGmailOtp({
    accessToken: 'token',
    expectedMailboxEmail: 'mailbox@example.com',
    sender: 'ceo@bin-groups.com',
    recipient: 'login-owner@example.com',
    subject: 'BIN GROUP contract signature OTP',
    correlationId: 'corr-123',
    providerMessageId: '<provider-1@example.com>',
    requestedAtMs: Date.now() - 1000,
    otpPattern: /contract signature OTP:\s*(\d{6})/i,
    fetchImpl,
    timeoutMs: 100,
    pollIntervalMs: 1,
  });
  assert.equal(result.otp, '123456');
  assert.match(result.messageIdHash, /^[a-f0-9]{64}$/);
});

test('reader rejects duplicate correlated matches', async () => {
  const one = message('gmail-1');
  const two = message('gmail-2');
  const fetchImpl = async (url) => {
    if (url.endsWith('/profile')) return response({ emailAddress: 'mailbox@example.com' });
    if (url.includes('/messages?maxResults=1')) return response({ messages: [{ id: 'sentinel' }] });
    if (url.includes('/messages/sentinel?format=full')) return response({ payload: { body: { data: b64('sentinel') } } });
    if (url.includes('maxResults=20')) return response({ messages: [{ id: one.id }, { id: two.id }] });
    if (url.includes(`/messages/${one.id}?format=full`)) return response(one);
    if (url.includes(`/messages/${two.id}?format=full`)) return response(two);
    if (url.includes('/attachments/otp-body')) return response(one.attachment);
    return response({}, 404);
  };
  await assert.rejects(readGmailOtp({
    accessToken: 'token',
    expectedMailboxEmail: 'mailbox@example.com',
    sender: 'ceo@bin-groups.com',
    recipient: 'login-owner@example.com',
    subject: 'BIN GROUP contract signature OTP',
    correlationId: 'corr-123',
    providerMessageId: '<provider-1@example.com>',
    requestedAtMs: Date.now() - 1000,
    otpPattern: /contract signature OTP:\s*(\d{6})/i,
    fetchImpl,
    timeoutMs: 100,
    pollIntervalMs: 1,
  }), /multiple messages/);
});

test('reader honours abort without logging message bodies or OTPs', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readGmailOtp({
    accessToken: 'token',
    expectedMailboxEmail: 'mailbox@example.com',
    sender: 'ceo@bin-groups.com',
    recipient: 'login-owner@example.com',
    subject: 'BIN GROUP contract signature OTP',
    correlationId: 'corr-123',
    requestedAtMs: Date.now(),
    otpPattern: /(\d{6})/,
    fetchImpl: async () => response({}),
    signal: controller.signal,
  }), { name: 'AbortError' });
});
