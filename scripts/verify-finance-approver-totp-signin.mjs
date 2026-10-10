#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin } from './firebase-admin-bootstrap.mjs';
import { signInFinanceApproverMfa } from './lib/finance-approver-mfa.mjs';

const PROJECT = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const FOUNDER = 'ceo@bin-groups.com';
const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

function requireProtectedContext(env, root) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== REPOSITORY ||
      env.GITHUB_WORKFLOW !== 'Firebase Production Deploy' || env.GITHUB_JOB !== 'deploy-firebase-production-stack' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main' ||
      lower(env.DEPLOYMENT_ENVIRONMENT) !== 'production' ||
      text(env.GCP_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT) !== PROJECT) {
    throw new Error('Finance credential verification requires the protected exact-main production deploy job.');
  }
  if (!/^[0-9a-f]{40}$/.test(text(env.GITHUB_SHA)) || !/^[1-9][0-9]*$/.test(text(env.GITHUB_RUN_ID))) {
    throw new Error('Exact commit SHA and workflow run ID are required.');
  }
  const authorization = JSON.parse(readFileSync(path.join(root, 'launch_package/hard-launch-authorization.json'), 'utf8'));
  const deployment = JSON.parse(readFileSync(path.join(root, 'launch_package/production-deployment.json'), 'utf8'));
  if (authorization.approved !== true || authorization.commitSha !== env.GITHUB_SHA ||
      authorization.repository !== REPOSITORY || text(authorization.runId) !== text(env.GITHUB_RUN_ID) ||
      lower(authorization.founder?.email) !== FOUNDER || deployment.status !== 'passed' ||
      deployment.projectId !== PROJECT || deployment.deployedCommitSha !== env.GITHUB_SHA ||
      deployment.repository !== REPOSITORY || text(deployment.workflowRunId) !== text(env.GITHUB_RUN_ID)) {
    throw new Error('Finance credential verification requires verified authorization and deployment bound to this same run.');
  }
  const email = lower(env.E2E_FINANCE_APPROVER_EMAIL);
  const password = String(env.E2E_FINANCE_APPROVER_PASSWORD ?? '');
  const totpSecret = text(env.E2E_FINANCE_APPROVER_TOTP_SECRET);
  const apiKey = text(env.VITE_FIREBASE_API_KEY);
  const otherEmails = [FOUNDER, ...[
    'E2E_ADMIN_EMAIL', 'E2E_OWNER_EMAIL', 'E2E_OWNER_MAILBOX_EMAIL', 'E2E_TENANT_EMAIL',
    'E2E_TECHNICIAN_EMAIL', 'E2E_TECHNICIAN_B_EMAIL', 'E2E_BROKER_EMAIL', 'E2E_BROKER_MAILBOX_EMAIL',
  ].map((name) => lower(env[name])).filter(Boolean)];
  if (!email || otherEmails.includes(email) || !apiKey || !totpSecret ||
      password !== password.trim() || password.length < 8) {
    throw new Error('A distinct Finance Admin email, valid protected password, API key and TOTP secret are required.');
  }
  return { email, password, totpSecret, apiKey };
}

export async function verifyFinanceApproverTotpSignIn({
  env = process.env, root = process.cwd(), authClient, signInImpl = signInFinanceApproverMfa,
} = {}) {
  const context = requireProtectedContext(env, root);
  if (!authClient) initializeFirebaseAdmin(admin, PROJECT);
  const auth = authClient || admin.auth();
  const founder = await auth.getUserByEmail(FOUNDER);
  const finance = await auth.getUserByEmail(context.email);
  const factors = finance.multiFactor?.enrolledFactors || [];
  const claims = finance.customClaims || {};
  if (!founder.uid || !finance.uid || founder.uid === finance.uid || finance.disabled === true ||
      finance.emailVerified !== true || lower(finance.email) !== context.email ||
      lower(claims.role || claims.userRole || claims.primaryRole) !== 'finance_admin' ||
      claims.suspended === true || claims.active === false ||
      !factors.some((factor) => lower(factor.factorId) === 'totp')) {
    throw new Error('Existing Finance Admin must be distinct, active, verified, finance_admin and TOTP-enrolled.');
  }
  const signIn = () => signInImpl({ ...context, recorderUid: founder.uid,
    referer: 'https://bin-group-admin-panel.web.app/' });
  let session;
  let passwordSynchronized = false;
  try {
    session = await signIn();
  } catch (error) {
    // Only a first-factor credential mismatch permits password synchronization.
    // Never repair enrollment, claims, disabled state or a rejected TOTP code.
    if (!/^Finance Admin first-factor sign-in failed \(HTTP 400\): INVALID_(LOGIN_CREDENTIALS|PASSWORD)\.$/.test(error?.message || '')) throw error;
    await auth.updateUser(finance.uid, { password: context.password });
    passwordSynchronized = true;
    session = await signIn();
  }
  if (session?.uid !== finance.uid || session.secondFactorType !== 'totp' ||
      !factors.some((factor) => lower(factor.factorId) === 'totp' && text(factor.uid) === session.secondFactorIdentifier)) {
    throw new Error('Finance sign-in must verify the existing UID and enrolled TOTP factor.');
  }
  console.log(`[finance-totp-signin] PASS password_synchronized=${passwordSynchronized} real_totp=true distinct_uid=true hardLaunchClaim=false`);
  return { status: 'passed', passwordSynchronized, roleAndMfaStateChanged: false, hardLaunchClaim: false };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  verifyFinanceApproverTotpSignIn().catch((error) => {
    console.error(`[finance-totp-signin] REFUSED: ${error instanceof Error ? error.message : 'unknown failure'}`);
    process.exitCode = 1;
  });
}
