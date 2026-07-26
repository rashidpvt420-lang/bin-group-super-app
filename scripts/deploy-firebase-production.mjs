#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
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
const functionBatchSize = boundedInteger(process.env.FIREBASE_FUNCTION_BATCH_SIZE, 12, 1, 20);
const functionBatchDelaySeconds = boundedInteger(
  process.env.FIREBASE_FUNCTION_BATCH_DELAY_SECONDS,
  75,
  60,
  300,
);
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

function boundedInteger(raw, fallback, minimum, maximum) {
  const value = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

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
const adminBootstrapRequested =
  String(workflowInputs.incident_evidence_refs || '').trim() === adminBootstrapMarker;

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
if ((remoteMain.status ?? 1) !== 0 || !remoteMainSha) {
  console.error('[production-deploy] Refusing stale deployment: could not resolve current origin/main');
  process.exit(1);
}
if (remoteMainSha !== githubSha) {
  const fetchResult = spawnSync(
    'git',
    ['fetch', '--depth=500', 'origin', 'main'],
    { cwd: process.cwd(), encoding: 'utf8', stdio: 'inherit', shell: false },
  );
  if ((fetchResult.status ?? 1) !== 0) {
    console.error(
      `[production-deploy] Refusing stale deployment: current origin/main ${remoteMainSha} does not match GITHUB_SHA and ancestry-check fetch failed`,
    );
    process.exit(1);
  }
  const ancestorCheck = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', githubSha, 'FETCH_HEAD'],
    { cwd: process.cwd(), encoding: 'utf8', shell: false },
  );
  if ((ancestorCheck.status ?? 1) !== 0) {
    console.error(
      `[production-deploy] Refusing stale deployment: current origin/main ${remoteMainSha} does not match GITHUB_SHA and ${githubSha} is not an ancestor of origin/main`,
    );
    process.exit(1);
  }
  console.log(
    `[production-deploy] origin/main has advanced to ${remoteMainSha}; GITHUB_SHA ${githubSha} is a verified ancestor — proceeding with deployment`,
  );
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

function sleepSeconds(seconds, reason) {
  console.log(`[production-deploy] Waiting ${seconds}s ${reason}`);
  const sleep = spawnSync('sleep', [String(seconds)], { stdio: 'inherit', shell: false });
  if ((sleep.status ?? 1) !== 0) process.exit(1);
}

function retryFirebase(target, label, options = {}) {
  const attempts = boundedInteger(options.attempts, 4, 1, 6);
  const retryDelaySeconds = boundedInteger(options.retryDelaySeconds, 90, 30, 300);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`[production-deploy] ${label} attempt ${attempt}/${attempts}`);
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
    if (attempt < attempts) {
      sleepSeconds(
        retryDelaySeconds * attempt,
        `before retrying ${label} after a Firebase deployment failure`,
      );
    }
  }
  console.error(`[production-deploy] ${label} failed after ${attempts} attempts`);
  process.exit(1);
}

function discoverDeployableFunctions() {
  const packagePath = resolve(process.cwd(), 'functions/package.json');
  if (!existsSync(packagePath)) {
    console.error('[production-deploy] functions/package.json is missing');
    process.exit(1);
  }
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const mainFile = String(packageJson.main || '').trim();
  if (!mainFile) {
    console.error('[production-deploy] functions/package.json main is missing');
    process.exit(1);
  }
  const runtimePath = resolve(process.cwd(), 'functions', mainFile);
  if (!existsSync(runtimePath)) {
    console.error(
      `[production-deploy] Built Functions runtime is missing: ${runtimePath}. Run the Functions build first.`,
    );
    process.exit(1);
  }

  const require = createRequire(import.meta.url);
  let exported;
  try {
    exported = require(runtimePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown runtime load failure';
    console.error(`[production-deploy] Could not inspect built Functions runtime: ${message}`);
    process.exit(1);
  }

  const names = Object.entries(exported || {})
    .filter(([, value]) => Boolean(value && (value.__endpoint || value.__trigger)))
    .map(([name]) => name)
    .filter((name) => /^[A-Za-z0-9_-]+$/.test(name))
    .sort();

  if (names.length === 0) {
    console.error('[production-deploy] No deployable Firebase Functions were discovered');
    process.exit(1);
  }
  if (new Set(names).size !== names.length) {
    console.error('[production-deploy] Duplicate Firebase Function export names were discovered');
    process.exit(1);
  }
  return names;
}

function deployFunctionsInBatches() {
  const names = discoverDeployableFunctions();
  const batches = [];
  for (let index = 0; index < names.length; index += functionBatchSize) {
    batches.push(names.slice(index, index + functionBatchSize));
  }

  console.log(
    `[production-deploy] Deploying ${names.length} Functions in ${batches.length} sequential batch(es) of at most ${functionBatchSize}`,
  );
  batches.forEach((batch, index) => {
    if (index > 0) {
      sleepSeconds(
        functionBatchDelaySeconds,
        'to remain below the Cloud Functions regional mutation quota',
      );
    }
    const target = batch.map((name) => `functions:${name}`).join(',');
    retryFirebase(
      target,
      `Functions batch ${index + 1}/${batches.length} (${batch.length} functions)`,
      { attempts: 4, retryDelaySeconds: functionBatchDelaySeconds },
    );
  });
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
  const publicReleaseRequested =
    String(workflowInputs.run_public_release_gate || 'false').trim().toLowerCase() === 'true';
  const adminAppSource = existsSync('apps/admin-panel/src/App.tsx')
    ? readFileSync('apps/admin-panel/src/App.tsx', 'utf8')
    : '';
  const adminProfileSource = existsSync(
    'apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx',
  )
    ? readFileSync('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx', 'utf8')
    : '';
  const adminEnrollmentSource = existsSync(
    'apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx',
  )
    ? readFileSync(
      'apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx',
      'utf8',
    )
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
    console.error(
      '[production-deploy] Admin MFA bootstrap is allowed only in the protected bank-pilot workflow with the public-release gate disabled',
    );
    process.exit(1);
  }
  if (!existsSync('apps/admin-panel/build/index.html')) {
    console.error('[production-deploy] Admin MFA bootstrap requires the validated Admin build');
    process.exit(1);
  }
  if (
    !adminAppSource.includes('path="/profile"') ||
    !adminProfileSource.includes('AdminMfaEnrollmentCard')
  ) {
    console.error(
      '[production-deploy] Admin MFA enrollment route/card is not present in the exact-SHA source',
    );
    process.exit(1);
  }
  if (
    !adminEnrollmentSource.includes('sendEmailVerification') ||
    !adminEnrollmentSource.includes('getAdminMfaReadinessOverview') ||
    !adminEnrollmentSource.includes('admin-mfa-readiness-overview')
  ) {
    console.error(
      '[production-deploy] Mobile Admin email/MFA remediation controls are not present in the exact-SHA Admin build',
    );
    process.exit(1);
  }
  if (
    !functionsRuntimeSource.includes('export * from "./adminSecurityProfile"') ||
    !functionsRuntimeSource.includes('export * from "./adminMfaReadiness"') ||
    !functionsRuntimeSource.includes('export * from "./adminMfaRecovery"')
  ) {
    console.error(
      '[production-deploy] Admin MFA bootstrap callable modules are not exported by the exact-SHA Functions runtime',
    );
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
    console.error(
      `[production-deploy] Admin MFA bootstrap function exports are missing: ${missingBootstrapFunctions.join(', ')}`,
    );
    process.exit(1);
  }

  console.log(
    `[production-deploy] Protected Admin MFA bootstrap requested; deploying ${adminBootstrapDeployTarget} before account-coverage enforcement`,
  );
  retryFirebase(
    adminBootstrapDeployTarget,
    'Admin MFA bootstrap hosting and remediation callables',
    { attempts: 4, retryDelaySeconds: functionBatchDelaySeconds },
  );
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
  console.log(
    '[production-deploy] Admin MFA enrollment, email verification, masked readiness UI and minimal security callables are deployed. The full production stack remains blocked until real Admin MFA coverage passes.',
  );
}

let adminMfaEvidence;
try {
  adminMfaEvidence = await verifyAdminMfaProduction({ projectId });
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Admin MFA account coverage verification failed';
  const bootstrapNote = adminBootstrapRequested
    ? ' Admin MFA bootstrap UI and remediation callables completed successfully; verify email and enroll the real accounts, then rerun without the bootstrap marker.'
    : '';
  console.error(
    `[production-deploy] Admin MFA production preflight failed: ${message}${bootstrapNote}`,
  );
  process.exit(1);
}

if (adminBootstrapRequested) {
  sleepSeconds(
    functionBatchDelaySeconds,
    'after the Admin bootstrap so the regional mutation quota can recover',
  );
}

deployFunctionsInBatches();

retryFirebase(
  'firestore:rules,firestore:indexes,storage,hosting',
  'Firestore, Storage and Hosting production services',
  { attempts: 3, retryDelaySeconds: 30 },
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
  deploymentMetadata.functionDeployment = {
    strategy: 'sequential-batches',
    batchSize: functionBatchSize,
    interBatchDelaySeconds: functionBatchDelaySeconds,
  };
  writeFileSync(deploymentMetadataPath, `${JSON.stringify(deploymentMetadata, null, 2)}\n`);
  console.log('[production-deploy] embedded exact-SHA Firebase Phone Auth and Admin MFA evidence');
} catch (error) {
  const message = error instanceof Error ? error.message : 'metadata embedding failed';
  console.error(
    `[production-deploy] Could not bind Firebase Phone Auth and Admin MFA evidence to deployment metadata: ${message}`,
  );
  process.exit(1);
}

const verifyStatus = run(process.execPath, [
  'scripts/verify-production-deployment.mjs',
  '--write-evidence',
]);
if (verifyStatus !== 0) process.exit(verifyStatus);

console.log('[production-deploy] production deployment and identity verification passed');
