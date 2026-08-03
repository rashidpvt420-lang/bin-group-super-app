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

test('Admin MFA bootstrap publishes Admin Hosting before bounded remediation callables and MFA enforcement', () => {
  const targetDefinition = source.indexOf('const adminBootstrapDeployTarget');
  const hostingDeploy = source.indexOf("adminBootstrapHostingTarget,\n    'Admin MFA bootstrap hosting'");
  const functionDeploy = source.indexOf("adminBootstrapFunctionTarget,\n    'Admin MFA bootstrap remediation callables'");
  const mfaPreflight = source.indexOf('adminMfaEvidence = await verifyAdminMfaProduction');
  const batchedFunctionsDeploy = source.indexOf('const functionDeploymentEvidence = deployFunctionsQuotaSafe()');
  const nonFunctionsDeploy = source.indexOf("'non-Functions Firebase production stack'");

  assert.ok(targetDefinition >= 0, 'bootstrap target must be explicitly defined');
  assert.ok(hostingDeploy > targetDefinition, 'Admin Hosting must deploy through the explicit hosting target');
  assert.ok(functionDeploy > hostingDeploy, 'allowlisted remediation callables must deploy after Admin Hosting');
  assert.ok(mfaPreflight > functionDeploy, 'real Admin MFA enforcement must run after the minimal bootstrap deployment');
  assert.ok(batchedFunctionsDeploy > mfaPreflight, 'quota-safe Functions deployment must remain behind real Admin MFA enforcement');
  assert.ok(nonFunctionsDeploy > batchedFunctionsDeploy, 'Hosting, rules and Storage must deploy after the sequential Functions batches');
  assert.doesNotMatch(source, /retryFirebase\(adminBootstrapDeployTarget/);
  assert.doesNotMatch(source, /functions,hosting,firestore:rules,firestore:indexes,storage/);
  assert.match(source, /const adminBootstrapHostingTarget = 'hosting:admin'/);
  assert.match(source, /const adminBootstrapFunctionTarget = adminBootstrapFunctionComponents\.join\(','\)/);
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

test('every Firebase CLI deployment has a bounded timeout and deterministic termination signal', () => {
  assert.match(source, /FIREBASE_DEPLOY_COMMAND_TIMEOUT_SECONDS/);
  assert.match(source, /options\.commandTimeoutSeconds \|\| 900/);
  assert.match(source, /timeout: commandTimeoutSeconds \* 1000/);
  assert.match(source, /killSignal: 'SIGTERM'/);
  assert.match(source, /Admin MFA bootstrap hosting'[\s\S]*commandTimeoutSeconds: 600/);
  assert.match(source, /Admin MFA bootstrap remediation callables'[\s\S]*commandTimeoutSeconds: 900/);
});

test('Admin MFA bootstrap metadata records the exact minimal deployment scope', () => {
  assert.match(source, /schemaVersion: 2/);
  assert.match(source, /deploymentScope: adminBootstrapDeployTarget/);
  assert.match(source, /deploymentComponents: adminBootstrapDeployComponents/);
  assert.match(source, /bootstrapFunctions: adminBootstrapFunctions/);
  assert.match(source, /hostingDeployedFirst: true/);
  assert.match(source, /firebaseCommandTimeoutEnforced: true/);
});

test('Admin MFA bootstrap is explicitly not a gate bypass or launch claim', () => {
  assert.match(source, /mfaGateBypassed: false/);
  assert.match(source, /hardLaunchClaim: false/);
  assert.match(source, /The full production stack remains blocked until real Admin MFA coverage passes/);
  assert.match(source, /Admin MFA production preflight failed/);
  assert.doesNotMatch(source, /skipAdminMfa|bypassAdminMfa|ADMIN_MFA_BYPASS/);
});
