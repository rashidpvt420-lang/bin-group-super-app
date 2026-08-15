import { createRequire } from 'node:module';
import { resolveProtectedSecretValue } from './production-otp-mailbox-preflight.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const DEFAULT_SMTP_HOST = 'smtp.sendgrid.net';
const DEFAULT_SMTP_PORT = 465;
const requireFunctionsDependency = createRequire(new URL('../../functions/package.json', import.meta.url));

const text = (value) => String(value ?? '').trim();

function failureText(error) {
  if (!error || typeof error !== 'object') return text(error);
  return text(error.response || error.stderr || error.stdout || error.message);
}

export function classifySmtpProviderFailure(error) {
  const failure = failureText(error).toLowerCase();

  if (/maximum credits exceeded|credits? (?:are )?exhausted|quota (?:is )?exceeded|quota exceeded|resource exhausted/.test(failure)) {
    return 'SMTP provider capacity is exhausted. Restore outbound email credits/quota before production deployment.';
  }
  if (/authentication failed|invalid login|invalid credentials|authentication unsuccessful|\b535\b|5\.7\.8/.test(failure)) {
    return 'SMTP provider authentication failed. Rotate or repair SMTP_USER/SMTP_PASS before production deployment.';
  }
  if (/enotfound|econnrefused|econnreset|etimedout|timeout|certificate|tls|socket hang up/.test(failure)) {
    return 'SMTP provider connectivity verification failed. Check SMTP_HOST/SMTP_PORT, TLS, DNS, and provider availability before production deployment.';
  }
  return 'SMTP provider readiness verification failed. Check the protected outbound email provider before production deployment.';
}

async function defaultVerifySmtp({ env, user, pass }) {
  const nodemailer = requireFunctionsDependency('nodemailer');
  const host = text(env.SMTP_HOST || DEFAULT_SMTP_HOST);
  const port = Number(env.SMTP_PORT || DEFAULT_SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('SMTP_PORT is invalid.');
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
  });

  try {
    await transport.verify();
  } finally {
    if (typeof transport.close === 'function') transport.close();
  }
}

function defaultSecretResolver(name, { env, projectId }) {
  return resolveProtectedSecretValue(name, { env, projectId });
}

export async function runSmtpProviderPreflight({
  env = process.env,
  resolveSecret = defaultSecretResolver,
  verifySmtp = defaultVerifySmtp,
} = {}) {
  const projectId = text(env.GCP_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || EXPECTED_PROJECT_ID);
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`SMTP provider preflight must target ${EXPECTED_PROJECT_ID}.`);
  }

  const user = text(resolveSecret('SMTP_USER', { env, projectId }));
  const pass = text(resolveSecret('SMTP_PASS', { env, projectId }));
  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must both have non-empty enabled values in Firebase Secret Manager.');
  }

  try {
    await verifySmtp({ env, user, pass });
  } catch (error) {
    throw new Error(classifySmtpProviderFailure(error));
  }

  const port = Number(env.SMTP_PORT || DEFAULT_SMTP_PORT);
  return {
    ok: true,
    projectId,
    providerHost: text(env.SMTP_HOST || DEFAULT_SMTP_HOST),
    providerPort: port,
    authVerified: true,
    sendAttempted: false,
    secretValuesLogged: false,
  };
}
