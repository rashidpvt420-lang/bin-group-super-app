#!/usr/bin/env node
/**
 * Shared fail-closed helpers for predeploy / postdeploy launch gates.
 * Does not claim hard launch. Does not invent credentials.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const FULL_SHA_RE = /^[0-9a-f]{40}$/;
export const INCIDENTS_PATH = 'launch_package/production-incidents.json';
export const PREDEPLOY_APPROVAL_PATH = 'launch_package/predeploy-approval.json';
export const DEPLOYMENT_META_PATH = 'launch_package/production-deployment.json';
export const EVIDENCE_BATCH_PATH = 'launch_package/launch-evidence-batch.json';
export const PUBLIC_RELEASE_STATUS_PATH = 'launch_package/public-release-status.json';

export const INCIDENTS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
export const APPROVAL_MAX_AGE_MS = 1000 * 60 * 60 * 24;
export const DEPLOYMENT_MAX_AGE_MS = 1000 * 60 * 60 * 2;
export const EVIDENCE_MAX_AGE_MS = 1000 * 60 * 60 * 72;
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function readJsonAbsolute(absPath, failures, label) {
  if (!existsSync(absPath)) {
    failures.push(`Missing ${label}.`);
    return null;
  }
  try {
    const text = readFileSync(absPath, 'utf8').trim();
    if (!text) {
      failures.push(`${label} is empty.`);
      return null;
    }
    if (text.startsWith('const ') || text.startsWith('import ') || text.includes('```')) {
      failures.push(`${label} must be pure JSON (found script/markdown content).`);
      return null;
    }
    return JSON.parse(text);
  } catch (err) {
    failures.push(`${label} is malformed JSON: ${err.message}`);
    return null;
  }
}

/**
 * Reject missing, invalid, future, and stale timestamps.
 * Invalid/NaN ages must fail closed (unlike NaN > N which is false).
 */
export function validateRecentTimestamp(value, maximumAgeMs, label, failures) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    failures.push(`${label} is missing or is not a valid ISO-8601 timestamp.`);
    return false;
  }
  const ageMs = Date.now() - timestamp;
  if (ageMs < -FUTURE_TOLERANCE_MS) {
    failures.push(`${label} is in the future.`);
    return false;
  }
  if (ageMs > maximumAgeMs) {
    failures.push(`${label} is stale.`);
    return false;
  }
  return true;
}

export function requireFullSha(value, label, failures) {
  const sha = String(value || '').trim();
  if (!FULL_SHA_RE.test(sha)) {
    failures.push(`${label} must be a full lowercase 40-character Git SHA.`);
    return '';
  }
  return sha;
}

export function requireArtifactDigest(value, label, failures) {
  const digest = String(value || '').trim().toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    failures.push(`${label} must be sha256:<64-hex>.`);
    return '';
  }
  return digest;
}

function regularFilesRecursively(dir, { excludedDirectories = new Set(), excludedFiles = new Set() } = {}) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    if (entry.isFile() && excludedFiles.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...regularFilesRecursively(full, { excludedDirectories, excludedFiles }));
    }
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

/** Deterministic digest over every deployable hosting, Functions, rules, and index byte. */
export function computeValidatedArtifactDigest(root = process.cwd()) {
  const requiredDirectories = [
    path.join(root, 'dist'),
    path.join(root, 'apps', 'admin-panel', 'build'),
    path.join(root, 'functions'),
  ];
  const requiredFiles = [
    path.join(root, 'firebase.json'),
    path.join(root, 'firestore.rules'),
    path.join(root, 'firestore.indexes.json'),
    path.join(root, 'storage.rules'),
    path.join(root, 'package-lock.json'),
    path.join(root, 'functions', 'package-lock.json'),
    path.join(root, 'functions', 'lib', 'runtimeAll.js'),
  ];
  for (const dir of requiredDirectories) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new Error(`Cannot compute artifact digest; missing ${path.relative(root, dir)}`);
    }
  }
  for (const file of requiredFiles) {
    if (!existsSync(file) || !statSync(file).isFile()) {
      throw new Error(`Cannot compute artifact digest; missing ${path.relative(root, file)}`);
    }
  }

  const functionsDirectory = path.join(root, 'functions');
  const targets = [...new Set([
    ...regularFilesRecursively(path.join(root, 'dist')),
    ...regularFilesRecursively(path.join(root, 'apps', 'admin-panel', 'build')),
    ...regularFilesRecursively(functionsDirectory, {
      excludedDirectories: new Set(['node_modules', '.git']),
      excludedFiles: new Set(['firebase-debug.log']),
    }).filter((file) => !file.endsWith('.local') && !path.basename(file).startsWith('firebase-debug.')),
    ...requiredFiles,
  ])].sort((left, right) => path.relative(root, left).localeCompare(path.relative(root, right)));
  if (targets.length === requiredFiles.length) {
    throw new Error('Cannot compute artifact digest; deployable build directories are empty.');
  }

  const hash = createHash('sha256');
  for (const target of targets) {
    hash.update(path.relative(root, target).replaceAll(path.sep, '/'));
    hash.update('\0');
    hash.update(readFileSync(target));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export function checkProductionIncidents(failures, { root = process.cwd(), now = Date.now(), env = process.env } = {}) {
  const incidentPath = path.join(root, INCIDENTS_PATH);
  if (!existsSync(incidentPath)) {
    failures.push('Missing production-incidents.json. Incident state cannot be verified.');
    return null;
  }

  const incidentData = readJsonAbsolute(incidentPath, failures, INCIDENTS_PATH);
  if (!incidentData) return null;

  if (Number(incidentData.schemaVersion) !== 1) {
    failures.push('production-incidents.json schemaVersion must be 1.');
  }
  validateRecentTimestamp(incidentData.updatedAt, INCIDENTS_MAX_AGE_MS, 'production-incidents.json updatedAt', failures);
  if (!String(incidentData.updatedBy || '').trim()) {
    failures.push('production-incidents.json updatedBy is required.');
  }

  // In protected CI, reject committed/static green fixtures and require run-bound attestation.
  if (String(env.GITHUB_ACTIONS || '') === 'true') {
    if (incidentData.source !== 'protected-workflow-dispatch-attestation') {
      failures.push(
        'production-incidents.json source must be protected-workflow-dispatch-attestation (static committed fixtures are rejected in CI).',
      );
    }
    const expectedSha = String(env.GITHUB_SHA || '').trim();
    const expectedRepo = String(env.GITHUB_REPOSITORY || '').trim();
    const expectedRunId = String(env.GITHUB_RUN_ID || '').trim();
    const expectedRef = String(env.GITHUB_REF || '').trim();
    if (expectedSha && String(incidentData.commitSha || '') !== expectedSha) {
      failures.push('production-incidents.json commitSha must match GITHUB_SHA.');
    }
    if (expectedRepo && String(incidentData.repository || '') !== expectedRepo) {
      failures.push('production-incidents.json repository must match GITHUB_REPOSITORY.');
    }
    if (expectedRunId && String(incidentData.workflowRunId || '') !== expectedRunId) {
      failures.push('production-incidents.json workflowRunId must match GITHUB_RUN_ID.');
    }
    if (expectedRef && String(incidentData.ref || '') !== expectedRef) {
      failures.push('production-incidents.json ref must match GITHUB_REF.');
    }
    if (!Array.isArray(incidentData.evidenceReferences) || incidentData.evidenceReferences.length === 0) {
      failures.push('production-incidents.json evidenceReferences must be a non-empty array in CI.');
    }
  }

  if (!Array.isArray(incidentData.activeIncidents)) {
    failures.push('production-incidents.json activeIncidents must be an array.');
  } else {
    const blocking = incidentData.activeIncidents.filter((inc) => {
      const severity = String(inc?.severity || '').toLowerCase();
      return severity === 'p0' || severity === 'p1' || severity === 'critical' || severity === 'high';
    });
    if (blocking.length) {
      failures.push(
        `Active P0/P1 production incidents: ${blocking.map((i) => `${i.id}:${i.severity}`).join(', ')}.`,
      );
    }
    for (const inc of incidentData.activeIncidents) {
      const ts = inc?.detectedAt || inc?.openedAt || inc?.failedAt;
      if (ts !== undefined && ts !== null) {
        if (!Number.isFinite(Date.parse(ts))) {
          failures.push(`Incident ${inc.id || '(unknown)'} has invalid timestamp.`);
        }
      }
    }
  }
  if (incidentData.requiresRollback === true) {
    failures.push(`Rollback hold is set: ${incidentData.rollbackReason || 'reason not specified'}.`);
  }
  if (incidentData.lastDeploymentFailed === true) {
    const failAt = incidentData.lastDeploymentFailedAt;
    const ts = Date.parse(failAt);
    if (!Number.isFinite(ts)) {
      failures.push('lastDeploymentFailedAt is missing or invalid while lastDeploymentFailed=true.');
    } else {
      const ageMin = (now - ts) / 60000;
      if (ageMin < 30) {
        failures.push(`Last production deployment failed ${ageMin.toFixed(0)} minutes ago; wait ≥30 minutes.`);
      }
    }
  }
  return incidentData;
}

export function requireGitHubProductionEnvironment(failures, env = process.env) {
  if (String(env.GITHUB_ACTIONS || '') !== 'true') {
    failures.push('Predeploy/postdeploy gates must run inside GitHub Actions (GITHUB_ACTIONS=true).');
  }
  if (String(env.DEPLOYMENT_ENVIRONMENT || '') !== 'production') {
    failures.push(
      'DEPLOYMENT_ENVIRONMENT must be "production". Human authorization is the protected GitHub environment approval.',
    );
  }
  if (String(env.GITHUB_REF || '') !== 'refs/heads/main') {
    failures.push('Production gates only run on refs/heads/main.');
  }
}

export function parseAuthorizedFounderEmails(env = process.env) {
  const raw = String(env.AUTHORIZED_FOUNDER_EMAILS || '').trim();
  if (!raw) return null;
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
