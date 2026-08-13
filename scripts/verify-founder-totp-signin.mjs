#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { signInWithRequiredTotpMfa } from './lib/firebase-mfa-sign-in.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const WORKFLOW = 'Firebase Production Deploy';
const JOB = 'deploy-firebase-production-stack';
const FOUNDER_EMAIL = 'ceo@bin-groups.com';

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const hash = (value) => createHash('sha256').update(String(value ?? '')).digest('hex');

function requireProtectedContext(env) {
  if (env.GITHUB_ACTIONS !== 'true') throw new Error('Founder TOTP sign-in preflight requires GitHub Actions.');
  if (text(env.GITHUB_REPOSITORY) !== REPOSITORY) throw new Error(`Repository must equal ${REPOSITORY}.`);
  if (text(env.GITHUB_WORKFLOW) !== WORKFLOW || text(env.GITHUB_JOB) !== JOB) {
    throw new Error('Founder TOTP sign-in preflight requires the protected Firebase production deploy job.');
  }
  if (text(env.GITHUB_EVENT_NAME) !== 'workflow_dispatch' || text(env.GITHUB_REF) !== 'refs/heads/main') {
    throw new Error('Founder TOTP sign-in preflight requires workflow_dispatch from refs/heads/main.');
  }
  if (lower(env.DEPLOYMENT_ENVIRONMENT) !== 'production') throw new Error('DEPLOYMENT_ENVIRONMENT must equal production.');
  const projectId = text(env.GCP_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT);
  if (projectId !== PROJECT_ID) throw new Error(`Firebase project must equal ${PROJECT_ID}.`);

  const apiKey = text(env.VITE_FIREBASE_API_KEY);
  const email = lower(env.E2E_FOUNDER_EMAIL);
  const password = text(env.E2E_FOUNDER_PASSWORD);
  const totpSecret = text(env.E2E_FOUNDER_TOTP_SECRET);
  if (!apiKey || !password || !totpSecret) {
    throw new Error('VITE_FIREBASE_API_KEY, E2E_FOUNDER_PASSWORD, and E2E_FOUNDER_TOTP_SECRET are required.');
  }
  if (email !== FOUNDER_EMAIL) throw new Error(`E2E_FOUNDER_EMAIL must equal ${FOUNDER_EMAIL}.`);
  return { apiKey, email, password, totpSecret };
}

export async function verifyFounderTotpSignIn({
  env = process.env,
  signInImpl = signInWithRequiredTotpMfa,
} = {}) {
  const context = requireProtectedContext(env);
  const session = await signInImpl({
    apiKey: context.apiKey,
    email: context.email,
    password: context.password,
    totpSecret: context.totpSecret,
    referer: 'https://bin-group-admin-panel.web.app/',
  });
  if (session?.secondFactorType !== 'totp' || !text(session?.secondFactorIdentifier)) {
    throw new Error('Founder sign-in did not produce a verified TOTP second-factor session.');
  }

  const evidence = {
    status: 'passed',
    projectId: PROJECT_ID,
    canonicalFounder: true,
    verifiedSecondFactor: 'totp',
    secondFactorIdentifierHash: hash(session.secondFactorIdentifier),
    sensitiveValuesExcluded: true,
  };
  console.log(`[founder-totp-signin] PASS factor=${evidence.secondFactorIdentifierHash.slice(0, 12)}…`);
  return evidence;
}

const invokedPath = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedPath) {
  verifyFounderTotpSignIn().catch((error) => {
    console.error(`[founder-totp-signin] REFUSED: ${error instanceof Error ? error.message : 'unknown failure'}`);
    process.exit(1);
  });
}
