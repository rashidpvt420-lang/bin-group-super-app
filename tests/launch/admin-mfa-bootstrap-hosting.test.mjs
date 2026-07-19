import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url), 'utf8');

test('Admin MFA bootstrap requires the protected exact marker and bank-pilot scope', () => {
  assert.match(source, /adminBootstrapMarker = 'ADMIN_MFA_BOOTSTRAP_HOSTING'/);
  assert.match(source, /incident_evidence_refs/);
  assert.match(source, /process\.env\.GITHUB_EVENT_NAME !== 'workflow_dispatch'/);
  assert.match(source, /launchMode !== 'bank-pilot'/);
  assert.match(source, /requestedLaunchMode !== 'bank-pilot'/);
  assert.match(source, /publicReleaseRequested/);
  assert.match(source, /approval\.launchMode !== 'bank-pilot'/);
});

test('Admin MFA bootstrap deploys only the Admin Hosting target before MFA coverage enforcement', () => {
  const bootstrapDeploy = source.indexOf("retryFirebase('hosting:admin', 'Admin MFA bootstrap hosting')");
  const mfaPreflight = source.indexOf('adminMfaEvidence = await verifyAdminMfaProduction');
  const fullDeploy = source.indexOf("'functions,hosting,firestore:rules,firestore:indexes,storage'");

  assert.ok(bootstrapDeploy >= 0, 'hosting:admin bootstrap deploy must exist');
  assert.ok(mfaPreflight > bootstrapDeploy, 'real Admin MFA enforcement must run after bootstrap hosting');
  assert.ok(fullDeploy > mfaPreflight, 'full stack deploy must remain behind real Admin MFA enforcement');
  assert.match(source, /Admin MFA enrollment route\/card is not present in the exact-SHA source/);
  assert.match(source, /apps\/admin-panel\/build\/index\.html/);
});

test('Admin MFA bootstrap is explicitly not a gate bypass or launch claim', () => {
  assert.match(source, /mfaGateBypassed: false/);
  assert.match(source, /hardLaunchClaim: false/);
  assert.match(source, /The full production stack remains blocked until real Admin MFA coverage passes/);
  assert.match(source, /Admin MFA production preflight failed/);
  assert.doesNotMatch(source, /skipAdminMfa|bypassAdminMfa|ADMIN_MFA_BYPASS/);
});
