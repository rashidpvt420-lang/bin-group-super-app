#!/usr/bin/env node
/**
 * Predeploy approval gate.
 *
 * Runs as the first step of the `deploy-firebase-production-stack` job, which
 * is itself gated by a protected GitHub `environment: production` requiring a
 * human reviewer — that reviewer approval is the actual identity proof for
 * "a founder authorized this deploy". This script does NOT attempt to
 * re-implement identity verification; it verifies that the release *content*
 * is genuinely ready: approval is bound to this exact commit and build
 * artifact, no incident/rollback hold is active, and the automatable
 * (non-live) launch gates pass.
 *
 * It intentionally does NOT require production-deployment.json — that file
 * can only exist after this exact commit has actually been deployed, and
 * requiring it here would make the gate impossible to pass before a first
 * deploy of a new commit (a contradiction the previous single-gate design had).
 *
 * Fail-closed: every missing/malformed/unverifiable input is a failure.
 *
 * Check functions are exported (pure, take root/env as parameters) so they
 * can be unit-tested with fixture directories instead of only being
 * exercised end-to-end inside a real GitHub Actions run.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  validateRecentTimestamp,
  requireFullCommitSha,
  readJsonFailClosed,
  checkProductionIncidentsFailClosed,
  printResult,
} from './lib/launch-approval-shared.mjs';

export const APPROVAL_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — tightened from the prior 7-day window.

export function checkCommitAndDigestInputs(env) {
  const failures = [];
  const shaCheck = requireFullCommitSha(env.GITHUB_SHA, 'GITHUB_SHA');
  if (!shaCheck.ok) failures.push(shaCheck.error);

  const digest = String(env.VALIDATED_ARTIFACT_DIGEST || '').trim();
  if (!digest || digest.length < 32) {
    failures.push('VALIDATED_ARTIFACT_DIGEST is missing or too short. Run scripts/compute-artifact-digest.mjs in the build step first.');
  }
  return { failures, commitSha: shaCheck.ok ? shaCheck.sha : null, digest: digest || null };
}

export function parseAuthorizedFounderEmails(env) {
  const raw = env.AUTHORIZED_FOUNDER_EMAILS;
  if (!raw || !String(raw).trim()) {
    return { failures: ['AUTHORIZED_FOUNDER_EMAILS is not configured. Refusing to fall back to a default founder email — set the GitHub secret explicitly.'], emails: [] };
  }
  return { failures: [], emails: String(raw).split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) };
}

/** Reads launch-proof-gates.json from `root` and validates approval is bound to commitSha/artifactDigest. */
export function checkApproval(root, { commitSha, artifactDigest, authorizedEmails }) {
  const failures = [];
  const gatePath = path.join(root, 'launch_package/launch-proof-gates.json');
  const read = readJsonFailClosed(gatePath, 'launch-proof-gates.json');
  if (!read.ok) return [read.error];
  const doc = read.data;

  if (doc.hardLaunchApproved !== true) {
    failures.push('hardLaunchApproved is not set to true in launch-proof-gates.json.');
  }

  const approvalStaleness = validateRecentTimestamp(doc.hardLaunchApprovedAt, APPROVAL_MAX_AGE_MS, 'hardLaunchApprovedAt');
  if (approvalStaleness) failures.push(approvalStaleness);

  const founderAuth = doc.founderAuthorization;
  if (!founderAuth || typeof founderAuth !== 'object') {
    failures.push('founderAuthorization is missing from launch-proof-gates.json. A founder/CEO must authorize each production release.');
    return failures;
  }

  for (const field of ['founderEmail', 'founderName', 'authorizedAt']) {
    if (!founderAuth[field]) failures.push(`founderAuthorization.${field} is missing.`);
  }

  if (founderAuth.founderEmail) {
    if (!authorizedEmails || authorizedEmails.length === 0) {
      failures.push('founderAuthorization.founderEmail cannot be validated because AUTHORIZED_FOUNDER_EMAILS is not configured.');
    } else if (!authorizedEmails.includes(String(founderAuth.founderEmail).toLowerCase())) {
      failures.push(`founderAuthorization.founderEmail (${founderAuth.founderEmail}) is not in the authorized founders list.`);
    }
  }

  const authStaleness = validateRecentTimestamp(founderAuth.authorizedAt, APPROVAL_MAX_AGE_MS, 'founderAuthorization.authorizedAt');
  if (authStaleness) failures.push(authStaleness);

  // Bind the approval to THIS exact release, not a generic time-boxed authorization.
  // This is the real fix for "one approval can authorize unrelated commits".
  if (commitSha && founderAuth.commitSha !== commitSha) {
    failures.push(`founderAuthorization.commitSha (${founderAuth.commitSha || 'missing'}) does not match GITHUB_SHA (${commitSha}). Re-approval is required for this specific commit.`);
  }
  if (artifactDigest && founderAuth.artifactDigest !== artifactDigest) {
    failures.push(`founderAuthorization.artifactDigest (${founderAuth.artifactDigest || 'missing'}) does not match VALIDATED_ARTIFACT_DIGEST (${artifactDigest}). Re-approval is required for this exact build.`);
  }

  // Deliberately NOT validating founderAuth.signature as identity proof — a regex over a
  // free-text field only proves someone typed a hex-looking string. The real authorization
  // boundary is the protected GitHub "production" environment's required-reviewer approval,
  // which this job cannot even start running without (see workflow `environment: production`).

  return failures;
}

/** Runs the automatable (non-live) launch gates. Spawns a real process — not covered by unit tests. */
export function runAutomationGates(root) {
  const failures = [];
  const stability = spawnSync('npm', ['run', 'test:stability'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((stability.status ?? 1) !== 0) {
    failures.push('npm run test:stability failed. Fix rules hardening / audit-bridge / stability regressions before deploying.');
  }
  return failures;
}

export function evaluatePredeployGate(root, env, { skipAutomationGates = false } = {}) {
  const failures = [];
  const { failures: inputFailures, commitSha, digest } = checkCommitAndDigestInputs(env);
  failures.push(...inputFailures);

  const { failures: emailFailures, emails } = parseAuthorizedFounderEmails(env);
  failures.push(...emailFailures);

  failures.push(...checkApproval(root, { commitSha, artifactDigest: digest, authorizedEmails: emails }));
  failures.push(...checkProductionIncidentsFailClosed(root));
  if (!skipAutomationGates) failures.push(...runAutomationGates(root));

  return failures;
}

function main() {
  console.log('\n=== Predeploy Approval Gate ===\n');
  const failures = evaluatePredeployGate(process.cwd(), process.env);
  const passed = printResult('Predeploy approval gate', failures);
  process.exit(passed ? 0 : 1);
}

if (path.basename(process.argv[1] || '') === 'predeploy-approval-gate.mjs') {
  main();
}
