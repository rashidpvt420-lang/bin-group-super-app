#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { requireArtifactDigest } from './lib/launch-gate-common.mjs';
import { verifyFirebaseProductionSecrets } from './verify-firebase-production-secrets.mjs';
import { verifyFirebasePhoneAuthProduction } from './verify-firebase-phone-auth-production.mjs';
import { verifyAdminMfaProduction } from './verify-admin-mfa-production.mjs';

const expectedProjectId = 'bin-group-57c60';
const deploymentEnvironment = String(process.env.DEPLOYMENT_ENVIRONMENT || '').trim();
const githubSha = String(process.env.GITHUB_SHA || '').trim();
const launchMode = String(process.env.LAUNCH_MODE || '').trim();
const artifactDigest = String(process.env.VALIDATED_ARTIFACT_DIGEST || '').trim();
const approvalPath = 'launch_package/predeploy-approval.json';
const deploymentMetadataPath = 'launch_package/production-deployment.json';
const adminBootstrapMetadataPath = 'launch_package/admin-mfa-bootstrap-hosting.json';
const adminBootstrapMarker = 'ADMIN_MFA_BOOTSTRAP_HOSTING';
const adminBootstrapFunctions = Object.freeze([
  'registerAdminSecuritySession',
  'getAdminSecurityProfile',
  'getAdminMfaReadinessOverview',
  'revokeAdminSessions',
  'lockOwnAdminAccount',
  'finalizeOwnAdminMfaRecovery',
]);
const adminBootstrapDeployComponents = Object.freeze([
  'hosting:admin',
  ...adminBootstrapFunctions.map((functionName) => `functions:${functionName}`),
]);
const adminBootstrapDeployTarget = adminBootstrapDeployComponents.join(',');
const digestFailures = [];
const validatedArtifactDigest = requireArtifactDigest(
  artifactDigest,
  'VALIDATED_ARTIFACT_DIGEST',
  digestFailures,
);

function readWorkflowDispatchInputs() {
  const eventPath = String(process.env.GITHUB_EVENT_PATH || '').trim();
  if (!eventPath || !existsSync(eventPath)) return {};
  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    return event?.inputs && typeof event.inputs === 'object' ? event.inputs : {};
  } catch {
    return {};
  }
}

const workflowInputs = readWorkflowDispatchInputs();
const adminBootstrapRequested = String(workflowInputs.incident_evidence_refs || '').trim() === adminBootstrapMarker;

if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/main' ||
  deploymentEnvironment !== 'production' ||
  !/^[0-9a-f]{40}$/.test(githubSha) ||
  !validatedArtifactDigest
) {
  console.error('[production-deploy] Refusing deployment outside the protected exact-SHA production workflow');
  for (const failure of digestFailures) console.error(`[production-deploy] ${failure}`);
  process.exit(1);
}

if (!existsSync(approvalPath)) {
  console.error(`[production-deploy] Missing protected predeploy approval: ${approvalPath}`);
  process.exit(1);
}

let approval;
try {
  approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
} catch {
  console.error('[production-deploy] Protected predeploy approval is malformed');
  process.exit(1);
}

if (
  approval.commitSha !== githubSha ||
  approval.artifactDigest !== artifactDigest ||
  approval.githubEnvironment !== 'production' ||
  approval.approvedVia !== 'github-environment-protection'
) {
  console.error('[production-deploy] Protected predeploy approval does not match this SHA and artifact');
  process.exit(1);
}

const projectId = String(process.env.GCP_PROJECT_ID || '').trim();
if (projectId !== expectedProjectId) {
  console.error(`[production-deploy] GCP_PROJECT_ID must equal ${expectedProjectId}`);
  process.exit(1);
}

const remoteMain = spawnSync(
  'git',
  ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'],
  { cwd: process.cwd(), encoding: 'utf8', shell: false },
);
const remoteMainSha = String(remoteMain.stdout || '').trim().split(/\s+/)[0] || '';
if ((remoteMain.status ?? 1) !== 0 || remoteMainSha !== githubSha) {
  console.error(
    `[production-deploy] Refusing stale deployment: current origin/main ${remoteMainSha || '(unavailable)'} does not match GITHUB_SHA`,
  );
  process.exit(1);
}

try {
  await verifyFirebaseProductionSecrets({ projectId, launchMode });
} catch (error) {
  const message = error instanceof Error ? error.message : 'secret metadata verification failed';
  console.error(`[production-deploy] Required Firebase production function secret preflight failed: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  return result.status ?? 1;
}

function retryFirebase(target, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.log(`[production-deploy] ${label} attempt ${attempt}/3`);
    const status = run('npx', [
      'firebase',
      'deploy',
      '--only',
      target,
      '--project',
      projectId,
      '--non-interactive',
      '--force',
    ]);
    if (status === 0) return;
    if (attempt < 3) {
      const sleep = spawnSync('sleep', ['30'], { stdio: 'inherit' });
      if ((sleep.status ?? 1) !== 0) process.exit(1);
    }
  }
  console.error(`[production-deploy] ${label} failed after 3 attempts`);
  process.exit(1);
}

let phoneAuthEvidence;
try {
  phoneAuthEvidence = await verifyFirebasePhoneAuthProduction({ projectId });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Phone Auth configuration verification failed';
  console.error(`[production-deploy] Firebase Phone Auth production preflight failed: ${message}`);
  process.exit(1);
}

if (adminBootstrapRequested) {
  const requestedLaunchMode = String(workflowInputs.launch_mode || '').trim();
  const publicReleaseRequested = String(workflowInputs.run_public_release_gate || 'false').trim().toLowerCase() === 'true';
  const adminAppSource = existsSync('apps/admin-panel/src/App.tsx')
    ? readFileSync('apps/admin-panel/src/App.tsx', 'utf8')
    : '';
  const adminProfileSource = existsSync('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx')
    ? readFileSync('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx', 'utf8')
    : '';
  const adminEnrollmentSource = existsSync('apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx')
    ? readFileSync('apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx', 'utf8')
    : '';
  const adminSecuritySource = existsSync('functions/adminSecurityProfile.ts')
    ? readFileSync('functions/adminSecurityProfile.ts', 'utf8')
    : '';
  const adminReadinessSource = existsSync('functions/adminMfaReadiness.ts')
    ? readFileSync('functions/adminMfaReadiness.ts', 'utf8')
    : '';
  const adminRecoverySource = existsSync('functions/adminMfaRecovery.ts')
    ? readFileSync('functions/adminMfaRecovery.ts', 'utf8')
    : '';
  const functionsRuntimeSource = existsSync('functions/runtime.ts')
    ? readFileSync('functions/runtime.ts', 'utf8')
    : '';

  if (
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    launchMode !== 'bank-pilot' ||
    requestedLaunchMode !== 'bank-pilot' ||
    publicReleaseRequested ||
    approval.launchMode !== 'bank-pilot'
  ) {
    console.error('[production-deploy] Admin MFA bootstrap is allowed only in the protected bank-pilot workflow with the public-release gate disabled');
    process.exit(1);
  }
  if (!existsSync('apps/admin-panel/build/index.html')) {
    console.error('[production-deploy] Admin MFA bootstrap requires the validated Admin build');
    process.exit(1);
  }
  if (!adminAppSource.includes('path="/profile"') || !adminProfileSource.includes('AdminMfaEnrollmentCard')) {
    console.error('[production-deploy] Admin MFA enrollment route/card is not present in the exact-SHA source');
    process.exit(1);
  }
  if (
    !adminEnrollmentSource.includes('sendEmailVerification') ||
    !adminEnrollmentSource.includes('getAdminMfaReadinessOverview') ||
    !adminEnrollmentSource.includes('admin-mfa-readiness-overview')
  ) {
    console.error('[production-deploy] Mobile Admin email/MFA remediation controls are not present in the exact-SHA Admin build');
    process.exit(1);
  }
  if (
    !functionsRuntimeSource.includes('export * from "./adminSecurityProfile"') ||
    !functionsRuntimeSource.includes('export * from "./adminMfaReadiness"') ||
    !functionsRuntimeSource.includes('export * from "./adminMfaRecovery"')
  ) {
    console.error('[production-deploy] Admin MFA bootstrap callable modules are not exported by the exact-SHA Functions runtime');
    process.exit(1);
  }

  const sourceByFunction = new Map([
    ['getAdminMfaReadinessOverview', adminReadinessSource],
    ['finalizeOwnAdminMfaRecovery', adminRecoverySource],
  ]);
  const missingBootstrapFunctions = adminBootstrapFunctions.filter((functionName) => {
    const source = sourceByFunction.get(functionName) || adminSecuritySource;
    return !source.includes(`export const ${functionName}`);
  });
  if (missingBootstrapFunctions.length > 0) {
    console.error(`[production-deploy] Admin MFA bootstrap function exports are missing: ${missingBootstrapFunctions.join(', ')}`);
    process.exit(1);
  }

  console.log(`[production-deploy] Protected Admin MFA bootstrap requested; deploying ${adminBootstrapDeployTarget} before account-coverage enforcement`);
  retryFirebase(adminBootstrapDeployTarget, 'Admin MFA bootstrap hosting and remediation callables');
  writeFileSync(adminBootstrapMetadataPath, `${JSON.stringify({
    schemaVersion: 2,
    status: 'deployed',
    commitSha: githubSha,
    repository: process.env.GITHUB_REPOSITORY || '',
    workflowRunId: process.env.GITHUB_RUN_ID || '',
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || '',
    deploymentScope: adminBootstrapDeployTarget,
    deploymentComponents: adminBootstrapDeployComponents,
    bootstrapFunctions: adminBootstrapFunctions,
    requestedBy: process.env.GITHUB_ACTOR || '',
    deployedAt: new Date().toISOString(),
    mfaGateBypassed: false,
    hardLaunchClaim: false,
  }, null, 2)}\n`);
  console.log('[production-deploy] Admin MFA enrollment, email verification, masked readiness UI and minimal security callables are deployed. The full production stack remains blocked until real Admin MFA coverage passes.');
}

let adminMfaEvidence;
try {
  adminMfaEvidence = await verifyAdminMfaProduction({ projectId });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Admin MFA account coverage verification failed';
  const bootstrapNote = adminBootstrapRequested
    ? ' Admin MFA bootstrap UI and remediation callables completed successfully; verify email and enroll the real accounts, then rerun without the bootstrap marker.'
    : '';
  console.error(`[production-deploy] Admin MFA production preflight failed: ${message}${bootstrapNote}`);
  process.exit(1);
}

retryFirebase(
  'functions,hosting,firestore:rules,firestore:indexes,storage',
  'complete Firebase production stack',
);

const metadataStatus = run(process.execPath, [
  'scripts/write-production-deployment-metadata.mjs',
  '--components',
  'hosting,firestoreRules,firestoreIndexes,storageRules,functions',
]);
if (metadataStatus !== 0) process.exit(metadataStatus);

try {
  const deploymentMetadata = JSON.parse(readFileSync(deploymentMetadataPath, 'utf8'));
  deploymentMetadata.firebasePhoneAuth = phoneAuthEvidence;
  deploymentMetadata.adminMfa = adminMfaEvidence;
  writeFileSync(deploymentMetadataPath, `${JSON.stringify(deploymentMetadata, null, 2)}\n`);
  console.log('[production-deploy] embedded exact-SHA Firebase Phone Auth and Admin MFA evidence');
} catch (error) {
  const message = error instanceof Error ? error.message : 'metadata embedding failed';
  console.error(`[production-deploy] Could not bind Firebase Phone Auth and Admin MFA evidence to deployment metadata: ${message}`);
  process.exit(1);
}

const verifyStatus = run(process.execPath, [
  'scripts/verify-production-deployment.mjs',
  '--write-evidence',
]);
if (verifyStatus !== 0) process.exit(verifyStatus);

console.log('[production-deploy] production deployment and identity verification passed');
