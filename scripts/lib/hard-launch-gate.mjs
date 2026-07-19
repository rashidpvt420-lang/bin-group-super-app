#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION,
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  readJsonSafe,
  sha256File,
} from './launch-honesty.mjs';
import { getAuthorizedApprovers } from './authorized-approvers.mjs';

export const HARD_LAUNCH_APPROVAL_RELATIVE = 'launch_package/hard-launch-approval.json';
export const PILOT_INCIDENT_REPORT_RELATIVE = 'launch_package/pilot-incident-report.json';
export const OPERATIONAL_READINESS_RELATIVE = 'launch_package/operational-readiness.json';
export const HARD_LAUNCH_STATUS_RELATIVE = 'launch_package/hard-launch-status.json';
export const HARD_LAUNCH_CONFIRMATION_PHRASE = 'AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP';
export const INCIDENT_CONFIRMATION_PHRASE = 'NO_OPEN_P0_P1';
export const ROLLBACK_CONFIRMATION_PHRASE = 'ROLLBACK_PLAN_VERIFIED';

export const EXPECTED_GITHUB_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
export const EXPECTED_GITHUB_REF = 'refs/heads/main';
export const EXPECTED_CLEARANCE_WORKFLOW = 'Live Role Smoke Tests';
export const EXPECTED_CLEARANCE_JOB = 'hard-public-launch-clearance';

export const MIN_PILOT_DURATION_MS = 24 * 60 * 60 * 1000;
export const MAX_APPROVAL_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_OPERATIONAL_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PILOT_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const REQUIRED_OPERATIONAL_GATES = Object.freeze([
  'ownerPaymentActivation',
  'paymentUnlockExactlyOnce',
  'tenantNotificationDelivery',
  'technicianPhysicalGpsEvidence',
  'brokerCommissionLockExactlyOnce',
  'adminStaffClaims',
  'stripeLiveBilling',
  'appCheckEnforcement',
  'privilegedAccessRotation',
  'brandedEmailDelivery',
  'renewalScheduler',
]);

export const GATE_EVIDENCE_REQUIREMENTS = Object.freeze({
  ownerPaymentActivation: new Set(['production-transaction']),
  paymentUnlockExactlyOnce: new Set(['production-transaction']),
  tenantNotificationDelivery: new Set(['production-transaction', 'workflow-artifact']),
  technicianPhysicalGpsEvidence: new Set(['physical-device-report']),
  brokerCommissionLockExactlyOnce: new Set(['production-transaction']),
  adminStaffClaims: new Set(['workflow-artifact', 'provider-console-export']),
  stripeLiveBilling: new Set(['production-transaction', 'provider-console-export']),
  appCheckEnforcement: new Set(['provider-console-export', 'workflow-artifact']),
  privilegedAccessRotation: new Set(['secret-rotation-record']),
  brandedEmailDelivery: new Set(['provider-console-export', 'workflow-artifact']),
  renewalScheduler: new Set(['scheduler-run']),
});

export const GATE_SOURCE_SYSTEM_PATTERNS = Object.freeze({
  ownerPaymentActivation: [/firebase.*payment.*activation/i],
  paymentUnlockExactlyOnce: [/firebase.*adminapprovepayment.*replay/i],
  tenantNotificationDelivery: [/firebase.*notification.*fcm/i, /email.*delivery/i],
  technicianPhysicalGpsEvidence: [/firebase.*technician.*device.*storage/i, /physical.*device.*gps/i],
  brokerCommissionLockExactlyOnce: [/firebase.*broker.*commission.*replay/i],
  adminStaffClaims: [/firebase.*auth.*staff/i],
  stripeLiveBilling: [/stripe/i],
  appCheckEnforcement: [/firebase.*app\s*check/i, /app\s*check.*firebase/i],
  privilegedAccessRotation: [/google.*secret.*firebase.*authentication/i, /secret.*rotation/i],
  brandedEmailDelivery: [/email|mail|postmark|sendgrid|smtp/i],
  renewalScheduler: [/firebase.*renewal.*watcher/i, /cloud.*scheduler/i],
});

const DEFAULT_EVIDENCE_HOSTS = Object.freeze([
  'github.com',
  'api.github.com',
  'console.firebase.google.com',
  'console.cloud.google.com',
  'dashboard.stripe.com',
  'app.postmarkapp.com',
  'app.sendgrid.com',
]);

export function hardLaunchApprovalPath(root = process.cwd()) {
  return path.join(root, HARD_LAUNCH_APPROVAL_RELATIVE);
}

export function pilotIncidentReportPath(root = process.cwd()) {
  return path.join(root, PILOT_INCIDENT_REPORT_RELATIVE);
}

export function operationalReadinessPath(root = process.cwd()) {
  return path.join(root, OPERATIONAL_READINESS_RELATIVE);
}

export function hardLaunchStatusPath(root = process.cwd()) {
  return path.join(root, HARD_LAUNCH_STATUS_RELATIVE);
}

function parseTime(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : NaN;
}

function isSha256(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || '').trim());
}

function isCommitSha(value) {
  return /^[0-9a-f]{40}$/.test(String(value || '').trim());
}

function approvedHosts(env = process.env) {
  const extra = String(env?.HARD_LAUNCH_ALLOWED_EVIDENCE_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_EVIDENCE_HOSTS, ...extra]);
}

export function parseApprovedEvidenceUrl(value, { env = process.env } = {}) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return null;
    if (!approvedHosts(env).has(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}

function actorAuthorizationErrors(actor, env = process.env) {
  try {
    const actors = getAuthorizedApprovers(env);
    if (!actors.length) return ['AUTHORIZED_FOUNDER_ACTORS must contain at least one protected GitHub actor'];
    if (!actors.includes(String(actor || '').trim())) return ['approver is not authorized'];
    return [];
  } catch (error) {
    return [String(error?.message || error)];
  }
}

export function isAuthorizedHardLaunchActor(actor, env = process.env) {
  return actorAuthorizationErrors(actor, env).length === 0;
}

// Backward-compatible dynamic facade. It never stores a hardcoded actor list.
export const AUTHORIZED_HARD_LAUNCH_ACTORS = Object.freeze({
  includes(actor) {
    return isAuthorizedHardLaunchActor(actor, process.env);
  },
});

function registerUnique(map, value, gateKey, label, errors, normalize = (entry) => String(entry || '').trim().toLowerCase()) {
  const normalized = normalize(value);
  if (!normalized) return;
  const previousGate = map.get(normalized);
  if (previousGate && previousGate !== gateKey) {
    errors.push(`${gateKey}.${label} is already used by ${previousGate}`);
    return;
  }
  map.set(normalized, gateKey);
}

function validateGateSourceSystem(key, value, errors) {
  const sourceSystem = String(value || '').trim();
  if (!sourceSystem) {
    errors.push(`${key}.sourceSystem required`);
    return;
  }
  const patterns = GATE_SOURCE_SYSTEM_PATTERNS[key] || [];
  if (!patterns.some((pattern) => pattern.test(sourceSystem))) {
    errors.push(`${key}.sourceSystem is not accepted for this gate`);
  }
}

function validateEvidenceReference(key, gate, errors, env) {
  const url = parseApprovedEvidenceUrl(gate.evidenceReference, { env });
  if (!url) {
    errors.push(`${key}.evidenceReference must be an HTTPS URL on an approved evidence host`);
    return null;
  }
  if (url.hostname.toLowerCase() === 'github.com') {
    const runMatch = url.pathname.match(/^\/rashidpvt420-lang\/bin-group-super-app\/actions\/runs\/(\d+)\/?$/);
    if (!runMatch) errors.push(`${key}.evidenceReference must target the protected repository workflow run`);
    else if (runMatch[1] !== String(gate.sourceWorkflowRunId || '')) {
      errors.push(`${key}.evidenceReference run ID must equal sourceWorkflowRunId`);
    }
  }
  return url;
}

export function validateProtectedHardLaunchWorkflowContext(env = process.env) {
  const errors = [];
  if (env.GITHUB_ACTIONS !== 'true') errors.push('validator must run in GitHub Actions');
  if (env.GITHUB_REPOSITORY !== EXPECTED_GITHUB_REPOSITORY) errors.push('validator repository mismatch');
  if (env.GITHUB_REF !== EXPECTED_GITHUB_REF) errors.push('validator requires refs/heads/main');
  if (env.GITHUB_WORKFLOW !== EXPECTED_CLEARANCE_WORKFLOW) errors.push(`validator requires ${EXPECTED_CLEARANCE_WORKFLOW}`);
  if (env.GITHUB_JOB !== EXPECTED_CLEARANCE_JOB) errors.push(`validator requires ${EXPECTED_CLEARANCE_JOB}`);
  if (!/^\d+$/.test(String(env.GITHUB_RUN_ID || ''))) errors.push('validator requires a numeric GITHUB_RUN_ID');
  if (!isCommitSha(env.GITHUB_SHA)) errors.push('validator requires a lowercase 40-character GITHUB_SHA');
  errors.push(...actorAuthorizationErrors(env.GITHUB_ACTOR, env));
  return [...new Set(errors)];
}

export function validateOperationalReadinessReport(doc, commitSha, { now = Date.now(), env = process.env } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['operational-readiness.json missing or malformed'];
  if (!isCommitSha(commitSha)) errors.push('current commit SHA must be a lowercase 40-character SHA');
  if (doc.schemaVersion !== 1) errors.push('operational readiness schemaVersion must be 1');
  if (doc.status !== 'passed') errors.push('operational readiness status must be passed');
  if (doc.commitSha !== commitSha) errors.push('operational readiness commitSha must equal current commit SHA');
  if (doc.projectId !== PRODUCTION.projectId) errors.push(`operational readiness projectId must be ${PRODUCTION.projectId}`);
  if (doc.source !== 'firestore-system-health-admin-summaries') errors.push('operational readiness source mismatch');
  if (doc.generatedByWorkflow !== true) errors.push('operational readiness snapshot must be workflow-generated');
  if (doc.githubRepository !== EXPECTED_GITHUB_REPOSITORY) errors.push('operational readiness githubRepository mismatch');
  if (doc.githubRef !== EXPECTED_GITHUB_REF) errors.push('operational readiness githubRef must be refs/heads/main');
  if (!/^\d+$/.test(String(doc.githubRunId || ''))) errors.push('operational readiness githubRunId must be numeric');

  const gates = doc.gates && typeof doc.gates === 'object' ? doc.gates : {};
  const seenReferences = new Map();
  const seenArtifactHashes = new Map();
  const seenSourceProofHashes = new Map();

  for (const key of REQUIRED_OPERATIONAL_GATES) {
    const gate = gates[key];
    if (!gate || typeof gate !== 'object') {
      errors.push(`operational gate missing: ${key}`);
      continue;
    }
    if (gate.status !== 'passed') errors.push(`${key}.status must be passed`);
    if (gate.commitSha !== commitSha) errors.push(`${key}.commitSha must equal current commit SHA`);
    if (gate.projectId !== PRODUCTION.projectId) errors.push(`${key}.projectId mismatch`);

    const allowedTypes = GATE_EVIDENCE_REQUIREMENTS[key];
    if (!allowedTypes?.has(String(gate.evidenceType || ''))) {
      errors.push(`${key}.evidenceType is not accepted for this gate`);
    }

    const evidenceUrl = validateEvidenceReference(key, gate, errors, env);
    if (!isSha256(gate.artifactHash)) errors.push(`${key}.artifactHash must be SHA-256`);
    if (!isSha256(gate.sourceProofHash)) errors.push(`${key}.sourceProofHash must be SHA-256`);
    validateGateSourceSystem(key, gate.sourceSystem, errors);
    if (!/^\d+$/.test(String(gate.sourceWorkflowRunId || ''))) errors.push(`${key}.sourceWorkflowRunId must be numeric`);
    if (!/^\d+$/.test(String(gate.workflowRunId || ''))) errors.push(`${key}.workflowRunId must be numeric`);
    if (gate.githubRepository !== EXPECTED_GITHUB_REPOSITORY) errors.push(`${key}.githubRepository mismatch`);
    if (gate.verifiedBy !== 'workflow') errors.push(`${key}.verifiedBy must be workflow`);

    if (evidenceUrl) registerUnique(seenReferences, evidenceUrl.href, key, 'evidenceReference', errors);
    if (isSha256(gate.artifactHash)) registerUnique(seenArtifactHashes, gate.artifactHash, key, 'artifactHash', errors);
    if (isSha256(gate.sourceProofHash)) registerUnique(seenSourceProofHashes, gate.sourceProofHash, key, 'sourceProofHash', errors);

    const observedAt = parseTime(gate.observedAt);
    const verifiedAt = parseTime(gate.verifiedAt);
    if (!Number.isFinite(observedAt)) errors.push(`${key}.observedAt must be a valid timestamp`);
    else {
      if (observedAt > now + 5 * 60 * 1000) errors.push(`${key}.observedAt cannot be in the future`);
      if (now - observedAt > MAX_OPERATIONAL_EVIDENCE_AGE_MS) errors.push(`${key} source proof is older than 7 days`);
    }
    if (!Number.isFinite(verifiedAt)) errors.push(`${key}.verifiedAt must be a valid timestamp`);
    else {
      if (verifiedAt > now + 5 * 60 * 1000) errors.push(`${key}.verifiedAt cannot be in the future`);
      if (now - verifiedAt > MAX_OPERATIONAL_EVIDENCE_AGE_MS) errors.push(`${key} evidence is older than 7 days`);
    }
    if (Number.isFinite(observedAt) && Number.isFinite(verifiedAt) && observedAt > verifiedAt) {
      errors.push(`${key}.observedAt cannot occur after verifiedAt`);
    }
  }
  return [...new Set(errors)];
}

export function validatePilotIncidentReport(doc, commitSha, { now = Date.now(), env = process.env } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['pilot-incident-report.json missing or malformed'];
  if (doc.schemaVersion !== 1) errors.push('pilot incident schemaVersion must be 1');
  if (doc.status !== 'passed') errors.push('pilot incident status must be passed');
  if (doc.commitSha !== commitSha) errors.push('pilot incident commitSha must equal current commit SHA');
  if (doc.projectId !== PRODUCTION.projectId) errors.push(`pilot incident projectId must be ${PRODUCTION.projectId}`);
  if (doc.generatedByWorkflow !== true) errors.push('pilot incident report must be workflow-generated');
  if (doc.source !== 'hard-public-launch-clearance-workflow') errors.push('pilot incident report source mismatch');
  if (doc.githubRepository !== EXPECTED_GITHUB_REPOSITORY) errors.push('pilot incident githubRepository mismatch');
  if (doc.githubRef !== EXPECTED_GITHUB_REF) errors.push('pilot incident githubRef must be refs/heads/main');
  if (!/^\d+$/.test(String(doc.githubRunId || ''))) errors.push('pilot incident githubRunId must be numeric');
  const actorErrors = actorAuthorizationErrors(doc.approvedBy, env);
  if (actorErrors.length) errors.push(...actorErrors.map((error) => `pilot incident ${error}`));
  if (Number(doc.openP0) !== 0) errors.push('openP0 must equal 0');
  if (Number(doc.openP1) !== 0) errors.push('openP1 must equal 0');
  if (doc.rollbackPlanVerified !== true) errors.push('rollbackPlanVerified must be true');
  if (doc.monitoringVerified !== true) errors.push('monitoringVerified must be true');
  if (doc.incidentConfirmationVerified !== true) errors.push('pilot incident confirmation was not verified');
  if (doc.rollbackConfirmationVerified !== true) errors.push('rollback confirmation was not verified');
  if (!parseApprovedEvidenceUrl(doc.incidentReference, { env })) errors.push('incidentReference must be an approved HTTPS URL');
  if (!parseApprovedEvidenceUrl(doc.rollbackReference, { env })) errors.push('rollbackReference must be an approved HTTPS URL');
  if (!parseApprovedEvidenceUrl(doc.monitoringReference, { env })) errors.push('monitoringReference must be an approved HTTPS URL');

  const started = parseTime(doc.pilotStartedAt);
  const completed = parseTime(doc.pilotCompletedAt);
  if (!Number.isFinite(started)) errors.push('pilotStartedAt must be a valid timestamp');
  if (!Number.isFinite(completed)) errors.push('pilotCompletedAt must be a valid timestamp');
  if (Number.isFinite(started) && Number.isFinite(completed)) {
    if (completed <= started) errors.push('pilotCompletedAt must be after pilotStartedAt');
    if (completed - started < MIN_PILOT_DURATION_MS) errors.push('controlled pilot must run for at least 24 hours');
    if (completed > now + 5 * 60 * 1000) errors.push('pilotCompletedAt cannot be in the future');
    if (now - completed > MAX_PILOT_AGE_MS) errors.push('pilot completed too long ago; max freshness exceeded');
  }
  return [...new Set(errors)];
}

export function validateHardLaunchApprovalDocument(doc, commitSha, { root = process.cwd(), now = Date.now(), env = process.env } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['hard-launch-approval.json missing or malformed'];
  if (doc.schemaVersion !== 1) errors.push('hard launch approval schemaVersion must be 1');
  if (doc.status !== 'approved') errors.push('hard launch approval status must be approved');
  if (doc.releaseDecision !== 'HARD_PUBLIC_LAUNCH_PREREQUISITES_APPROVED') errors.push('releaseDecision must be HARD_PUBLIC_LAUNCH_PREREQUISITES_APPROVED');
  if (doc.hardLaunchClaim !== false) errors.push('hardLaunchClaim must remain false before the signed final decision');
  if (doc.commitSha !== commitSha) errors.push('hard launch approval commitSha must equal current commit SHA');
  if (doc.deployedCommitSha !== commitSha) errors.push('deployedCommitSha must equal current commit SHA');
  if (doc.projectId !== PRODUCTION.projectId) errors.push(`projectId must be ${PRODUCTION.projectId}`);
  if (String(doc.mainUrl || '').replace(/\/+$/, '') !== PRODUCTION.mainUrl) errors.push('mainUrl mismatch');
  if (String(doc.adminUrl || '').replace(/\/+$/, '') !== PRODUCTION.adminUrl) errors.push('adminUrl mismatch');
  if (doc.generatedByWorkflow !== true) errors.push('hard launch approval must be workflow-generated');
  if (doc.source !== 'hard-public-launch-clearance-workflow') errors.push('hard launch approval source mismatch');
  if (doc.githubRepository !== EXPECTED_GITHUB_REPOSITORY) errors.push('githubRepository mismatch');
  if (doc.githubRef !== EXPECTED_GITHUB_REF) errors.push('githubRef must be refs/heads/main');
  if (!/^\d+$/.test(String(doc.githubRunId || ''))) errors.push('githubRunId must be numeric');
  const actorErrors = actorAuthorizationErrors(doc.approvedBy, env);
  if (actorErrors.length) errors.push(...actorErrors.map((error) => `hard launch ${error}`));
  if (doc.founderApproval !== true) errors.push('founderApproval must be true');
  if (doc.confirmationVerified !== true) errors.push('hard launch confirmation was not verified');
  if (doc.pilotEligibleAtApproval !== true) errors.push('pilotEligibleAtApproval must be true');
  if (doc.operationalReadinessAtApproval !== true) errors.push('operationalReadinessAtApproval must be true');
  if (doc.noOpenP0P1 !== true) errors.push('noOpenP0P1 must be true');
  if (doc.rollbackPlanVerified !== true) errors.push('rollbackPlanVerified must be true');
  if (doc.monitoringVerified !== true) errors.push('monitoringVerified must be true');

  const approvedAt = parseTime(doc.approvedAt);
  if (!Number.isFinite(approvedAt)) errors.push('approvedAt must be a valid timestamp');
  else {
    if (approvedAt > now + 5 * 60 * 1000) errors.push('approvedAt cannot be in the future');
    if (now - approvedAt > MAX_APPROVAL_AGE_MS) errors.push('hard launch approval is older than 24 hours');
  }

  const hashBindings = [
    ['deploymentHash', deploymentEvidencePath(root)],
    ['evidenceBatchHash', evidencePath(root)],
    ['incidentReportHash', pilotIncidentReportPath(root)],
    ['operationalReadinessHash', operationalReadinessPath(root)],
  ];
  for (const [field, file] of hashBindings) {
    if (!existsSync(file)) {
      errors.push(`${path.basename(file)} missing for approval hash binding`);
      continue;
    }
    const actual = sha256File(file);
    if (!doc[field] || doc[field] !== actual) errors.push(`${field} mismatch`);
  }
  return [...new Set(errors)];
}

export function evaluateHardLaunchEligibility({
  evidenceBatch,
  deploymentDoc,
  incidentReport,
  operationalReport,
  approvalDoc,
  commitSha,
  root = process.cwd(),
  now = Date.now(),
  env = process.env,
} = {}) {
  const pilot = evaluatePilotEligibility({ evidenceBatch, deploymentDoc, commitSha, root, now });
  const resolvedOperationalReport = operationalReport === undefined
    ? readJsonSafe(operationalReadinessPath(root), null)
    : operationalReport;
  const errors = [];
  if (!pilot.pilotEligible) {
    errors.push(...pilot.missing.map((key) => `pilot evidence missing: ${key}`));
    errors.push(...pilot.invalid.map((item) => `pilot evidence invalid: ${item}`));
  }
  errors.push(...validateOperationalReadinessReport(resolvedOperationalReport, commitSha, { now, env }));
  errors.push(...validatePilotIncidentReport(incidentReport, commitSha, { now, env }));
  errors.push(...validateHardLaunchApprovalDocument(approvalDoc, commitSha, { root, now, env }));
  const hardLaunchEligible = pilot.pilotEligible && errors.length === 0;
  return {
    hardLaunchEligible,
    hardLaunchClaim: false,
    pilotEligible: pilot.pilotEligible,
    pilot,
    errors: [...new Set(errors)],
  };
}

export function readHardLaunchInputs(root = process.cwd()) {
  return {
    evidenceBatch: readJsonSafe(evidencePath(root), { records: [] }),
    deploymentDoc: readJsonSafe(deploymentEvidencePath(root), null),
    incidentReport: readJsonSafe(pilotIncidentReportPath(root), null),
    operationalReport: readJsonSafe(operationalReadinessPath(root), null),
    approvalDoc: readJsonSafe(hardLaunchApprovalPath(root), null),
  };
}

const directPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (directPath && directPath === fileURLToPath(import.meta.url)) {
  const contextErrors = validateProtectedHardLaunchWorkflowContext(process.env);
  if (contextErrors.length) {
    console.error('[hard-launch-validator] REFUSED — protected workflow context failed');
    for (const error of contextErrors) console.error(`- ${error}`);
    process.exit(1);
  }
  const commitSha = String(process.env.GITHUB_SHA || '').trim();
  const result = evaluateHardLaunchEligibility({
    ...readHardLaunchInputs(process.cwd()),
    commitSha,
    root: process.cwd(),
    env: process.env,
  });
  if (!result.hardLaunchEligible) {
    console.error('[hard-launch-validator] NO-GO');
    for (const error of result.errors) console.error(`- ${error}`);
    console.error('hardLaunchClaim=false');
    process.exit(1);
  }
  console.log('[hard-launch-validator] READY FOR FINAL SIGNED DECISION');
  console.log('hardLaunchClaim=false');
}
