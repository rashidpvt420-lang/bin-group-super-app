from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"Expected marker not found for {label}")
    return source.replace(old, new, 1)


runner_path = Path('scripts/run-broker-production-evidence.mjs')
runner = runner_path.read_text(encoding='utf-8')
runner = replace_once(
    runner,
    "import { execFileSync } from 'node:child_process';",
    "import { execFileSync } from 'node:child_process';\nimport { createHash } from 'node:crypto';",
    'Broker evidence crypto import',
)
runner = replace_once(
    runner,
    "const brokerRealPayoutOtp = text(process.env.E2E_BROKER_REAL_PAYOUT_OTP);",
    "const mailboxClientId = text(process.env.E2E_BROKER_MAILBOX_CLIENT_ID);\n"
    "const mailboxClientSecret = text(process.env.E2E_BROKER_MAILBOX_CLIENT_SECRET);\n"
    "const mailboxRefreshToken = text(process.env.E2E_BROKER_MAILBOX_REFRESH_TOKEN);",
    'Broker mailbox credentials',
)
runner = replace_once(
    runner,
    "  E2E_BROKER_REAL_PAYOUT_OTP: brokerRealPayoutOtp,",
    "  E2E_BROKER_MAILBOX_CLIENT_ID: mailboxClientId,\n"
    "  E2E_BROKER_MAILBOX_CLIENT_SECRET: mailboxClientSecret,\n"
    "  E2E_BROKER_MAILBOX_REFRESH_TOKEN: mailboxRefreshToken,",
    'Broker mailbox required environment',
)
runner = replace_once(
    runner,
    "assert(/^\\d{6}$/.test(brokerRealPayoutOtp), 'E2E_BROKER_REAL_PAYOUT_OTP must be the current six-digit code read from the verified Broker mailbox.');\n",
    "",
    'remove dynamic OTP environment assertion',
)

helpers = r'''const normalizeMessageId = (value) => text(value).replace(/^<|>$/g, '').toLowerCase();
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function decodeBase64Url(value) {
  const normalized = text(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function gmailHeader(message, name) {
  const headers = Array.isArray(message?.payload?.headers) ? message.payload.headers : [];
  return text(headers.find((entry) => text(entry?.name).toLowerCase() === name.toLowerCase())?.value);
}

function gmailBody(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const own = text(payload.body?.data) ? decodeBase64Url(payload.body.data) : '';
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  const plain = parts.find((part) => text(part.mimeType).toLowerCase() === 'text/plain');
  if (plain) return gmailBody(plain);
  const nested = parts.map(gmailBody).find(Boolean);
  return own || nested || '';
}

async function mailboxAccessToken() {
  const body = await jsonRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: mailboxClientId,
      client_secret: mailboxClientSecret,
      refresh_token: mailboxRefreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  }, 'Broker mailbox OAuth exchange');
  assert(text(body.access_token), 'Broker mailbox OAuth exchange did not return an access token.');
  return text(body.access_token);
}

async function waitForMailboxOtp({ providerMessageId, requestedAt, timeoutMs = 120000 }) {
  const accessToken = await mailboxAccessToken();
  const deadline = Date.now() + timeoutMs;
  const query = `from:ceo@bin-groups.com to:${brokerEmail} subject:"BIN GROUP payout verification code" newer_than:1d`;
  while (Date.now() < deadline) {
    const list = await jsonRequest(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      'Broker mailbox message search',
    );
    for (const candidate of Array.isArray(list.messages) ? list.messages : []) {
      const message = await jsonRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(candidate.id)}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        'Broker mailbox message read',
      );
      const receivedAt = Number(message.internalDate || 0);
      if (!Number.isFinite(receivedAt) || receivedAt < requestedAt - 10000) continue;
      const to = gmailHeader(message, 'To').toLowerCase();
      const subject = gmailHeader(message, 'Subject');
      const receivedMessageId = normalizeMessageId(gmailHeader(message, 'Message-ID'));
      if (!to.includes(brokerEmail) || subject !== 'BIN GROUP payout verification code') continue;
      if (normalizeMessageId(providerMessageId) !== receivedMessageId) continue;
      const match = gmailBody(message.payload).match(/payout code is\s+(\d{6})/i);
      if (!match) continue;
      return {
        code: match[1],
        receivedAt: new Date(receivedAt).toISOString(),
        messageIdHash: sha256(receivedMessageId),
      };
    }
    await sleep(5000);
  }
  throw new Error('Timed out waiting for the provider-confirmed Broker OTP in the verified mailbox.');
}

'''
runner = replace_once(
    runner,
    'async function exchangeAppCheckToken() {',
    helpers + 'async function exchangeAppCheckToken() {',
    'Broker mailbox helpers',
)
runner = replace_once(
    runner,
    "  const requested = await callFunction('requestBrokerPayoutOtp', { commissionIds: [commissionId] }, appCheckToken, brokerSession.idToken);",
    "  const otpRequestedAt = Date.now();\n"
    "  const requested = await callFunction('requestBrokerPayoutOtp', { commissionIds: [commissionId] }, appCheckToken, brokerSession.idToken);",
    'Broker OTP request timestamp',
)
runner = replace_once(
    runner,
    "  const otpDelivery = await inspectOtpDelivery(challengeId);\n"
    "  const verified = await callFunction('verifyBrokerPayoutOtp', {\n"
    "    challengeId,\n"
    "    otp: brokerRealPayoutOtp,\n"
    "  }, appCheckToken, brokerSession.idToken);\n"
    "  assert(verified.status === 'VERIFIED' && text(verified.challengeId) === challengeId, 'Broker payout OTP verification did not complete with the mailbox-read code.');",
    "  const otpDelivery = await inspectOtpDelivery(challengeId);\n"
    "  const mailboxReceipt = await waitForMailboxOtp({\n"
    "    providerMessageId: otpDelivery.providerMessageId,\n"
    "    requestedAt: otpRequestedAt,\n"
    "  });\n"
    "  const verified = await callFunction('verifyBrokerPayoutOtp', {\n"
    "    challengeId,\n"
    "    otp: mailboxReceipt.code,\n"
    "  }, appCheckToken, brokerSession.idToken);\n"
    "  assert(verified.status === 'VERIFIED' && text(verified.challengeId) === challengeId, 'Broker payout OTP verification did not complete with the mailbox-received code.');",
    'Broker mailbox OTP verification',
)
runner = replace_once(
    runner,
    '      realMailboxCodeUsed: true,',
    "      mailboxReceiptVerified: true,\n"
    "      mailboxReceivedAt: mailboxReceipt.receivedAt,\n"
    "      mailboxMessageIdHash: mailboxReceipt.messageIdHash,",
    'Broker mailbox receipt evidence',
)
runner_path.write_text(runner, encoding='utf-8')

secret_names = [
    'E2E_BROKER_MAILBOX_CLIENT_ID',
    'E2E_BROKER_MAILBOX_CLIENT_SECRET',
    'E2E_BROKER_MAILBOX_REFRESH_TOKEN',
]
for workflow_path in [
    Path('.github/workflows/firebase-production-deploy.yml'),
    Path('.github/workflows/live-role-smoke.yml'),
]:
    workflow = workflow_path.read_text(encoding='utf-8')
    indent = '      ' if workflow_path.name == 'firebase-production-deploy.yml' else '  '
    needle = f"{indent}E2E_BROKER_PASSWORD: ${{{{ secrets.E2E_BROKER_PASSWORD }}}}"
    additions = ''.join(
        f"\n{indent}{name}: ${{{{ secrets.{name} }}}}"
        for name in secret_names
    )
    workflow = replace_once(workflow, needle, needle + additions, f'{workflow_path} mailbox bindings')
    workflow_path.write_text(workflow, encoding='utf-8')

hmac_test_path = Path('tests/launch/broker-otp-hmac-evidence.test.mjs')
hmac_test = hmac_test_path.read_text(encoding='utf-8')
hmac_test = replace_once(
    hmac_test,
    "  assert.match(source, /E2E_BROKER_REAL_PAYOUT_OTP/);\n"
    "  assert.match(source, /realMailboxCodeUsed:\\s*true/);",
    "  assert.match(source, /E2E_BROKER_MAILBOX_CLIENT_ID/);\n"
    "  assert.match(source, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);\n"
    "  assert.match(source, /mailboxReceiptVerified:\\s*true/);\n"
    "  assert.match(source, /mailboxMessageIdHash/);",
    'Broker HMAC mailbox assertions',
)
hmac_test_path.write_text(hmac_test, encoding='utf-8')

live_test_path = Path('tests/launch/broker-payout-otp-live-evidence.test.mjs')
live_test = live_test_path.read_text(encoding='utf-8')
live_test = replace_once(
    live_test,
    "  assert.match(productionRunner, /E2E_BROKER_REAL_PAYOUT_OTP/);",
    "  assert.match(productionRunner, /E2E_BROKER_MAILBOX_CLIENT_ID/);\n"
    "  assert.match(productionRunner, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);",
    'Broker live mailbox credential assertion',
)
live_test = replace_once(
    live_test,
    "  assert.match(productionRunner, /realMailboxCodeUsed: true/);",
    "  assert.match(productionRunner, /mailboxReceiptVerified: true/);\n"
    "  assert.match(productionRunner, /mailboxMessageIdHash/);",
    'Broker live mailbox receipt assertion',
)
live_test_path.write_text(live_test, encoding='utf-8')

Path('tests/launch/broker-mailbox-workflow-bindings.test.mjs').write_text(
    """import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('protected launch workflows inject static Broker mailbox OAuth credentials', async () => {
  const workflows = await Promise.all([
    read('.github/workflows/firebase-production-deploy.yml'),
    read('.github/workflows/live-role-smoke.yml'),
  ]);
  for (const workflow of workflows) {
    assert.match(workflow, /E2E_BROKER_MAILBOX_CLIENT_ID:\\s*\\$\\{\\{ secrets\\.E2E_BROKER_MAILBOX_CLIENT_ID \\}\\}/);
    assert.match(workflow, /E2E_BROKER_MAILBOX_CLIENT_SECRET:\\s*\\$\\{\\{ secrets\\.E2E_BROKER_MAILBOX_CLIENT_SECRET \\}\\}/);
    assert.match(workflow, /E2E_BROKER_MAILBOX_REFRESH_TOKEN:\\s*\\$\\{\\{ secrets\\.E2E_BROKER_MAILBOX_REFRESH_TOKEN \\}\\}/);
  }
});
""",
    encoding='utf-8',
)
