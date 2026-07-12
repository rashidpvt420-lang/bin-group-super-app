import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  CRITICAL_EVIDENCE_KEYS,
  HARD_LAUNCH_CLAIM,
  PRODUCTION,
  REQUIRED_PILOT_EVIDENCE,
  evaluatePilotEligibility,
  parsePlaywrightJsonReport,
  validateDeploymentDocument,
  validateEvidenceRecord,
} from '../scripts/lib/launch-honesty.mjs';

const ROOT = process.cwd();
const COMMIT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function baseRecord(overrides = {}) {
  const now = new Date().toISOString();
  return {
    testName: 'businessOwner',
    suiteName: 'business-owner',
    source: 'run-critical-evidence:businessOwner',
    executionGenerated: true,
    exitCode: 0,
    commitSha: COMMIT,
    mainUrl: PRODUCTION.mainUrl,
    adminUrl: PRODUCTION.adminUrl,
    startedAt: now,
    finishedAt: now,
    passed: 3,
    failed: 0,
    skipped: 0,
    artifactHash: 'a'.repeat(64),
    hardLaunchClaim: false,
    ...overrides,
  };
}

function validDeployment(overrides = {}) {
  return {
    status: 'passed',
    projectId: PRODUCTION.projectId,
    mainUrl: PRODUCTION.mainUrl,
    adminUrl: PRODUCTION.adminUrl,
    deployedCommitSha: COMMIT,
    deployedAt: new Date().toISOString(),
    httpChecksOk: true,
    bundleVerified: true,
    hardLaunchClaim: false,
    ...overrides,
  };
}

function fullEvidenceBatch() {
  const records = REQUIRED_PILOT_EVIDENCE.map((key) => {
    if (key.startsWith('production')) {
      return baseRecord({
        testName: key,
        suiteName: 'production-deployment',
        passed: 1,
        httpChecksOk: true,
        deploymentStatus: 'passed',
        projectId: PRODUCTION.projectId,
        deployedCommitSha: COMMIT,
        bundleVerified: true,
      });
    }
    if (key === 'adminCredentialLogin') {
      return baseRecord({ testName: key, suiteName: 'business-admin' });
    }
    return baseRecord({ testName: key, suiteName: key });
  });
  return { records };
}

describe('launch honesty — Playwright report parsing', () => {
  it('rejects zero tests', () => {
    const parsed = parsePlaywrightJsonReport({ suites: [], stats: {} });
    assert.equal(parsed.ok, false);
    assert.match(parsed.reason, /zero tests/i);
  });

  it('rejects all skipped', () => {
    const parsed = parsePlaywrightJsonReport({
      stats: { expected: 0, unexpected: 0, skipped: 4, flaky: 0 },
      suites: [],
    });
    assert.equal(parsed.ok, false);
    assert.match(parsed.reason, /skipped/i);
  });

  it('accepts passing report', () => {
    const parsed = parsePlaywrightJsonReport({
      stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 },
      suites: [],
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.passed, 2);
  });
});

describe('launch honesty — evidence validation', () => {
  it('rejects evidence from another commit', () => {
    const check = validateEvidenceRecord(baseRecord({ commitSha: OTHER }), { commitSha: COMMIT });
    assert.equal(check.ok, false);
    assert.match(check.reason, /commitSha mismatch/i);
  });

  it('rejects staging URL evidence', () => {
    const check = validateEvidenceRecord(
      baseRecord({ mainUrl: 'https://staging.example.com' }),
      { commitSha: COMMIT },
    );
    assert.equal(check.ok, false);
    assert.match(check.reason, /production|staging|non-production/i);
  });

  it('rejects non-execution-generated evidence', () => {
    const check = validateEvidenceRecord(
      baseRecord({ executionGenerated: false }),
      { commitSha: COMMIT },
    );
    assert.equal(check.ok, false);
    assert.match(check.reason, /execution-generated/i);
  });

  it('rejects stale evidence', () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 80).toISOString();
    const check = validateEvidenceRecord(
      baseRecord({ finishedAt: old, startedAt: old }),
      { commitSha: COMMIT },
    );
    assert.equal(check.ok, false);
    assert.match(check.reason, /stale|expired/i);
  });

  it('rejects malformed record', () => {
    const check = validateEvidenceRecord(null, { commitSha: COMMIT });
    assert.equal(check.ok, false);
  });
});

describe('launch honesty — deployment fail-closed', () => {
  for (const status of ['missing', 'pending', 'unknown', 'skipped', 'waived', 'failed', '']) {
    it(`rejects hosting status "${status || '(empty)'}"`, () => {
      const errors = validateDeploymentDocument(validDeployment({ status: status || undefined }), COMMIT);
      assert.ok(errors.length > 0, `expected errors for status=${status}`);
    });
  }

  it('rejects deployed SHA different from tested SHA', () => {
    const errors = validateDeploymentDocument(validDeployment({ deployedCommitSha: OTHER }), COMMIT);
    assert.ok(errors.some((e) => /commit/i.test(e)));
  });

  it('accepts strict passed deployment', () => {
    const errors = validateDeploymentDocument(validDeployment(), COMMIT);
    assert.deepEqual(errors, []);
  });
});

describe('launch honesty — pilot eligibility', () => {
  it('fails when business-role evidence is missing', () => {
    const batch = { records: [baseRecord({ testName: 'adminCredentialLogin' })] };
    const result = evaluatePilotEligibility({
      evidenceBatch: batch,
      commitSha: COMMIT,
      deploymentDoc: validDeployment(),
    });
    assert.equal(result.pilotEligible, false);
    assert.ok(result.missing.includes('businessOwner'));
    assert.equal(result.hardLaunchClaim, false);
  });

  it('fails when only admin evidence is present', () => {
    const batch = { records: [baseRecord({ testName: 'adminCredentialLogin' })] };
    const result = evaluatePilotEligibility({
      evidenceBatch: batch,
      commitSha: COMMIT,
      deploymentDoc: validDeployment(),
    });
    assert.equal(result.pilotEligible, false);
    assert.ok(
      result.invalid.some((i) => /adminCredentialLogin alone/i.test(i)) ||
        result.missing.length > 0,
    );
  });

  it('fails for evidence from another commit', () => {
    const batch = fullEvidenceBatch();
    batch.records = batch.records.map((r) => ({ ...r, commitSha: OTHER }));
    const result = evaluatePilotEligibility({
      evidenceBatch: batch,
      commitSha: COMMIT,
      deploymentDoc: validDeployment(),
    });
    assert.equal(result.pilotEligible, false);
  });

  it('fails when hosting status is missing', () => {
    const result = evaluatePilotEligibility({
      evidenceBatch: fullEvidenceBatch(),
      commitSha: COMMIT,
      deploymentDoc: null,
    });
    assert.equal(result.pilotEligible, false);
    assert.ok(result.invalid.some((i) => /missing|malformed/i.test(i)));
  });

  it('passes only when every required artifact is valid for same commit', () => {
    const result = evaluatePilotEligibility({
      evidenceBatch: fullEvidenceBatch(),
      commitSha: COMMIT,
      deploymentDoc: validDeployment(),
    });
    assert.equal(result.pilotEligible, true);
    assert.equal(result.hardLaunchClaim, HARD_LAUNCH_CLAIM);
    assert.equal(result.hardLaunchClaim, false);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.invalid, []);
  });
});

describe('launch honesty — manual evidence recorder refuses critical keys', () => {
  it('refuses caller manually supplying exit-code 0 for critical key', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/record-launch-evidence-batch.mjs',
        '--test',
        'businessOwner',
        '--exit-code',
        '0',
        '--proof',
        'manufactured proof text that should be rejected as critical',
        '--source',
        'business-admin',
      ],
      { encoding: 'utf8', cwd: ROOT },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /REFUSED|critical/i);
  });

  it('refuses source string manually set to business-admin for critical key', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/record-launch-evidence-batch.mjs',
        '--test',
        'adminCredentialLogin',
        '--proof',
        'manufactured admin login proof that must not be accepted manually',
        '--source',
        'business-admin',
      ],
      { encoding: 'utf8', cwd: ROOT },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /REFUSED|critical/i);
  });

  for (const key of CRITICAL_EVIDENCE_KEYS) {
    it(`refuses manual recording of ${key}`, () => {
      const result = spawnSync(
        process.execPath,
        [
          'scripts/record-launch-evidence-batch.mjs',
          '--test',
          key,
          '--proof',
          'attempt to manually record a critical launch evidence key which must fail',
        ],
        { encoding: 'utf8', cwd: ROOT },
      );
      assert.notEqual(result.status, 0);
    });
  }
});

describe('launch honesty — App Check failure pattern', () => {
  it('treats App Check 403/429/permission-denied as failure signals', () => {
    const APP_CHECK_FAILURE_RE =
      /app check|firebase.?app.?check|appcheck|permission-denied|insufficient permissions|unauthenticated|too many requests|resource.?exhausted|throttl|retry|status.?code.?(401|403|429)|\b401\b|\b403\b|\b429\b/i;
    const collectAppCheckFailures = (messages) => messages.filter((msg) => APP_CHECK_FAILURE_RE.test(msg));
    const hits = collectAppCheckFailures([
      'FirebaseError: [code=permission-denied]: Missing or insufficient permissions.',
      'HTTP 403 https://firestore.googleapis.com/v1/projects/bin-group-57c60/databases/(default)/documents',
      'HTTP 429 https://firebaseappcheck.googleapis.com/v1/projects/x:exchangeDebugToken',
      'unrelated warning',
    ]);
    assert.ok(hits.some((h) => /403/.test(h)));
    assert.ok(hits.some((h) => /429/.test(h)));
    assert.ok(hits.some((h) => /permission-denied/i.test(h)));
    assert.equal(hits.includes('unrelated warning'), false);
  });
});
