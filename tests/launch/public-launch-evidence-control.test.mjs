import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertPublicLaunchEvidenceRules, hardenPublicLaunchEvidenceRules } from '../../scripts/lib/public-launch-evidence-rules.mjs';

const pagePath = 'apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPage.tsx';
const publisherPath = 'scripts/record-firestore-evidence.js';
const productionRulesWriterPath = 'scripts/write-production-firestore-rules.mjs';
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');

function matchBlock(source, header) {
  const start = source.indexOf(header);
  assert.notEqual(start, -1, `missing match block: ${header}`);
  const open = start + header.length - 1;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unclosed match block: ${header}`);
}

test('public launch evidence rule hardener is fail-closed and idempotent', () => {
  const original = read('firestore.rules');
  const hardened = hardenPublicLaunchEvidenceRules(original);
  assertPublicLaunchEvidenceRules(hardened);
  assert.equal(hardenPublicLaunchEvidenceRules(hardened), hardened);

  const launchBlock = matchBlock(hardened, '    match /launch_evidence/{evidenceId} {');
  const smokeBlock = matchBlock(hardened, '    match /signed_in_smoke_checks/{checkId} {');
  for (const block of [launchBlock, smokeBlock]) {
    assert.match(block, /allow read: if canReadLaunchEvidence\(\);/);
    assert.match(block, /allow update, delete: if false;/);
    assert.doesNotMatch(block, /allow update: if isAdmin\(\)/);
    assert.doesNotMatch(block, /allow delete: if isAdmin\(\)/);
  }

  assert.match(hardened, /hasPermission\('canManageLaunchEvidence'\)/);
  assert.match(hardened, /claimedRole\(\) in \['manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin'\]/);

  const globalFallback = matchBlock(hardened, '    match /{collection}/{document=**} {');
  assert.equal((globalFallback.match(/'launch_evidence'/g) || []).length, 3);
  assert.equal((globalFallback.match(/'signed_in_smoke_checks'/g) || []).length, 3);
  assert.match(globalFallback, /allow read:[\s\S]*'launch_evidence'[\s\S]*'signed_in_smoke_checks'/);
  assert.match(globalFallback, /allow create:[\s\S]*'launch_evidence'[\s\S]*'signed_in_smoke_checks'/);
  assert.match(globalFallback, /allow update, delete:[\s\S]*'launch_evidence'[\s\S]*'signed_in_smoke_checks'/);
});

test('command center fails closed and scopes readiness to one trusted release SHA', () => {
  const page = read(pagePath);
  for (const token of [
    'evidenceReadError',
    'smokeReadError',
    'EVIDENCE UNAVAILABLE',
    'readiness === null',
    'Evidence unreadable; score withheld.',
    'Evidence feed unavailable — status withheld',
    'allEvidenceReadable',
    'activeReleaseSha',
    'currentReleaseEvidence',
    'currentReleaseSmokeRecords',
    "item.source === 'github-actions'",
    'item.releaseSha === activeReleaseSha',
  ]) assert.ok(page.includes(token), `missing fail-closed/release-scoped UI token: ${token}`);

  for (const token of [
    'schemaVersion: 2',
    "source: 'admin-command-center'",
    'releaseSha',
    'workflowRunId',
    'evidenceHash',
    'canWriteEvidence',
    'canManageLaunchEvidence',
    "['admin-command-center', 'github-actions']",
    'smokePassedCount === SIGNED_IN_SMOKE_CHECKS.length',
    'Phase 1 Cash/Cheque activation proof',
    'Bank Transfer and Stripe remain disabled for Phase 1',
  ]) assert.ok(page.includes(token), `missing command-center control token: ${token}`);

  assert.doesNotMatch(page, /process\.env\.REACT_APP_RELEASE_SHA/);
  assert.doesNotMatch(page, /Payment\/manual bank activation proof/);
});

test('protected Firestore publisher cannot fabricate passed evidence', () => {
  const publisher = read(publisherPath);
  assert.doesNotMatch(publisher, /firebase_auth_passed_20260620\.png/);
  assert.doesNotMatch(publisher, /Rashid Bin Abdul Ghani/);
  assert.doesNotMatch(publisher, /Verified active authentication flow for all 5 system roles/);
  for (const token of [
    "process.argv.includes('--write')",
    'GITHUB_ACTIONS',
    'GITHUB_REF',
    'GITHUB_SHA',
    'GITHUB_RUN_ID',
    'GITHUB_REPOSITORY',
    "source: 'github-actions'",
    'evidenceHash',
    'FieldValue.serverTimestamp()',
    'EXPECTED_BACKFILL_WORKFLOW',
    'EXPECTED_BRIDGE_WORKFLOW',
  ]) assert.ok(publisher.includes(token), `publisher missing protected token: ${token}`);
});

test('production rules pipeline always applies append-only launch evidence hardening', () => {
  const writer = read(productionRulesWriterPath);
  assert.match(writer, /hardenPublicLaunchEvidenceRules/);
  assert.match(writer, /global Firestore fallback block is missing or malformed/);
  assert.match(writer, /launch evidence must be excluded from global read, create and update\/delete fallbacks/);
  assert.match(writer, /launchEvidenceMutationPolicy: 'append-only'/);
  assert.match(writer, /launchEvidenceProvenanceRequired: true/);
  assert.match(writer, /writeFileSync\(sourcePath, source/);
});
