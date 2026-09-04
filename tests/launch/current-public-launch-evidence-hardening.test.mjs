import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const routeGuard = read('apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPage.tsx');
const detailedCommandCenter = read('apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPageV2.tsx');
const productionRulesWriter = read('scripts/write-production-firestore-rules.mjs');
const firebaseConfig = JSON.parse(read('firebase.json'));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('public launch route fails closed until all five protected role smokes pass on the exact release', () => {
  assert.match(routeGuard, /REQUIRED_SMOKE_ROLES[^\n]*owner[^\n]*tenant[^\n]*technician[^\n]*broker[^\n]*admin/);
  assert.match(routeGuard, /normalizeCommitSha\(process\.env\.REACT_APP_RELEASE_COMMIT_SHA\)/);
  assert.match(routeGuard, /evidenceCountsForPublicLaunch/);
  assert.match(routeGuard, /smokePassedCount === REQUIRED_SMOKE_ROLES\.length/);
  assert.match(routeGuard, /if \(!fiveRoleSmokeReady\)/);
  assert.match(routeGuard, /PUBLIC LAUNCH BLOCKED/);
  assert.match(routeGuard, /executionGenerated=true/);
  assert.match(routeGuard, /hardLaunchClaim=false/);
  assert.match(routeGuard, /return <PublicLaunchCommandCenterPageV2 \/>/);
});

test('detailed command center remains exact-SHA and protected-execution evidence only', () => {
  assert.match(detailedCommandCenter, /evidenceCountsForPublicLaunch/);
  assert.match(detailedCommandCenter, /RELEASE_SHA = normalizeCommitSha\(process\.env\.REACT_APP_RELEASE_COMMIT_SHA\)/);
  assert.match(detailedCommandCenter, /waived \(non-passing\)/);
});

test('production Firestore artifact makes launch evidence append-only and prevents browser provenance forgery', () => {
  for (const collection of ['launch_evidence', 'signed_in_smoke_checks']) {
    const escapedCollection = escapeRegExp(collection);
    assert.match(productionRulesWriter, new RegExp(`match \/${escapedCollection}\/\\{`));
  }
  assert.match(productionRulesWriter, /request\.resource\.data\.get\('source', ''\) != 'github-actions'/);
  assert.match(productionRulesWriter, /request\.resource\.data\.get\('executionGenerated', false\) != true/);
  assert.match(productionRulesWriter, /request\.resource\.data\.get\('hardLaunchClaim', false\) != true/);
  assert.match(productionRulesWriter, /allow update, delete: if false;/);
  assert.match(productionRulesWriter, /launchEvidenceBrowserAuthority: 'manual-create-only-append-only-no-github-provenance'/);
  assert.equal(firebaseConfig.firestore.rules, 'launch_generated/firestore.rules');
});
