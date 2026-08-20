#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import admin from 'firebase-admin';
import { signInWithRequiredTotpMfa } from './lib/firebase-mfa-sign-in.mjs';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { claimsGrantAdminPortal } from './verify-admin-mfa-production.mjs';

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
  const commitSha = text(env.GITHUB_SHA);
  if (commitSha && !/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('GITHUB_SHA must be a full lowercase commit SHA.');

  const apiKey = text(env.VITE_FIREBASE_API_KEY);
  const email = lower(env.E2E_FOUNDER_EMAIL);
  const rawPassword = String(env.E2E_FOUNDER_PASSWORD ?? '');
  const password = rawPassword.trim();
  const totpSecret = text(env.E2E_FOUNDER_TOTP_SECRET);
  if (!apiKey || password.length < 8 || rawPassword !== password || !totpSecret) {
    throw new Error('VITE_FIREBASE_API_KEY, a valid E2E_FOUNDER_PASSWORD, and E2E_FOUNDER_TOTP_SECRET are required.');
  }
  if (email !== FOUNDER_EMAIL) throw new Error(`E2E_FOUNDER_EMAIL must equal ${FOUNDER_EMAIL}.`);
  return { apiKey, email, password, totpSecret };
}

function isCredentialDrift(error) {
  return /Firebase first-factor sign-in failed:\s*INVALID_(?:LOGIN_CREDENTIALS|PASSWORD)/i.test(
    error instanceof Error ? error.message : String(error ?? ''),
  );
}

async function defaultSynchronizeFounderPassword({ email, password, authClient } = {}) {
  const projectId = resolveFirebaseAdminProjectId();
  if (projectId !== PROJECT_ID) {
    throw new Error(`Unexpected Firebase project for Founder credential synchronization: ${projectId || '(missing)'}.`);
  }
  if (!authClient) initializeFirebaseAdmin(admin, projectId);
  const auth = authClient || admin.auth();
  const founder = await auth.getUserByEmail(email);
  const factors = Array.isArray(founder?.multiFactor?.enrolledFactors) ? founder.multiFactor.enrolledFactors : [];
  const claims = founder?.customClaims || {};
  if (
    !founder?.uid || founder.disabled || founder.emailVerified !== true ||
    lower(founder.email) !== FOUNDER_EMAIL || !claimsGrantAdminPortal(claims) || factors.length < 1
  ) {
    throw new Error('Canonical Founder Auth identity is not active, verified, privileged, and MFA-enrolled.');
  }

  await auth.updateUser(founder.uid, { password });
  return { founderUid: founder.uid, enrolledMfaFactorCount: factors.length };
}

export async function verifyFounderTotpSignIn({
  env = process.env,
  signInImpl = signInWithRequiredTotpMfa,
  synchronizePasswordImpl = defaultSynchronizeFounderPassword,
  authClient,
} = {}) {
  const context = requireProtectedContext(env);
  const signIn = () => signInImpl({
    apiKey: context.apiKey,
    email: context.email,
    password: context.password,
    totpSecret: context.totpSecret,
    referer: 'https://bin-group-admin-panel.web.app/',
  });

  let session;
  let credentialResynchronized = false;
  try {
    session = await signIn();
  } catch (error) {
    if (!isCredentialDrift(error)) throw error;
    const sync = await synchronizePasswordImpl({
      email: context.email,
      password: context.password,
      authClient,
    });
    if (!text(sync?.founderUid) || Number(sync?.enrolledMfaFactorCount || 0) < 1) {
      throw new Error('Founder credential synchronization did not prove the canonical MFA-enrolled identity.');
    }
    credentialResynchronized = true;
    session = await signIn();
  }

  if (session?.secondFactorType !== 'totp' || !text(session?.secondFactorIdentifier)) {
    throw new Error('Founder sign-in did not produce a verified TOTP second-factor session.');
  }

  const evidence = {
    status: 'passed',
    projectId: PROJECT_ID,
    canonicalFounder: true,
    verifiedSecondFactor: 'totp',
    secondFactorIdentifierHash: hash(session.secondFactorIdentifier),
    credentialResynchronized,
    sensitiveValuesExcluded: true,
  };
  console.log(`[founder-totp-signin] PASS factor=${evidence.secondFactorIdentifierHash.slice(0, 12)}… synchronized=${credentialResynchronized}`);
  return evidence;
}

const invokedPath = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedPath) {
  verifyFounderTotpSignIn().catch((error) => {
    console.error(`[founder-totp-signin] REFUSED: ${error instanceof Error ? error.message : 'unknown failure'}`);
    process.exit(1);
  });
}
