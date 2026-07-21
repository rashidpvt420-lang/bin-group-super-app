#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  evaluateHardLaunchEligibility,
  readHardLaunchInputs,
} from './lib/hard-launch-gate.mjs';
import {
  sha256File,
  validateHardLaunchDecisionDocument,
} from './lib/hard-launch-control.mjs';

const root = process.cwd();
const registerPath = path.resolve('launch_package', 'hard-launch-readiness.json');
const repo = 'rashidpvt420-lang/bin-group-super-app';

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { __malformed: true, error: error.message };
  }
}

function gitSha() {
  const envSha = String(process.env.GITHUB_SHA || '').trim();
  if (/^[0-9a-f]{40}$/.test(envSha)) return envSha;
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const sha = String(result.stdout || '').trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : 'UNKNOWN_SHA';
}

function jsonSummary(file, sha) {
  const doc = readJson(file, null);
  const exists = fs.existsSync(file);
  if (!exists) return { file, exists: false, state: 'missing', binding: 'missing' };
  if (doc?.__malformed) return { file, exists: true, state: 'malformed', binding: doc.error };

  const commitFields = [
    doc?.commitSha,
    doc?.deployedCommitSha,
    doc?.sha,
  ].filter(Boolean).map(String);
  const bound = commitFields.length === 0 || commitFields.includes(sha);
  const hardLaunchClaim = doc?.hardLaunchClaim;
  return {
    file,
    exists: true,
    state: doc?.status || doc?.decision || 'present',
    binding: bound ? 'same-SHA-or-unbound' : `stale:${commitFields.join(',')}`,
    hardLaunchClaim: hardLaunchClaim === undefined ? 'n/a' : String(hardLaunchClaim),
  };
}

function printArtifactMatrix(sha) {
  const files = [
    'launch_package/production-incidents.json',
    'launch_package/hard-launch-authorization.json',
    'launch_package/production-deployment.json',
    'launch_package/launch-evidence-batch.json',
    'launch_package/launch-status.json',
    'launch_package/live-evidence-provenance.json',
    'launch_package/operational-readiness.json',
    'launch_package/pilot-incident-report.json',
    'launch_package/hard-launch-approval.json',
    'launch_package/public-release-status.json',
    'launch_package/stripe-live-proof.json',
    'launch_package/hard-launch-decision.json',
  ];
  console.log('\nWorkflow artifact state in this checkout:');
  for (const item of files.map((file) => jsonSummary(path.resolve(file), sha))) {
    console.log(`- ${path.relative(process.cwd(), item.file)}: ${item.state} · ${item.binding} · hardLaunchClaim=${item.hardLaunchClaim ?? 'n/a'}`);
  }
}

function printWorkflowSequence(sha) {
  console.log('\nExecutable clearance sequence for hardLaunchClaim=true:');
  console.log('\n1) Start a new exact-main bank-pilot dispatch.');
  console.log('   Workflow: START HERE - Firebase Production Deploy');
  console.log('   confirmation: DEPLOY_PRODUCTION_BIN_GROUP_57C60');
  console.log('   hard_launch_confirmation: AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP');
  console.log('   founder_name: <AUTHORIZED_FOUNDER_NAME>');
  console.log('   founder_email: <AUTHORIZED_FOUNDER_EMAIL>');
  console.log('   launch_mode: bank-pilot');
  console.log('   run_public_release_gate: false');
  console.log('   incident_active_json: []');
  console.log('   incident_requires_rollback: false');
  console.log('   incident_rollback_reason: leave blank');
  console.log('   incident_evidence_refs: <CURRENT_APPROVED_EVIDENCE_REFERENCE>');
  console.log(`   The launcher binds the stable current main SHA automatically (currently ${sha}).`);
  console.log('   The launcher derives incident_attestation and latest-failed-deployment recovery from GitHub Actions; those are not operator inputs.');

  console.log('\n2) Generate same-commit live evidence after bank-pilot deploy succeeds.');
  console.log('   Workflow: Live Role Smoke Tests');
  console.log('   mode: live-evidence');
  console.log(`   expected_commit_sha: ${sha}`);
  console.log('   production_deploy_run_id: <BANK_PILOT_DEPLOY_RUN_ID>');

  console.log('\n3) After the verified live-evidence run has remained in controlled pilot for a real 24 hours, create protected hard-clearance evidence.');
  console.log('   Workflow: Live Role Smoke Tests');
  console.log('   mode: hard-clearance');
  console.log(`   expected_commit_sha: ${sha}`);
  console.log('   live_evidence_run_id: <LIVE_EVIDENCE_RUN_ID>');
  console.log('   confirmation: AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP');
  console.log('   incident_confirmation: NO_OPEN_P0_P1');
  console.log('   rollback_confirmation: ROLLBACK_PLAN_VERIFIED');
  console.log('   pilot_started_at: derived from the verified live-evidence run completion; deprecated input remains blank');
  console.log('   pilot_completed_at: derived by the protected hard-clearance workflow; deprecated input remains blank');
  console.log('   open_p0: 0');
  console.log('   open_p1: 0');
  console.log('   incident_reference: https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/<LIVE_EVIDENCE_RUN_ID>');
  console.log('   rollback_reference: https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/<BANK_PILOT_DEPLOY_RUN_ID>');
  console.log('   monitoring_reference: https://github.com/rashidpvt420-lang/bin-group-super-app/issues/<CONTROLLED_PILOT_REPORT_ISSUE_NUMBER>');
  console.log('   Use a real pilot-report or monitoring URL that exists before dispatch; do not use the hard-clearance run URL before the run is created.');

  console.log('\n4) Start a new public dispatch with real live Stripe proof.');
  console.log('   Workflow: START HERE - Firebase Production Deploy');
  console.log('   confirmation: DEPLOY_PRODUCTION_BIN_GROUP_57C60');
  console.log('   hard_launch_confirmation: AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP');
  console.log('   founder_name: <AUTHORIZED_FOUNDER_NAME>');
  console.log('   founder_email: <AUTHORIZED_FOUNDER_EMAIL>');
  console.log('   launch_mode: public');
  console.log('   run_public_release_gate: true');
  console.log('   incident_active_json: []');
  console.log('   incident_requires_rollback: false');
  console.log('   incident_rollback_reason: leave blank');
  console.log('   incident_evidence_refs: https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/<HARD_CLEARANCE_RUN_ID>');
  console.log('   hard_clearance_run_id: <HARD_CLEARANCE_RUN_ID>');
  console.log('   stripe_live_checkout_session_id: cs_live_...');
  console.log('   stripe_live_webhook_event_id: evt_...');
  console.log('   The launcher again derives incident_attestation and failed-deployment recovery automatically.');
}

function gateLine(gate) {
  const canonical = gate.canonicalGate ? ` · canonical: ${gate.canonicalGate}` : '';
  return `- ${gate.id}: ${gate.label} [${gate.status}]${canonical}`;
}

function evaluateSignedFinalDecision(sha) {
  const decisionPath = path.resolve('launch_package', 'hard-launch-decision.json');
  const decision = readJson(decisionPath, null);
  const evidenceFiles = {
    authorization: path.resolve('launch_package', 'hard-launch-authorization.json'),
    incidents: path.resolve('launch_package', 'production-incidents.json'),
    deployment: path.resolve('launch_package', 'production-deployment.json'),
    liveEvidence: path.resolve('launch_package', 'launch-evidence-batch.json'),
    publicReleaseStatus: path.resolve('launch_package', 'public-release-status.json'),
    stripeLiveProof: path.resolve('launch_package', 'stripe-live-proof.json'),
    pilotIncidentReport: path.resolve('launch_package', 'pilot-incident-report.json'),
  };

  const errors = [];
  const expectedHashes = {};
  for (const [key, file] of Object.entries(evidenceFiles)) {
    if (!fs.existsSync(file)) {
      errors.push(`${path.basename(file)} missing for final decision verification`);
      continue;
    }
    expectedHashes[key] = sha256File(file);
  }

  if (decision?.__malformed) {
    errors.push(`hard-launch-decision.json is malformed: ${decision.error}`);
  } else {
    errors.push(...validateHardLaunchDecisionDocument(decision, {
      commitSha: sha,
      repository: repo,
      expectedHashes,
      hmacKey: process.env.HARD_LAUNCH_APPROVAL_HMAC_KEY,
    }));
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
  };
}

const sha = gitSha();
const register = readJson(registerPath, {
  decision: 'MISSING',
  scores: {},
  hardLaunchGates: [],
});
const gates = Array.isArray(register?.hardLaunchGates) ? register.hardLaunchGates : [];
const required = gates.filter((gate) => gate.required !== false);
const acceptedStatuses = new Set(['passed', 'software_gate_present']);
const accepted = required.filter((gate) => acceptedStatuses.has(gate.status));
const external = required.filter((gate) => gate.status === 'external_verification_required');
const blocked = required.filter((gate) => ['blocked', 'failed', 'missing'].includes(gate.status));
const attested = required.filter((gate) => gate.status === 'founder_attested');
const unknown = required.filter((gate) => !acceptedStatuses.has(gate.status) && !['external_verification_required', 'founder_attested', 'blocked', 'failed', 'missing'].includes(gate.status));

const verifiedScore = Number(register?.scores?.overallVerified || 0);
const conditionalScore = Number(register?.scores?.overallConditional || 0);
const baselineDecision = String(register?.decision || '').trim() || 'MISSING';

const groups = {
  five_profile_live_workflow: ['admin_login', 'main_login', 'owner_onboarding', 'tenant_photo_request', 'technician_evidence_completion', 'broker_commission_state', 'admin_core_pages', 'admin_staff_create', 'payment_unlock'],
  external_services_and_security: ['live_billing', 'app_integrity', 'access_rotation', 'branded_email'],
  operations_pilot: ['renewal_watch', 'pilot_no_p0_p1'],
};

console.log('\n[hard-launch:blockers] BIN GROUP Super App');
console.log(`[hard-launch:blockers] Repository: ${repo}`);
console.log(`[hard-launch:blockers] Current SHA: ${sha}`);
console.log(`[hard-launch:blockers] Baseline register decision: ${baselineDecision}`);
console.log(`[hard-launch:blockers] Baseline conditional score: ${conditionalScore}/10`);
console.log(`[hard-launch:blockers] Baseline verified score: ${verifiedScore}/10`);
console.log(`[hard-launch:blockers] Baseline required gates accepted: ${accepted.length}/${required.length}`);
console.log('[hard-launch:blockers] The committed baseline register is planning metadata only; it never grants or permanently blocks runtime launch clearance.');

if (accepted.length > 0) {
  console.log('\nAccepted baseline software gates:');
  for (const gate of accepted) console.log(gateLine(gate));
}

for (const [group, ids] of Object.entries(groups)) {
  const groupGates = external.filter((gate) => ids.includes(gate.id));
  if (groupGates.length === 0) continue;
  console.log(`\n${group.replaceAll('_', ' ').toUpperCase()}:`);
  for (const gate of groupGates) console.log(gateLine(gate));
}

const otherExternal = external.filter((gate) => !Object.values(groups).flat().includes(gate.id));
if (otherExternal.length > 0) {
  console.log('\nOTHER BASELINE EXTERNAL VERIFICATION GATES:');
  for (const gate of otherExternal) console.log(gateLine(gate));
}

if (blocked.length > 0) {
  console.log('\nBASELINE BLOCKED / FAILED / MISSING:');
  for (const gate of blocked) console.log(gateLine(gate));
}

if (attested.length > 0) {
  console.log('\nFOUNDER ATTESTATION IS NOT ACCEPTED FOR HARD LAUNCH:');
  for (const gate of attested) console.log(gateLine(gate));
}

if (unknown.length > 0) {
  console.log('\nUNKNOWN BASELINE STATUS GATES:');
  for (const gate of unknown) console.log(gateLine(gate));
}

printArtifactMatrix(sha);

const runtimeEligibility = evaluateHardLaunchEligibility({
  ...readHardLaunchInputs(root),
  commitSha: sha,
  root,
  env: process.env,
});
const finalDecision = evaluateSignedFinalDecision(sha);

console.log('\nRuntime protected-artifact evaluation:');
console.log(`- Pilot evidence eligible: ${runtimeEligibility.pilotEligible}`);
console.log(`- Hard-launch prerequisites eligible: ${runtimeEligibility.hardLaunchEligible}`);
console.log(`- Signed final public decision valid: ${finalDecision.ok}`);

if (runtimeEligibility.errors.length > 0) {
  console.log('\nRUNTIME PREREQUISITE BLOCKERS:');
  for (const error of runtimeEligibility.errors) console.log(`- ${error}`);
}
if (finalDecision.errors.length > 0) {
  console.log('\nSIGNED FINAL DECISION BLOCKERS:');
  for (const error of finalDecision.errors) console.log(`- ${error}`);
}

printWorkflowSequence(sha);

console.log('\nWhat changes hardLaunchClaim to true:');
console.log('- The final START HERE - Firebase Production Deploy run must use launch_mode=public.');
console.log('- resolve-live-pilot-window.mjs must verify the exact successful live-evidence workflow run and derive a real 24-hour pilot window.');
console.log('- The postdeploy gate must write public-release-status.json with publicReleaseCleared=true.');
console.log('- verify-stripe-live-proof.mjs must write stripe-live-proof.json from a real cs_live_ session and evt_ webhook.');
console.log('- hard-launch-operational-decision-gate.mjs must validate operational readiness, pilot incident, Stripe proof, and same-run artifact binding.');
console.log('- Only scripts/hard-launch-decision-gate.mjs may write hardLaunchClaim=true. Editing JSON or source files does not clear launch.');
console.log('- This command verifies the final HMAC signature and evidence hashes; HARD_LAUNCH_APPROVAL_HMAC_KEY is required for a GO result.');

if (!runtimeEligibility.hardLaunchEligible || !finalDecision.ok) {
  console.log('\n[hard-launch:blockers] Result: NO-GO for unrestricted public hard launch. Live workflow evidence or a valid signed final decision is still required.');
  process.exitCode = 1;
} else {
  console.log('\n[hard-launch:blockers] Result: GO for unrestricted public hard launch. Runtime evidence and the signed final decision are verified.');
}
