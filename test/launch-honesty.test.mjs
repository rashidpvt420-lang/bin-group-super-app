import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  CRITICAL_EVIDENCE_KEYS,
  HARD_LAUNCH_CLAIM,
  PRODUCTION,
  REQUIRED_PILOT_EVIDENCE,
  evaluatePilotEligibility,
  parsePlaywrightJsonReport,
  resolveApprovedArtifactPath,
  revalidatePlaywrightArtifact,
  sha256File,
  validateDeploymentDocument,
  validateEvidenceRecord,
} from '../scripts/lib/launch-honesty.mjs';

const ROOT = process.cwd();
const COMMIT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function sha256Text(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function makePassingReport({ passed = 2, skipped = 0, failed = 0, specs = ['tests/e2e/business-owner.spec.ts'] } = {}) {
  const leafCount = passed + skipped + failed;
  const leaves = Array.from({ length: leafCount }, (_, i) => {
    let status = 'passed';
    if (i < failed) status = 'failed';
    else if (i < failed + skipped) status = 'skipped';
    return {
      title: `test-${i}`,
      tests: [{ status, results: [{ status }] }],
    };
  });
  // Put executable leaves on the first suite; remaining expected specs appear as empty suites for file presence.
  const suites = specs.map((file, idx) => ({
    file,
    specs: idx === 0 ? leaves.map((leaf) => ({ ...leaf, file })) : [{ title: `${path.basename(file)}-anchor`, file, tests: [] }],
  }));
  return {
    stats: {
      expected: passed,
      unexpected: failed,
      skipped,
      flaky: 0,
      interrupted: 0,
    },
    suites,
  };
}

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
    artifactPath: 'launch_package/artifacts/business-owner-aaaaaaaa.json',
    artifactHash: 'a'.repeat(64),
    expectedSpecs: ['tests/e2e/business-owner.spec.ts'],
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
    workflowRunId: '123456789',
    workflowRunAttempt: 1,
    workflowRef: 'refs/heads/main',
    repository: 'rashidpvt420-lang/bin-group-super-app',
    successfulComponents: ['hosting', 'firestoreRules', 'firestoreIndexes', 'storageRules', 'functions'],
    source: 'firebase-production-deploy-workflow',
    ...overrides,
  };
}

function writeArtifactWorkspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'launch-honesty-'));
  mkdirSync(path.join(dir, 'launch_package', 'artifacts'), { recursive: true });
  return dir;
}

function installPlaywrightEvidence(root, key, { passed = 2, skipped = 0, specs } = {}) {
  const expectedSpecs =
    specs ||
    (key === 'adminCredentialLogin'
      ? ['tests/e2e/business-admin.spec.ts']
      : key === 'launchAuditLive'
        ? ['tests/e2e/launch-audit-public-routes.spec.ts']
        : key === 'appCheckAuthenticatedAccess'
          ? ['tests/e2e/business-owner.spec.ts']
          : key === 'businessGlobal'
            ? ['tests/e2e/business-global.spec.ts']
            : [`tests/e2e/${key.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`).replace(/^-/, '')}.spec.ts`.replace('business-', 'business-')]);

  // Normalize known keys to real suite files.
  const suiteSpecs = {
    adminCredentialLogin: ['tests/e2e/business-admin.spec.ts'],
    businessOwner: ['tests/e2e/business-owner.spec.ts'],
    businessTenant: ['tests/e2e/business-tenant.spec.ts'],
    businessTechnician: ['tests/e2e/business-technician.spec.ts'],
    businessBroker: ['tests/e2e/business-broker.spec.ts'],
    businessGlobal: ['tests/e2e/business-global.spec.ts'],
    launchAuditLive: [
      'tests/e2e/launch-audit-public-routes.spec.ts',
      'tests/e2e/launch-audit-admin.spec.ts',
      'tests/e2e/launch-audit-owner.spec.ts',
      'tests/e2e/launch-audit-tenant.spec.ts',
      'tests/e2e/launch-audit-technician.spec.ts',
      'tests/e2e/launch-audit-broker.spec.ts',
      'tests/e2e/hard-launch-routes.spec.ts',
    ],
    appCheckAuthenticatedAccess: ['tests/e2e/business-owner.spec.ts'],
  };
  const useSpecs = suiteSpecs[key] || expectedSpecs;
  const report = makePassingReport({ passed, skipped, specs: useSpecs });
  const relative = `launch_package/artifacts/${key}-${COMMIT.slice(0, 8)}.json`;
  const abs = path.join(root, relative);
  writeFileSync(abs, `${JSON.stringify(report)}\n`);
  const hash = sha256File(abs);
  return baseRecord({
    testName: key,
    suiteName: key,
    passed,
    failed: 0,
    skipped,
    artifactPath: relative,
    artifactHash: hash,
    expectedSpecs: useSpecs,
  });
}

function installDeploymentEvidence(root, commitSha = COMMIT) {
  const doc = validDeployment({ deployedCommitSha: commitSha });
  const relative = 'launch_package/production-deployment.json';
  const abs = path.join(root, relative);
  writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`);
  const hash = sha256File(abs);
  const now = new Date().toISOString();
  return {
    doc,
    records: ['productionMainHosting', 'productionAdminHosting'].map((key) =>
      baseRecord({
        testName: key,
        suiteName: 'production-deployment',
        passed: 1,
        httpChecksOk: true,
        deploymentStatus: 'passed',
        projectId: PRODUCTION.projectId,
        deployedCommitSha: commitSha,
        bundleVerified: true,
        artifactPath: relative,
        artifactHash: hash,
        startedAt: now,
        finishedAt: now,
      }),
    ),
  };
}

function fullEvidenceBatch(root) {
  const keys = REQUIRED_PILOT_EVIDENCE.filter((k) => !k.startsWith('production'));
  const records = keys.map((key) => installPlaywrightEvidence(root, key, { passed: 2 }));
  const deploy = installDeploymentEvidence(root);
  return { records: [...records, ...deploy.records], deploymentDoc: deploy.doc };
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

  it('rejects one passed plus one skipped', () => {
    const parsed = parsePlaywrightJsonReport(
      makePassingReport({ passed: 1, skipped: 1, specs: ['tests/e2e/business-owner.spec.ts'] }),
    );
    assert.equal(parsed.ok, false);
    assert.match(parsed.reason, /skipped/i);
  });

  it('rejects multiple passed plus one skipped', () => {
    const parsed = parsePlaywrightJsonReport(
      makePassingReport({ passed: 5, skipped: 1, specs: ['tests/e2e/business-owner.spec.ts'] }),
    );
    assert.equal(parsed.ok, false);
    assert.match(parsed.reason, /skipped/i);
  });

  it('rejects interrupted > 0', () => {
    const parsed = parsePlaywrightJsonReport({
      stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0, interrupted: 1 },
      suites: [],
    });
    assert.equal(parsed.ok, false);
    assert.match(parsed.reason, /interrupted/i);
  });

  it('rejects failed > 0', () => {
    const parsed = parsePlaywrightJsonReport({
      stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0 },
      suites: [],
    });
    assert.equal(parsed.ok, false);
    assert.match(parsed.reason, /failed/i);
  });

  it('accepts passing report with zero skips', () => {
    const parsed = parsePlaywrightJsonReport(
      makePassingReport({ passed: 2, skipped: 0, specs: ['tests/e2e/business-owner.spec.ts'] }),
    );
    assert.equal(parsed.ok, true);
    assert.equal(parsed.passed, 2);
    assert.equal(parsed.skipped, 0);
  });
});

describe('launch honesty — evidence validation', () => {
  it('rejects evidence from another commit', () => {
    const check = validateEvidenceRecord(baseRecord({ commitSha: OTHER }), {
      commitSha: COMMIT,
      revalidateArtifact: false,
    });
    assert.equal(check.ok, false);
    assert.match(check.reason, /commitSha mismatch/i);
  });

  it('rejects staging URL evidence', () => {
    const check = validateEvidenceRecord(baseRecord({ mainUrl: 'https://staging.example.com' }), {
      commitSha: COMMIT,
      revalidateArtifact: false,
    });
    assert.equal(check.ok, false);
    assert.match(check.reason, /production|staging|non-production/i);
  });

  it('rejects non-execution-generated evidence', () => {
    const check = validateEvidenceRecord(baseRecord({ executionGenerated: false }), {
      commitSha: COMMIT,
      revalidateArtifact: false,
    });
    assert.equal(check.ok, false);
    assert.match(check.reason, /execution-generated/i);
  });

  it('rejects stale evidence', () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 80).toISOString();
    const check = validateEvidenceRecord(baseRecord({ finishedAt: old, startedAt: old }), {
      commitSha: COMMIT,
      revalidateArtifact: false,
    });
    assert.equal(check.ok, false);
    assert.match(check.reason, /stale|expired/i);
  });

  it('rejects malformed record', () => {
    const check = validateEvidenceRecord(null, { commitSha: COMMIT, revalidateArtifact: false });
    assert.equal(check.ok, false);
  });

  it('rejects skipped > 0 on launch-critical evidence', () => {
    const check = validateEvidenceRecord(baseRecord({ passed: 2, skipped: 1 }), {
      commitSha: COMMIT,
      revalidateArtifact: false,
    });
    assert.equal(check.ok, false);
    assert.match(check.reason, /skipped/i);
  });
});

describe('launch honesty — cryptographic artifact revalidation', () => {
  it('rejects missing artifact file', () => {
    const root = writeArtifactWorkspace();
    try {
      const record = baseRecord({
        artifactPath: 'launch_package/artifacts/missing.json',
        artifactHash: 'b'.repeat(64),
      });
      const check = validateEvidenceRecord(record, { commitSha: COMMIT, root });
      assert.equal(check.ok, false);
      assert.match(check.reason, /missing/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects wrong artifact hash', () => {
    const root = writeArtifactWorkspace();
    try {
      const record = installPlaywrightEvidence(root, 'businessOwner', { passed: 2 });
      record.artifactHash = 'c'.repeat(64);
      const check = validateEvidenceRecord(record, { commitSha: COMMIT, root });
      assert.equal(check.ok, false);
      assert.match(check.reason, /mismatch/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects path traversal', () => {
    const check = resolveApprovedArtifactPath('../etc/passwd', ROOT);
    assert.equal(check.ok, false);
    assert.match(check.reason, /traversal|inside|absolute|escape/i);
  });

  it('rejects absolute artifact paths', () => {
    const check = resolveApprovedArtifactPath('/tmp/evil.json', ROOT);
    assert.equal(check.ok, false);
    assert.match(check.reason, /absolute|relative/i);
  });

  it('rejects symlink escape outside approved artifacts directory', () => {
    const root = writeArtifactWorkspace();
    try {
      const outside = path.join(root, 'outside-secret.json');
      writeFileSync(outside, '{"suites":[],"stats":{"expected":1}}');
      const linkRel = 'launch_package/artifacts/escape.json';
      symlinkSync(outside, path.join(root, linkRel));
      const check = resolveApprovedArtifactPath(linkRel, root);
      assert.equal(check.ok, false);
      assert.match(check.reason, /symlink|escape/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects artifact report changed after recording', () => {
    const root = writeArtifactWorkspace();
    try {
      const record = installPlaywrightEvidence(root, 'businessOwner', { passed: 2 });
      const abs = path.join(root, record.artifactPath);
      writeFileSync(abs, `${JSON.stringify(makePassingReport({ passed: 9, specs: record.expectedSpecs }))}\n`);
      const check = revalidatePlaywrightArtifact(record, { root });
      assert.equal(check.ok, false);
      assert.match(check.reason, /mismatch|changed|fabricated/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects report counts differing from the evidence JSON', () => {
    const root = writeArtifactWorkspace();
    try {
      const record = installPlaywrightEvidence(root, 'businessOwner', { passed: 2 });
      record.passed = 99;
      const check = revalidatePlaywrightArtifact(record, { root });
      assert.equal(check.ok, false);
      assert.match(check.reason, /passed=/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects wrong spec files in an otherwise passing report', () => {
    const root = writeArtifactWorkspace();
    try {
      const report = makePassingReport({
        passed: 2,
        specs: ['tests/e2e/unrelated-suite.spec.ts'],
      });
      const relative = 'launch_package/artifacts/wrong-specs.json';
      writeFileSync(path.join(root, relative), `${JSON.stringify(report)}\n`);
      const record = baseRecord({
        artifactPath: relative,
        artifactHash: sha256File(path.join(root, relative)),
        passed: 2,
        expectedSpecs: ['tests/e2e/business-owner.spec.ts'],
      });
      const check = revalidatePlaywrightArtifact(record, { root });
      assert.equal(check.ok, false);
      assert.match(check.reason, /missing expected suite\/spec/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts matching artifact hash + report + specs', () => {
    const root = writeArtifactWorkspace();
    try {
      const record = installPlaywrightEvidence(root, 'businessOwner', { passed: 2 });
      const check = validateEvidenceRecord(record, { commitSha: COMMIT, root });
      assert.equal(check.ok, true, check.reason);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

  it('rejects partial production deployment components', () => {
    const errors = validateDeploymentDocument(
      validDeployment({
        successfulComponents: ['hosting', 'firestoreRules'],
      }),
      COMMIT,
    );
    assert.ok(errors.some((e) => /successfulComponents missing/i.test(e)));
  });

  it('rejects deployment metadata not generated by the workflow', () => {
    const errors = validateDeploymentDocument(
      validDeployment({ source: 'hand-written' }),
      COMMIT,
      { requireWorkflowProvenance: true },
    );
    assert.ok(errors.some((e) => /workflow/i.test(e)));
  });

  it('rejects deployment metadata from another workflow run when on-disk differs', () => {
    const root = writeArtifactWorkspace();
    try {
      const onDisk = validDeployment({ workflowRunId: '111' });
      writeFileSync(path.join(root, 'launch_package/production-deployment.json'), `${JSON.stringify(onDisk)}\n`);
      const errors = validateDeploymentDocument(validDeployment({ workflowRunId: '999' }), COMMIT, { root });
      assert.ok(errors.some((e) => /another workflow run/i.test(e)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts strict passed deployment with workflow provenance', () => {
    const errors = validateDeploymentDocument(validDeployment(), COMMIT, { requireWorkflowProvenance: true });
    assert.deepEqual(errors, []);
  });
});

describe('launch honesty — pilot eligibility', () => {
  it('fails when business-role evidence is missing', () => {
    const root = writeArtifactWorkspace();
    try {
      const batch = { records: [installPlaywrightEvidence(root, 'adminCredentialLogin')] };
      const result = evaluatePilotEligibility({
        evidenceBatch: batch,
        commitSha: COMMIT,
        deploymentDoc: validDeployment(),
        root,
      });
      assert.equal(result.pilotEligible, false);
      assert.ok(result.missing.includes('businessOwner'));
      assert.equal(result.hardLaunchClaim, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when only admin evidence is present', () => {
    const root = writeArtifactWorkspace();
    try {
      const batch = { records: [installPlaywrightEvidence(root, 'adminCredentialLogin')] };
      const result = evaluatePilotEligibility({
        evidenceBatch: batch,
        commitSha: COMMIT,
        deploymentDoc: validDeployment(),
        root,
      });
      assert.equal(result.pilotEligible, false);
      assert.ok(
        result.invalid.some((i) => /adminCredentialLogin alone/i.test(i)) || result.missing.length > 0,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails for evidence from another commit', () => {
    const root = writeArtifactWorkspace();
    try {
      const full = fullEvidenceBatch(root);
      full.records = full.records.map((r) => ({ ...r, commitSha: OTHER }));
      const result = evaluatePilotEligibility({
        evidenceBatch: full,
        commitSha: COMMIT,
        deploymentDoc: full.deploymentDoc,
        root,
      });
      assert.equal(result.pilotEligible, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when hosting status is missing', () => {
    const root = writeArtifactWorkspace();
    try {
      const full = fullEvidenceBatch(root);
      const result = evaluatePilotEligibility({
        evidenceBatch: { records: full.records.filter((r) => !r.testName.startsWith('production')) },
        commitSha: COMMIT,
        deploymentDoc: null,
        root,
      });
      assert.equal(result.pilotEligible, false);
      assert.ok(result.invalid.some((i) => /missing|malformed/i.test(i)) || result.missing.length > 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when mixed passed/skipped tests are recorded', () => {
    const root = writeArtifactWorkspace();
    try {
      const full = fullEvidenceBatch(root);
      // Overwrite owner artifact with a mixed report; hash will not match parse acceptance
      // even if someone force-wrote skipped into the evidence JSON.
      const poisoned = installPlaywrightEvidence(root, 'businessOwner', { passed: 2 });
      poisoned.skipped = 1;
      poisoned.passed = 2;
      full.records = full.records.map((r) => (r.testName === 'businessOwner' ? poisoned : r));
      const result = evaluatePilotEligibility({
        evidenceBatch: full,
        commitSha: COMMIT,
        deploymentDoc: full.deploymentDoc,
        root,
      });
      assert.equal(result.pilotEligible, false);
      assert.ok(result.invalid.some((i) => /skipped/i.test(i)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when deployment metadata is not workflow-generated', () => {
    const root = writeArtifactWorkspace();
    try {
      const full = fullEvidenceBatch(root);
      const result = evaluatePilotEligibility({
        evidenceBatch: full,
        commitSha: COMMIT,
        deploymentDoc: validDeployment({ source: 'manual-json' }),
        root,
      });
      assert.equal(result.pilotEligible, false);
      assert.ok(result.invalid.some((i) => /workflow/i.test(i)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes only when every required artifact is valid for same commit', () => {
    const root = writeArtifactWorkspace();
    try {
      const full = fullEvidenceBatch(root);
      const result = evaluatePilotEligibility({
        evidenceBatch: full,
        commitSha: COMMIT,
        deploymentDoc: full.deploymentDoc,
        root,
      });
      assert.equal(result.pilotEligible, true, JSON.stringify(result.invalid, null, 2));
      assert.equal(result.hardLaunchClaim, HARD_LAUNCH_CLAIM);
      assert.equal(result.hardLaunchClaim, false);
      assert.deepEqual(result.missing, []);
      assert.deepEqual(result.invalid, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('launch honesty — hardcoded credential fallbacks must not remain', () => {
  it('rejects known hardcoded E2E password fallbacks in scanned sources', () => {
    const targets = [
      'tests/e2e/final-admin-login.spec.ts',
      'tests/e2e/launch-five-profile-walkthrough.spec.ts',
      'tests/e2e/mosque-onboarding.spec.ts',
      'scripts/seed-e2e-accounts.js',
      'scripts/seed-e2e-tenant-fixture.mjs',
    ];
    const forbidden = [/E2e!Test!Pass2026/, /MasjidPass123!/, /Password123!/, /\|\|\s*['"][^'"]*Pass/];
    for (const rel of targets) {
      const text = readFileSync(path.join(ROOT, rel), 'utf8');
      for (const re of forbidden) {
        assert.equal(re.test(text), false, `${rel} still matches ${re}`);
      }
    }
  });
});

describe('launch honesty — admin bundle without REACT_APP_FIREBASE_* fails verification', () => {
  it('fails verify:admin-firebase when build lacks project embedding', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'admin-build-'));
    try {
      mkdirSync(path.join(dir, 'static', 'js'), { recursive: true });
      writeFileSync(path.join(dir, 'index.html'), '<html><script src="/static/js/main.js"></script></html>');
      writeFileSync(path.join(dir, 'static', 'js', 'main.js'), 'console.log("no firebase config here");');
      const result = spawnSync(
        process.execPath,
        ['scripts/verify-admin-firebase-build.mjs', '--build', dir],
        { encoding: 'utf8', cwd: ROOT },
      );
      assert.notEqual(result.status, 0);
      assert.match(`${result.stderr}${result.stdout}`, /projectId|FAIL|missing|mismatch|admin/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

describe('launch honesty — write-production-deployment-metadata refuse partial', () => {
  it('refuses to write passed metadata without all components', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/write-production-deployment-metadata.mjs', '--components', 'hosting,functions'],
      {
        encoding: 'utf8',
        cwd: ROOT,
        env: { ...process.env, GITHUB_SHA: COMMIT },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /REFUSED|missing/i);
    assert.equal(existsSync(path.join(ROOT, 'launch_package/production-deployment.json')), false);
  });
});
