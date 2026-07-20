#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AUTHORIZATION_KIND,
  AUTHORIZATION_MAX_AGE_MS,
  DEPLOY_CONFIRMATION_PHRASE,
  HARD_LAUNCH_CONFIRMATION_PHRASE,
  HARD_LAUNCH_CONTROL_SCHEMA,
  parseCsvRequired,
  sha256Text,
  signDocument,
  validateAuthorizationDocument,
} from './lib/hard-launch-control.mjs';
import { normalizeAuthorizedEmail } from './lib/identity-normalization.mjs';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

try {
  const commitSha = requiredEnv('GITHUB_SHA');
  const ref = requiredEnv('GITHUB_REF');
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const runId = requiredEnv('GITHUB_RUN_ID');
  const runAttempt = Number(requiredEnv('GITHUB_RUN_ATTEMPT'));
  const actor = requiredEnv('GITHUB_ACTOR');
  const founderName = requiredEnv('FOUNDER_NAME');
  const founderEmail = normalizeAuthorizedEmail(requiredEnv('FOUNDER_EMAIL'));
  const deployConfirmation = requiredEnv('DEPLOYMENT_CONFIRMATION');
  const hardLaunchConfirmation = requiredEnv('HARD_LAUNCH_CONFIRMATION');
  const hmacKey = requiredEnv('HARD_LAUNCH_APPROVAL_HMAC_KEY');
  const authorizedActorsRaw = requiredEnv('AUTHORIZED_FOUNDER_ACTORS');
  const authorizedEmailsRaw = requiredEnv('AUTHORIZED_FOUNDER_EMAILS');

  if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('GITHUB_SHA must be a lowercase 40-character SHA');
  if (ref !== 'refs/heads/main') throw new Error('hard-launch authorization may only be created for refs/heads/main');
  if (deployConfirmation !== DEPLOY_CONFIRMATION_PHRASE) throw new Error('production deployment confirmation phrase mismatch');
  if (hardLaunchConfirmation !== HARD_LAUNCH_CONFIRMATION_PHRASE) throw new Error('hard-launch confirmation phrase mismatch');

  const authorizedActors = parseCsvRequired(authorizedActorsRaw, 'AUTHORIZED_FOUNDER_ACTORS');
  const authorizedEmails = parseCsvRequired(authorizedEmailsRaw, 'AUTHORIZED_FOUNDER_EMAILS');
  if (!authorizedActors.includes(actor.toLowerCase())) throw new Error(`GitHub actor ${actor} is not an authorized founder actor`);
  if (!authorizedEmails.includes(founderEmail)) throw new Error(`Founder email ${founderEmail} is not authorized`);

  const issuedAtMs = Date.now();
  const payload = {
    schemaVersion: HARD_LAUNCH_CONTROL_SCHEMA,
    kind: AUTHORIZATION_KIND,
    approved: true,
    scope: 'production-deploy-and-conditional-hard-launch-decision',
    commitSha,
    ref,
    repository,
    runId,
    runAttempt,
    actor,
    founder: {
      name: founderName,
      email: founderEmail,
    },
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + AUTHORIZATION_MAX_AGE_MS).toISOString(),
    deployConfirmationDigest: sha256Text(DEPLOY_CONFIRMATION_PHRASE),
    hardLaunchConfirmationDigest: sha256Text(HARD_LAUNCH_CONFIRMATION_PHRASE),
  };

  const document = signDocument(payload, hmacKey);
  const validationErrors = validateAuthorizationDocument(document, {
    commitSha,
    ref,
    repository,
    runId,
    actor,
    authorizedActors: authorizedActorsRaw,
    authorizedEmails: authorizedEmailsRaw,
    hmacKey,
  });
  if (validationErrors.length) throw new Error(`generated authorization failed validation:\n- ${validationErrors.join('\n- ')}`);

  const outputPath = path.resolve('launch_package/hard-launch-authorization.json');
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  console.log(`[hard-launch-auth] wrote ${outputPath}`);
  console.log(`[hard-launch-auth] commitSha=${commitSha}`);
  console.log(`[hard-launch-auth] actor=${actor}`);
  console.log('[hard-launch-auth] founder authorization signed and bound to this workflow run');
} catch (error) {
  console.error(`[hard-launch-auth] REFUSED: ${error.message}`);
  process.exit(1);
}
