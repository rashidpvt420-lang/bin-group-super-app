#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exchangeGmailAccessToken } from './lib/gmail-otp-reader.mjs';

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readMailboxProfile({ accessToken, label, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') throw new Error(`${label} requires a fetch implementation.`);

  const response = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) throw new Error(`${label} profile verification failed with HTTP ${response.status}.`);
  const mailboxEmail = lower(body.emailAddress);
  if (!EMAIL_RE.test(mailboxEmail)) throw new Error(`${label} profile returned no valid mailbox email.`);
  return mailboxEmail;
}

async function resolveMailbox({ role, prefix, env = process.env }) {
  const label = `${role} Gmail mailbox`;
  const accessToken = await exchangeGmailAccessToken({
    clientId: env[`${prefix}_MAILBOX_CLIENT_ID`],
    clientSecret: env[`${prefix}_MAILBOX_CLIENT_SECRET`],
    refreshToken: env[`${prefix}_MAILBOX_REFRESH_TOKEN`],
    label,
  });
  const mailboxEmail = await readMailboxProfile({ accessToken, label });
  const configuredEmail = lower(env[`${prefix}_MAILBOX_EMAIL_CONFIGURED`]);
  if (configuredEmail && configuredEmail !== mailboxEmail) {
    throw new Error(`${label} OAuth identity does not match the configured mailbox.`);
  }
  return mailboxEmail;
}

export async function resolveProductionMailboxIdentities(env = process.env) {
  const githubEnv = text(env.GITHUB_ENV);
  if (!githubEnv) throw new Error('GITHUB_ENV is required to publish resolved mailbox identities.');

  const [ownerEmail, brokerEmail] = await Promise.all([
    resolveMailbox({ role: 'Owner', prefix: 'E2E_OWNER', env }),
    resolveMailbox({ role: 'Broker', prefix: 'E2E_BROKER', env }),
  ]);

  const roleEmails = [
    ['admin', lower(env.E2E_ADMIN_EMAIL)],
    ['owner', ownerEmail],
    ['tenant', lower(env.E2E_TENANT_EMAIL)],
    ['technician', lower(env.E2E_TECHNICIAN_EMAIL)],
    ['broker', brokerEmail],
  ].filter(([, email]) => EMAIL_RE.test(email));
  const seenRoleByEmail = new Map();
  for (const [role, email] of roleEmails) {
    const priorRole = seenRoleByEmail.get(email);
    if (priorRole) {
      throw new Error(
        `E2E role email collision: "${priorRole}" and "${role}" resolve to the same mailbox address. ` +
        'Every role needs a distinct account. Owner and Broker come from Gmail OAuth, so this usually means ' +
        'their MAILBOX_REFRESH_TOKEN (client id/secret) point at the same Gmail inbox; provision separate ' +
        'mailbox OAuth credentials for the affected role.'
      );
    }
    seenRoleByEmail.set(email, role);
  }

  for (const mailboxEmail of [ownerEmail, brokerEmail]) console.log(`::add-mask::${mailboxEmail}`);
  appendFileSync(githubEnv, `E2E_OWNER_MAILBOX_EMAIL=${ownerEmail}\nE2E_BROKER_MAILBOX_EMAIL=${brokerEmail}\n`, 'utf8');
  console.log('Resolved protected Owner and Broker Gmail mailbox identities from authenticated profiles.');
  return { ownerEmail, brokerEmail };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await resolveProductionMailboxIdentities();
}
