#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  REQUIRED_PILOT_EVIDENCE,
  assertGateNotWaivedForSecurity,
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  gitSha,
  readJsonSafe,
  sha256File,
  validateDeploymentDocument,
} from './lib/launch-honesty.mjs';
import {
  evaluateHardLaunchEligibility,
  hardLaunchApprovalPath,
  pilotIncidentReportPath,
} from './lib/hard-launch-gate.mjs';
import {
  pilotExecutionSupersedesLedger,
  pilotMayDeferManualLedger,
} from './lib/controlled-pilot-ledger.mjs';

const gatePath = 'launch_package/launch-proof-gates.json';
const statusPath = 'launch_package/launch-status.json';
const pilotLockPath = 'launch_package/pilot-start.lock.json';
const MANUAL_EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const failures = [];
const warnings = [];
const isPilotMode = process.argv.includes('--pilot') || process.env.LAUNCH_SCOPE === 'pilot';
const root = process.cwd();
const artifactRoot = path.resolve(root, 'launch_package/artifacts');

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

const sha = gitSha(root);
const evidence = readJsonSafe(evidencePath(root), { records: [] });
const deploymentDoc = readJsonSafe(deploymentEvidencePath(root), null);
const eligibility = evaluatePilotEligibility({
  evidenceBatch: evidence,
  commitSha: sha,
  deploymentDoc,
  root,
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
  if (isPilotMode) {
    return pilotExecutionSupersedesLedger({
      groupName,
      name,
      currentExecutionComplete,
      deploymentValid,
    });
  }
  return false;
}

function pilotDefersManualLedger(groupName, name) {
  if (!isPilotMode) return false;
  return pilotMayDeferManualLedger({
    groupName,
    name,
    currentExecutionComplete,
    deploymentValid,
  });
}

function validateManualArtifact(groupName, name, gate) {
  const label = `${groupName}.${name}`;
  if (groupName === 'deploymentProof') {
    return [`${label} cannot use manual proof; protected production deployment evidence is required.`];
  }

  const errors = [];
  if (gate.evidenceType !== 'manual-artifact') errors.push(`${label} evidenceType must be manual-artifact.`);
  if (gate.executionGenerated !== false) errors.push(`${label} executionGenerated must be false for manual proof.`);
  if (gate.hardLaunchClaim !== false) errors.push(`${label} hardLaunchClaim must remain false.`);
  if (String(gate.commitSha || '') !== sha) errors.push(`${label} manual proof belongs to a different commit SHA.`);
  if (!String(gate.testedBy || '').trim()) errors.push(`${label} testedBy is required.`);

  const testedAt = Date.parse(String(gate.testedAt || ''));
  if (!Number.isFinite(testedAt)) {
    errors.push(`${label} testedAt must be a valid ISO timestamp.`);
  } else {
    if (testedAt > Date.now() + MAX_CLOCK_SKEW_MS) errors.push(`${label} testedAt is in the future.`);
    if (Date.now() - testedAt > MANUAL_EVIDENCE_MAX_AGE_MS) errors.push(`${label} manual proof is older than 30 days.`);
  }

  const artifactPath = String(gate.artifactPath || '').replace(/\\/g, '/');
  if (!artifactPath.startsWith('launch_package/artifacts/')) {
    errors.push(`${label} artifactPath must be inside launch_package/artifacts/.`);
    return errors;
  }
  const absolutePath = path.resolve(root, artifactPath);
  const relativeToRoot = path.relative(artifactRoot, absolutePath).replace(/\\/g, '/');
  if (!relativeToRoot || relativeToRoot.startsWith('../') || path.isAbsolute(relativeToRoot)) {
    errors.push(`${label} artifactPath escapes launch_package/artifacts/.`);
    return errors;
  }
  if (!existsSync(absolutePath)) {
    errors.push(`${label} artifact is missing: ${artifactPath}`);
    return errors;
  }

  const stat = statSync(absolutePath);
  if (!stat.isFile() || stat.size <= 0) errors.push(`${label} artifact must be a non-empty regular file.`);
  if (!Number.isInteger(gate.artifactBytes) || gate.artifactBytes !== stat.size) {
    errors.push(`${label} artifactBytes does not match the artifact.`);
  }

  const expectedHash = String(gate.artifactHash || '').toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedHash)) {
    errors.push(`${label} artifactHash must be a sha256 digest.`);
  } else {
    const actualHash = `sha256:${sha256File(absolutePath)}`;
    if (actualHash !== expectedHash) errors.push(`${label} artifact hash mismatch.`);
  }
  return errors;
}


// The hard-clearance reconciler (reconcile-hard-public-evidence.mjs) fills
// exactly one physical gate, requiredDeviceGates.technicianGpsTracking, from the
// protected Technician Physical Evidence workflow instead of a Command Center
// manual record. Accept that exact attestation shape for that one gate only;
// every other gate keeps the strict manual-artifact contract above.
const PROTECTED_TECHNICIAN_GATE = 'requiredDeviceGates.technicianGpsTracking';
const PROTECTED_TECHNICIAN_SOURCE = 'protected-technician-operational-evidence';
const PROTECTED_TECHNICIAN_TESTER = 'Technician Physical Evidence workflow';

function isProtectedTechnicianAttestation(gate) {
  return gate?.evidenceType === 'physical-device-report';
}

function validateProtectedTechnicianArtifact(groupName, name, gate) {
  const label = `${groupName}.${name}`;
  if (label !== PROTECTED_TECHNICIAN_GATE) {
    return [`${label} physical-device-report evidence is accepted only for ${PROTECTED_TECHNICIAN_GATE}; manual-artifact proof is required.`];
  }

  const errors = [];
  if (gate.evidenceType !== 'physical-device-report') errors.push(`${label} evidenceType must be physical-device-report.`);
  if (gate.executionGenerated !== true) errors.push(`${label} executionGenerated must equal true for protected technician proof.`);
  if (gate.hardLaunchClaim !== false) errors.push(`${label} hardLaunchClaim must remain false.`);
  if (String(gate.evidenceLayerRequired || '') !== 'physical_device') {
    errors.push(`${label} protected technician proof is allowed only for a physical_device gate.`);
  }
  if (String(gate.commitSha || '').toLowerCase() !== sha) errors.push(`${label} protected technician proof belongs to a different commit SHA.`);
  if (String(gate.releaseSha || '').toLowerCase() !== sha) errors.push(`${label} protected technician proof releaseSha mismatch.`);
  const controlPlaneSha = String(gate.controlPlaneCommitSha || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(controlPlaneSha)) {
    errors.push(`${label} controlPlaneCommitSha must be a full lowercase SHA.`);
  }
  const expectedControlPlaneSha = String(process.env.CLEARANCE_CONTROL_PLANE_SHA || '').trim().toLowerCase();
  if (expectedControlPlaneSha && controlPlaneSha !== expectedControlPlaneSha) {
    errors.push(`${label} protected technician proof control-plane SHA mismatch.`);
  }
  if (String(gate.testedBy || '') !== PROTECTED_TECHNICIAN_TESTER) {
    errors.push(`${label} protected technician proof testedBy provenance mismatch.`);
  }
  if (!proofText(gate)) errors.push(`${label} protected technician proof text is required.`);

  const testedAt = Date.parse(String(gate.testedAt || ''));
  if (!Number.isFinite(testedAt)) {
    errors.push(`${label} testedAt must be a valid ISO timestamp.`);
  } else {
    if (testedAt > Date.now() + MAX_CLOCK_SKEW_MS) errors.push(`${label} testedAt is in the future.`);
    if (Date.now() - testedAt > MANUAL_EVIDENCE_MAX_AGE_MS) errors.push(`${label} protected technician proof is older than 30 days.`);
  }

  const artifactPath = String(gate.artifactPath || '').replace(/\\/g, '/');
  const expectedArtifactPath = `launch_package/artifacts/physical-evidence-${name}-protected-technician.json`;
  if (artifactPath !== expectedArtifactPath) {
    errors.push(`${label} artifactPath must be ${expectedArtifactPath}.`);
    return errors;
  }
  const absolutePath = path.resolve(root, artifactPath);
  const relativeToRoot = path.relative(artifactRoot, absolutePath).replace(/\\/g, '/');
  if (!relativeToRoot || relativeToRoot.startsWith('../') || path.isAbsolute(relativeToRoot)) {
    errors.push(`${label} artifactPath escapes launch_package/artifacts/.`);
    return errors;
  }
  if (!existsSync(absolutePath)) {
    errors.push(`${label} artifact is missing: ${artifactPath}`);
    return errors;
  }

  const stat = statSync(absolutePath);
  if (!stat.isFile() || stat.size <= 0) {
    errors.push(`${label} artifact must be a non-empty regular file.`);
    return errors;
  }
  if (!Number.isInteger(gate.artifactBytes) || gate.artifactBytes !== stat.size) {
    errors.push(`${label} artifactBytes does not match the artifact.`);
  }
  const expectedHash = String(gate.artifactHash || '').toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedHash)) {
    errors.push(`${label} artifactHash must be a sha256 digest.`);
  } else if (`sha256:${sha256File(absolutePath)}` !== expectedHash) {
    errors.push(`${label} artifact hash mismatch.`);
  }

  let attestation;
  try {
    attestation = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch {
    errors.push(`${label} protected technician attestation is not valid JSON.`);
    return errors;
  }
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    errors.push(`${label} protected technician attestation must be a JSON object.`);
    return errors;
  }
  if (attestation.source !== PROTECTED_TECHNICIAN_SOURCE) errors.push(`${label} attestation source must be ${PROTECTED_TECHNICIAN_SOURCE}.`);
  if (attestation.status !== 'passed') errors.push(`${label} attestation status must be passed.`);
  if (attestation.evidenceLayer !== 'physical_device') errors.push(`${label} attestation evidenceLayer must be physical_device.`);
  if (attestation.gateKey !== label) errors.push(`${label} attestation gateKey mismatch.`);
  if (String(attestation.releaseSha || '').toLowerCase() !== sha) errors.push(`${label} attestation releaseSha mismatch.`);
  if (String(attestation.controlPlaneCommitSha || '').toLowerCase() !== controlPlaneSha) {
    errors.push(`${label} attestation controlPlaneCommitSha mismatch.`);
  }
  if (attestation.testerName !== PROTECTED_TECHNICIAN_TESTER) errors.push(`${label} attestation testerName provenance mismatch.`);
  if (attestation.hardLaunchClaim !== false) errors.push(`${label} attestation hardLaunchClaim must remain false.`);
  if (String(attestation.testedAt || '') !== String(gate.testedAt || '')) errors.push(`${label} attestation testedAt mismatch.`);
  if (!String(attestation.proofRef || '').trim()) errors.push(`${label} attestation proofRef is required.`);
  return errors;
}

function validateProtectedExecutionArtifact(groupName, name, gate) {
  const label = `${groupName}.${name}`;
  const errors = [];
  if (gate.evidenceType !== 'protected-execution') errors.push(`${label} evidenceType must be protected-execution.`);
  if (gate.executionGenerated !== true) errors.push(`${label} executionGenerated must equal true.`);
  if (gate.hardLaunchClaim !== false) errors.push(`${label} hardLaunchClaim must remain false.`);
  if (String(gate.commitSha || '').toLowerCase() !== sha) errors.push(`${label} protected proof belongs to a different commit SHA.`);
  if (String(gate.releaseSha || '').toLowerCase() !== sha) errors.push(`${label} protected proof releaseSha mismatch.`);
  const controlPlaneSha = String(gate.controlPlaneCommitSha || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(controlPlaneSha)) errors.push(`${label} controlPlaneCommitSha must be a full lowercase SHA.`);
  if (String(gate.reconciledByWorkflow || '') !== 'Live Role Smoke Tests') {
    errors.push(`${label} protected proof workflow provenance mismatch.`);
  }
  const reconciledAt = Date.parse(String(gate.reconciledAt || ''));
  if (!Number.isFinite(reconciledAt)) {
    errors.push(`${label} reconciledAt must be a valid ISO timestamp.`);
  } else {
    if (reconciledAt > Date.now() + MAX_CLOCK_SKEW_MS) errors.push(`${label} reconciledAt is in the future.`);
    if (Date.now() - reconciledAt > MANUAL_EVIDENCE_MAX_AGE_MS) errors.push(`${label} protected proof is older than 30 days.`);
  }
  if (String(gate.evidenceLayerRequired || '') !== 'hosted') {
    errors.push(`${label} protected execution reconciliation is allowed only for hosted gates.`);
  }
  if (!proofText(gate)) errors.push(`${label} protected execution proof text is required.`);
  return errors;
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
  const superseded = executionSupersedesLedger(groupName, name);
  const deferredForPilot = pilotDefersManualLedger(groupName, name);
  if (waivedBlocked && !superseded) {
    fail(waivedBlocked);
    return;
  }
  if (waivedBlocked && superseded) {
    warn(`${label} manual status is stale, but current-commit execution evidence supersedes it.`);
    return;
  }

  // A pending static ledger entry must not veto fresh protected exact-SHA
  // execution evidence during the controlled pilot. This exception is
  // deliberately pilot-only: malformed/unknown states still fail closed and
  // public-launch clearance keeps its stricter manual/provider requirements.
  if (isPilotMode && superseded && status === 'pending') {
    warn(`${label} remains pending in the static ledger, but protected current-commit execution evidence supersedes it for the controlled pilot only.`);
    return;
  }

  if (status === 'passed') {
    if (superseded) return;
    if (gate.evidenceType === 'protected-execution') {
      for (const error of validateProtectedExecutionArtifact(groupName, name, gate)) fail(error);
      return;
    }
    const manualErrors = isProtectedTechnicianAttestation(gate)
      ? validateProtectedTechnicianArtifact(groupName, name, gate)
      : validateManualArtifact(groupName, name, gate);
    if (deferredForPilot) {
      if (manualErrors.length) {
        warn(`${label} manual record is not current-commit proof and remains deferred for the controlled pilot.`);
      }
      return;
    }
    if (!proofText(gate)) fail(`${label} is marked passed but has no proof text.`);
    for (const error of manualErrors) fail(error);
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

  if (required && deferredForPilot) {
    warn(`${label} remains pending for the controlled pilot and must pass before public launch.`);
  } else if (required) {
    fail(`${name} is not launch-clear. Current status: ${gate.status || 'missing'}`);
  }
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
  // Clearance is an eligibility check, not the signed final launch decision.
  // Only hard-launch-decision-gate.mjs may emit hardLaunchClaim=true.
  hardLaunchClaim = false;
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