from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"Expected marker not found for {label}")
    return source.replace(old, new, 1)


runner_path = Path('scripts/run-broker-production-evidence.mjs')
runner = runner_path.read_text(encoding='utf-8')

if 'function resolveBrokerMailboxSecret(name)' not in runner:
    old = """const mailboxClientId = text(process.env.E2E_BROKER_MAILBOX_CLIENT_ID);
const mailboxClientSecret = text(process.env.E2E_BROKER_MAILBOX_CLIENT_SECRET);
const mailboxRefreshToken = text(process.env.E2E_BROKER_MAILBOX_REFRESH_TOKEN);"""
    new = """function resolveBrokerMailboxSecret(name) {
  const configured = text(process.env[name]);
  if (configured) return configured;
  try {
    return text(execFileSync(
      'npx',
      ['firebase', 'functions:secrets:access', name, '--project', PROJECT_ID],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ));
  } catch {
    throw new Error(`${name} is required as an environment value or Firebase Secret Manager secret for verified Broker mailbox evidence.`);
  }
}

const mailboxClientId = resolveBrokerMailboxSecret('E2E_BROKER_MAILBOX_CLIENT_ID');
const mailboxClientSecret = resolveBrokerMailboxSecret('E2E_BROKER_MAILBOX_CLIENT_SECRET');
const mailboxRefreshToken = resolveBrokerMailboxSecret('E2E_BROKER_MAILBOX_REFRESH_TOKEN');"""
    runner = replace_once(runner, old, new, 'Broker mailbox secret resolution')
    runner_path.write_text(runner, encoding='utf-8')

hmac_test_path = Path('tests/launch/broker-otp-hmac-evidence.test.mjs')
hmac_test = hmac_test_path.read_text(encoding='utf-8')
if 'functions:secrets:access' not in hmac_test:
    hmac_test = replace_once(
        hmac_test,
        "  assert.match(source, /E2E_BROKER_MAILBOX_CLIENT_ID/);",
        "  assert.match(source, /E2E_BROKER_MAILBOX_CLIENT_ID/);\n"
        "  assert.match(source, /functions:secrets:access/);\n"
        "  assert.match(source, /Firebase Secret Manager secret/);",
        'Broker mailbox secret-manager assertions',
    )
    hmac_test_path.write_text(hmac_test, encoding='utf-8')

print('Applied Firebase Secret Manager fallback for Broker mailbox OAuth evidence.')
