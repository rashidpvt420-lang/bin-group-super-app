from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"Expected marker not found for {label}")
    return source.replace(old, new, 1)


runner_path = Path('scripts/run-broker-production-evidence.mjs')
runner = runner_path.read_text(encoding='utf-8')
runner = replace_once(
    runner,
    "import { config as loadDotenv } from 'dotenv';",
    "import { config as loadDotenv } from 'dotenv';\nimport { GoogleAuth } from 'google-auth-library';",
    'Google Secret Manager authentication import',
)
runner = replace_once(
    runner,
    "  E2E_BROKER_MAILBOX_CLIENT_ID: mailboxClientId,\n"
    "  E2E_BROKER_MAILBOX_CLIENT_SECRET: mailboxClientSecret,\n"
    "  E2E_BROKER_MAILBOX_REFRESH_TOKEN: mailboxRefreshToken,\n",
    "",
    'remove mandatory mailbox environment values',
)
secret_helper = r'''let googleSecretClientPromise;

async function secretManagerValue(name) {
  if (!googleSecretClientPromise) {
    const googleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    googleSecretClientPromise = googleAuth.getClient();
  }
  const googleClient = await googleSecretClientPromise;
  const response = await googleClient.request({
    url: `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${encodeURIComponent(name)}/versions/latest:access`,
    method: 'GET',
  });
  const encoded = text(response.data?.payload?.data);
  assert(encoded, `${name} has no accessible Secret Manager payload.`);
  const value = Buffer.from(encoded, 'base64').toString('utf8').trim();
  assert(value, `${name} resolved to an empty Secret Manager value.`);
  return value;
}

'''
runner = replace_once(
    runner,
    "async function mailboxAccessToken() {\n"
    "  const body = await jsonRequest('https://oauth2.googleapis.com/token', {",
    secret_helper
    + "async function mailboxAccessToken() {\n"
    + "  const [clientId, clientSecret, refreshToken] = await Promise.all([\n"
    + "    mailboxClientId || secretManagerValue('E2E_BROKER_MAILBOX_CLIENT_ID'),\n"
    + "    mailboxClientSecret || secretManagerValue('E2E_BROKER_MAILBOX_CLIENT_SECRET'),\n"
    + "    mailboxRefreshToken || secretManagerValue('E2E_BROKER_MAILBOX_REFRESH_TOKEN'),\n"
    + "  ]);\n"
    + "  const body = await jsonRequest('https://oauth2.googleapis.com/token', {",
    'mailbox OAuth Secret Manager fallback',
)
runner = replace_once(runner, '      client_id: mailboxClientId,', '      client_id: clientId,', 'mailbox client ID binding')
runner = replace_once(runner, '      client_secret: mailboxClientSecret,', '      client_secret: clientSecret,', 'mailbox client secret binding')
runner = replace_once(runner, '      refresh_token: mailboxRefreshToken,', '      refresh_token: refreshToken,', 'mailbox refresh token binding')
runner_path.write_text(runner, encoding='utf-8')

hmac_test_path = Path('tests/launch/broker-otp-hmac-evidence.test.mjs')
hmac_test = hmac_test_path.read_text(encoding='utf-8')
hmac_test = replace_once(
    hmac_test,
    "  assert.match(source, /E2E_BROKER_MAILBOX_CLIENT_ID/);\n"
    "  assert.match(source, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);",
    "  assert.match(source, /GoogleAuth/);\n"
    "  assert.match(source, /secretmanager\\.googleapis\\.com/);\n"
    "  assert.match(source, /E2E_BROKER_MAILBOX_CLIENT_ID/);\n"
    "  assert.match(source, /E2E_BROKER_MAILBOX_CLIENT_SECRET/);\n"
    "  assert.match(source, /E2E_BROKER_MAILBOX_REFRESH_TOKEN/);\n"
    "  assert.match(source, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);",
    'Broker Secret Manager test assertions',
)
hmac_test_path.write_text(hmac_test, encoding='utf-8')

live_test_path = Path('tests/launch/broker-payout-otp-live-evidence.test.mjs')
live_test = live_test_path.read_text(encoding='utf-8')
live_test = replace_once(
    live_test,
    "  assert.match(productionRunner, /E2E_BROKER_MAILBOX_CLIENT_ID/);\n"
    "  assert.match(productionRunner, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);",
    "  assert.match(productionRunner, /GoogleAuth/);\n"
    "  assert.match(productionRunner, /secretmanager\\.googleapis\\.com/);\n"
    "  assert.match(productionRunner, /E2E_BROKER_MAILBOX_CLIENT_ID/);\n"
    "  assert.match(productionRunner, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);",
    'Broker live Secret Manager assertions',
)
live_test_path.write_text(live_test, encoding='utf-8')
