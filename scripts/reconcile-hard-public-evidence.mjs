#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  gitSha,
  readJsonSafe,
  validateDeploymentDocument,
} from './lib/launch-honesty.mjs';
import { validateOperationalReadinessReport } from './lib/hard-launch-gate.mjs';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_WORKFLOW = 'Live Role Smoke Tests';
const root = process.cwd();
const gatePath = path.join(root, 'launch_package', 'launch-proof-gates.json');
const statusPath = path.join(root, 'launch_package', 'launch-status.json');
const operationalPath = path.join(root, 'launch_package', 'operational-readiness.json');

function fail(message) {
  throw new Error(`[hard-public-evidence-reconcile] ${message}`);
}

function text(value) {
  return String(value || '').trim();
}

if (process.env.GITHUB_ACTIONS !== 'true') fail('protected GitHub Actions context is required');
if (text(process.env.GITHUB_REPOSITORY) !== EXPECTED_REPOSITORY) fail('unexpected repository');
if (text(process.env.GITHUB_REF) !== 'refs/heads/main') fail('hard clearance must run from main');
if (text(process.env.GITHUB_WORKFLOW) !== EXPECTED_WORKFLOW) fail('unexpected workflow');

const releaseSha = gitSha(root);
const expectedReleaseSha = text(process.env.HARD_LAUNCH_EXPECTED_SHA).toLowerCase();
const controlPlaneSha = text(process.env.CLEARANCE_CONTROL_PLANE_SHA).toLowerCase();
if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha) || expectedReleaseSha !== releaseSha) {
  fail('frozen release SHA binding mismatch');
}
if (!/^[0-9a-f]{40}$/.test(controlPlaneSha)) fail('control-plane SHA must be a full lowercase SHA');

const evidence = readJsonSafe(evidencePath(root), { records: [] });
const deploymentDoc = readJsonSafe(deploymentEvidencePath(root), null);
const operational = readJsonSafe(operationalPath, null);
const launchStatus = readJsonSafe(statusPath, null);

const deploymentErrors = validateDeploymentDocument(
  deploymentDoc,
  releaseSha,
  { requireWorkflowProvenance: true },
);
if (deploymentErrors.length) fail(`production deployment evidence invalid: ${deploymentErrors.join('; ')}`);

const pilot = evaluatePilotEligibility({
  evidenceBatch: evidence,
  commitSha: releaseSha,
  deploymentDoc,
  root,
});
if (pilot.pilotEligible !== true || pilot.missing.length || pilot.invalid.length) {
  fail('exact-SHA protected live evidence is not pilot-eligible');
}

const operationalErrors = operational
  ? validateOperationalReadinessReport(operational, releaseSha, {
      env: { ...process.env, CONTROL_PLANE_COMMIT_SHA: controlPlaneSha },
    })
  : ['operational-readiness.json is missing'];
if (operationalErrors.length) {
  fail(`operational readiness invalid: ${operationalErrors.join('; ')}`);
}

if (
  operational?.controlPlaneCommitSha &&
  text(operational.controlPlaneCommitSha).toLowerCase() !== controlPlaneSha
) {
  fail('operational readiness control-plane SHA mismatch');
}

if (
  launchStatus?.scope !== 'hard-public-launch' ||
  text(launchStatus?.commitSha).toLowerCase() !== releaseSha ||
  launchStatus?.automationOk !== true ||
  launchStatus?.pilotEligible !== true
) {
  fail('hard launch status is not bound to the verified frozen release');
}

const billingReady =
  Array.isArray(launchStatus?.checks) &&
  launchStatus.checks.some(
    (check) => check?.name === 'firebaseDeploymentReadiness' && check?.ok === true,
  );
if (!billingReady) fail('live Firebase deployment/billing readiness proof is missing');

function operationalGatePassed(name) {
  const gate = operational?.gates?.[name];
  return gate?.status === 'passed' && gate?.hardLaunchClaim !== true;
}

const exactHostedProof = new Map([
  ['deploymentProof.hosting', {
    ok: true,
    proof: 'Protected exact-SHA Firebase production deployment evidence validated.',
  }],
  ['deploymentProof.functionsDeploy', {
    ok: true,
    proof: 'Protected exact-SHA Firebase Functions production deployment evidence validated.',
  }],
  ['requiredProviderGates.firebaseAuth', {
    ok: true,
    proof: 'Protected exact-SHA five-role Firebase Auth execution evidence validated.',
  }],
  ['requiredProviderGates.firestoreRules', {
    ok: true,
    proof: 'Protected exact-SHA production deployment plus live role authorization evidence validated.',
  }],
  ['requiredProviderGates.storageRules', {
    ok: true,
    proof: 'Protected exact-SHA production deployment plus live upload/read authority evidence validated.',
  }],
  ['requiredProviderGates.firebaseFunctionsLiveSmoke', {
    ok: true,
    proof: 'Protected exact-SHA operational readiness and live role callable/trigger evidence validated.',
  }],
  ['requiredProviderGates.aiVisionOrTriage', {
    ok: operationalGatePassed('aiProviderHealth'),
    proof: 'Protected exact-SHA AI provider health and signed-in production evidence validated.',
  }],
  ['requiredProviderGates.firebaseBillingPlan', {
    ok: billingReady,
    proof: 'Protected live Firebase deployment/billing readiness check passed.',
  }],
  ['requiredProviderGates.appCheckEnforcement', {
    ok: operationalGatePassed('appCheckEnforcement'),
    proof: 'Protected exact-SHA App Check enforcement evidence validated.',
  }],
]);

let gates;
try {
  gates = JSON.parse(readFileSync(gatePath, 'utf8'));
} catch (error) {
  fail(`launch proof gates could not be read: ${error.message}`);
}

const reconciled = [];
for (const [key, evidenceProof] of exactHostedProof) {
  const [groupName, gateName] = key.split('.');
  const gate = gates?.[groupName]?.[gateName];
  if (!gate || gate.required !== true) fail(`required gate is missing: ${key}`);
  if (text(gate.evidenceLayerRequired) !== 'hosted') {
    fail(`refusing to reconcile non-hosted gate: ${key}`);
  }
  if (evidenceProof.ok !== true) fail(`protected proof did not pass for ${key}`);

  gate.status = 'passed';
  gate.proof = evidenceProof.proof;
  gate.evidenceType = 'protected-execution';
  gate.executionGenerated = true;
  gate.hardLaunchClaim = false;
  gate.commitSha = releaseSha;
  gate.releaseSha = releaseSha;
  gate.controlPlaneCommitSha = controlPlaneSha;
  gate.reconciledAt = new Date().toISOString();
  gate.reconciledByWorkflow = EXPECTED_WORKFLOW;
  reconciled.push(key);
}

gates.runtimeReconciliation = {
  schemaVersion: 1,
  releaseSha,
  controlPlaneCommitSha: controlPlaneSha,
  workflow: EXPECTED_WORKFLOW,
  reconciledAt: new Date().toISOString(),
  reconciledHostedGates: reconciled,
  physicalDeviceGatesModified: false,
  policyReviewGatesModified: false,
  hardLaunchClaim: false,
};

writeFileSync(gatePath, `${JSON.stringify(gates, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify({
  status: 'reconciled',
  releaseSha,
  controlPlaneCommitSha: controlPlaneSha,
  reconciledHostedGates: reconciled,
  physicalDeviceGatesModified: false,
  policyReviewGatesModified: false,
  hardLaunchClaim: false,
}, null, 2));
