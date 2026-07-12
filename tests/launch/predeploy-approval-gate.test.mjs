import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  checkCommitAndDigestInputs,
  parseAuthorizedFounderEmails,
  checkApproval,
  evaluatePredeployGate,
} from '../../scripts/predeploy-approval-gate.mjs';
import {
  validateRecentTimestamp,
  requireFullCommitSha,
  checkProductionIncidentsFailClosed,
  scanArtifactsForAppCheckFailures,
} from '../../scripts/lib/launch-approval-shared.mjs';

const COMMIT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_COMMIT = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DIGEST = 'd'.repeat(64);
const OTHER_DIGEST = 'e'.repeat(64);
const NOW_ISO = () => new Date().toISOString();

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'predeploy-gate-'));
}

function writeGateFile(root, doc) {
  mkdirSync(path.join(root, 'launch_package'), { recursive: true });
  writeFileSync(path.join(root, 'launch_package/launch-proof-gates.json'), JSON.stringify(doc, null, 2));
}

function writeIncidents(root, doc) {
  mkdirSync(path.join(root, 'launch_package'), { recursive: true });
  writeFileSync(path.join(root, 'launch_package/production-incidents.json'), JSON.stringify(doc, null, 2));
}

function cleanRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

function validGateDoc() {
  return {
    hardLaunchApproved: true,
    hardLaunchApprovedAt: NOW_ISO(),
    founderAuthorization: {
      founderEmail: 'ceo@bin-groups.com',
      founderName: 'Rashid AbdulGhani',
      authorizedAt: NOW_ISO(),
      commitSha: COMMIT,
      artifactDigest: DIGEST,
      signature: 'not-a-real-proof-of-anything',
    },
  };
}

function cleanIncidentsDoc() {
  return {
    schemaVersion: 1,
    activeIncidents: [],
    requiresRollback: false,
    rollbackReason: null,
    lastDeploymentFailed: false,
    lastDeploymentFailedAt: null,
    updatedAt: NOW_ISO(),
    updatedBy: 'test',
  };
}

describe('validateRecentTimestamp', () => {
  it('rejects missing/unparseable timestamps', () => {
    assert.match(validateRecentTimestamp(undefined, 1000, 'x'), /missing or is not a valid/);
    assert.match(validateRecentTimestamp('not-a-date', 1000, 'x'), /missing or is not a valid/);
  });

  it('rejects future timestamps beyond tolerance (NaN-safe, not `age > max` bypassable)', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    assert.match(validateRecentTimestamp(future, 24 * 60 * 60 * 1000, 'x'), /future/);
  });

  it('rejects stale timestamps', () => {
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    assert.match(validateRecentTimestamp(stale, 24 * 60 * 60 * 1000, 'x'), /stale/);
  });

  it('accepts a recent, valid timestamp', () => {
    assert.equal(validateRecentTimestamp(NOW_ISO(), 24 * 60 * 60 * 1000, 'x'), null);
  });
});

describe('requireFullCommitSha', () => {
  it('rejects short/mixed-case/missing SHAs', () => {
    assert.equal(requireFullCommitSha('abc123', 'GITHUB_SHA').ok, false);
    assert.equal(requireFullCommitSha('A'.repeat(40), 'GITHUB_SHA').ok, false);
    assert.equal(requireFullCommitSha('', 'GITHUB_SHA').ok, false);
  });

  it('accepts a full lowercase 40-char SHA', () => {
    assert.equal(requireFullCommitSha(COMMIT, 'GITHUB_SHA').ok, true);
  });
});

describe('checkCommitAndDigestInputs', () => {
  it('fails when GITHUB_SHA and VALIDATED_ARTIFACT_DIGEST are missing', () => {
    const { failures, commitSha, digest } = checkCommitAndDigestInputs({});
    assert.ok(failures.length >= 2);
    assert.equal(commitSha, null);
    assert.equal(digest, null);
  });

  it('passes with a valid full SHA and digest', () => {
    const { failures, commitSha, digest } = checkCommitAndDigestInputs({ GITHUB_SHA: COMMIT, VALIDATED_ARTIFACT_DIGEST: DIGEST });
    assert.deepEqual(failures, []);
    assert.equal(commitSha, COMMIT);
    assert.equal(digest, DIGEST);
  });
});

describe('parseAuthorizedFounderEmails', () => {
  it('fails closed when AUTHORIZED_FOUNDER_EMAILS is missing (no default fallback)', () => {
    const { failures, emails } = parseAuthorizedFounderEmails({});
    assert.equal(failures.length, 1);
    assert.deepEqual(emails, []);
  });

  it('never silently defaults to ceo@bin-groups.com', () => {
    const { failures } = parseAuthorizedFounderEmails({ AUTHORIZED_FOUNDER_EMAILS: '' });
    assert.equal(failures.length, 1);
  });

  it('parses a configured comma-separated list', () => {
    const { failures, emails } = parseAuthorizedFounderEmails({ AUTHORIZED_FOUNDER_EMAILS: 'a@x.com, B@X.com' });
    assert.deepEqual(failures, []);
    assert.deepEqual(emails, ['a@x.com', 'b@x.com']);
  });
});

describe('checkApproval (fail-closed, commit/digest bound)', () => {
  it('fails when launch-proof-gates.json is missing', () => {
    const root = tempRoot();
    try {
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.ok(failures.some((f) => /is missing/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails on malformed JSON', () => {
    const root = tempRoot();
    try {
      mkdirSync(path.join(root, 'launch_package'), { recursive: true });
      writeFileSync(path.join(root, 'launch_package/launch-proof-gates.json'), '{ not json');
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.ok(failures.some((f) => /not valid JSON/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails when hardLaunchApproved is not true', () => {
    const root = tempRoot();
    try {
      writeGateFile(root, { ...validGateDoc(), hardLaunchApproved: false });
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.ok(failures.some((f) => /hardLaunchApproved/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails when the approval commit SHA does not match GITHUB_SHA (wrong commit)', () => {
    const root = tempRoot();
    try {
      const doc = validGateDoc();
      doc.founderAuthorization.commitSha = OTHER_COMMIT;
      writeGateFile(root, doc);
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.ok(failures.some((f) => /commitSha.*does not match/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails when the approval artifact digest does not match VALIDATED_ARTIFACT_DIGEST (wrong artifact)', () => {
    const root = tempRoot();
    try {
      const doc = validGateDoc();
      doc.founderAuthorization.artifactDigest = OTHER_DIGEST;
      writeGateFile(root, doc);
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.ok(failures.some((f) => /artifactDigest.*does not match/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails when founderEmail is not in the authorized list', () => {
    const root = tempRoot();
    try {
      const doc = validGateDoc();
      doc.founderAuthorization.founderEmail = 'attacker@example.com';
      writeGateFile(root, doc);
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.ok(failures.some((f) => /not in the authorized founders list/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('does NOT reject a garbage "signature" value as a failure (no longer treated as identity proof)', () => {
    const root = tempRoot();
    try {
      const doc = validGateDoc();
      doc.founderAuthorization.signature = 'clearly not a hash of anything, just some words';
      writeGateFile(root, doc);
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.deepEqual(failures, []);
    } finally {
      cleanRoot(root);
    }
  });

  it('fails on a stale approval timestamp', () => {
    const root = tempRoot();
    try {
      const doc = validGateDoc();
      doc.hardLaunchApprovedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      writeGateFile(root, doc);
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.ok(failures.some((f) => /stale/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails on a future approval timestamp', () => {
    const root = tempRoot();
    try {
      const doc = validGateDoc();
      doc.founderAuthorization.authorizedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      writeGateFile(root, doc);
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.ok(failures.some((f) => /future/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('passes a fully valid, commit/digest-bound approval', () => {
    const root = tempRoot();
    try {
      writeGateFile(root, validGateDoc());
      const failures = checkApproval(root, { commitSha: COMMIT, artifactDigest: DIGEST, authorizedEmails: ['ceo@bin-groups.com'] });
      assert.deepEqual(failures, []);
    } finally {
      cleanRoot(root);
    }
  });
});

describe('checkProductionIncidentsFailClosed', () => {
  it('fails when production-incidents.json is missing (fail-closed, not "production is clean")', () => {
    const root = tempRoot();
    try {
      const failures = checkProductionIncidentsFailClosed(root);
      assert.ok(failures.some((f) => /is missing/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails on malformed incidents JSON', () => {
    const root = tempRoot();
    try {
      mkdirSync(path.join(root, 'launch_package'), { recursive: true });
      writeFileSync(path.join(root, 'launch_package/production-incidents.json'), 'const x = {};');
      const failures = checkProductionIncidentsFailClosed(root);
      assert.ok(failures.some((f) => /not valid JSON/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails when an incident is active', () => {
    const root = tempRoot();
    try {
      writeIncidents(root, { ...cleanIncidentsDoc(), activeIncidents: [{ id: 'INC-1', severity: 'critical', status: 'investigating' }] });
      const failures = checkProductionIncidentsFailClosed(root);
      assert.ok(failures.some((f) => /Active production incidents/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails when requiresRollback is true (rollback hold)', () => {
    const root = tempRoot();
    try {
      writeIncidents(root, { ...cleanIncidentsDoc(), requiresRollback: true, rollbackReason: 'bad deploy' });
      const failures = checkProductionIncidentsFailClosed(root);
      assert.ok(failures.some((f) => /rollback flag is set/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails during the post-failure cooldown window', () => {
    const root = tempRoot();
    try {
      writeIncidents(root, { ...cleanIncidentsDoc(), lastDeploymentFailed: true, lastDeploymentFailedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() });
      const failures = checkProductionIncidentsFailClosed(root);
      assert.ok(failures.some((f) => /Wait at least/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('fails on a stale updatedAt (ops must keep this file current)', () => {
    const root = tempRoot();
    try {
      writeIncidents(root, { ...cleanIncidentsDoc(), updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() });
      const failures = checkProductionIncidentsFailClosed(root);
      assert.ok(failures.some((f) => /stale/.test(f)));
    } finally {
      cleanRoot(root);
    }
  });

  it('passes with a clean, freshly-updated incidents file', () => {
    const root = tempRoot();
    try {
      writeIncidents(root, cleanIncidentsDoc());
      const failures = checkProductionIncidentsFailClosed(root);
      assert.deepEqual(failures, []);
    } finally {
      cleanRoot(root);
    }
  });
});

describe('scanArtifactsForAppCheckFailures', () => {
  it('returns empty when the artifacts directory does not exist', () => {
    const root = tempRoot();
    try {
      assert.deepEqual(scanArtifactsForAppCheckFailures(root), []);
    } finally {
      cleanRoot(root);
    }
  });

  it('detects an App Check token-fetch failure in a report artifact', () => {
    const root = tempRoot();
    try {
      const dir = path.join(root, 'launch_package/artifacts');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'business-broker-abc.json'), JSON.stringify({ log: 'AppCheck: Fetch server returned an HTTP error status. appCheck/fetch-status-error' }));
      const hits = scanArtifactsForAppCheckFailures(root);
      assert.deepEqual(hits, ['business-broker-abc.json']);
    } finally {
      cleanRoot(root);
    }
  });

  it('does not flag ordinary 403s from expected negative-path assertions', () => {
    const root = tempRoot();
    try {
      const dir = path.join(root, 'launch_package/artifacts');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'launch-audit-abc.json'), JSON.stringify({ log: 'Failed to load resource: the server responded with a status of 403 ()' }));
      const hits = scanArtifactsForAppCheckFailures(root);
      assert.deepEqual(hits, []);
    } finally {
      cleanRoot(root);
    }
  });
});

describe('evaluatePredeployGate (end-to-end, automation gates skipped)', () => {
  it('reports zero failures for a fully valid, commit/digest-bound, incident-free release', () => {
    const root = tempRoot();
    try {
      writeGateFile(root, validGateDoc());
      writeIncidents(root, cleanIncidentsDoc());
      const failures = evaluatePredeployGate(root, { GITHUB_SHA: COMMIT, VALIDATED_ARTIFACT_DIGEST: DIGEST, AUTHORIZED_FOUNDER_EMAILS: 'ceo@bin-groups.com' }, { skipAutomationGates: true });
      assert.deepEqual(failures, []);
    } finally {
      cleanRoot(root);
    }
  });

  it('accumulates failures from every layer at once (missing env, missing files)', () => {
    const root = tempRoot();
    try {
      const failures = evaluatePredeployGate(root, {}, { skipAutomationGates: true });
      assert.ok(failures.length >= 4, `expected multiple accumulated failures, got: ${JSON.stringify(failures)}`);
    } finally {
      cleanRoot(root);
    }
  });
});
