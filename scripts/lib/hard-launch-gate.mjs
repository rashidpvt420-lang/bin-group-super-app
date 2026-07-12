#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  PRODUCTION,
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  readJsonSafe,
  sha256File,
} from './launch-honesty.mjs';

export const HARD_LAUNCH_APPROVAL_RELATIVE = 'launch_package/hard-launch-approval.json';
export const PILOT_INCIDENT_REPORT_RELATIVE = 'launch_package/pilot-incident-report.json';
export const OPERATIONAL_READINESS_RELATIVE = 'launch_package/operational-readiness.json';
export const HARD_LAUNCH_STATUS_RELATIVE = 'launch_package/hard-launch-status.json';
export const HARD_LAUNCH_CONFIRMATION_PHRASE = 'AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP';
export const INCIDENT_CONFIRMATION_PHRASE = 'NO_OPEN_P0_P1';
export const ROLLBACK_CONFIRMATION_PHRASE = 'ROLLBACK_PLAN_VERIFIED';
export const AUTHORIZED_HARD_LAUNCH_ACTORS = Object.freeze(['rashidpvt420-lang']);
export const MIN_PILOT_DURATION_MS = 24 * 60 * 60 * 1000;
export const MAX_APPROVAL_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_OPERATIONAL_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

const ALLOWED_OPERATIONAL_EVIDENCE_TYPES = new Set([
  'workflow-artifact',
  'provider-console-export',
  'production-transaction',
  'physical-device-report',
  'secret-rotation-record',
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

function hasReference(value) {
  return String(value || '').trim().length >= 6;
}

function isAuthorizedActor(actor) {
  return AUTHORIZED_HARD_LAUNCH_ACTORS.includes(String(actor || '').trim());
}

function isSha256(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || '').trim());
}

export function validateOperationalReadinessReport(doc, commitSha, { now = Date.now() } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['operational-readiness.json missing or malformed'];
  if (doc.schemaVersion !== 1) errors.push('operational readiness schemaVersion must be 1');
  if (doc.status !== 'passed') errors.push('operational readiness status must be passed');
  if (doc.commitSha !== commitSha) errors.push('operational readiness commitSha must equal current commit SHA');
  if (doc.projectId !== PRODUCTION.projectId) errors.push(`operational readiness projectId must be ${PRODUCTION.projectId}`);
  if (doc.source !== 'firestore-system-health-admin-summaries') errors.push('operational readiness source mismatch');
  if (doc.generatedByWorkflow !== true) errors.push('operational readiness snapshot must be workflow-generated');
  if (doc.githubRepository !== 'rashidpvt420-lang/bin-group-super-app') errors.push('operational readiness githubRepository mismatch');
  if (doc.githubRef !== 'refs/heads/main') errors.push('operational readiness githubRef must be refs/heads/main');
  if (!doc.githubRunId) errors.push('operational readiness githubRunId required');

  const gates = doc.gates && typeof doc.gates === 'object' ? doc.gates : {};
  for (const key of REQUIRED_OPERATIONAL_GATES) {
    const gate = gates[key];
    if (!gate || typeof gate !== 'object') {
      errors.push(`operational gate missing: ${key}`);
      continue;
    }
    if (gate.status !== 'passed') errors.push(`${key}.status must be passed`);
    if (gate.commitSha !== commitSha) errors.push(`${key}.commitSha must equal current commit SHA`);
    if (gate.projectId !== PRODUCTION.projectId) errors.push(`${key}.projectId mismatch`);
    if (!ALLOWED_OPERATIONAL_EVIDENCE_TYPES.has(String(gate.evidenceType || ''))) {
      errors.push(`${key}.evidenceType is not accepted`);
    }
    if (!hasReference(gate.evidenceReference)) errors.push(`${key}.evidenceReference required`);
    if (!isSha256(gate.artifactHash)) errors.push(`${key}.artifactHash must be SHA-256`);
    if (!isSha256(gate.sourceProofHash)) errors.push(`${key}.sourceProofHash must be SHA-256`);
    if (!hasReference(gate.sourceSystem)) errors.push(`${key}.sourceSystem required`);
    if (!/^\d+$/.test(String(gate.sourceWorkflowRunId || ''))) errors.push(`${key}.sourceWorkflowRunId must be numeric`);
    if (!gate.workflowRunId) errors.push(`${key}.workflowRunId required`);
    if (gate.verifiedBy !== 'workflow') errors.push(`${key}.verifiedBy must be workflow`);

    const observedAt = parseTime(gate.observedAt);
    if (!Number.isFinite(observedAt)) errors.push(`${key}.observedAt must be a valid timestamp`);
    else {
      if (observedAt > now + 5 * 60 * 1000) errors.push(`${key}.observedAt cannot be in the future`);
      if (now - observedAt > MAX_OPERATIONAL_EVIDENCE_AGE_MS) errors.push(`${key} source proof is older than 7 days`);
    }

    const verifiedAt = parseTime(gate.verifiedAt);
    if (!Number.isFinite(verifiedAt)) errors.push(`${key}.verifiedAt must be a valid timestamp`);
    else {
      if (verifiedAt > now + 5 * 60 * 1000) errors.push(`${key}.verifiedAt cannot be in the future`);
      if (now - verifiedAt > MAX_OPERATIONAL_EVIDENCE_AGE_MS) errors.push(`${key} evidence is older than 7 days`);
    }
  }
  return [...new Set(errors)];
}

export function validatePilotIncidentReport(doc, commitSha, { now = Date.now() } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['pilot-incident-report.json missing or malformed'];
  if (doc.schemaVersion !== 1) errors.push('pilot incident schemaVersion must be 1');
  if (doc.status !== 'passed') errors.push('pilot incident status must be passed');
  if (doc.commitSha !== commitSha) errors.push('pilot incident commitSha must equal current commit SHA');
  if (doc.projectId !== PRODUCTION.projectId) errors.push(`pilot incident projectId must be ${PRODUCTION.projectId}`);
  if (doc.generatedByWorkflow !== true) errors.push('pilot incident report must be workflow-generated');
  if (doc.source !== 'hard-public-launch-clearance-workflow') errors.push('pilot incident report source mismatch');
  if (doc.githubRepository !== 'rashidpvt420-lang/bin-group-super-app') errors.push('pilot incident githubRepository mismatch');
  if (doc.githubRef !== 'refs/heads/main') errors.push('pilot incident githubRef must be refs/heads/main');
  if (!doc.githubRunId) errors.push('pilot incident githubRunId required');
  if (!isAuthorizedActor(doc.approvedBy)) errors.push('pilot incident approver is not authorized');
  if (Number(doc.openP0) !== 0) errors.push('openP0 must equal 0');
  if (Number(doc.openP1) !== 0) errors.push('openP1 must equal 0');
  if (doc.rollbackPlanVerified !== true) errors.push('rollbackPlanVerified must be true');
  if (doc.monitoringVerified !== true) errors.push('monitoringVerified must be true');
  if (doc.incidentConfirmationVerified !== true) errors.push('incident confirmation was not verified');
  if (doc.rollbackConfirmationVerified !== true) errors.push('rollback confirmation was not verified');
  if (!hasReference(doc.incidentReference)) errors.push('incidentReference required');
  if (!hasReference(doc.rollbackReference)) errors.push('rollbackReference required');
  if (!hasReference(doc.monitoringReference)) errors.push('monitoringReference required');

  const started = parseTime(doc.pilotStartedAt);
  const completed = parseTime(doc.pilotCompletedAt);
  if (!Number.isFinite(started)) errors.push('pilotStartedAt must be a valid timestamp');
  if (!Number.isFinite(completed)) errors.push('pilotCompletedAt must be a valid timestamp');
  if (Number.isFinite(started) && Number.isFinite(completed)) {
    if (completed <= started) errors.push('pilotCompletedAt must be after pilotStartedAt');
    if (completed - started < MIN_PILOT_DURATION_MS) errors.push('controlled pilot must run for at least 24 hours');
    if (completed > now + 5 * 60 * 1000) errors.push('pilotCompletedAt cannot be in the future');
  }
  return [...new Set(errors)];
}

export function validateHardLaunchApprovalDocument(doc, commitSha, { root = process.cwd(), now = Date.now() } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['hard-launch-approval.json missing or malformed'];
  if (doc.schemaVersion !== 1) errors.push('hard launch approval schemaVersion must be 1');
  if (doc.status !== 'approved') errors.push('hard launch approval status must be approved');
  if (doc.releaseDecision !== 'HARD_PUBLIC_LAUNCH_AUTHORIZED') errors.push('releaseDecision must be HARD_PUBLIC_LAUNCH_AUTHORIZED');
  if (doc.hardLaunchClaim !== true) errors.push('hardLaunchClaim must be true in final approval');
  if (doc.commitSha !== commitSha) errors.push('hard launch approval commitSha must equal current commit SHA');
  if (doc.deployedCommitSha !== commitSha) errors.push('deployedCommitSha must equal current commit SHA');
  if (doc.projectId !== PRODUCTION.projectId) errors.push(`projectId must be ${PRODUCTION.projectId}`);
  if (String(doc.mainUrl || '').replace(/\/+$/, '') !== PRODUCTION.mainUrl) errors.push('mainUrl mismatch');
  if (String(doc.adminUrl || '').replace(/\/+$/, '') !== PRODUCTION.adminUrl) errors.push('adminUrl mismatch');
  if (doc.generatedByWorkflow !== true) errors.push('hard launch approval must be workflow-generated');
  if (doc.source !== 'hard-public-launch-clearance-workflow') errors.push('hard launch approval source mismatch');
  if (doc.githubRepository !== 'rashidpvt420-lang/bin-group-super-app') errors.push('githubRepository mismatch');
  if (doc.githubRef !== 'refs/heads/main') errors.push('githubRef must be refs/heads/main');
  if (!doc.githubRunId) errors.push('githubRunId required');
  if (!isAuthorizedActor(doc.approvedBy)) errors.push('hard launch approver is not authorized');
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
  errors.push(...validateOperationalReadinessReport(resolvedOperationalReport, commitSha, { now }));
  errors.push(...validatePilotIncidentReport(incidentReport, commitSha, { now }));
  errors.push(...validateHardLaunchApprovalDocument(approvalDoc, commitSha, { root, now }));
  const hardLaunchEligible = pilot.pilotEligible && errors.length === 0;
  return {
    hardLaunchEligible,
    hardLaunchClaim: hardLaunchEligible,
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
