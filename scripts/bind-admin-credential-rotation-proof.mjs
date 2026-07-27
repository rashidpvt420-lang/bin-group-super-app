#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';

const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const WORKFLOW = 'Privileged Access Rotation Evidence';
const JOB = 'verify-rotation';
const ROTATION_PROOF_PATH = 'launch_package/operational-proof.json';
const LOGIN_PROOF_PATH = 'launch_package/admin-credential-login-proof.json';
const text = (value) => String(value ?? '').trim();
const fail = (message) => {
  console.error(`[bind-admin-credential-rotation] FAIL — ${message}`);
  process.exit(1);
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('binder may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') fail('binder requires protected main');
if (process.env.GITHUB_WORKFLOW !== WORKFLOW || process.env.GITHUB_JOB !== JOB) fail('unexpected protected workflow context');
try { requireAuthorizedApprover(process.env.GITHUB_ACTOR); } catch (error) { fail(error.message); }

const commitSha = text(process.env.GITHUB_SHA);
const workflowRunId = text(process.env.GITHUB_RUN_ID);
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(workflowRunId)) fail('exact commit SHA and numeric workflow run ID are required');

let rotationProof;
let loginProof;
try { rotationProof = JSON.parse(readFileSync(ROTATION_PROOF_PATH, 'utf8')); }
catch (error) { fail(`${ROTATION_PROOF_PATH} is malformed: ${error.message}`); }
try { loginProof = JSON.parse(readFileSync(LOGIN_PROOF_PATH, 'utf8')); }
catch (error) { fail(`${LOGIN_PROOF_PATH} is malformed: ${error.message}`); }

if (
  rotationProof.status !== 'passed' ||
  rotationProof.gateKey !== 'privilegedAccessRotation' ||
  rotationProof.commitSha !== commitSha ||
  text(rotationProof.sourceRunId) !== workflowRunId
) {
  fail('rotation proof is not bound to this protected execution');
}
if (
  loginProof.status !== 'passed' ||
  loginProof.commitSha !== commitSha ||
  text(loginProof.workflowRunId) !== workflowRunId ||
  loginProof.projectId !== rotationProof.projectId
) {
  fail('Admin credential login proof is not bound to this protected execution');
}
if (text(loginProof.adminUidHash) !== text(rotationProof.adminUidHash)) fail('Admin credential and rotation records refer to different accounts');
if (loginProof.directAuthentication !== true && loginProof.mfaChallengeIssued !== true) fail('rotated Admin password was not accepted by Firebase Auth');
const observedAt = Date.parse(text(loginProof.observedAt));
const rotationObservedAt = Date.parse(text(rotationProof.observedAt));
if (!Number.isFinite(observedAt) || !Number.isFinite(rotationObservedAt)) fail('rotation or credential timestamps are invalid');
if (Math.abs(observedAt - rotationObservedAt) > 30 * 60 * 1000) fail('credential login and rotation evidence were not observed in the same protected window');

rotationProof.adminCredentialLogin = {
  status: 'passed',
  adminUidHash: text(loginProof.adminUidHash),
  adminEmailHash: text(loginProof.adminEmailHash),
  role: text(loginProof.role),
  authOutcome: text(loginProof.authOutcome),
  directAuthentication: loginProof.directAuthentication === true,
  mfaChallengeIssued: loginProof.mfaChallengeIssued === true,
  enrolledMfaFactorCount: Number(loginProof.enrolledMfaFactorCount || 0),
  observedAt: text(loginProof.observedAt),
};
rotationProof.checks = Array.isArray(rotationProof.checks) ? rotationProof.checks : [];
rotationProof.checks.push({
  name: 'Rotated Admin credential accepted by Firebase Auth',
  status: 'passed',
  reference: 'firebase-auth://admin-credential-login',
});
writeFileSync(ROTATION_PROOF_PATH, `${JSON.stringify(rotationProof, null, 2)}\n`, { mode: 0o600 });
console.log(`[bind-admin-credential-rotation] PASS outcome=${loginProof.authOutcome}`);
