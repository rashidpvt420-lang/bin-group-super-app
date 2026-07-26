from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"Expected marker not found for {label}")
    return source.replace(old, new, 1)


runner_path = Path('scripts/run-broker-production-evidence.mjs')
runner = runner_path.read_text(encoding='utf-8')
runner = replace_once(
    runner,
    "async function waitForMailboxOtp({ providerMessageId, requestedAt, timeoutMs = 120000 }) {\n"
    "  const accessToken = await mailboxAccessToken();\n"
    "  const deadline = Date.now() + timeoutMs;",
    "async function waitForMailboxOtp({ providerMessageId, requestedAt, timeoutMs = 120000 }) {\n"
    "  const accessToken = await mailboxAccessToken();\n"
    "  const mailboxProfile = await jsonRequest(\n"
    "    'https://gmail.googleapis.com/gmail/v1/users/me/profile',\n"
    "    { headers: { Authorization: `Bearer ${accessToken}` } },\n"
    "    'Broker mailbox profile read',\n"
    "  );\n"
    "  assert(text(mailboxProfile.emailAddress).toLowerCase() === brokerEmail, 'Broker mailbox OAuth identity does not match the verified Broker email.');\n"
    "  const deadline = Date.now() + timeoutMs;",
    'Broker mailbox identity binding',
)
runner = replace_once(
    runner,
    "  const mailboxReceipt = await waitForMailboxOtp({\n"
    "    providerMessageId: otpDelivery.providerMessageId,\n"
    "    requestedAt: otpRequestedAt,\n"
    "  });\n"
    "  const verified = await callFunction('verifyBrokerPayoutOtp', {",
    "  const mailboxReceipt = await waitForMailboxOtp({\n"
    "    providerMessageId: otpDelivery.providerMessageId,\n"
    "    requestedAt: otpRequestedAt,\n"
    "  });\n"
    "  const providerMessageIdHash = sha256(normalizeMessageId(otpDelivery.providerMessageId));\n"
    "  assert(providerMessageIdHash === mailboxReceipt.messageIdHash, 'Broker mailbox receipt is not bound to the SMTP provider Message-ID.');\n"
    "  const verified = await callFunction('verifyBrokerPayoutOtp', {",
    'Broker provider and mailbox Message-ID fingerprint binding',
)
runner = replace_once(
    runner,
    "      providerMessageId: otpDelivery.providerMessageId,\n"
    "      bindingHash: otpDelivery.bindingHash,",
    "      providerMessageIdHash,\n"
    "      bindingHash: otpDelivery.bindingHash,",
    'remove raw provider Message-ID from evidence artifact',
)
runner_path.write_text(runner, encoding='utf-8')

hmac_test_path = Path('tests/launch/broker-otp-hmac-evidence.test.mjs')
hmac_test = hmac_test_path.read_text(encoding='utf-8')
hmac_test = replace_once(
    hmac_test,
    "  assert.match(source, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);\n"
    "  assert.match(source, /mailboxReceiptVerified:\\s*true/);",
    "  assert.match(source, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/profile/);\n"
    "  assert.match(source, /mailboxProfile\\.emailAddress/);\n"
    "  assert.match(source, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);\n"
    "  assert.match(source, /providerMessageIdHash/);\n"
    "  assert.match(source, /mailboxReceiptVerified:\\s*true/);",
    'Broker mailbox identity and fingerprint assertions',
)
hmac_test = replace_once(
    hmac_test,
    "  assert.doesNotMatch(source, /padStart\\(6, ['\"]0['\"]\\)/);",
    "  assert.doesNotMatch(source, /padStart\\(6, ['\"]0['\"]\\)/);\n"
    "  assert.doesNotMatch(source, /providerMessageId:\\s*otpDelivery\\.providerMessageId/);",
    'Broker raw Message-ID rejection',
)
hmac_test_path.write_text(hmac_test, encoding='utf-8')

live_test_path = Path('tests/launch/broker-payout-otp-live-evidence.test.mjs')
live_test = live_test_path.read_text(encoding='utf-8')
live_test = replace_once(
    live_test,
    "  assert.match(productionRunner, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);",
    "  assert.match(productionRunner, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/profile/);\n"
    "  assert.match(productionRunner, /mailboxProfile\\.emailAddress/);\n"
    "  assert.match(productionRunner, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);",
    'Broker live mailbox identity assertions',
)
live_test = replace_once(
    live_test,
    "  assert.match(productionRunner, /mailboxMessageIdHash/);",
    "  assert.match(productionRunner, /providerMessageIdHash/);\n"
    "  assert.match(productionRunner, /mailboxMessageIdHash/);\n"
    "  assert.doesNotMatch(productionRunner, /providerMessageId:\\s*otpDelivery\\.providerMessageId/);",
    'Broker live Message-ID fingerprint assertions',
)
live_test_path.write_text(live_test, encoding='utf-8')
