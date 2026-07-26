import { execFileSync } from 'node:child_process';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const PEPPER_NAMES = [
  'BROKER_PAYOUT_OTP_PEPPER',
  'OWNER_CONTRACT_OTP_PEPPER',
];
const MAILBOXES = [
  {
    label: 'Owner',
    emailEnv: 'E2E_OWNER_EMAIL',
    clientIdSecret: 'E2E_OWNER_MAILBOX_CLIENT_ID',
    clientSecretSecret: 'E2E_OWNER_MAILBOX_CLIENT_SECRET',
    refreshTokenSecret: 'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  },
  {
    label: 'Broker',
    emailEnv: 'E2E_BROKER_EMAIL',
    clientIdSecret: 'E2E_BROKER_MAILBOX_CLIENT_ID',
    clientSecretSecret: 'E2E_BROKER_MAILBOX_CLIENT_SECRET',
    refreshTokenSecret: 'E2E_BROKER_MAILBOX_REFRESH_TOKEN',
  },
];

const text = (value) => String(value ?? '').trim();

function defaultSecretResolver(name, { env, projectId }) {
  const injected = text(env[name]);
  if (injected) return injected;
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    return text(execFileSync(
      executable,
      ['firebase', 'functions:secrets:access', name, '--project', projectId],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env },
    ));
  } catch {
    throw new Error(`${name} is missing or inaccessible in Firebase Secret Manager.`);
  }
}

async function jsonRequest(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return body;
}

async function verifyMailbox({ mailbox, credentials, expectedEmail, fetchImpl }) {
  const token = await jsonRequest(fetchImpl, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  }, `${mailbox.label} mailbox OAuth exchange`);
  const accessToken = text(token.access_token);
  if (!accessToken) throw new Error(`${mailbox.label} mailbox OAuth exchange returned no access token.`);

  const headers = { Authorization: `Bearer ${accessToken}` };
  const profile = await jsonRequest(
    fetchImpl,
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    { headers },
    `${mailbox.label} mailbox profile verification`,
  );
  if (text(profile.emailAddress).toLowerCase() !== expectedEmail) {
    throw new Error(`${mailbox.label} mailbox OAuth identity does not match ${mailbox.emailEnv}.`);
  }

  await jsonRequest(
    fetchImpl,
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1',
    { headers },
    `${mailbox.label} mailbox read-scope verification`,
  );
}

export async function runProductionOtpMailboxPreflight({
  env = process.env,
  fetchImpl = globalThis.fetch,
  resolveSecret = defaultSecretResolver,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required for mailbox verification.');
  const projectId = text(env.GCP_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || EXPECTED_PROJECT_ID);
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`OTP/mailbox preflight must target ${EXPECTED_PROJECT_ID}.`);
  }

  for (const name of PEPPER_NAMES) {
    const value = resolveSecret(name, { env, projectId });
    if (value.length < 32) throw new Error(`${name} must contain at least 32 characters.`);
  }

  for (const mailbox of MAILBOXES) {
    const expectedEmail = text(env[mailbox.emailEnv]).toLowerCase();
    if (!expectedEmail || !expectedEmail.includes('@')) {
      throw new Error(`${mailbox.emailEnv} is required for protected mailbox verification.`);
    }
    const credentials = {
      clientId: resolveSecret(mailbox.clientIdSecret, { env, projectId }),
      clientSecret: resolveSecret(mailbox.clientSecretSecret, { env, projectId }),
      refreshToken: resolveSecret(mailbox.refreshTokenSecret, { env, projectId }),
    };
    if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      throw new Error(`${mailbox.label} mailbox OAuth credentials are incomplete.`);
    }
    await verifyMailbox({ mailbox, credentials, expectedEmail, fetchImpl });
  }

  return {
    ok: true,
    projectId,
    peppersVerified: PEPPER_NAMES.length,
    mailboxesVerified: MAILBOXES.length,
    secretValuesLogged: false,
    hardLaunchClaim: false,
  };
}
