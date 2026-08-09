import { execFileSync } from 'node:child_process';
import {
  exchangeGmailAccessToken,
  verifyGmailMailboxAccess,
} from './gmail-otp-reader.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const PEPPER_NAMES = [
  'BROKER_PAYOUT_OTP_PEPPER',
  'OWNER_CONTRACT_OTP_PEPPER',
];
const MAILBOXES = [
  {
    label: 'Owner',
    emailEnv: 'E2E_OWNER_MAILBOX_EMAIL',
    clientIdSecret: 'E2E_OWNER_MAILBOX_CLIENT_ID',
    clientSecretSecret: 'E2E_OWNER_MAILBOX_CLIENT_SECRET',
    refreshTokenSecret: 'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  },
  {
    label: 'Broker',
    emailEnv: 'E2E_BROKER_MAILBOX_EMAIL',
    clientIdSecret: 'E2E_BROKER_MAILBOX_CLIENT_ID',
    clientSecretSecret: 'E2E_BROKER_MAILBOX_CLIENT_SECRET',
    refreshTokenSecret: 'E2E_BROKER_MAILBOX_REFRESH_TOKEN',
  },
];

const text = (value) => String(value ?? '').trim();

function commandFailureText(error) {
  if (!error || typeof error !== 'object') return text(error);
  return text(error.stderr || error.stdout || error.message);
}

// Keep this output deliberately diagnostic but value-free: it is emitted by a
// protected deployment gate and must never turn a provider error (or a secret
// value) into workflow output.
export function classifyProtectedSecretAccessFailure(name, error, { projectId = EXPECTED_PROJECT_ID } = {}) {
  const safeName = text(name);
  const failure = commandFailureText(error).toLowerCase();

  if (/enoent|command not found|gcloud[^\n]*not found/.test(failure)) {
    return `${safeName} could not be checked because the Google Cloud CLI is unavailable. Run google-github-actions/setup-gcloud after Workload Identity authentication.`;
  }
  if (/billing_disabled|billing to be enabled|requires billing|enable billing/.test(failure)) {
    return `Cloud Billing is disabled on project ${projectId}. Enable billing before resolving ${safeName}.`;
  }
  if (/permission[_ -]?denied|forbidden|not authorized|access denied|secretmanager\.versions\.access|\b403\b/.test(failure)) {
    return `${safeName} is inaccessible in Firebase Secret Manager: grant the deployment service account roles/secretmanager.secretAccessor on this secret.`;
  }
  if (/not[_ -]?found|does not exist|could not find|no (?:enabled )?versions|does not have any versions|secret version.*not found|\b404\b/.test(failure)) {
    return `${safeName} is missing or has no enabled version in Firebase Secret Manager.`;
  }
  return `${safeName} is missing or inaccessible in Firebase Secret Manager.`;
}

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
    try {
      return text(execFileSync(
        'gcloud',
        ['secrets', 'versions', 'access', 'latest', '--secret', name, '--project', projectId, '--quiet'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env },
      ));
    } catch (gErr) {
      throw new Error(classifyProtectedSecretAccessFailure(name, gErr, { projectId }));
    }
  }
}

export async function runProductionOtpMailboxPreflight({
  env = process.env,
  fetchImpl = globalThis.fetch,
  resolveSecret = defaultSecretResolver,
  signal,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required for mailbox verification.');
  const projectId = text(env.GCP_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || EXPECTED_PROJECT_ID);
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`OTP/mailbox preflight must target ${EXPECTED_PROJECT_ID}.`);
  }

  const blockers = [];
  let peppersVerified = 0;
  let mailboxesVerified = 0;

  const resolveProtectedSecret = (name) => {
    try {
      const value = text(resolveSecret(name, { env, projectId }));
      if (!value) blockers.push(`${name} is missing or inaccessible in Firebase Secret Manager.`);
      return value;
    } catch (error) {
      const message = text(error instanceof Error ? error.message : '');
      const safeMessage = message.startsWith(`${name} `)
        ? message
        : `${name} is missing or inaccessible in Firebase Secret Manager.`;
      blockers.push(safeMessage);
      return '';
    }
  };

  for (const name of PEPPER_NAMES) {
    const value = resolveProtectedSecret(name);
    if (!value) continue;
    if (value.length < 32) {
      blockers.push(`${name} must contain at least 32 characters.`);
      continue;
    }
    peppersVerified += 1;
  }

  const mailboxCandidates = MAILBOXES.map((mailbox) => {
    const expectedEmail = text(env[mailbox.emailEnv]).toLowerCase();
    if (!expectedEmail || !expectedEmail.includes('@')) {
      blockers.push(`${mailbox.emailEnv} is required for protected mailbox verification.`);
    }
    return {
      mailbox,
      expectedEmail,
      credentials: {
        clientId: resolveProtectedSecret(mailbox.clientIdSecret),
        clientSecret: resolveProtectedSecret(mailbox.clientSecretSecret),
        refreshToken: resolveProtectedSecret(mailbox.refreshTokenSecret),
      },
    };
  });

  if (blockers.length === 0) {
    for (const candidate of mailboxCandidates) {
      try {
        const accessToken = await exchangeGmailAccessToken({
          ...candidate.credentials,
          fetchImpl,
          signal,
          label: `${candidate.mailbox.label} mailbox`,
        });
        await verifyGmailMailboxAccess({
          accessToken,
          expectedMailboxEmail: candidate.expectedEmail,
          fetchImpl,
          signal,
          label: `${candidate.mailbox.label} mailbox`,
        });
        mailboxesVerified += 1;
      } catch (error) {
        const safeMessage = error instanceof Error && text(error.message)
          ? text(error.message).replace(/[\r\n]+/g, ' ').slice(0, 320)
          : `${candidate.mailbox.label} mailbox verification failed.`;
        blockers.push(safeMessage);
      }
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  if (uniqueBlockers.length > 0) {
    const label = uniqueBlockers.length === 1 ? 'blocker' : 'blockers';
    throw new Error(
      `Protected OTP/mailbox preflight found ${uniqueBlockers.length} ${label}: ${uniqueBlockers.join(' | ')}`,
    );
  }

  return {
    ok: true,
    projectId,
    peppersVerified,
    mailboxesVerified,
    sentinelFullMessagesVerified: mailboxesVerified,
    secretValuesLogged: false,
    hardLaunchClaim: false,
  };
}
