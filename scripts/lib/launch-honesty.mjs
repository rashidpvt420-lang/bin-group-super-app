#!/usr/bin/env node
/**
 * Shared launch-honesty helpers.
 * Critical evidence must be execution-generated, bound to commit SHA + artifacts.
 * hardLaunchClaim is always false from this module.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

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

  // Walk suites for leaf tests when stats are incomplete.
  let passed = 0;
  let failed = 0;
  let skippedCount = skipped;
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

  if (!total && expected === 0 && unexpected === 0 && skipped === 0) {
    return { ok: false, reason: 'Playwright report contains zero tests', passed: 0, failed: 0, skipped: 0, total: 0 };
  }

  const effectivePassed = expected || passed;
  const effectiveFailed = unexpected || failed;
  const effectiveSkipped = skipped || skippedCount;
  const effectiveTotal = effectivePassed + effectiveFailed + effectiveSkipped + flaky + interrupted;

  if (effectiveTotal === 0) {
    return { ok: false, reason: 'Playwright report contains zero tests', passed: 0, failed: 0, skipped: 0, total: 0 };
  }
  if (effectivePassed === 0 && effectiveSkipped > 0 && effectiveFailed === 0) {
    return { ok: false, reason: 'all tests skipped', passed: 0, failed: 0, skipped: effectiveSkipped, total: effectiveTotal };
  }
  if (effectiveFailed > 0 || interrupted > 0) {
    return {
      ok: false,
      reason: `failed=${effectiveFailed} interrupted=${interrupted}`,
      passed: effectivePassed,
      failed: effectiveFailed,
      skipped: effectiveSkipped,
      flaky,
      interrupted,
      total: effectiveTotal,
    };
  }
  if (effectivePassed < 1) {
    return { ok: false, reason: 'no passing tests', passed: effectivePassed, failed: effectiveFailed, skipped: effectiveSkipped, total: effectiveTotal };
  }
  // Flaky-only (passed after retry counted as flaky with no clean expected) is not enough.
  if (flaky > 0 && effectivePassed === 0) {
    return { ok: false, reason: 'flaky-only results', passed: 0, failed: 0, skipped: effectiveSkipped, flaky, total: effectiveTotal };
  }

  return {
    ok: true,
    passed: effectivePassed,
    failed: effectiveFailed,
    skipped: effectiveSkipped,
    flaky,
    interrupted,
    total: effectiveTotal,
  };
}

export function validateEvidenceRecord(record, { commitSha, now = Date.now() } = {}) {
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
  if (Number(record.passed || 0) < 1 && key !== 'productionMainHosting' && key !== 'productionAdminHosting' && key !== 'productionDeployment') {
    // Hosting evidence uses httpChecks instead of playwright passed count.
    if (!record.httpChecksOk) {
      return { ok: false, reason: 'no passing tests and no httpChecksOk' };
    }
  }
  if (Number(record.failed || 0) > 0) return { ok: false, reason: 'failed count > 0' };
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

  if (key === 'productionMainHosting' || key === 'productionAdminHosting' || key === 'productionDeployment') {
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
} = {}) {
  const missing = [];
  const invalid = [];

  for (const key of REQUIRED_PILOT_EVIDENCE) {
    const record = findEvidence(evidenceBatch, key, commitSha);
    if (!record) {
      missing.push(key);
      continue;
    }
    const check = validateEvidenceRecord(record, { commitSha, now });
    if (!check.ok) invalid.push(`${key}: ${check.reason}`);
  }

  // Strict deployment document checks (fail closed — never "not failed").
  const deployErrors = validateDeploymentDocument(deploymentDoc, commitSha);
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

export function validateDeploymentDocument(doc, commitSha) {
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
