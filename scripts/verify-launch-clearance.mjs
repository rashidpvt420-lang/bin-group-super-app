#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import {
  REQUIRED_PILOT_EVIDENCE,
  assertGateNotWaivedForSecurity,
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  gitSha,
  readJsonSafe,
  validateDeploymentDocument,
} from './lib/launch-honesty.mjs';
import {
  evaluateHardLaunchEligibility,
  hardLaunchApprovalPath,
  pilotIncidentReportPath,
} from './lib/hard-launch-gate.mjs';

const gatePath = 'launch_package/launch-proof-gates.json';
const statusPath = 'launch_package/launch-status.json';
const pilotLockPath = 'launch_package/pilot-start.lock.json';
const failures = [];
const warnings = [];
const isPilotMode = process.argv.includes('--pilot') || process.env.LAUNCH_SCOPE === 'pilot';

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

const sha = gitSha();
const evidence = readJsonSafe(evidencePath(), { records: [] });
const deploymentDoc = readJsonSafe(deploymentEvidencePath(), null);
const eligibility = evaluatePilotEligibility({
  evidenceBatch: evidence,
  commitSha: sha,
  deploymentDoc,
});
const deploymentValid =
  validateDeploymentDocument(deploymentDoc, sha, { requireWorkflowProvenance: true }).length === 0;
const currentExecutionComplete = eligibility.pilotEligible === true;

function proofText(gate) {
  return String(gate?.proof || '').trim();
}

function executionSupersedesLedger(groupName, name) {
  const key = `${groupName}.${name}`;
  if (key === 'requiredProviderGates.appCheckEnforcement') return currentExecutionComplete;
  if (key === 'requiredProviderGates.firebaseAuth') return currentExecutionComplete;
  if (key === 'deploymentProof.hosting' || key === 'deploymentProof.functionsDeploy') {
    return deploymentValid;
  }
  return false;
}

function validateGate(groupName, name, gate) {
  if (!gate || typeof gate !== 'object') {
    fail(`${groupName}.${name} is malformed or missing.`);
    return;
  }

  const required = gate.required === true;
  const status = String(gate.status || '').toLowerCase();
  const label = `${groupName}.${name}`;
  const waivedBlocked = assertGateNotWaivedForSecurity(groupName, name, gate);
  if (waivedBlocked && !superseded) {
    fail(waivedBlocked);
    return;
  }
  if (waivedBlocked && superseded) {
    warn(`${label} manual status is stale, but current-commit execution evidence supersedes it.`);
    return;
  }

  if (status === 'passed') {
    if (!proofText(gate)) fail(`${label} is marked passed but has no proof text.`);
    return;
  }

  if (status === 'waived') {
    if (required && !isPilotMode) {
      fail(`${label} is required and cannot be waived for hard public launch.`);
    } else if (required) {
      warn(`${label} is required but waived for controlled pilot only.`);
    }
    return;
  }

  if (required) fail(`${name} is not launch-clear. Current status: ${gate.status || 'missing'}`);
}

if (!existsSync(gatePath)) {
  fail(`Missing launch proof gates file: ${gatePath}`);
} else {
  const gates = JSON.parse(readFileSync(gatePath, 'utf8'));
  const gateGroups = {
    deploymentProof: gates.deploymentProof || {},
    requiredProviderGates: gates.requiredProviderGates || {},
    requiredDeviceGates: gates.requiredDeviceGates || {},
  };
  for (const [groupName, group] of Object.entries(gateGroups)) {
    for (const [name, gate] of Object.entries(group)) validateGate(groupName, name, gate);
  }
}

if (existsSync(statusPath)) {
  try {
    const status = JSON.parse(readFileSync(statusPath, 'utf8'));
    if (status.hardLaunchClaim === true && status.hardLaunchEligible !== true) {
      fail('launch-status claims hard launch without hardLaunchEligible=true.');
    }
  } catch {
    warn('launch-status.json exists but could not be parsed.');
  }
}

const root = process.cwd();
const sha = gitSha(root);
const evidence = readJsonSafe(evidencePath(root), { records: [] });
const deploymentDoc = readJsonSafe(deploymentEvidencePath(root), null);
const eligibility = evaluatePilotEligibility({ evidenceBatch: evidence, commitSha: sha, deploymentDoc, root });

for (const key of eligibility.missing) {
  fail(`${isPilotMode ? 'Controlled pilot' : 'Public launch'} blocked: missing current-commit evidence for ${key}`);
}
for (const item of eligibility.invalid) {
  fail(`${isPilotMode ? 'Controlled pilot' : 'Public launch'} blocked: invalid evidence — ${item}`);
}

if (eligibility.missing.includes('adminCredentialLogin') === false &&
    eligibility.missing.length === REQUIRED_PILOT_EVIDENCE.length - 1) {
  fail('Admin credential login alone cannot make pilot or public launch eligible.');
}

if (isPilotMode && existsSync(pilotLockPath)) {
  try {
    const lock = JSON.parse(readFileSync(pilotLockPath, 'utf8'));
    if (lock.status === 'invalidated') fail(`Pilot start lock is invalidated: ${lock.reason || 'unknown reason'}`);
    if (lock.status === 'started' && lock.commitSha && lock.commitSha !== sha) {
      fail('Pilot start lock belongs to a different commit SHA and must be revalidated.');
    }
  } catch {
    warn('pilot-start.lock.json exists but could not be parsed.');
  }
}

let hardLaunchClaim = false;
if (!isPilotMode) {
  const incidentReport = readJsonSafe(pilotIncidentReportPath(root), null);
  const approvalDoc = readJsonSafe(hardLaunchApprovalPath(root), null);
  const hard = evaluateHardLaunchEligibility({
    evidenceBatch: evidence,
    deploymentDoc,
    incidentReport,
    approvalDoc,
    commitSha: sha,
    root,
  });
  hardLaunchClaim = hard.hardLaunchClaim;
  for (const error of hard.errors) fail(`Hard public launch blocked: ${error}`);
}

if (failures.length) {
  console.error(`\n${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: NO-GO\n`);
  for (const item of [...new Set(failures)]) console.error(`- ${item}`);
  if (warnings.length) {
    console.error('\nWarnings:');
    for (const item of [...new Set(warnings)]) console.error(`- ${item}`);
  }
  console.error(`\nhardLaunchClaim=${hardLaunchClaim}`);
  console.error('Critical evidence must be generated by the production and live-clearance workflows.');
  process.exit(1);
}

if (warnings.length) {
  console.warn(`\n${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: GO WITH WARNINGS\n`);
  for (const item of [...new Set(warnings)]) console.warn(`- ${item}`);
} else {
  console.log(`${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: GO`);
}
console.log(`hardLaunchClaim=${hardLaunchClaim}`);
