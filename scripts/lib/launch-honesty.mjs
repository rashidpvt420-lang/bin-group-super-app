#!/usr/bin/env node
/**
 * Shared launch-honesty helpers.
 * Critical evidence must be execution-generated, bound to commit SHA + artifacts.
 * hardLaunchClaim is always false from this module.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const APPROVED_ARTIFACTS_DIR = 'launch_package/artifacts';
export const DEPLOYMENT_METADATA_RELATIVE = 'launch_package/production-deployment.json';

export const HARD_LAUNCH_CLAIM = false;

export const PRODUCTION = {
  projectId: 'bin-group-57c60',
  mainUrl: 'https://bin-group-57c60.web.app',
  adminUrl: 'https://bin-group-admin-panel.web.app',
  authDomain: 'bin-group-57c60.firebaseapp.com',
  appIdSuffix: '285cb53bc26626d699f3b6',
};

/** Evidence keys that may NEVER be recorded manually. */
export const CRITICAL_EVIDENCE_KEYS = Object.freeze([
  'adminCredentialLogin',
  'businessOwner',
  'businessTenant',
  'businessTechnician',
  'businessBroker',
  'businessGlobal',
  'launchAuditLive',
  'productionDeployment',
  'productionMainHosting',
  'productionAdminHosting',
  'appCheckAuthenticatedAccess',
]);

/** Required current-commit evidence for controlled pilot eligibility. */
export const REQUIRED_PILOT_EVIDENCE = Object.freeze([
  'adminCredentialLogin',
  'businessOwner',
  'businessTenant',
  'businessTechnician',
  'businessBroker',
  'businessGlobal',
  'launchAuditLive',
  'appCheckAuthenticatedAccess',
  'productionMainHosting',
  'productionAdminHosting',
]);

/** Gates that must never be waived. */
export const NON_WAIVABLE_GATE_NAMES = Object.freeze([
  'hosting',
  'functionsDeploy',
  'firebaseAuth',
  'firestoreRules',
  'storageRules',
  'appCheckEnforcement',
  'appCheckProduction',
]);

export const EVIDENCE_MAX_AGE_MS = 1000 * 60 * 60 * 72; // 72h

export const SUITE_SPECS = Object.freeze({
  adminCredentialLogin: {
    specs: ['tests/e2e/business-admin.spec.ts'],
    suiteName: 'business-admin',
    evidenceKeys: ['adminCredentialLogin', 'appCheckAuthenticatedAccess'],
    requiresAdminUrl: true,
  },
  businessOwner: {
    specs: ['tests/e2e/business-owner.spec.ts'],
    suiteName: 'business-owner',
    evidenceKeys: ['businessOwner', 'appCheckAuthenticatedAccess'],
  },
  businessTenant: {
    specs: ['tests/e2e/business-tenant.spec.ts'],
    suiteName: 'business-tenant',
    evidenceKeys: ['businessTenant', 'appCheckAuthenticatedAccess'],
  },
  businessTechnician: {
    specs: ['tests/e2e/business-technician.spec.ts'],
    suiteName: 'business-technician',
    evidenceKeys: ['businessTechnician', 'appCheckAuthenticatedAccess'],
  },
  businessBroker: {
    specs: ['tests/e2e/business-broker.spec.ts'],
    suiteName: 'business-broker',
    evidenceKeys: ['businessBroker', 'appCheckAuthenticatedAccess'],
  },
  businessGlobal: {
    specs: ['tests/e2e/business-global.spec.ts'],
    suiteName: 'business-global',
    evidenceKeys: ['businessGlobal'],
  },
  launchAuditLive: {
    specs: [
      'tests/e2e/launch-audit-public-routes.spec.ts',
      'tests/e2e/launch-audit-admin.spec.ts',
      'tests/e2e/launch-audit-owner.spec.ts',
      'tests/e2e/launch-audit-tenant.spec.ts',
      'tests/e2e/launch-audit-technician.spec.ts',
      'tests/e2e/launch-audit-broker.spec.ts',
      'tests/e2e/hard-launch-routes.spec.ts',
    ],
    suiteName: 'launch-audit-live',
    evidenceKeys: ['launchAuditLive', 'appCheckAuthenticatedAccess'],
  },
});

export function gitSha(cwd = process.cwd()) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd });
  return (result.stdout || '').trim() || 'unknown';
}

export function evidencePath(root = process.cwd()) {
  return path.join(root, 'launch_package', 'launch-evidence-batch.json');
}

export function deploymentEvidencePath(root = process.cwd()) {
  return path.join(root, 'launch_package', 'production-deployment.json');
}

export function sha256File(filePath) {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

export function readJsonSafe(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function isCriticalEvidenceKey(name) {
  return CRITICAL_EVIDENCE_KEYS.includes(String(name || ''));
}

export function isProductionUrl(url, kind = 'main') {
  const normalized = String(url || '').trim().replace(/\/+$/, '');
  if (kind === 'admin') return normalized === PRODUCTION.adminUrl;
  if (kind === 'either') return normalized === PRODUCTION.mainUrl || normalized === PRODUCTION.adminUrl;
  return normalized === PRODUCTION.mainUrl;
}

export function isPlaywrightCriticalKey(key) {
  const name = String(key || '');
  return (
    CRITICAL_EVIDENCE_KEYS.includes(name) &&
    name !== 'productionDeployment' &&
    name !== 'productionMainHosting' &&
    name !== 'productionAdminHosting'
  );
}

export function isDeploymentEvidenceKey(key) {
  return ['productionDeployment', 'productionMainHosting', 'productionAdminHosting'].includes(String(key || ''));
}

export function expectedSpecsForEvidenceKey(key) {
  const name = String(key || '');
  for (const def of Object.values(SUITE_SPECS)) {
    if (def.evidenceKeys.includes(name)) return [...def.specs];
  }
  return [];
}

/**
 * Resolve a relative artifact path strictly inside launch_package/artifacts.
 * Rejects absolute paths, .. traversal, and symlink escapes outside the approved dir.
 */
export function resolveApprovedArtifactPath(artifactPath, root = process.cwd()) {
  const raw = String(artifactPath || '').trim();
  if (!raw) return { ok: false, reason: 'missing artifactPath' };
  if (path.isAbsolute(raw)) return { ok: false, reason: 'artifactPath must be relative (absolute paths rejected)' };

  const normalized = path.normalize(raw).replace(/\\/g, '/');
  if (normalized.startsWith('../') || normalized === '..' || normalized.includes('/../')) {
    return { ok: false, reason: 'path traversal rejected' };
  }
  if (!normalized.startsWith(`${APPROVED_ARTIFACTS_DIR}/`)) {
    return { ok: false, reason: `artifactPath must be inside ${APPROVED_ARTIFACTS_DIR}` };
  }

  const abs = path.resolve(root, normalized);
  const approvedAbs = path.resolve(root, APPROVED_ARTIFACTS_DIR);
  if (!abs.startsWith(`${approvedAbs}${path.sep}`) && abs !== approvedAbs) {
    return { ok: false, reason: 'artifactPath escapes approved artifacts directory' };
  }

  if (!existsSync(abs)) {
    return { ok: false, reason: 'artifact file missing', absolutePath: abs, relativePath: normalized };
  }

  try {
    const stat = lstatSync(abs);
    if (stat.isSymbolicLink()) {
      const real = realpathSync(abs);
      const approvedReal = realpathSync(approvedAbs);
      if (!real.startsWith(`${approvedReal}${path.sep}`) && real !== approvedReal) {
        return { ok: false, reason: 'symlink escape outside approved artifacts directory' };
      }
    } else {
      // Also realpath parent chain for bind-mount / link tricks on the path.
      const real = realpathSync(abs);
      const approvedReal = existsSync(approvedAbs) ? realpathSync(approvedAbs) : approvedAbs;
      if (!real.startsWith(`${approvedReal}${path.sep}`) && real !== approvedReal) {
        return { ok: false, reason: 'resolved path escapes approved artifacts directory' };
      }
    }
  } catch (err) {
    return { ok: false, reason: `artifact path resolution failed: ${err.message}` };
  }

  return { ok: true, absolutePath: abs, relativePath: normalized };
}

export function resolveDeploymentMetadataPath(artifactPath, root = process.cwd()) {
  const raw = String(artifactPath || DEPLOYMENT_METADATA_RELATIVE).trim();
  if (!raw) return { ok: false, reason: 'missing deployment artifactPath' };
  if (path.isAbsolute(raw)) return { ok: false, reason: 'deployment artifactPath must be relative' };
  const normalized = path.normalize(raw).replace(/\\/g, '/');
  if (normalized.startsWith('../') || normalized === '..' || normalized.includes('/../')) {
    return { ok: false, reason: 'path traversal rejected for deployment metadata' };
  }
  if (normalized !== DEPLOYMENT_METADATA_RELATIVE) {
    return { ok: false, reason: `deployment artifactPath must be ${DEPLOYMENT_METADATA_RELATIVE}` };
  }
  const abs = path.resolve(root, normalized);
  if (!existsSync(abs)) {
    return { ok: false, reason: 'deployment metadata artifact missing', absolutePath: abs, relativePath: normalized };
  }
  return { ok: true, absolutePath: abs, relativePath: normalized };
}

export function collectReportSpecFiles(report) {
  const files = new Set();
  function walk(suite) {
    if (suite.file) files.add(String(suite.file).replace(/\\/g, '/'));
    for (const spec of suite.specs || []) {
      if (spec.file) files.add(String(spec.file).replace(/\\/g, '/'));
      if (spec.title && suite.file) files.add(String(suite.file).replace(/\\/g, '/'));
    }
    for (const child of suite.suites || []) walk(child);
  }
  for (const suite of report?.suites || []) walk(suite);
  return [...files];
}

export function reportContainsExpectedSpecs(report, expectedSpecs = []) {
  if (!expectedSpecs.length) return { ok: true, found: [], missing: [] };
  const foundFiles = collectReportSpecFiles(report);
  const haystack = foundFiles.join('\n').toLowerCase();
  const missing = [];
  for (const spec of expectedSpecs) {
    const base = path.basename(spec).toLowerCase();
    const norm = String(spec).replace(/\\/g, '/').toLowerCase();
    const hit =
      haystack.includes(norm) ||
      haystack.includes(base) ||
      foundFiles.some((f) => f.toLowerCase().endsWith(base) || f.toLowerCase().includes(norm));
    if (!hit) missing.push(spec);
  }
  if (missing.length) {
    return { ok: false, reason: `report missing expected suite/spec files: ${missing.join(', ')}`, found: foundFiles, missing };
  }
  return { ok: true, found: foundFiles, missing: [] };
}

export function parsePlaywrightJsonReport(report) {
  if (!report || typeof report !== 'object') {
    return { ok: false, reason: 'malformed Playwright report object' };
  }

  const stats = report.stats || {};
  const expected = Number(stats.expected || 0);
  const unexpected = Number(stats.unexpected || 0);
  const skipped = Number(stats.skipped || 0);
  const flaky = Number(stats.flaky || 0);
  const interrupted = Number(stats.interrupted || 0);

  let passed = 0;
  let failed = 0;
  let skippedCount = 0;
  let total = 0;

  function walk(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        total += 1;
        const results = test.results || [];
        const last = results[results.length - 1];
        const status = last?.status || test.status || 'unknown';
        if (status === 'passed' || status === 'expected') passed += 1;
        else if (status === 'skipped') skippedCount += 1;
        else failed += 1;
      }
    }
    for (const child of suite.suites || []) walk(child);
  }
  for (const suite of report.suites || []) walk(suite);

  const effectivePassed = total > 0 ? passed : expected;
  const effectiveFailed = total > 0 ? failed : unexpected;
  const effectiveSkipped = total > 0 ? skippedCount : skipped;
  // Prefer the higher skip signal so partial suites cannot hide skips.
  const skipSignal = Math.max(effectiveSkipped, skipped, skippedCount);
  const effectiveTotal =
    total > 0
      ? total
      : effectivePassed + effectiveFailed + skipSignal + flaky + interrupted;

  if (effectiveTotal === 0) {
    return { ok: false, reason: 'Playwright report contains zero tests', passed: 0, failed: 0, skipped: 0, total: 0 };
  }
  if (skipSignal > 0) {
    return {
      ok: false,
      reason: `launch-critical suite has skipped=${skipSignal} (any skip fails evidence)`,
      passed: effectivePassed,
      failed: effectiveFailed,
      skipped: skipSignal,
      flaky,
      interrupted,
      total: effectiveTotal,
    };
  }
  if (effectiveFailed > 0 || interrupted > 0) {
    return {
      ok: false,
      reason: `failed=${effectiveFailed} interrupted=${interrupted}`,
      passed: effectivePassed,
      failed: effectiveFailed,
      skipped: skipSignal,
      flaky,
      interrupted,
      total: effectiveTotal,
    };
  }
  if (effectivePassed < 1) {
    return {
      ok: false,
      reason: 'no passing tests',
      passed: effectivePassed,
      failed: effectiveFailed,
      skipped: skipSignal,
      total: effectiveTotal,
    };
  }
  if (flaky > 0 && effectivePassed === 0) {
    return { ok: false, reason: 'flaky-only results', passed: 0, failed: 0, skipped: skipSignal, flaky, total: effectiveTotal };
  }

  return {
    ok: true,
    passed: effectivePassed,
    failed: effectiveFailed,
    skipped: 0,
    flaky,
    interrupted: 0,
    total: effectiveTotal,
  };
}

/**
 * Cryptographically revalidate a Playwright JSON artifact against an evidence record.
 * Never trusts caller-provided artifactHash without recomputing SHA-256 from disk.
 */
export function revalidatePlaywrightArtifact(record, { root = process.cwd(), expectedSpecs } = {}) {
  const resolved = resolveApprovedArtifactPath(record?.artifactPath, root);
  if (!resolved.ok) return resolved;

  let currentHash;
  try {
    currentHash = sha256File(resolved.absolutePath);
  } catch (err) {
    return { ok: false, reason: `unable to hash artifact: ${err.message}` };
  }

  const claimed = String(record.artifactHash || '');
  if (!claimed || claimed.length < 32) {
    return { ok: false, reason: 'missing artifactHash' };
  }
  if (claimed !== currentHash) {
    return { ok: false, reason: 'artifactHash mismatch (file changed or fabricated hash)' };
  }

  let report;
  try {
    const text = readFileSync(resolved.absolutePath, 'utf8');
    if (!text.trim()) return { ok: false, reason: 'artifact report is empty' };
    report = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'artifact report malformed JSON' };
  }

  const parsed = parsePlaywrightJsonReport(report);
  if (!parsed.ok) {
    return { ok: false, reason: `artifact report rejected: ${parsed.reason}`, parsed };
  }

  if (Number(record.passed) !== parsed.passed) {
    return { ok: false, reason: `report passed=${parsed.passed} != evidence passed=${record.passed}` };
  }
  if (Number(record.failed || 0) !== parsed.failed) {
    return { ok: false, reason: `report failed=${parsed.failed} != evidence failed=${record.failed}` };
  }
  if (Number(record.skipped || 0) !== parsed.skipped) {
    return { ok: false, reason: `report skipped=${parsed.skipped} != evidence skipped=${record.skipped}` };
  }

  const specs = expectedSpecs || record.expectedSpecs || expectedSpecsForEvidenceKey(record.testName);
  const specCheck = reportContainsExpectedSpecs(report, specs);
  if (!specCheck.ok) return specCheck;

  return { ok: true, hash: currentHash, parsed, specs: specCheck.found };
}

export function revalidateDeploymentArtifact(record, { root = process.cwd(), commitSha } = {}) {
  const resolved = resolveDeploymentMetadataPath(record?.artifactPath || DEPLOYMENT_METADATA_RELATIVE, root);
  if (!resolved.ok) return resolved;

  let currentHash;
  try {
    currentHash = sha256File(resolved.absolutePath);
  } catch (err) {
    return { ok: false, reason: `unable to hash deployment artifact: ${err.message}` };
  }
  const claimed = String(record.artifactHash || '');
  if (!claimed || claimed.length < 32) {
    return { ok: false, reason: 'missing deployment artifactHash' };
  }
  if (claimed !== currentHash) {
    return { ok: false, reason: 'deployment artifactHash mismatch' };
  }

  const doc = readJsonSafe(resolved.absolutePath, null);
  const errors = validateDeploymentDocument(doc, commitSha || record.commitSha);
  if (errors.length) {
    return { ok: false, reason: `deployment metadata invalid: ${errors[0]}`, errors };
  }
  return { ok: true, hash: currentHash, doc };
}

export function validateEvidenceRecord(record, {
  commitSha,
  now = Date.now(),
  root = process.cwd(),
  revalidateArtifact = true,
  expectedSpecs,
} = {}) {
  if (!record || typeof record !== 'object') return { ok: false, reason: 'malformed evidence record' };
  const key = String(record.testName || '');
  if (!key) return { ok: false, reason: 'missing testName' };
  if (record.exitCode !== 0) return { ok: false, reason: `exitCode=${record.exitCode}` };
  if (!record.commitSha || record.commitSha !== commitSha) {
    return { ok: false, reason: `commitSha mismatch (have=${record.commitSha || 'missing'} want=${commitSha})` };
  }
  if (record.executionGenerated !== true) {
    return { ok: false, reason: 'evidence is not execution-generated' };
  }
  if (!record.artifactHash || String(record.artifactHash).length < 32) {
    return { ok: false, reason: 'missing artifactHash' };
  }
  if (!record.startedAt || !record.finishedAt) {
    return { ok: false, reason: 'missing startedAt/finishedAt' };
  }
  const finishedMs = Date.parse(record.finishedAt);
  if (!Number.isFinite(finishedMs)) return { ok: false, reason: 'malformed finishedAt' };
  if (now - finishedMs > EVIDENCE_MAX_AGE_MS) {
    return { ok: false, reason: 'stale/expired evidence' };
  }
  if (Number(record.passed || 0) < 1 && !isDeploymentEvidenceKey(key)) {
    if (!record.httpChecksOk) {
      return { ok: false, reason: 'no passing tests and no httpChecksOk' };
    }
  }
  if (Number(record.failed || 0) > 0) return { ok: false, reason: 'failed count > 0' };
  // Launch-critical: any skipped test fails evidence (not only skipped-only suites).
  if (Number(record.skipped || 0) > 0 && isPlaywrightCriticalKey(key)) {
    return { ok: false, reason: 'skipped > 0 is not allowed for launch-critical evidence' };
  }
  if (Number(record.skipped || 0) > 0 && Number(record.passed || 0) < 1 && !record.httpChecksOk) {
    return { ok: false, reason: 'skipped-only evidence' };
  }

  // Production URL binding for role/app-check suites.
  if (REQUIRED_PILOT_EVIDENCE.includes(key) || CRITICAL_EVIDENCE_KEYS.includes(key)) {
    const mainUrl = String(record.mainUrl || '').replace(/\/+$/, '');
    const adminUrl = String(record.adminUrl || '').replace(/\/+$/, '');
    if (key === 'adminCredentialLogin' || key === 'productionAdminHosting') {
      if (adminUrl !== PRODUCTION.adminUrl) return { ok: false, reason: 'adminUrl is not production admin URL' };
    } else if (key === 'productionMainHosting') {
      if (mainUrl !== PRODUCTION.mainUrl) return { ok: false, reason: 'mainUrl is not production main URL' };
    } else if (key !== 'productionDeployment') {
      if (mainUrl && mainUrl !== PRODUCTION.mainUrl && !isProductionUrl(mainUrl, 'either')) {
        return { ok: false, reason: `non-production mainUrl=${mainUrl}` };
      }
      if (mainUrl && /localhost|127\.0\.0\.1|staging|preview/i.test(mainUrl)) {
        return { ok: false, reason: 'staging/local URL is not production' };
      }
      if (mainUrl && mainUrl !== PRODUCTION.mainUrl) {
        return { ok: false, reason: 'mainUrl must be production main URL' };
      }
    }
  }

  if (isDeploymentEvidenceKey(key)) {
    if (String(record.deploymentStatus || '').toLowerCase() !== 'passed') {
      return { ok: false, reason: `deploymentStatus=${record.deploymentStatus || 'missing'}` };
    }
    if (record.projectId !== PRODUCTION.projectId) {
      return { ok: false, reason: 'Firebase projectId mismatch' };
    }
    if (record.deployedCommitSha !== commitSha) {
      return { ok: false, reason: 'deployedCommitSha differs from current commit SHA' };
    }
    if (record.httpChecksOk !== true) {
      return { ok: false, reason: 'httpChecksOk is not true' };
    }
    if (record.bundleVerified !== true) {
      return { ok: false, reason: 'bundleVerified is not true' };
    }
  }

  if (revalidateArtifact) {
    if (isPlaywrightCriticalKey(key)) {
      if (!record.artifactPath) return { ok: false, reason: 'missing artifactPath' };
      const art = revalidatePlaywrightArtifact(record, { root, expectedSpecs });
      if (!art.ok) return art;
    } else if (isDeploymentEvidenceKey(key)) {
      const art = revalidateDeploymentArtifact(record, { root, commitSha });
      if (!art.ok) return art;
    }
  }

  return { ok: true };
}

export function findEvidence(batch, testName, commitSha) {
  const records = batch?.records || [];
  return records.find((r) => r.testName === testName && r.commitSha === commitSha) || null;
}

export function evaluatePilotEligibility({
  evidenceBatch,
  commitSha,
  deploymentDoc,
  now = Date.now(),
  root = process.cwd(),
} = {}) {
  const missing = [];
  const invalid = [];

  for (const key of REQUIRED_PILOT_EVIDENCE) {
    const record = findEvidence(evidenceBatch, key, commitSha);
    if (!record) {
      missing.push(key);
      continue;
    }
    const check = validateEvidenceRecord(record, { commitSha, now, root, revalidateArtifact: true });
    if (!check.ok) invalid.push(`${key}: ${check.reason}`);
  }

  // Strict deployment document checks (fail closed — never "not failed").
  // Pilot eligibility requires workflow-generated provenance (not a hand-written JSON).
  const deployErrors = validateDeploymentDocument(deploymentDoc, commitSha, {
    root,
    requireWorkflowProvenance: true,
  });
  if (deployErrors.length) invalid.push(...deployErrors.map((e) => `deployment: ${e}`));

  const onlyAdmin =
    findEvidence(evidenceBatch, 'adminCredentialLogin', commitSha) &&
    REQUIRED_PILOT_EVIDENCE.filter((k) => k !== 'adminCredentialLogin').every(
      (k) => !findEvidence(evidenceBatch, k, commitSha),
    );

  if (onlyAdmin) {
    invalid.push('adminCredentialLogin alone cannot make pilot eligible');
  }

  const pilotEligible = missing.length === 0 && invalid.length === 0;
  return {
    pilotEligible,
    hardLaunchClaim: HARD_LAUNCH_CLAIM,
    missing,
    invalid,
    required: [...REQUIRED_PILOT_EVIDENCE],
  };
}

export function validateDeploymentDocument(doc, commitSha, { root = process.cwd(), requireWorkflowProvenance = false } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object') {
    errors.push('production-deployment.json missing or malformed');
    return errors;
  }

  const status = String(doc.status || '').toLowerCase();
  if (status !== 'passed') {
    errors.push(`status must be exactly "passed" (got "${doc.status || 'missing'}")`);
  }
  for (const bad of ['pending', 'unknown', 'skipped', 'waived', 'missing', 'failed']) {
    if (status === bad) errors.push(`status "${bad}" is not allowed`);
  }
  if (doc.projectId !== PRODUCTION.projectId) {
    errors.push(`projectId must be ${PRODUCTION.projectId}`);
  }
  if (String(doc.mainUrl || '').replace(/\/+$/, '') !== PRODUCTION.mainUrl) {
    errors.push(`mainUrl must be ${PRODUCTION.mainUrl}`);
  }
  if (String(doc.adminUrl || '').replace(/\/+$/, '') !== PRODUCTION.adminUrl) {
    errors.push(`adminUrl must be ${PRODUCTION.adminUrl}`);
  }
  if (!doc.deployedCommitSha || doc.deployedCommitSha !== commitSha) {
    errors.push('deployedCommitSha must equal current commit SHA');
  }
  if (doc.httpChecksOk !== true) errors.push('httpChecksOk must be true');
  if (doc.bundleVerified !== true) errors.push('bundleVerified must be true');
  if (!doc.deployedAt) errors.push('deployedAt timestamp required');
  if (doc.hardLaunchClaim === true) errors.push('hardLaunchClaim must remain false');

  const components = doc.successfulComponents || doc.components || [];
  if (Array.isArray(components) && components.length) {
    for (const required of ['hosting', 'firestoreRules', 'firestoreIndexes', 'storageRules', 'functions']) {
      if (!components.includes(required)) {
        errors.push(`successfulComponents missing ${required}`);
      }
    }
  }

  if (requireWorkflowProvenance) {
    if (!doc.workflowRunId) errors.push('workflowRunId required');
    if (!doc.workflowRef) errors.push('workflowRef required');
    if (String(doc.source || '') !== 'firebase-production-deploy-workflow') {
      errors.push('deployment metadata must be generated by the production deploy workflow');
    }
  }

  // If a file exists on disk, optionally confirm it parses as this doc's SHA binding.
  const metaPath = path.join(root, DEPLOYMENT_METADATA_RELATIVE);
  if (existsSync(metaPath) && doc.deployedCommitSha) {
    try {
      const onDisk = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (onDisk.deployedCommitSha && onDisk.deployedCommitSha !== doc.deployedCommitSha) {
        errors.push('on-disk deployment metadata deployedCommitSha mismatch');
      }
      if (onDisk.workflowRunId && doc.workflowRunId && String(onDisk.workflowRunId) !== String(doc.workflowRunId)) {
        errors.push('deployment metadata from another workflow run');
      }
    } catch {
      errors.push('on-disk deployment metadata unreadable');
    }
  }

  return [...new Set(errors)];
}

export function upsertEvidenceRecord(root, record) {
  const file = evidencePath(root);
  mkdirSync(path.dirname(file), { recursive: true });
  const batch = readJsonSafe(file, { records: [] }) || { records: [] };
  const fingerprint = `${record.commitSha}|${record.testName}|${record.artifactHash}|${record.suiteName || ''}`;
  const idx = (batch.records || []).findIndex((r) => r.fingerprint === fingerprint || (r.testName === record.testName && r.commitSha === record.commitSha));
  const next = { ...record, fingerprint, hardLaunchClaim: false };
  if (idx >= 0) batch.records[idx] = { ...batch.records[idx], ...next, updatedAt: new Date().toISOString() };
  else batch.records = [...(batch.records || []), next];
  batch.updatedAt = new Date().toISOString();
  batch.hardLaunchClaim = false;
  writeFileSync(file, `${JSON.stringify(batch, null, 2)}\n`);
  return next;
}

export function assertGateNotWaivedForSecurity(groupName, name, gate) {
  const nonWaivable =
    NON_WAIVABLE_GATE_NAMES.includes(name) ||
    groupName === 'deploymentProof' ||
    /appcheck|auth|rules|hosting|deploy/i.test(name);
  if (!nonWaivable) return null;
  const status = String(gate?.status || '').toLowerCase();
  if (status === 'waived') {
    return `${groupName}.${name} is non-waivable (auth/App Check/rules/deployment)`;
  }
  return null;
}
