import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url), 'utf8');

const requiredBootstrapFunctions = [
  'registerAdminSecuritySession',
  'getAdminSecurityProfile',
  'getAdminMfaReadinessOverview',
  'revokeAdminSessions',
  'lockOwnAdminAccount',
  'finalizeOwnAdminMfaRecovery',
];

test('Admin MFA bootstrap requires the protected exact marker and bank-pilot scope', () => {
  assert.match(source, /adminBootstrapMarker = 'ADMIN_MFA_BOOTSTRAP_HOSTING'/);
  assert.match(source, /incident_evidence_refs/);
  assert.match(source, /process\.env\.GITHUB_EVENT_NAME !== 'workflow_dispatch'/);
  assert.match(source, /launchMode !== 'bank-pilot'/);
  assert.match(source, /requestedLaunchMode !== 'bank-pilot'/);
  assert.match(source, /publicReleaseRequested/);
  assert.match(source, /approval\.launchMode !== 'bank-pilot'/);
});

test('Admin MFA bootstrap deploys Admin Hosting and only the required remediation callables before MFA coverage enforcement', () => {
  const targetDefinition = source.indexOf('const adminBootstrapDeployTarget');
  const bootstrapDeploy = source.indexOf("retryFirebase(adminBootstrapDeployTarget, 'Admin MFA bootstrap hosting and remediation callables')");
  const mfaPreflight = source.indexOf('adminMfaEvidence = await verifyAdminMfaProduction');
  const fullDeploy = source.indexOf("'functions,hosting,firestore:rules,firestore:indexes,storage'");

  assert.ok(targetDefinition >= 0, 'bootstrap target must be explicitly defined');
  assert.ok(bootstrapDeploy > targetDefinition, 'minimal bootstrap deployment must use the explicit target');
  assert.ok(mfaPreflight > bootstrapDeploy, 'real Admin MFA enforcement must run after the minimal bootstrap deployment');
  assert.ok(fullDeploy > mfaPreflight, 'full stack deploy must remain behind real Admin MFA enforcement');
  assert.match(source, /'hosting:admin'/);
  for (const functionName of requiredBootstrapFunctions) {
    assert.match(source, new RegExp(`'${functionName}'`), `${functionName} must be included in the bootstrap allowlist`);
  }
  assert.match(source, /adminBootstrapDeployComponents\.join\(','\)/);
  assert.match(source, /Admin MFA bootstrap function exports are missing/);
  assert.match(source, /Admin MFA bootstrap callable modules are not exported/);
  assert.match(source, /apps\/admin-panel\/build\/index\.html/);
  assert.match(source, /sendEmailVerification/);
  assert.match(source, /getAdminMfaReadinessOverview/);
});

test('Admin MFA bootstrap metadata records the exact minimal deployment scope', () => {
  assert.match(source, /schemaVersion: 2/);
  assert.match(source, /deploymentScope: adminBootstrapDeployTarget/);
  assert.match(source, /deploymentComponents: adminBootstrapDeployComponents/);
  assert.match(source, /bootstrapFunctions: adminBootstrapFunctions/);
});

test('Admin MFA bootstrap is explicitly not a gate bypass or launch claim', () => {
  assert.match(source, /mfaGateBypassed: false/);
  assert.match(source, /hardLaunchClaim: false/);
  assert.match(source, /The full production stack remains blocked until real Admin MFA coverage passes/);
  assert.match(source, /Admin MFA production preflight failed/);
  assert.doesNotMatch(source, /skipAdminMfa|bypassAdminMfa|ADMIN_MFA_BYPASS/);
});
