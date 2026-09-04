#!/usr/bin/env node
/**
 * Pre-deployment approval gate (fail-closed).
 *
 * Runs inside the protected GitHub `production` environment job BEFORE Firebase deploy.
 * Does NOT require production-deployment.json.
 * Does NOT accept UUID/hex "signatures" as founder identity proof.
 * Does NOT claim hard launch.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  APPROVAL_MAX_AGE_MS,
  PREDEPLOY_APPROVAL_PATH,
  checkProductionIncidents,
  parseAuthorizedFounderEmails,
  requireArtifactDigest,
  requireFullSha,
  requireGitHubProductionEnvironment,
  validateRecentTimestamp,
} from './lib/launch-gate-common.mjs';
import { HARD_LAUNCH_CLAIM } from './lib/launch-honesty.mjs';
import { runProductionOtpMailboxPreflight } from './lib/production-otp-mailbox-preflight.mjs';
import { runSmtpProviderPreflight } from './lib/smtp-provider-preflight.mjs';

const PHASE1_PAYMENT_POLICY = 'phase1-manual';

export function runPredeployApprovalGate({
  root = process.cwd(),
  env = process.env,
  now = Date.now(),
} = {}) {
  const failures = [];

  requireGitHubProductionEnvironment(failures, env);

  const githubSha = requireFullSha(env.GITHUB_SHA, 'GITHUB_SHA', failures);
  const validatedDigest = requireArtifactDigest(
    env.VALIDATED_ARTIFACT_DIGEST,
    'VALIDATED_ARTIFACT_DIGEST',
    failures,
  );
  const environmentPaymentPolicy = String(env.PAYMENT_POLICY || '').trim().toLowerCase();
  if (environmentPaymentPolicy !== PHASE1_PAYMENT_POLICY) {
    failures.push('PAYMENT_POLICY must equal phase1-manual while PHASE1_CASH_CHEQUE_V1 is active.');
  }

  const authorizedEmails = parseAuthorizedFounderEmails(env);
  if (!authorizedEmails || authorizedEmails.length === 0) {
    failures.push(
      'AUTHORIZED_FOUNDER_EMAILS is missing or empty. Authorization configuration must not silently default.',
    );
  }

  const approvalPath = path.join(root, PREDEPLOY_APPROVAL_PATH);
  if (!existsSync(approvalPath)) {
    failures.push(
      `Missing ${PREDEPLOY_APPROVAL_PATH}. Predeploy approval must bind commitSha, artifactDigest, releaseId, approvedAt, approvedBy and paymentPolicy.`,
    );
  } else {
    let approval = null;
    try {
      const text = readFileSync(approvalPath, 'utf8').trim();
      if (text.startsWith('const ') || text.includes('```')) {
        failures.push(`${PREDEPLOY_APPROVAL_PATH} must be pure JSON.`);
      } else {
        approval = JSON.parse(text);
      }
    } catch (err) {
      failures.push(`${PREDEPLOY_APPROVAL_PATH} is malformed JSON: ${err.message}`);
    }

    if (approval) {
      for (const field of ['commitSha', 'artifactDigest', 'releaseId', 'approvedAt', 'approvedBy', 'paymentPolicy']) {
        if (!String(approval[field] || '').trim()) {
          failures.push(`predeploy-approval.json missing required field: ${field}`);
        }
      }

      if (String(approval.approvedVia || '') !== 'github-environment-protection') {
        failures.push(
          'approvedVia must be exactly "github-environment-protection". UUID/hex signature strings are not founder authorization.',
        );
      }
      if (String(approval.githubEnvironment || '') !== 'production') {
        failures.push('predeploy-approval.json githubEnvironment must be "production".');
      }
      if (approval.signature || approval.founderAuthorization?.signature) {
        failures.push(
          'Founder "signature" fields are rejected. Use the protected GitHub production environment reviewers for human authorization.',
        );
      }

      if (githubSha && String(approval.commitSha || '').trim() !== githubSha) {
        failures.push(
          `approval.commitSha (${approval.commitSha}) does not equal GITHUB_SHA (${githubSha}).`,
        );
      }
      if (
        validatedDigest &&
        String(approval.artifactDigest || '').trim().toLowerCase() !== validatedDigest
      ) {
        failures.push('approval.artifactDigest does not equal VALIDATED_ARTIFACT_DIGEST.');
      }

      validateRecentTimestamp(approval.approvedAt, APPROVAL_MAX_AGE_MS, 'approval.approvedAt', failures);

      const approvedBy = String(approval.approvedBy || '').trim().toLowerCase();
      if (authorizedEmails && approvedBy && !authorizedEmails.includes(approvedBy)) {
        failures.push(`approvedBy ${approvedBy} is not listed in AUTHORIZED_FOUNDER_EMAILS.`);
      }

      const launchMode = String(approval.launchMode || env.LAUNCH_MODE || '').trim();
      if (launchMode !== 'bank-pilot' && launchMode !== 'public') {
        failures.push('launchMode must be "bank-pilot" or "public".');
      }

      const approvalPaymentPolicy = String(approval.paymentPolicy || '').trim().toLowerCase();
      if (approvalPaymentPolicy !== PHASE1_PAYMENT_POLICY) {
        failures.push('predeploy approval paymentPolicy must equal phase1-manual while PHASE1_CASH_CHEQUE_V1 is active.');
      }
      if (environmentPaymentPolicy && approvalPaymentPolicy && approvalPaymentPolicy !== environmentPaymentPolicy) {
        failures.push('predeploy approval paymentPolicy does not match PAYMENT_POLICY.');
      }
    }
  }

  checkProductionIncidents(failures, { root, now, env });

  for (const item of [
    { envKey: 'PREDEPLOY_BUILD_OK', label: 'main public app build validation' },
    { envKey: 'PREDEPLOY_ADMIN_BUILD_OK', label: 'admin panel build validation' },
    { envKey: 'PREDEPLOY_FUNCTIONS_BUILD_OK', label: 'Firebase Functions build validation' },
    { envKey: 'PREDEPLOY_RULES_OK', label: 'Firestore rules hardening / stability' },
    { envKey: 'PREDEPLOY_FUNCTIONS_LOAD_OK', label: 'Functions load measurement' },
  ]) {
    if (String(env[item.envKey] || '') !== 'true') {
      failures.push(`Missing ${item.label} marker (${item.envKey}=true).`);
    }
  }

  const launchMode = String(env.LAUNCH_MODE || '').trim();
  if (launchMode === 'public') {
    // Current public mode remains Phase 1 only. Exact-artifact Cash/Cheque proof
    // is generated after deployment and revalidated by the postdeploy gate.
  } else if (launchMode === 'bank-pilot') {
    if (String(env.LAUNCH_BANK_ONLY || '') !== '1' && String(env.LAUNCH_BANK_ONLY || '') !== 'true') {
      failures.push('bank-pilot mode requires LAUNCH_BANK_ONLY=1.');
    }
  } else if (!launchMode) {
    failures.push('LAUNCH_MODE must be set to bank-pilot or public.');
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    hardLaunchClaim: HARD_LAUNCH_CLAIM,
    stage: 'predeploy',
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  console.log('\n=== Pre-deployment approval gate ===\n');
  console.log(`hardLaunchClaim=${HARD_LAUNCH_CLAIM} (never claimed by this gate)`);
  try {
    const secretPreflight = await runProductionOtpMailboxPreflight();
    console.log(`PASS — OTP peppers=${secretPreflight.peppersVerified} verified mailboxes=${secretPreflight.mailboxesVerified}; secret values were not logged.`);
    const smtpPreflight = await runSmtpProviderPreflight();
    console.log(`PASS — SMTP provider authentication verified without sending mail; host=${smtpPreflight.providerHost} port=${smtpPreflight.providerPort}.`);
  } catch (error) {
    console.error(`FAIL — protected provider preflight blocked deployment: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
    process.exit(1);
  }
  const result = runPredeployApprovalGate();
  if (result.ok) {
    console.log('PASS — protected-environment predeploy checks succeeded for Phase 1 Cash/Cheque policy.');
    process.exit(0);
  }
  console.error('FAIL — production deployment is NOT authorized:\n');
  for (const failure of result.failures) console.error(`- ${failure}`);
  console.error(`\nhardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
  process.exit(1);
}
