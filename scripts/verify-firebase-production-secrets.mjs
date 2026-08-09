import firebaseTools from 'firebase-tools';
import { existsSync, readFileSync } from 'node:fs';
import { ensureAdminMfaAuthorizedDomains } from './ensure-admin-mfa-authorized-domains.mjs';

const expectedProjectId = 'bin-group-57c60';
const expectedRepository = 'rashidpvt420-lang/bin-group-super-app';
const adminMfaBootstrapMarker = 'ADMIN_MFA_BOOTSTRAP_HOSTING';

export const requiredFirebaseAiSecrets = Object.freeze([
  'OPENAI_API_KEY',
  'IMAGE_GENERATION_API_KEY',
  'GEMINI_API_KEY',
]);

// These secrets are bound by deployable production Functions even when the
// product is running in the restricted bank-pilot mode. They must be verified
// before the quota-safe Functions rollout starts; otherwise Firebase can spend
// an hour updating earlier batches before discovering an inaccessible secret.
export const requiredFirebaseInfrastructureSecrets = Object.freeze([
  'IOT_GATEWAY_TOKEN',
]);

export const requiredFirebaseBankPilotSecrets = Object.freeze([
  'SMTP_USER',
  'SMTP_PASS',
  'OWNER_CONTRACT_OTP_PEPPER',
  ...requiredFirebaseInfrastructureSecrets,
  ...requiredFirebaseAiSecrets,
]);

export const requiredFirebasePublicSecrets = Object.freeze([
  ...requiredFirebaseBankPilotSecrets,
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
]);

export function requiredFirebaseProductionSecretsForMode(launchMode) {
  const normalizedMode = String(launchMode || '').trim();
  if (!['bank-pilot', 'public'].includes(normalizedMode)) {
    throw new Error('LAUNCH_MODE must be bank-pilot or public.');
  }
  return normalizedMode === 'public'
    ? requiredFirebasePublicSecrets
    : requiredFirebaseBankPilotSecrets;
}

function readWorkflowInputs(env) {
  const eventPath = String(env.GITHUB_EVENT_PATH || '').trim();
  if (!eventPath || !existsSync(eventPath)) return {};
  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    return event?.inputs && typeof event.inputs === 'object' ? event.inputs : {};
  } catch {
    return {};
  }
}

function resolveDeployVerifiedMainSha({ env = process.env, apiStatus = 'unknown' } = {}) {
  const githubSha = String(env.GITHUB_SHA || '').trim();
  const inputs = readWorkflowInputs(env);
  const expectedInputSha = String(inputs.expected_commit_sha || '').trim();
  if (expectedInputSha && expectedInputSha !== githubSha) {
    throw new Error(
      `Refusing production mutation: workflow input expected_commit_sha is ${expectedInputSha}, but this workflow is ${githubSha}.`,
    );
  }

  const verifiedMainSha = String(env.PRODUCTION_EXACT_MAIN_VERIFIED_SHA || '').trim();
  if (!/^[0-9a-f]{40}$/.test(verifiedMainSha)) return '';
  console.warn(
    `[firebase-production-preflight] GitHub API current-main lookup returned HTTP ${apiStatus}; using deploy-verified origin/main binding ${verifiedMainSha}.`,
  );
  return verifiedMainSha;
}

export async function assertExactCurrentMain({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const githubSha = String(env.GITHUB_SHA || '').trim();
  const repository = String(env.GITHUB_REPOSITORY || expectedRepository).trim();
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    repository !== expectedRepository
  ) {
    throw new Error(`Exact-main production verification requires protected ${expectedRepository} GitHub Actions on refs/heads/main.`);
  }
  if (!/^[0-9a-f]{40}$/.test(githubSha)) {
    throw new Error('Exact-main production verification requires a lowercase 40-character GITHUB_SHA.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Refusing production mutation: GitHub API transport is unavailable.');
  }

  const token = String(env.GITHUB_TOKEN || env.GH_TOKEN || '').trim();
  const response = await fetchImpl(
    `https://api.github.com/repos/${expectedRepository}/git/ref/heads/main`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  if (!response?.ok) {
    const status = response?.status || 'unknown';
    const isPrivateRepoAuthorizationFailure = Number(status) === 403;
    if (isPrivateRepoAuthorizationFailure) {
      const verifiedMainSha = resolveDeployVerifiedMainSha({ env, apiStatus: status });
      if (verifiedMainSha) {
        if (verifiedMainSha !== githubSha) {
          throw new Error(
            `Refusing stale production mutation: deploy-verified origin/main is ${verifiedMainSha}, but this workflow is ${githubSha}. Start a fresh exact-SHA deployment.`,
          );
        }
        console.log(`[firebase-production-preflight] exact current main verified from deploy binding: ${githubSha}`);
        return verifiedMainSha;
      }
    }
    throw new Error(`Refusing production mutation: current origin/main could not be resolved through GitHub API (HTTP ${status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Refusing production mutation: GitHub API returned malformed current-main metadata.');
  }
  const remoteMainSha = String(payload?.object?.sha || '').trim();
  if (!/^[0-9a-f]{40}$/.test(remoteMainSha)) {
    throw new Error('Refusing production mutation: GitHub API returned no valid current origin/main SHA.');
  }
  if (remoteMainSha !== githubSha) {
    throw new Error(
      `Refusing stale production mutation: origin/main is ${remoteMainSha}, but this workflow is ${githubSha}. Start a fresh exact-SHA deployment.`,
    );
  }

  console.log(`[firebase-production-preflight] exact current main verified: ${githubSha}`);
  return remoteMainSha;
}

export function requireAdminMfaDomainRepairContext({
  env = process.env,
  approvalPath = 'launch_package/predeploy-approval.json',
} = {}) {
  const inputs = readWorkflowInputs(env);
  const requested = String(inputs.incident_evidence_refs || '').trim() === adminMfaBootstrapMarker;
  if (!requested) return false;

  const failures = [];
  const githubSha = String(env.GITHUB_SHA || '').trim();
  const artifactDigest = String(env.VALIDATED_ARTIFACT_DIGEST || '').trim();
  const launchMode = String(env.LAUNCH_MODE || '').trim();
  const requestedMode = String(inputs.launch_mode || '').trim();
  const publicGate = String(inputs.run_public_release_gate || 'false').trim().toLowerCase();

  if (env.GITHUB_ACTIONS !== 'true') failures.push('GitHub Actions context is required');
  if (env.GITHUB_REF !== 'refs/heads/main') failures.push('refs/heads/main is required');
  if (env.GITHUB_REPOSITORY !== expectedRepository) failures.push(`repository must equal ${expectedRepository}`);
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch') failures.push('workflow_dispatch is required');
  if (env.DEPLOYMENT_ENVIRONMENT !== 'production') failures.push('production deployment environment is required');
  if (!/^[0-9a-f]{40}$/.test(githubSha)) failures.push('exact GITHUB_SHA is required');
  if (!/^sha256:[0-9a-f]{64}$/i.test(artifactDigest)) failures.push('validated artifact digest is required');
  if (launchMode !== 'bank-pilot' || requestedMode !== 'bank-pilot') failures.push('bank-pilot mode is required');
  if (publicGate !== 'false') failures.push('public release gate must be disabled');

  if (!existsSync(approvalPath)) {
    failures.push('protected predeploy approval is missing');
  } else {
    try {
      const approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
      if (approval.commitSha !== githubSha) failures.push('approval SHA mismatch');
      if (approval.artifactDigest !== artifactDigest) failures.push('approval artifact mismatch');
      if (approval.launchMode !== 'bank-pilot') failures.push('approval launch mode mismatch');
      if (approval.githubEnvironment !== 'production') failures.push('approval environment mismatch');
      if (approval.approvedVia !== 'github-environment-protection') failures.push('approval authority mismatch');
    } catch {
      failures.push('protected predeploy approval is malformed');
    }
  }

  if (failures.length) {
    throw new Error(`Admin MFA authorized-domain repair refused: ${failures.join('; ')}`);
  }
  return true;
}

function normalizeFirebaseSecretLookupFailure(secretName, error) {
  const message = error instanceof Error ? error.message : 'metadata lookup failed';
  const normalized = String(message).toLowerCase();
  if (
    normalized.includes('requires billing to be enabled') ||
    normalized.includes('please enable billing') ||
    normalized.includes('check billing account associated')
  ) {
    return `${secretName}: Google Cloud billing is not enabled/usable for ${expectedProjectId}; Firebase Functions deployment is blocked (${message})`;
  }
  if (normalized.includes('permission') || normalized.includes('access denied') || normalized.includes('forbidden')) {
    return `${secretName}: production deploy identity cannot access this Secret Manager secret (${message})`;
  }
  return `${secretName}: ${message}`;
}

export async function verifyFirebaseSecretMetadata({
  projectId = String(process.env.GCP_PROJECT_ID || '').trim(),
  launchMode = String(process.env.LAUNCH_MODE || '').trim(),
  firebaseClient = firebaseTools,
} = {}) {
  if (projectId !== expectedProjectId) {
    throw new Error(`GCP_PROJECT_ID must equal ${expectedProjectId}.`);
  }

  const requiredSecrets = requiredFirebaseProductionSecretsForMode(launchMode);
  const failures = [];
  const verifiedSecretNames = [];

  for (const secretName of requiredSecrets) {
    try {
      const result = await firebaseClient.functions.secrets.get(secretName, {
        project: expectedProjectId,
        nonInteractive: true,
      });
      const versions = Array.isArray(result?.secrets) ? result.secrets : [];
      const hasAvailableVersion = versions.some((version) => {
        const state = String(version?.state || '').toUpperCase();
        return state === 'ENABLED';
      });
      if (!hasAvailableVersion) {
        failures.push(`${secretName}: no enabled secret version is available`);
        continue;
      }
      verifiedSecretNames.push(secretName);
      console.log(`Verified Firebase production secret metadata: ${secretName}`);
    } catch (error) {
      failures.push(normalizeFirebaseSecretLookupFailure(secretName, error));
    }
  }

  if (failures.length) {
    throw new Error(`Required Firebase production function secrets are unavailable: ${failures.join('; ')}`);
  }

  console.log(
    `Firebase production function secret metadata preflight passed for ${requiredSecrets.length} secret(s) in ${launchMode} mode.`,
  );
  return {
    projectId: expectedProjectId,
    launchMode,
    verifiedSecrets: requiredSecrets.length,
    verifiedSecretNames,
  };
}

export async function verifyFirebaseProductionSecrets({
  projectId = String(process.env.GCP_PROJECT_ID || '').trim(),
  launchMode = String(process.env.LAUNCH_MODE || '').trim(),
  firebaseClient = firebaseTools,
  env = process.env,
  approvalPath = 'launch_package/predeploy-approval.json',
  domainRepair = ensureAdminMfaAuthorizedDomains,
  exactMainVerifier = assertExactCurrentMain,
} = {}) {
  if (projectId !== expectedProjectId) {
    throw new Error(`GCP_PROJECT_ID must equal ${expectedProjectId}.`);
  }

  await exactMainVerifier({ env });

  if (requireAdminMfaDomainRepairContext({ env, approvalPath })) {
    await domainRepair({ projectId: expectedProjectId });
    console.log('Verified canonical protected Admin MFA authorized-domain repair.');
  }

  return verifyFirebaseSecretMetadata({ projectId, launchMode, firebaseClient });
}
