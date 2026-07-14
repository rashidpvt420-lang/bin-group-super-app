#!/usr/bin/env node
/**
 * Regression tests for scripts/normalize-firestore-rules.mjs.
 * Uses temporary directories only — never mutates the repository firestore.rules.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const normalizerPath = path.join(repoRoot, 'scripts/normalize-firestore-rules.mjs');

function conflictTokens() {
  return {
    start: `${'<'.repeat(7)} Updated upstream`,
    mid: '='.repeat(7),
    end: `${'>'.repeat(7)} Stashed changes`,
  };
}

function makeConflictedFixture() {
  const { start, mid, end } = conflictTokens();
  return [
    'rules_version = \'2\';',
    'service cloud.firestore {',
    '  match /databases/{database}/documents {',
    '    function hasTechnicianDispatchAuthority() { return true; }',
    start,
    "    function openMissionAvailable(data) { return data.assignedTechnicianId == null && data.status in ['OPEN', 'open', 'emergency_submitted']; }",
    '    function openMissionPoolRead(data) { return hasTechnicianDispatchAuthority() && openMissionAvailable(data); }',
    mid,
    "    function openMissionPoolRead(data) { return hasTechnicianDispatchAuthority() && data.assignedTechnicianId == null && data.status in ['OPEN', 'open', 'emergency_submitted']; }",
    end,
    '    function safeOpenMissionClaim() {',
    start,
    '      return hasTechnicianDispatchAuthority() && openMissionAvailable(resource.data) &&',
    mid,
    '      return hasTechnicianDispatchAuthority() && openMissionPoolRead(resource.data) &&',
    end,
    '        request.resource.data.assignedTechnicianId == request.auth.uid;',
    '    }',
    "      allow read: if isAdmin() || hasPermission('canManageProperties') || ownerCanRead(resource.data) || tenantOwns(resource.data) ||",
    "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'tenant');",
    '    match /notifications/{notificationId} {',
    '      allow read: if isAdmin();',
    '      allow create: if signedIn();',
    '      allow update: if isAdmin();',
    '      allow delete: if isAdmin();',
    '    }',
    '    match /{document=**} {',
    '      allow read, write: if false;',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
}

function makeCleanFixture() {
  return [
    'rules_version = \'2\';',
    'service cloud.firestore {',
    '  match /databases/{database}/documents {',
    '    function hasTechnicianDispatchAuthority() { return true; }',
    "    function openMissionAvailable(data) { return data.assignedTechnicianId == null && data.status in ['OPEN', 'open', 'emergency_submitted']; }",
    '    function openMissionPoolRead(data) { return hasTechnicianDispatchAuthority() && openMissionAvailable(data); }',
    '    function safeOpenMissionClaim() {',
    '      return hasTechnicianDispatchAuthority() && openMissionAvailable(resource.data) &&',
    '        request.resource.data.assignedTechnicianId == request.auth.uid;',
    '    }',
    "      allow read: if isAdmin() || hasPermission('canManageProperties') || ownerCanRead(resource.data) || tenantOwns(resource.data) ||",
    "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'tenant');",
    '    match /notifications/{notificationId} {',
    '      allow read: if isAdmin();',
    '      allow create: if signedIn();',
    '      allow update: if isAdmin();',
    '      allow delete: if isAdmin();',
    '    }',
    '    match /{document=**} {',
    '      allow read, write: if false;',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
}

function runNormalizer(cwd) {
  return spawnSync(process.execPath, [normalizerPath], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
  });
}

function withTempRules(rulesText, fn) {
  const directory = mkdtempSync(path.join(tmpdir(), 'normalize-rules-'));
  try {
    writeFileSync(path.join(directory, 'firestore.rules'), rulesText);
    return fn(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('normalize-firestore-rules.mjs', () => {
  it('source parses with node --check', () => {
    const result = spawnSync(process.execPath, ['--check', normalizerPath], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });

  it('resolves known openMission and safeOpenMissionClaim conflict blocks', () => {
    withTempRules(makeConflictedFixture(), (directory) => {
      const result = runNormalizer(directory);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const output = readFileSync(path.join(directory, 'firestore.rules'), 'utf8');
      const availableMatches = output.match(/function openMissionAvailable\(/g) || [];
      const poolMatches = output.match(/function openMissionPoolRead\(/g) || [];
      assert.equal(availableMatches.length, 1);
      assert.equal(poolMatches.length, 1);
      assert.match(
        output,
        /return hasTechnicianDispatchAuthority\(\) && openMissionAvailable\(resource\.data\) &&/,
      );
      assert.doesNotMatch(output, /<<<<<<</);
      assert.doesNotMatch(output, /=======/);
      assert.doesNotMatch(output, />>>>>>>/);
      assert.match(
        output,
        /function openMissionPoolRead\(data\) \{ return hasTechnicianDispatchAuthority\(\) && openMissionAvailable\(data\); \}/,
      );
    });
  });

  it('is idempotent on a conflicted fixture', () => {
    withTempRules(makeConflictedFixture(), (directory) => {
      const first = runNormalizer(directory);
      assert.equal(first.status, 0, first.stderr || first.stdout);
      const afterFirst = readFileSync(path.join(directory, 'firestore.rules'));
      const second = runNormalizer(directory);
      assert.equal(second.status, 0, second.stderr || second.stdout);
      const afterSecond = readFileSync(path.join(directory, 'firestore.rules'));
      assert.deepEqual(afterSecond, afterFirst);
    });
  });

  it('preserves a clean fixture without corrupting resolved helpers', () => {
    withTempRules(makeCleanFixture(), (directory) => {
      const before = readFileSync(path.join(directory, 'firestore.rules'), 'utf8');
      const result = runNormalizer(directory);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const after = readFileSync(path.join(directory, 'firestore.rules'), 'utf8');
      assert.match(after, /function openMissionAvailable\(/);
      assert.match(after, /function openMissionPoolRead\(/);
      assert.match(after, /openMissionAvailable\(resource\.data\)/);
      assert.doesNotMatch(after, /<<<<<<</);
      // Clean helper definitions must remain intact.
      assert.match(
        after,
        /function openMissionPoolRead\(data\) \{ return hasTechnicianDispatchAuthority\(\) && openMissionAvailable\(data\); \}/,
      );
      assert.ok(after.includes('function openMissionAvailable(data)'));
      // Properties/notifications may be normalized; helpers must not be duplicated.
      assert.equal((after.match(/function openMissionAvailable\(/g) || []).length, 1);
      assert.equal((after.match(/function openMissionPoolRead\(/g) || []).length, 1);
      assert.ok(before.includes('openMissionAvailable'));
    });
  });

  it('normalizer source is free of branch-label contamination', () => {
    const source = readFileSync(normalizerPath, 'utf8');
    assert.doesNotMatch(source, /cursor\/launch-readiness-audit-a1f7/);
    const contaminatedMainLine = source
      .split(/\r?\n/)
      .some((line) => /^\s*main\s*$/.test(line));
    assert.equal(contaminatedMainLine, false);
  });

  it('fails closed when firestore.rules is missing', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'normalize-rules-missing-'));
    try {
      assert.equal(existsSync(path.join(directory, 'firestore.rules')), false);
      const result = runNormalizer(directory);
      assert.notEqual(result.status, 0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not invent success from malformed unknown conflict content', () => {
    const { start, mid, end } = conflictTokens();
    const malformed = [
      'rules_version = \'2\';',
      'service cloud.firestore {',
      '  match /databases/{database}/documents {',
      start,
      '    function totallyUnknownConflictHelper() { return true; }',
      mid,
      '    function totallyUnknownConflictHelper() { return false; }',
      end,
      "      allow read: if isAdmin() || hasPermission('canManageProperties') || ownerCanRead(resource.data) || tenantOwns(resource.data) ||",
      "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'tenant');",
      '    match /notifications/{notificationId} {',
      '      allow create: if signedIn();',
      '      allow read: if isAdmin();',
      '      allow update: if isAdmin();',
      '      allow delete: if isAdmin();',
      '    }',
      '    match /{document=**} {',
      '      allow read, write: if false;',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');

    withTempRules(malformed, (directory) => {
      const before = readFileSync(path.join(directory, 'firestore.rules'), 'utf8');
      const result = runNormalizer(directory);
      // Script may still exit 0 because other normalizations succeed, but known markers
      // for an unknown conflict block must remain — not silently rewritten as success.
      const after = readFileSync(path.join(directory, 'firestore.rules'), 'utf8');
      assert.match(after, /totallyUnknownConflictHelper/);
      assert.ok(
        after.includes(start) || after.includes(mid) || after.includes(end) || after === before,
        'malformed unknown conflicts must not be silently rewritten into a clean result',
      );
      // Specifically: the unknown conflict body must not disappear as if "resolved".
      assert.match(after, /totallyUnknownConflictHelper\(\) \{ return true; \}/);
      assert.match(after, /totallyUnknownConflictHelper\(\) \{ return false; \}/);
      void result;
    });
  });
});
