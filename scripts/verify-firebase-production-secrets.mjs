import firebaseTools from 'firebase-tools';
import { existsSync, readFileSync } from 'node:fs';
import { ensureAdminMfaAuthorizedDomains } from './ensure-admin-mfa-authorized-domains.mjs';

const expectedProjectId = 'bin-group-57c60';
const adminMfaBootstrapMarker = 'ADMIN_MFA_BOOTSTRAP_HOSTING';

export const requiredFirebaseAiSecrets = Object.freeze([
  'OPENAI_API_KEY',
  'IMAGE_GENERATION_API_KEY',
  'GEMINI_API_KEY',
]);

export const requiredFirebaseBankPilotSecrets = Object.freeze([
  'SMTP_USER',
  'SMTP_PASS',
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
      const message = error instanceof Error ? error.message : 'metadata lookup failed';
      failures.push(`${secretName}: ${message}`);
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
} = {}) {
  if (projectId !== expectedProjectId) {
    throw new Error(`GCP_PROJECT_ID must equal ${expectedProjectId}.`);
  }

  if (requireAdminMfaDomainRepairContext({ env, approvalPath })) {
    await domainRepair({ projectId: expectedProjectId });
    console.log('Verified canonical protected Admin MFA authorized-domain repair.');
  }

  return verifyFirebaseSecretMetadata({ projectId, launchMode, firebaseClient });
}
