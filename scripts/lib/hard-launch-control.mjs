#!/usr/bin/env node

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const HARD_LAUNCH_CONTROL_SCHEMA = 1;
export const AUTHORIZATION_KIND = 'bin-group-hard-launch-authorization';
export const DECISION_KIND = 'bin-group-hard-launch-decision';
export const AUTHORIZATION_MAX_AGE_MS = 60 * 60 * 1000;
export const DECISION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DEPLOYMENT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const FUTURE_SKEW_MS = 5 * 60 * 1000;
export const RETRY_COOLDOWN_MS = 30 * 60 * 1000;
export const DEPLOY_CONFIRMATION_PHRASE = 'DEPLOY_PRODUCTION_BIN_GROUP_57C60';
export const HARD_LAUNCH_CONFIRMATION_PHRASE = 'AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP';
export const REQUIRED_DEPLOY_COMPONENTS = Object.freeze([
  'hosting',
  'firestoreRules',
  'firestoreIndexes',
  'storageRules',
  'functions',
]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function hmacDocument(payload, key) {
  return createHmac('sha256', key).update(canonicalJson(payload), 'utf8').digest('hex');
}

export function safeHexEqual(left, right) {
  if (!/^[0-9a-f]+$/i.test(String(left || '')) || !/^[0-9a-f]+$/i.test(String(right || ''))) {
    return false;
  }
  const a = Buffer.from(String(left), 'hex');
  const b = Buffer.from(String(right), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsignedDocument(document) {
  const { signature: _signature, ...payload } = document || {};
  return payload;
}

export function signDocument(payload, key) {
  if (typeof key !== 'string' || key.length < 32) {
    throw new Error('HARD_LAUNCH_APPROVAL_HMAC_KEY must contain at least 32 characters');
  }
  return {
    ...payload,
    signature: {
      algorithm: 'hmac-sha256',
      value: hmacDocument(payload, key),
    },
  };
}

export function parseCsvRequired(value, label) {
  const entries = String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!entries.length) throw new Error(`${label} must be configured and non-empty`);
  return [...new Set(entries)];
}

export function readJsonStrict(filePath, label = path.basename(filePath)) {
  if (!existsSync(filePath)) throw new Error(`${label} is missing at ${filePath}`);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

export function validateIsoTimestamp(value, label, options = {}) {
  const {
    now = Date.now(),
    maxAgeMs = null,
    futureSkewMs = FUTURE_SKEW_MS,
    requireFuture = false,
  } = options;
  const failures = [];
  if (typeof value !== 'string' || !value.trim()) return [`${label} is required`];
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return [`${label} must be a valid ISO-8601 timestamp`];
  if (timestamp > now + futureSkewMs) failures.push(`${label} is too far in the future`);
  if (maxAgeMs !== null && now - timestamp > maxAgeMs) failures.push(`${label} is stale`);
  if (requireFuture && timestamp <= now) failures.push(`${label} must be in the future`);
  return failures;
}

export function validateIncidentDocument(document, options = {}) {
  const now = options.now ?? Date.now();
  const failures = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return ['production-incidents.json must contain an object'];
  }
  if (document.schemaVersion !== 1) failures.push('production-incidents.json schemaVersion must equal 1');
  if (!Array.isArray(document.activeIncidents)) {
    failures.push('production-incidents.json activeIncidents must be an array');
  } else if (document.activeIncidents.length) {
    const descriptions = document.activeIncidents.map((incident, index) => {
      if (!incident || typeof incident !== 'object') return `index ${index}`;
      return `${incident.id || `index ${index}`}:${incident.severity || 'unknown'}:${incident.status || 'unknown'}`;
    });
    failures.push(`active production incidents block release: ${descriptions.join(', ')}`);
  }
  if (typeof document.requiresRollback !== 'boolean') {
    failures.push('production-incidents.json requiresRollback must be boolean');
  } else if (document.requiresRollback) {
    failures.push(`production rollback is required: ${document.rollbackReason || 'reason missing'}`);
  }
  if (typeof document.lastDeploymentFailed !== 'boolean') {
    failures.push('production-incidents.json lastDeploymentFailed must be boolean');
  } else if (document.lastDeploymentFailed) {
    failures.push(
      ...validateIsoTimestamp(document.lastDeploymentFailedAt, 'lastDeploymentFailedAt', {
        now,
        futureSkewMs: FUTURE_SKEW_MS,
      }),
    );
    const failedAt = Date.parse(document.lastDeploymentFailedAt || '');
    if (Number.isFinite(failedAt) && now - failedAt < RETRY_COOLDOWN_MS) {
      failures.push('last production deployment failed within the 30-minute retry cooldown');
    }
  }
  if (
    document.lastSuccessfulCommitSha !== null &&
    document.lastSuccessfulCommitSha !== undefined &&
    !/^[0-9a-f]{40}$/i.test(String(document.lastSuccessfulCommitSha))
  ) {
    failures.push('lastSuccessfulCommitSha must be null or a full 40-character SHA');
  }
  return failures;
}

export function validateAuthorizationDocument(document, context = {}) {
  const failures = [];
  const now = context.now ?? Date.now();
  const expectedSha = String(context.commitSha || '');
  const expectedRef = String(context.ref || 'refs/heads/main');
  const expectedRepository = String(context.repository || '');
  const expectedRunId = String(context.runId || '');
  const expectedActor = String(context.actor || '').toLowerCase();

  let authorizedActors = [];
  let authorizedEmails = [];
  try {
    authorizedActors = parseCsvRequired(context.authorizedActors, 'AUTHORIZED_FOUNDER_ACTORS');
  } catch (error) {
    failures.push(error.message);
  }
  try {
    authorizedEmails = parseCsvRequired(context.authorizedEmails, 'AUTHORIZED_FOUNDER_EMAILS');
  } catch (error) {
    failures.push(error.message);
  }
  if (typeof context.hmacKey !== 'string' || context.hmacKey.length < 32) {
    failures.push('HARD_LAUNCH_APPROVAL_HMAC_KEY must contain at least 32 characters');
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return [...failures, 'hard-launch authorization must contain an object'];
  }
  if (document.schemaVersion !== HARD_LAUNCH_CONTROL_SCHEMA) failures.push('authorization schemaVersion mismatch');
  if (document.kind !== AUTHORIZATION_KIND) failures.push('authorization kind mismatch');
  if (document.approved !== true) failures.push('authorization approved must equal true');
  if (!/^[0-9a-f]{40}$/.test(String(document.commitSha || ''))) failures.push('authorization commitSha must be a lowercase 40-character SHA');
  if (expectedSha && document.commitSha !== expectedSha) failures.push('authorization commitSha does not match workflow SHA');
  if (document.ref !== 'refs/heads/main' || (expectedRef && document.ref !== expectedRef)) failures.push('authorization ref must equal refs/heads/main');
  if (!document.repository || (expectedRepository && document.repository !== expectedRepository)) failures.push('authorization repository mismatch');
  if (!document.runId || (expectedRunId && String(document.runId) !== expectedRunId)) failures.push('authorization workflow run mismatch');
  if (!document.actor || (expectedActor && String(document.actor).toLowerCase() !== expectedActor)) failures.push('authorization actor mismatch');
  if (authorizedActors.length && !authorizedActors.includes(String(document.actor || '').toLowerCase())) failures.push('workflow actor is not an authorized founder actor');
  if (!document.founder || typeof document.founder !== 'object') {
    failures.push('authorization founder object is required');
  } else {
    if (!String(document.founder.name || '').trim()) failures.push('founder name is required');
    const email = String(document.founder.email || '').trim().toLowerCase();
    if (!email) failures.push('founder email is required');
    if (authorizedEmails.length && !authorizedEmails.includes(email)) failures.push('founder email is not authorized');
  }
  failures.push(...validateIsoTimestamp(document.issuedAt, 'authorization issuedAt', { now, maxAgeMs: AUTHORIZATION_MAX_AGE_MS }));
  failures.push(...validateIsoTimestamp(document.expiresAt, 'authorization expiresAt', { now, requireFuture: true }));
  const issuedAt = Date.parse(document.issuedAt || '');
  const expiresAt = Date.parse(document.expiresAt || '');
  if (Number.isFinite(issuedAt) && Number.isFinite(expiresAt) && expiresAt - issuedAt > AUTHORIZATION_MAX_AGE_MS) {
    failures.push('authorization validity window exceeds one hour');
  }
  if (document.deployConfirmationDigest !== sha256Text(DEPLOY_CONFIRMATION_PHRASE)) failures.push('deployment confirmation digest mismatch');
  if (document.hardLaunchConfirmationDigest !== sha256Text(HARD_LAUNCH_CONFIRMATION_PHRASE)) failures.push('hard-launch confirmation digest mismatch');
  if (document.signature?.algorithm !== 'hmac-sha256' || !/^[0-9a-f]{64}$/.test(String(document.signature?.value || ''))) {
    failures.push('authorization signature format is invalid');
  } else if (typeof context.hmacKey === 'string' && context.hmacKey.length >= 32) {
    const expected = hmacDocument(unsignedDocument(document), context.hmacKey);
    if (!safeHexEqual(document.signature.value, expected)) failures.push('authorization signature verification failed');
  }
  return failures;
}

export function validateDeploymentMetadata(document, context = {}) {
  const failures = [];
  const now = context.now ?? Date.now();
  const expectedSha = String(context.commitSha || '');
  if (!document || typeof document !== 'object' || Array.isArray(document)) return ['production deployment metadata must contain an object'];
  if (document.status !== 'passed') failures.push('production deployment status must equal passed');
  if (document.httpChecksOk !== true) failures.push('production HTTP checks are not passed');
  if (document.bundleVerified !== true) failures.push('production bundle verification is not passed');
  if (document.hardLaunchClaim === true) failures.push('deployment metadata must not claim hard launch before final decision');
  if (!/^[0-9a-f]{40}$/.test(String(document.deployedCommitSha || ''))) failures.push('deployedCommitSha must be a lowercase 40-character SHA');
  if (expectedSha && document.deployedCommitSha !== expectedSha) failures.push('deployedCommitSha does not match workflow SHA');
  failures.push(...validateIsoTimestamp(document.deployedAt, 'deployment deployedAt', { now, maxAgeMs: DEPLOYMENT_MAX_AGE_MS }));
  failures.push(...validateIsoTimestamp(document.verifiedAt, 'deployment verifiedAt', { now, maxAgeMs: DEPLOYMENT_MAX_AGE_MS }));
  const components = Array.isArray(document.successfulComponents) ? document.successfulComponents : [];
  for (const component of REQUIRED_DEPLOY_COMPONENTS) {
    if (!components.includes(component)) failures.push(`deployment metadata missing successful component: ${component}`);
  }
  if (context.repository && document.repository !== context.repository) failures.push('deployment repository mismatch');
  if (document.workflowRef !== 'refs/heads/main') failures.push('deployment workflowRef must equal refs/heads/main');
  return failures;
}

export function validateHardLaunchDecisionDocument(document, context = {}) {
  const failures = [];
  const now = context.now ?? Date.now();
  if (!document || typeof document !== 'object' || Array.isArray(document)) return ['hard-launch decision must contain an object'];
  if (document.schemaVersion !== HARD_LAUNCH_CONTROL_SCHEMA) failures.push('decision schemaVersion mismatch');
  if (document.kind !== DECISION_KIND) failures.push('decision kind mismatch');
  if (document.status !== 'approved') failures.push('decision status must equal approved');
  if (document.hardLaunchClaim !== true) failures.push('decision hardLaunchClaim must equal true');
  if (context.commitSha && document.commitSha !== context.commitSha) failures.push('decision commitSha mismatch');
  if (context.repository && document.repository !== context.repository) failures.push('decision repository mismatch');
  failures.push(...validateIsoTimestamp(document.approvedAt, 'decision approvedAt', { now, maxAgeMs: DECISION_MAX_AGE_MS }));
  const expectedHashes = context.expectedHashes || {};
  for (const [key, value] of Object.entries(expectedHashes)) {
    if (!value || document.evidenceHashes?.[key] !== value) failures.push(`decision evidence hash mismatch: ${key}`);
  }
  if (document.signature?.algorithm !== 'hmac-sha256' || !/^[0-9a-f]{64}$/.test(String(document.signature?.value || ''))) {
    failures.push('decision signature format is invalid');
  } else if (typeof context.hmacKey !== 'string' || context.hmacKey.length < 32) {
    failures.push('HARD_LAUNCH_APPROVAL_HMAC_KEY is required to verify decision');
  } else {
    const expected = hmacDocument(unsignedDocument(document), context.hmacKey);
    if (!safeHexEqual(document.signature.value, expected)) failures.push('decision signature verification failed');
  }
  return failures;
}
