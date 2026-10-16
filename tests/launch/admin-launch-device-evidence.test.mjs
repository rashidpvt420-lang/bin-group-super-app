import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync('packages/shared/src/config/providerLaunchTruth.ts', 'utf8');
const exports = {};
runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const ledger = JSON.parse(readFileSync('launch_package/launch-proof-gates.json', 'utf8'));
const sha = 'a'.repeat(40);
const protectedRecord = {
  status: 'passed', source: 'github-actions', executionGenerated: true,
  hardLaunchClaim: false, releaseSha: sha, commitSha: sha,
};

for (const gateId of ['everyButtonWritesFirestoreOrStorage', 'logoutAllDashboards']) {
  test(`Admin ${gateId} matches the final clearance evidence requirement`, () => {
    const required = exports.requiredEvidenceLayerForGate(gateId, 'Role Buttons');
    assert.equal(required, ledger.requiredDeviceGates[gateId].evidenceLayerRequired);
    assert.equal(required, 'physical_device');
    for (const evidenceLayer of ['source', 'hosted']) {
      assert.equal(exports.evidenceCountsForPublicLaunch({ ...protectedRecord, evidenceLayer }, sha, required), false);
    }
    assert.equal(exports.evidenceCountsForPublicLaunch({ ...protectedRecord, evidenceLayer: 'physical_device' }, sha, required), true);
  });
}

test('physical records keep exact-SHA and protected provenance guards', () => {
  const required = exports.requiredEvidenceLayerForGate('logoutAllDashboards', 'Role Buttons');
  const physicalRecord = { ...protectedRecord, evidenceLayer: 'physical_device' };
  for (const change of [
    { status: 'waived' },
    { source: 'admin-manual-evidence', executionGenerated: false },
    { executionGenerated: false },
    { hardLaunchClaim: true },
    { commitSha: 'b'.repeat(40) },
    { releaseSha: 'b'.repeat(40) },
    { commitSha: 'malformed' },
    { releaseSha: 'b'.repeat(40), commitSha: 'b'.repeat(40) },
  ]) {
    assert.equal(exports.evidenceCountsForPublicLaunch({ ...physicalRecord, ...change }, sha, required), false);
  }
  assert.equal(exports.requiredEvidenceLayerForGate('firebaseAuth', 'Provider'), 'hosted');
  assert.equal(exports.requiredEvidenceLayerForGate('aiVisionOrTriage', 'Provider'), 'hosted');
  assert.equal(exports.evidenceCountsForPublicLaunch({ ...physicalRecord, commitSha: undefined }, sha, required), true);
  assert.equal(exports.evidenceCountsForPublicLaunch({ ...physicalRecord, releaseSha: undefined }, sha, required), true);
});
