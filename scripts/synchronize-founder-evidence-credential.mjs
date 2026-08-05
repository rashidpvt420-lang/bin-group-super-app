#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { CANONICAL_FOUNDER_EMAIL, claimsGrantAdminPortal } from './verify-admin-mfa-production.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const WORKFLOW = 'Firebase Production Deploy';
const JOB = 'deploy-firebase-production-stack';
const AUTHORIZATION_PATH = 'launch_package/hard-launch-authorization.json';
const DEPLOYMENT_PATH = 'launch_package/production-deployment.json';
const OUTPUT_PATH = 'launch_package/founder-evidence-credential-sync.json';
const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const sha256 = (value) => createHash('sha256').update(String(value ?? '')).digest('hex');

function readJson(root, relativePath) {
  try {
    return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
  } catch {
    throw new Error(`${relativePath} must contain valid same-run JSON evidence.`);
  }
}

function requireProtectedContext({ env, root }) {
  if (env.GITHUB_ACTIONS !== 'true') throw new Error('Founder credential synchronization requires GitHub Actions.');
  if (text(env.GITHUB_REPOSITORY) !== REPOSITORY) throw new Error(`Repository must equal ${REPOSITORY}.`);
  if (text(env.GITHUB_WORKFLOW) !== WORKFLOW || text(env.GITHUB_JOB) !== JOB) {
    throw new Error('Founder credential synchronization requires the protected Firebase production deploy job.');
  }
  if (text(env.GITHUB_EVENT_NAME) !== 'workflow_dispatch' || text(env.GITHUB_REF) !== 'refs/heads/main') {
    throw new Error('Founder credential synchronization requires workflow_dispatch from refs/heads/main.');
  }
  if (lower(env.DEPLOYMENT_ENVIRONMENT) !== 'production') throw new Error('DEPLOYMENT_ENVIRONMENT must equal production.');

  const commitSha = text(env.GITHUB_SHA);
  const workflowRunId = text(env.GITHUB_RUN_ID);
  if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^[1-9][0-9]*$/.test(workflowRunId)) {
    throw new Error('An exact commit SHA and numeric workflow run ID are required.');
  }
  const founderEmail = lower(env.E2E_FOUNDER_EMAIL);
  if (founderEmail !== CANONICAL_FOUNDER_EMAIL) {
    throw new Error(`E2E_FOUNDER_EMAIL must equal ${CANONICAL_FOUNDER_EMAIL}.`);
  }
  const rawPassword = String(env.E2E_FOUNDER_PASSWORD ?? '');
  const password = rawPassword.trim();
  if (rawPassword !== password || password.length < 8) {
    throw new Error('E2E_FOUNDER_PASSWORD must contain at least 8 characters and no boundary whitespace.');
  }
  const apiKey = text(env.VITE_FIREBASE_API_KEY);
  if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY is required for first-factor verification.');

  const authorization = readJson(root, AUTHORIZATION_PATH);
  const deployment = readJson(root, DEPLOYMENT_PATH);
  if (
    authorization.approved !== true ||
    text(authorization.commitSha) !== commitSha ||
    text(authorization.repository) !== REPOSITORY ||
    text(authorization.runId) !== workflowRunId ||
    lower(authorization.founder?.email) !== CANONICAL_FOUNDER_EMAIL
  ) {
    throw new Error('Signed Founder authorization is not bound to this exact workflow run.');
  }
  if (
    text(deployment.status) !== 'passed' ||
    text(deployment.projectId) !== PROJECT_ID ||
    text(deployment.deployedCommitSha) !== commitSha ||
    text(deployment.repository) !== REPOSITORY ||
    text(deployment.workflowRunId) !== workflowRunId
  ) {
    throw new Error('Verified deployment evidence is not bound to this exact workflow run.');
  }
  return { apiKey, commitSha, founderEmail, password, workflowRunId };
}

async function parseJson(response) {
  const bodyText = await response.text();
  try {
    return bodyText ? JSON.parse(bodyText) : {};
  } catch {
    return { raw: bodyText.slice(0, 300) };
  }
}

async function verifyFirstFactor({ apiKey, email, password, expectedUid, fetchImpl }) {
  const endpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword');
  endpoint.searchParams.set('key', apiKey);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Referer: 'https://bin-group-admin-panel.web.app/',
    },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    return {
      accepted: false,
      providerError: text(payload?.error?.message || payload?.error || payload?.raw || `HTTP_${response.status}`).toUpperCase(),
    };
  }
  if (text(payload.localId) && text(payload.localId) !== expectedUid) {
    throw new Error('Firebase first-factor response is bound to a different Founder UID.');
  }
  const mfaInfo = Array.isArray(payload.mfaInfo) ? payload.mfaInfo : [];
  if (!text(payload.mfaPendingCredential) || mfaInfo.length < 1 || text(payload.idToken)) {
    throw new Error('Canonical Founder first-factor verification did not return the required MFA challenge.');
  }
  return { accepted: true, mfaFactorCount: mfaInfo.length };
}

export async function synchronizeFounderEvidenceCredential({
  env = process.env,
  root = process.cwd(),
  authClient,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const context = requireProtectedContext({ env, root });
  const projectId = text(env.GCP_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT)
    || resolveFirebaseAdminProjectId();
  if (projectId !== PROJECT_ID) throw new Error(`Firebase project must equal ${PROJECT_ID}.`);
  if (!authClient) initializeFirebaseAdmin(admin, projectId);
  const auth = authClient || admin.auth();
  const founder = await auth.getUserByEmail(context.founderEmail);
  const claims = founder.customClaims || {};
  const factors = Array.isArray(founder.multiFactor?.enrolledFactors) ? founder.multiFactor.enrolledFactors : [];
  if (
    !founder.uid || founder.disabled || founder.emailVerified !== true ||
    lower(founder.email) !== CANONICAL_FOUNDER_EMAIL ||
    !claimsGrantAdminPortal(claims) || factors.length < 1
  ) {
    throw new Error('Canonical Founder Auth identity is not active, verified, privileged, and MFA-enrolled.');
  }

  let verification = await verifyFirstFactor({
    apiKey: context.apiKey,
    email: context.founderEmail,
    password: context.password,
    expectedUid: founder.uid,
    fetchImpl,
  });
  let mutationPerformed = false;
  if (!verification.accepted) {
    if (!/INVALID_(LOGIN_CREDENTIALS|PASSWORD)/.test(verification.providerError)) {
      throw new Error(`Founder first-factor verification was blocked by ${verification.providerError.slice(0, 120)}.`);
    }
    await auth.updateUser(founder.uid, { password: context.password });
    mutationPerformed = true;
    verification = await verifyFirstFactor({
      apiKey: context.apiKey,
      email: context.founderEmail,
      password: context.password,
      expectedUid: founder.uid,
      fetchImpl,
    });
    if (!verification.accepted) throw new Error('Synchronized Founder credential was still rejected by Firebase Auth.');
  }

  const evidence = {
    schemaVersion: 1,
    status: 'passed',
    source: 'protected-founder-evidence-credential-synchronizer',
    projectId,
    repository: REPOSITORY,
    commitSha: context.commitSha,
    workflowRunId: context.workflowRunId,
    founderUidHash: sha256(founder.uid),
    founderEmailHash: sha256(context.founderEmail),
    passwordAccepted: true,
    mfaChallengeIssued: true,
    enrolledMfaFactorCount: factors.length,
    observedMfaFactorCount: verification.mfaFactorCount,
    mutationPerformed,
    roleAndMfaStateChanged: false,
    sensitiveValuesExcluded: true,
    observedAt: now.toISOString(),
    hardLaunchClaim: false,
  };
  mkdirSync(path.dirname(path.join(root, OUTPUT_PATH)), { recursive: true });
  writeFileSync(path.join(root, OUTPUT_PATH), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`[founder-evidence-credential] PASS synchronized=${mutationPerformed} mfa_challenge=true`);
  return evidence;
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (invokedPath) {
  synchronizeFounderEvidenceCredential().catch((error) => {
    console.error(`[founder-evidence-credential] REFUSED: ${error instanceof Error ? error.message : 'unknown failure'}`);
    process.exit(1);
  });
}
