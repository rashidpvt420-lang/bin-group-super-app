import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pilotExecutionSupersedesLedger,
  pilotMayDeferManualLedger,
} from '../../scripts/lib/controlled-pilot-ledger.mjs';

const complete = {
  currentExecutionComplete: true,
  deploymentValid: true,
};

test('controlled pilot supersedes security gates only with exact execution and deployment proof', () => {
  for (const name of ['firebaseAuth', 'firestoreRules', 'storageRules', 'appCheckEnforcement']) {
    assert.equal(pilotExecutionSupersedesLedger({
      groupName: 'requiredProviderGates',
      name,
      ...complete,
    }), true, name);
  }
  for (const name of ['hosting', 'functionsDeploy']) {
    assert.equal(pilotExecutionSupersedesLedger({
      groupName: 'deploymentProof',
      name,
      ...complete,
    }), true, name);
  }
  assert.equal(pilotExecutionSupersedesLedger({
    groupName: 'requiredProviderGates',
    name: 'firebaseAuth',
    currentExecutionComplete: false,
    deploymentValid: true,
  }), false);
  assert.equal(pilotExecutionSupersedesLedger({
    groupName: 'requiredProviderGates',
    name: 'firestoreRules',
    currentExecutionComplete: true,
    deploymentValid: false,
  }), false);
  assert.equal(pilotExecutionSupersedesLedger({
    groupName: 'deploymentProof',
    name: 'hosting',
    currentExecutionComplete: true,
    deploymentValid: false,
  }), false);
});

test('controlled pilot defers non-security provider and device records only after all protected evidence passes', () => {
  assert.equal(pilotMayDeferManualLedger({
    groupName: 'requiredProviderGates',
    name: 'googleMaps',
    ...complete,
  }), true);
  assert.equal(pilotMayDeferManualLedger({
    groupName: 'requiredDeviceGates',
    name: 'iosPwaSmoke',
    ...complete,
  }), true);
  assert.equal(pilotMayDeferManualLedger({
    groupName: 'requiredProviderGates',
    name: 'storageRules',
    ...complete,
  }), false);
  assert.equal(pilotMayDeferManualLedger({
    groupName: 'requiredDeviceGates',
    name: 'iosPwaSmoke',
    currentExecutionComplete: false,
    deploymentValid: true,
  }), false);
});

test('pending static gates can be superseded only in controlled-pilot mode', async () => {
  const { readFile } = await import('node:fs/promises');
  const verifier = await readFile(new URL('../../scripts/verify-launch-clearance.mjs', import.meta.url), 'utf8');
  const pendingSupersession = verifier.indexOf("if (isPilotMode && superseded && status === 'pending')");
  const pendingFailure = verifier.indexOf('if (required && deferredForPilot)');

  assert.ok(pendingSupersession >= 0, 'pilot-only pending supersession guard must exist');
  assert.ok(pendingFailure > pendingSupersession, 'supersession must be evaluated before pending required gates fail');
  assert.match(
    verifier,
    /protected current-commit execution evidence supersedes it for the controlled pilot only/,
  );
});

test('public launch verifier retains strict manual-artifact validation', async () => {
  const { readFile } = await import('node:fs/promises');
  const verifier = await readFile(new URL('../../scripts/verify-launch-clearance.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /if \(!isPilotMode\) return false/);
  assert.match(verifier, /for \(const error of manualErrors\) fail\(error\)/);
  assert.doesNotMatch(verifier, /if \(superseded && status === 'pending'\)/);
});
