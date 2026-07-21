#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('scripts/print-hard-launch-blockers.mjs', 'utf8');


test('hard launch blocker printer documents the exact-main protected workflow chain', () => {
  for (const required of [
    'START HERE - Firebase Production Deploy',
    'confirmation: DEPLOY_PRODUCTION_BIN_GROUP_57C60',
    'hard_launch_confirmation: AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP',
    'launch_mode: bank-pilot',
    'mode: live-evidence',
    'mode: hard-clearance',
    'launch_mode: public',
    'run_public_release_gate: true',
    'stripe_live_checkout_session_id: cs_live_',
    'stripe_live_webhook_event_id: evt_',
  ]) {
    assert.ok(source.includes(required), `missing launch plan marker: ${required}`);
  }
  assert.equal(
    (source.match(/Workflow: START HERE - Firebase Production Deploy/g) || []).length,
    2,
    'bank-pilot and public dispatches must both use the exact-main launcher',
  );
});


test('operator guidance does not expose dispatcher-derived incident inputs', () => {
  assert.doesNotMatch(source, /console\.log\(['"]\s+incident_attestation:/);
  assert.doesNotMatch(source, /console\.log\(['"]\s+incident_last_deployment_failed:/);
  assert.doesNotMatch(source, /console\.log\(['"]\s+incident_last_deployment_failed_at:/);
  assert.match(source, /derives incident_attestation and latest-failed-deployment recovery from GitHub Actions/);
});


test('hard launch blocker result is derived from runtime artifacts and a signed final decision', () => {
  assert.match(source, /evaluateHardLaunchEligibility/);
  assert.match(source, /readHardLaunchInputs/);
  assert.match(source, /validateHardLaunchDecisionDocument/);
  assert.match(source, /HARD_LAUNCH_APPROVAL_HMAC_KEY is required for a GO result/);
  assert.match(source, /!runtimeEligibility\.hardLaunchEligible \|\| !finalDecision\.ok/);
  assert.doesNotMatch(source, /verifiedScore < 9/);
  assert.doesNotMatch(source, /decision !== 'PUBLIC_LAUNCH_READY'/);
});


test('hard launch blocker printer warns that JSON/source edits cannot clear launch', () => {
  assert.match(source, /Only scripts\/hard-launch-decision-gate\.mjs may write hardLaunchClaim=true/);
  assert.match(source, /Editing JSON or source files does not clear launch/);
  assert.match(source, /Live workflow evidence or a valid signed final decision is still required/);
});


test('hard launch blocker printer reports every final-decision artifact binding', () => {
  for (const file of [
    'launch_package/production-incidents.json',
    'launch_package/hard-launch-authorization.json',
    'launch_package/production-deployment.json',
    'launch_package/launch-evidence-batch.json',
    'launch_package/operational-readiness.json',
    'launch_package/pilot-incident-report.json',
    'launch_package/public-release-status.json',
    'launch_package/stripe-live-proof.json',
    'launch_package/hard-launch-decision.json',
  ]) {
    assert.ok(source.includes(file), `missing artifact matrix file: ${file}`);
  }
});
