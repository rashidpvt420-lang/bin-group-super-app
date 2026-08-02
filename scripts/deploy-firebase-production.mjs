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
const functionsRuntimeEntry = 'functions/lib/runtimeAll.js';
const adminBootstrapFunctions = Object.freeze([
  'registerAdminSecuritySession',
  'getAdminSecurityProfile',
  'getAdminMfaReadinessOverview',
  'revokeAdminSessions',
  'lockOwnAdminAccount',
  'finalizeOwnAdminMfaRecovery',
]);
const adminBootstrapHostingTarget = 'hosting:admin';
const adminBootstrapFunctionComponents = Object.freeze(
  adminBootstrapFunctions.map((functionName) => `functions:${functionName}`),
);
const adminBootstrapFunctionTarget = adminBootstrapFunctionComponents.join(',');
const adminBootstrapDeployComponents = Object.freeze([
  adminBootstrapHostingTarget,
  ...adminBootstrapFunctionComponents,
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
if ((remoteMain.status ?? 1) !== 0 || !remoteMainSha) {
  console.error('[production-deploy] Refusing stale deployment: could not resolve current origin/main');
  process.exit(1);
}
if (remoteMainSha !== githubSha) {
  console.error(
    `[production-deploy] Refusing stale deployment: current origin/main ${remoteMainSha} must exactly match GITHUB_SHA ${githubSha}`,
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
  if (result.error) {
    const code = String(result.error.code || 'unknown');
    console.error(`[production-deploy] ${command} failed to complete (${code})`);
  }
  if (result.signal) {
    console.error(`[production-deploy] ${command} terminated by ${result.signal}`);
  }
  return result.status ?? 1;
}

function boundedInteger(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function sleepSeconds(seconds, reason) {
  const duration = Math.max(0, Number(seconds) || 0);
  if (!duration) return;
  console.log(`[production-deploy] waiting ${duration}s ${reason}`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, duration * 1000);
}

function retryFirebase(target, label, options = {}) {
  const attempts = boundedInteger('FIREBASE_DEPLOY_MAX_ATTEMPTS', options.attempts || 3, 1, 5);
  const retryDelaySeconds = boundedInteger(
    'FIREBASE_DEPLOY_RETRY_DELAY_SECONDS',
    options.retryDelaySeconds || 120,
    60,
    300,
  );
  const commandTimeoutSeconds = boundedInteger(
    'FIREBASE_DEPLOY_COMMAND_TIMEOUT_SECONDS',
    options.commandTimeoutSeconds || 900,
    300,
    1800,
  );
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(
      `[production-deploy] ${label} attempt ${attempt}/${attempts} (timeout=${commandTimeoutSeconds}s)`,
    );
    const status = run('npx', [
      'firebase',
      'deploy',
      '--only',
      target,
      '--project',
      projectId,
      '--non-interactive',
      '--force',
    ], {
      timeout: commandTimeoutSeconds * 1000,
      killSignal: 'SIGTERM',
    });
    if (status === 0) return;
    if (attempt < attempts) {
      sleepSeconds(retryDelaySeconds * attempt, `before retrying ${label}`);
    }
  }
  console.error(`[production-deploy] ${label} failed after ${attempts} attempts`);
  process.exit(1);
}

function discoverDeployableFunctionNames() {
  if (!existsSync(functionsRuntimeEntry)) {
    console.error(`[production-deploy] Missing compiled Functions runtime: ${functionsRuntimeEntry}`);
    process.exit(1);
  }
  const absoluteEntry = `${process.cwd()}/${functionsRuntimeEntry}`;
  const probe = `
const mod = require(${JSON.stringify(absoluteEntry)});
const names = Object.entries(mod || {})
  .filter(([, value]) => Boolean(value && (value.__endpoint || value.__trigger)))
  .map(([name]) => name)
  .sort();
process.stdout.write(JSON.stringify(names));
`;
  const result = spawnSync(process.execPath, ['-e', probe], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production' },
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    console.error('[production-deploy] Could not discover compiled Firebase Function exports');
    console.error(result.stderr || result.stdout || 'unknown Functions discovery failure');
    process.exit(1);
  }
  let names;
  try {
    names = JSON.parse(String(result.stdout || '').trim());
  } catch {
    console.error('[production-deploy] Compiled Firebase Function discovery returned malformed JSON');
    process.exit(1);
  }
  if (!Array.isArray(names) || names.length === 0) {
    console.error('[production-deploy] No deployable Firebase Function exports were discovered');
    process.exit(1);
  }
  const invalid = names.filter((name) => !/^[A-Za-z][A-Za-z0-9_-]*$/.test(String(name)));
  if (invalid.length > 0 || new Set(names).size !== names.length) {
    console.error(`[production-deploy] Invalid or duplicate Firebase Function export names: ${invalid.join(', ')}`);
    process.exit(1);
  }
  return names;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function deployFunctionsQuotaSafe() {
  const functionNames = discoverDeployableFunctionNames();
  const batchSize = boundedInteger('FIREBASE_FUNCTION_DEPLOY_BATCH_SIZE', 4, 1, 6);
  const cooldownSeconds = boundedInteger('FIREBASE_FUNCTION_DEPLOY_COOLDOWN_SECONDS', 75, 60, 300);
  const batches = chunk(functionNames, batchSize);

  console.log(
    `[production-deploy] quota-safe Functions deployment: ${functionNames.length} exports in ${batches.length} sequential batches (size<=${batchSize}, cooldown=${cooldownSeconds}s)`,
  );

  batches.forEach((batch, index) => {
    const target = batch.map((name) => `functions:${name}`).join(',');
    retryFirebase(
      target,
      `Functions batch ${index + 1}/${batches.length} [${batch.join(', ')}]`,
      { retryDelaySeconds: 120 },
    );
    if (index < batches.length - 1) {
      sleepSeconds(cooldownSeconds, 'to respect the regional Cloud Functions mutation quota');
    }
  });

  return {
    strategy: 'sequential-export-batches',
    functionCount: functionNames.length,
    batchCount: batches.length,
    batchSize,
    cooldownSeconds,
    deployedFunctions: functionNames,
  };
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

  console.log('[production-deploy] Protected Admin MFA bootstrap requested; deploying Admin Hosting before remediation callables');
  retryFirebase(
    adminBootstrapHostingTarget,
    'Admin MFA bootstrap hosting',
    { attempts: 2, retryDelaySeconds: 60, commandTimeoutSeconds: 600 },
  );
  console.log('[production-deploy] Admin Hosting release completed; deploying only the allowlisted remediation callables');
  retryFirebase(
    adminBootstrapFunctionTarget,
    'Admin MFA bootstrap remediation callables',
    { attempts: 2, retryDelaySeconds: 90, commandTimeoutSeconds: 900 },
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
    hostingDeployedFirst: true,
    firebaseCommandTimeoutEnforced: true,
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

const functionDeploymentEvidence = deployFunctionsQuotaSafe();
retryFirebase(
  'hosting,firestore:rules,firestore:indexes,storage',
  'non-Functions Firebase production stack',
  { retryDelaySeconds: 90 },
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
  deploymentMetadata.functionsDeployment = functionDeploymentEvidence;
  writeFileSync(deploymentMetadataPath, `${JSON.stringify(deploymentMetadata, null, 2)}\n`);
  console.log('[production-deploy] embedded exact-SHA Firebase Phone Auth, Admin MFA and quota-safe Functions deployment evidence');
} catch (error) {
  const message = error instanceof Error ? error.message : 'metadata embedding failed';
  console.error(`[production-deploy] Could not bind Firebase Phone Auth, Admin MFA and Functions batching evidence to deployment metadata: ${message}`);
  process.exit(1);
}

const verifyStatus = run(process.execPath, [
  'scripts/verify-production-deployment.mjs',
  '--write-evidence',
]);
if (verifyStatus !== 0) process.exit(verifyStatus);

console.log('[production-deploy] production deployment and identity verification passed');
