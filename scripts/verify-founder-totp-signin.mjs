#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin } from './firebase-admin-bootstrap.mjs';
import { signInWithRequiredTotpMfa } from './lib/firebase-mfa-sign-in.mjs';
import {
  CANONICAL_FOUNDER_EMAIL,
  claimsGrantAdminPortal,
  recoveryApproverRole,
} from './verify-admin-mfa-production.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const WORKFLOW = 'Firebase Production Deploy';
const JOB = 'deploy-firebase-production-stack';
const FOUNDER_EMAIL = CANONICAL_FOUNDER_EMAIL;

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
  const rawPassword = String(env.E2E_FOUNDER_PASSWORD ?? '');
  const password = rawPassword.trim();
  const totpSecret = text(env.E2E_FOUNDER_TOTP_SECRET);
  if (!apiKey || !password || !totpSecret) {
    throw new Error('VITE_FIREBASE_API_KEY, E2E_FOUNDER_PASSWORD, and E2E_FOUNDER_TOTP_SECRET are required.');
  }
  if (rawPassword !== password || password.length < 8) {
    throw new Error('E2E_FOUNDER_PASSWORD must contain at least 8 characters and no boundary whitespace.');
  }
  if (email !== FOUNDER_EMAIL) throw new Error(`E2E_FOUNDER_EMAIL must equal ${FOUNDER_EMAIL}.`);
  return { apiKey, email, password, projectId, totpSecret };
}

function isCredentialMismatch(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /INVALID_(LOGIN_CREDENTIALS|PASSWORD)/i.test(message);
}

function validateCanonicalFounder(founder, expectedEmail) {
  const claims = founder?.customClaims || {};
  const factors = Array.isArray(founder?.multiFactor?.enrolledFactors)
    ? founder.multiFactor.enrolledFactors
    : [];
  const hasTotp = factors.some((factor) => lower(factor?.factorId) === 'totp');
  const founderRole = recoveryApproverRole(claims);

  if (
    !founder?.uid ||
    founder.disabled === true ||
    founder.emailVerified !== true ||
    lower(founder.email) !== expectedEmail ||
    !claimsGrantAdminPortal(claims) ||
    !founderRole ||
    !hasTotp
  ) {
    throw new Error('Canonical Founder Auth identity must be active, verified, CEO/Super Admin privileged, and TOTP-enrolled before credential recovery.');
  }

  return { uid: founder.uid, factorCount: factors.length, founderRole };
}

export async function verifyFounderTotpSignIn({
  env = process.env,
  signInImpl = signInWithRequiredTotpMfa,
  authClient,
} = {}) {
  const context = requireProtectedContext(env);
  if (!authClient) initializeFirebaseAdmin(admin, context.projectId);
  const auth = authClient || admin.auth();
  const founder = await auth.getUserByEmail(context.email);
  const canonical = validateCanonicalFounder(founder, context.email);

  const signIn = () => signInImpl({
    apiKey: context.apiKey,
    email: context.email,
    password: context.password,
    totpSecret: context.totpSecret,
    referer: 'https://bin-group-admin-panel.web.app/',
  });

  let passwordSynchronized = false;
  let session;
  try {
    session = await signIn();
  } catch (error) {
    if (!isCredentialMismatch(error)) throw error;

    // Fail closed: only the already-verified canonical Founder identity may have
    // its first-factor password synchronized to the protected Actions secret.
    // Claims, email verification, MFA enrollment and all other auth state remain untouched.
    await auth.updateUser(canonical.uid, { password: context.password });
    passwordSynchronized = true;
    session = await signIn();
  }

  if (session?.secondFactorType !== 'totp' || !text(session?.secondFactorIdentifier)) {
    throw new Error('Founder sign-in did not produce a verified TOTP second-factor session.');
  }

  const evidence = {
    status: 'passed',
    projectId: PROJECT_ID,
    canonicalFounder: true,
    founderRole: canonical.founderRole,
    enrolledMfaFactorCount: canonical.factorCount,
    verifiedSecondFactor: 'totp',
    secondFactorIdentifierHash: hash(session.secondFactorIdentifier),
    passwordSynchronized,
    roleAndMfaStateChanged: false,
    sensitiveValuesExcluded: true,
  };
  console.log(`[founder-totp-signin] PASS factor=${evidence.secondFactorIdentifierHash.slice(0, 12)}… password_synchronized=${passwordSynchronized}`);
  return evidence;
}

const invokedPath = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedPath) {
  verifyFounderTotpSignIn().catch((error) => {
    console.error(`[founder-totp-signin] REFUSED: ${error instanceof Error ? error.message : 'unknown failure'}`);
    process.exit(1);
  });
}
