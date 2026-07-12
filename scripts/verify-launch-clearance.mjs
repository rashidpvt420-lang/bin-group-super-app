import { existsSync, readFileSync } from 'node:fs';
import {
  HARD_LAUNCH_CLAIM,
  REQUIRED_PILOT_EVIDENCE,
  assertGateNotWaivedForSecurity,
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  gitSha,
  readJsonSafe,
  validateDeploymentDocument,
} from './lib/launch-honesty.mjs';

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
  const superseded = executionSupersedesLedger(groupName, name);

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
    if (!proofText(gate) && !superseded) fail(`${label} is marked passed but has no proof text.`);
    return;
  }

  if (superseded) {
    warn(`${label} ledger status ${status || 'missing'} is superseded by current-commit execution evidence.`);
    return;
  }

  if (status === 'waived') {
    if (required) warn(`${label} is required but waived. Confirm the accepted risk remains within scope.`);
    return;
  }

  if (required) fail(`${name} is not launch-clear. Current status: ${gate.status || 'missing'}`);
}

if (!existsSync(gatePath)) {
  fail(`Missing launch proof gates file: ${gatePath}`);
} else {
  try {
    const gates = JSON.parse(readFileSync(gatePath, 'utf8'));
    const gateGroups = {
      deploymentProof: gates.deploymentProof || {},
      requiredProviderGates: gates.requiredProviderGates || {},
      requiredDeviceGates: gates.requiredDeviceGates || {},
    };
    for (const [groupName, group] of Object.entries(gateGroups)) {
      for (const [name, gate] of Object.entries(group)) validateGate(groupName, name, gate);
    }
  } catch (error) {
    fail(`Launch proof gates file is invalid JSON: ${error.message}`);
  }
}

if (existsSync(statusPath)) {
  try {
    const status = JSON.parse(readFileSync(statusPath, 'utf8'));
    if (status.hardLaunchClaim === true) {
      fail('pilot launch-status incorrectly claims hard launch; only hard-launch-status may approve it.');
    }
  } catch {
    warn('launch-status.json exists but could not be parsed.');
  }
}

const scopeLabel = isPilotMode ? 'Controlled pilot' : 'Public launch';
for (const key of eligibility.missing) {
  fail(`${scopeLabel} blocked: missing current-commit evidence for ${key}`);
}
for (const item of eligibility.invalid) {
  fail(`${scopeLabel} blocked: invalid evidence — ${item}`);
}

if (
  eligibility.missing.includes('adminCredentialLogin') === false &&
  eligibility.missing.length === REQUIRED_PILOT_EVIDENCE.length - 1
) {
  fail(`${scopeLabel} blocked: adminCredentialLogin alone cannot establish launch eligibility`);
}

if (isPilotMode && existsSync(pilotLockPath)) {
  try {
    const lock = JSON.parse(readFileSync(pilotLockPath, 'utf8'));
    if (lock.status === 'invalidated') fail(`Pilot start lock is invalidated: ${lock.reason || 'unknown reason'}`);
    if (lock.status === 'started' && lock.commitSha && lock.commitSha !== sha) {
      fail('Pilot start lock belongs to a different commit SHA and must be revalidated.');
    }
    if (lock.hardLaunchClaim === true) fail('Pilot lock incorrectly claims hard launch.');
  } catch {
    warn('pilot-start.lock.json exists but could not be parsed.');
  }
}

if (failures.length) {
  console.error(`\n${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: NO-GO\n`);
  for (const item of [...new Set(failures)]) console.error(`- ${item}`);
  if (warnings.length) {
    console.error('\nWarnings:');
    for (const item of [...new Set(warnings)]) console.error(`- ${item}`);
  }
  console.error(`\nhardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
  console.error('Record critical evidence only via: node scripts/run-critical-evidence.mjs --suite <suite>');
  process.exit(1);
}

if (warnings.length) {
  console.warn(`\n${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: GO WITH WARNINGS\n`);
  for (const item of [...new Set(warnings)]) console.warn(`- ${item}`);
} else {
  console.log(`${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: GO`);
}
console.log(`hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
