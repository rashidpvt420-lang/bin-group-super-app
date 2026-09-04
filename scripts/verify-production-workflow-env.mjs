#!/usr/bin/env node

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_FIREBASE_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const EXPECTED_MAIN_URL = 'https://bin-group-57c60.web.app';
const EXPECTED_ADMIN_URL = 'https://bin-group-admin-panel.web.app';
const CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups.com';
const ADMIN_MFA_BOOTSTRAP_MARKER = 'ADMIN_MFA_BOOTSTRAP_HOSTING';
const PHASE1_PAYMENT_POLICY = 'phase1-manual';
const CANONICAL_INCIDENT_REFERENCE = 'https://github.com/rashidpvt420-lang/bin-group-super-app/issues/434';
const OWNER_REQUEST_REFERENCE_RE = /^https:\/\/github\.com\/rashidpvt420-lang\/bin-group-super-app\/pull\/\d+$/;
const FAILED_PRODUCTION_RUN_REFERENCE_RE = /^GITHUB_PRODUCTION_RUN_[1-9]\d*$/;
const AUTHORIZED_OWNER_ACTOR = 'rashidpvt420-lang';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GOOGLE_API_KEY_RE = /^AIza[0-9A-Za-z_-]{30,}$/;
const FIREBASE_APP_ID_RE = /^1:\d{6,20}:web:[0-9A-Za-z]+$/;
const MESSAGING_SENDER_ID_RE = /^\d{6,20}$/;
const VAPID_KEY_RE = /^B[A-Za-z0-9_-]{70,100}$/;
const RECAPTCHA_SITE_KEY_RE = /^[A-Za-z0-9_-]{30,100}$/;
const WIF_PROVIDER_RE = /^projects\/\d+\/locations\/global\/workloadIdentityPools\/[A-Za-z0-9._-]+\/providers\/[A-Za-z0-9._-]+$/;
const SERVICE_ACCOUNT_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER_RE = /(?:YOUR_|REPLACE(?:_ME)?|CHANGE_ME|CHANGEME|TODO|EXAMPLE|XXX+)/i;
const PRODUCTION_ENV_WRITER = readFileSync(new URL('./write-production-env.mjs', import.meta.url), 'utf8');

export const REQUIRED_PRODUCTION_VALUES = Object.freeze([
  'GCP_PROJECT_ID',
  'GCP_WORKLOAD_IDENTITY_PROVIDER',
  'GCP_SERVICE_ACCOUNT',
  'HARD_LAUNCH_APPROVAL_HMAC_KEY',
  'AUTHORIZED_FOUNDER_ACTORS',
  'AUTHORIZED_FOUNDER_EMAILS',
  'PRODUCTION_APPROVED_BY',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_VAPID_KEY',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_APP_CHECK_SITE_KEY',
  'VITE_ENABLE_FIREBASE_APPCHECK',
  'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN',
  'E2E_BASE_URL',
  'E2E_ADMIN_BASE_URL',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_FOUNDER_EMAIL',
  'E2E_FOUNDER_PASSWORD',
  'E2E_OWNER_MAILBOX_EMAIL',
  'E2E_OWNER_PASSWORD',
  'E2E_TENANT_EMAIL',
  'E2E_TENANT_PASSWORD',
  'E2E_TECHNICIAN_EMAIL',
  'E2E_TECHNICIAN_PASSWORD',
  'E2E_BROKER_MAILBOX_EMAIL',
  'E2E_BROKER_PASSWORD',
]);

const value = (env, key) => String(env?.[key] || '').trim();
const hrEnabledByProductionWriter = () =>
  /\[['"]VITE_ENABLE_HR_MODULE['"],\s*['"]true['"]\]/.test(PRODUCTION_ENV_WRITER) &&
  /\[['"]REACT_APP_ENABLE_HR_MODULE['"],\s*['"]true['"]\]/.test(PRODUCTION_ENV_WRITER);

function readWorkflowDispatchEvent(env = process.env) {
  const eventPath = value(env, 'GITHUB_EVENT_PATH');
  if (!eventPath || !existsSync(eventPath)) {
    return { eventPath, event: null, inputs: {}, deploymentPayload: null, error: null };
  }

  let event;
  try {
    event = JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch {
    return {
      eventPath,
      event: null,
      inputs: {},
      deploymentPayload: null,
      error: 'GitHub workflow dispatch event is malformed',
    };
  }

  const inputs = event?.inputs && typeof event.inputs === 'object' ? event.inputs : {};
  const rawDeploymentPayload = String(inputs.deployment_payload_json || '').trim();
  if (!rawDeploymentPayload) {
    return { eventPath, event, inputs, deploymentPayload: {}, error: null };
  }

  try {
    const deploymentPayload = JSON.parse(rawDeploymentPayload);
    if (!deploymentPayload || typeof deploymentPayload !== 'object' || Array.isArray(deploymentPayload)) {
      return {
        eventPath,
        event,
        inputs,
        deploymentPayload: null,
        error: 'deployment_payload_json must decode to an object',
      };
    }
    return { eventPath, event, inputs, deploymentPayload, error: null };
  } catch {
    return {
      eventPath,
      event,
      inputs,
      deploymentPayload: null,
      error: 'deployment_payload_json is malformed',
    };
  }
}

export function adminMfaBootstrapWorkflowState(env = process.env) {
  const dispatch = readWorkflowDispatchEvent(env);
  const incidentEvidenceRefs = String(dispatch.deploymentPayload?.incident_evidence_refs || '').trim();
  const compatibilityMarker = String(dispatch.inputs?.incident_evidence_refs || '').trim();
  const explicitMarkerRequested =
    incidentEvidenceRefs === ADMIN_MFA_BOOTSTRAP_MARKER ||
    compatibilityMarker === ADMIN_MFA_BOOTSTRAP_MARKER;

  const founderTotp = value(env, 'E2E_FOUNDER_TOTP_SECRET').toUpperCase().replace(/[\s=-]/g, '');
  const founderMfaConfigured =
    (founderTotp.length >= 16 && /^[A-Z2-7]+$/.test(founderTotp)) ||
    /^\d{6}$/.test(value(env, 'E2E_FOUNDER_REAL_MFA_CODE'));
  const incidentReferences = incidentEvidenceRefs.split(',').map((entry) => entry.trim()).filter(Boolean);
  const hasFailedProductionReference =
    incidentReferences.length === 3 && FAILED_PRODUCTION_RUN_REFERENCE_RE.test(incidentReferences[2]);
  const failedDeploymentTimestamp = String(dispatch.deploymentPayload?.incident_last_deployment_failed_at || '').trim();
  const failedDeploymentStateMatched = hasFailedProductionReference
    ? String(dispatch.deploymentPayload?.incident_last_deployment_failed || '').trim() === 'true' &&
      !Number.isNaN(Date.parse(failedDeploymentTimestamp)) &&
      String(dispatch.deploymentPayload?.incident_attestation || '').trim() === 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS'
    : incidentReferences.length === 2 &&
      String(dispatch.deploymentPayload?.incident_last_deployment_failed || '').trim() === 'false' &&
      failedDeploymentTimestamp === '' &&
      String(dispatch.deploymentPayload?.incident_attestation || '').trim() === 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR';
  const canonicalOwnerRecoveryRequested =
    !founderMfaConfigured &&
    (incidentReferences.length === 2 || hasFailedProductionReference) &&
    incidentReferences[0] === CANONICAL_INCIDENT_REFERENCE &&
    OWNER_REQUEST_REFERENCE_RE.test(incidentReferences[1]) &&
    failedDeploymentStateMatched &&
    String(dispatch.deploymentPayload?.incident_active_json || '').trim() === '[]' &&
    String(dispatch.deploymentPayload?.incident_requires_rollback || '').trim() === 'false' &&
    String(dispatch.deploymentPayload?.incident_rollback_reason || '').trim() === '' &&
    String(dispatch.deploymentPayload?.hard_clearance_run_id || '').trim() === '' &&
    String(dispatch.deploymentPayload?.stripe_live_checkout_session_id || '').trim() === '' &&
    String(dispatch.deploymentPayload?.stripe_live_webhook_event_id || '').trim() === '' &&
    String(dispatch.inputs?.authorization_actor || '').trim() === AUTHORIZED_OWNER_ACTOR &&
    String(dispatch.inputs?.founder_email || '').trim().toLowerCase() === CANONICAL_FOUNDER_EMAIL &&
    String(dispatch.inputs?.confirmation || '').trim() === 'DEPLOY_PRODUCTION_BIN_GROUP_57C60' &&
    String(dispatch.inputs?.hard_launch_confirmation || '').trim() === 'AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP' &&
    String(dispatch.inputs?.expected_commit_sha || '').trim() === value(env, 'GITHUB_SHA') &&
    String(dispatch.inputs?.launch_mode || '').trim() === 'bank-pilot' &&
    String(dispatch.inputs?.payment_policy || '').trim() === PHASE1_PAYMENT_POLICY &&
    String(dispatch.inputs?.run_public_release_gate || '').trim() === 'false';

  const requested = explicitMarkerRequested || canonicalOwnerRecoveryRequested;
  const exactMainSha = /^[0-9a-f]{40}$/.test(value(env, 'GITHUB_SHA'));
  const authorized =
    requested &&
    !dispatch.error &&
    value(env, 'GITHUB_ACTIONS') === 'true' &&
    value(env, 'GITHUB_EVENT_NAME') === 'workflow_dispatch' &&
    value(env, 'GITHUB_REF') === 'refs/heads/main' &&
    exactMainSha &&
    value(env, 'LAUNCH_MODE') === 'bank-pilot' &&
    value(env, 'PAYMENT_POLICY') === PHASE1_PAYMENT_POLICY &&
    value(env, 'RUN_PUBLIC_RELEASE_GATE') === 'false';

  return {
    marker: ADMIN_MFA_BOOTSTRAP_MARKER,
    requested,
    authorized,
    requestSource: explicitMarkerRequested
      ? 'explicit-marker'
      : canonicalOwnerRecoveryRequested
        ? 'protected-owner-recovery'
        : null,
    eventPath: dispatch.eventPath,
    dispatchError: dispatch.error,
  };
}

export function normalizeAdminMfaBootstrapWorkflowEvent(env = process.env) {
  const state = adminMfaBootstrapWorkflowState(env);
  if (!state.authorized) return false;

  const dispatch = readWorkflowDispatchEvent(env);
  if (!dispatch.event || !dispatch.eventPath || dispatch.error) {
    throw new Error('Authorized Admin MFA bootstrap event could not be normalized');
  }

  if (!dispatch.event.inputs || typeof dispatch.event.inputs !== 'object') {
    dispatch.event.inputs = {};
  }
  if (String(dispatch.event.inputs.incident_evidence_refs || '').trim() === ADMIN_MFA_BOOTSTRAP_MARKER) {
    return false;
  }

  dispatch.event.inputs.incident_evidence_refs = ADMIN_MFA_BOOTSTRAP_MARKER;
  const temporaryPath = `${dispatch.eventPath}.admin-mfa-bootstrap-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(dispatch.event)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, dispatch.eventPath);
  return true;
}

function requirePattern(failures, env, key, pattern, description) {
  const current = value(env, key);
  if (current && !pattern.test(current)) failures.push(`${key} ${description}`);
}

export function validateProductionWorkflowEnv(env = process.env) {
  const failures = [];
  for (const key of REQUIRED_PRODUCTION_VALUES) {
    if (!value(env, key)) failures.push(`Missing required production value: ${key}`);
  }

  if (!hrEnabledByProductionWriter()) {
    failures.push('write-production-env.mjs must enable both VITE_ENABLE_HR_MODULE and REACT_APP_ENABLE_HR_MODULE');
  }

  if (value(env, 'GCP_PROJECT_ID') && value(env, 'GCP_PROJECT_ID') !== EXPECTED_PROJECT_ID) {
    failures.push(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}`);
  }
  requirePattern(failures, env, 'GCP_WORKLOAD_IDENTITY_PROVIDER', WIF_PROVIDER_RE, 'must be a full Workload Identity provider resource name');
  requirePattern(failures, env, 'GCP_SERVICE_ACCOUNT', SERVICE_ACCOUNT_RE, 'must be a Google service-account email');

  const hmac = value(env, 'HARD_LAUNCH_APPROVAL_HMAC_KEY');
  if (hmac && hmac.length < 32) failures.push('HARD_LAUNCH_APPROVAL_HMAC_KEY must contain at least 32 characters');

  const founderEmails = value(env, 'AUTHORIZED_FOUNDER_EMAILS')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (value(env, 'AUTHORIZED_FOUNDER_EMAILS') && (founderEmails.length === 0 || founderEmails.some((email) => !EMAIL_RE.test(email)))) {
    failures.push('AUTHORIZED_FOUNDER_EMAILS must contain valid comma-separated email addresses');
  }

  const founderEmail = value(env, 'E2E_FOUNDER_EMAIL').toLowerCase();
  const adminEmail = value(env, 'E2E_ADMIN_EMAIL').toLowerCase();
  if (founderEmail && founderEmail !== CANONICAL_FOUNDER_EMAIL) {
    failures.push(`E2E_FOUNDER_EMAIL must equal ${CANONICAL_FOUNDER_EMAIL}`);
  }
  if (founderEmail && adminEmail && founderEmail === adminEmail) {
    failures.push('E2E_FOUNDER_EMAIL must differ from the ephemeral E2E_ADMIN_EMAIL');
  }
  const founderPassword = value(env, 'E2E_FOUNDER_PASSWORD');
  if (founderPassword && founderPassword.length < 8) failures.push('E2E_FOUNDER_PASSWORD must contain at least 8 characters');
  const founderTotp = value(env, 'E2E_FOUNDER_TOTP_SECRET').toUpperCase().replace(/[\s=-]/g, '');
  const founderRealMfaCode = value(env, 'E2E_FOUNDER_REAL_MFA_CODE');
  const validFounderTotp = founderTotp.length >= 16 && /^[A-Z2-7]+$/.test(founderTotp);
  const validFounderRealMfaCode = /^\d{6}$/.test(founderRealMfaCode);
  const bootstrapState = adminMfaBootstrapWorkflowState(env);
  if (bootstrapState.dispatchError && bootstrapState.requested) {
    failures.push(bootstrapState.dispatchError);
  }
  if (bootstrapState.requested && !bootstrapState.authorized) {
    failures.push('Admin MFA bootstrap is allowed only for exact-main workflow_dispatch bank-pilot runs with Phase 1 payments and the public-release gate disabled');
  }
  if (!validFounderTotp && !validFounderRealMfaCode && !bootstrapState.authorized) {
    failures.push('Set a valid E2E_FOUNDER_TOTP_SECRET or six-digit E2E_FOUNDER_REAL_MFA_CODE');
  }

  const namedClientValues = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_VAPID_KEY',
    'VITE_GOOGLE_MAPS_API_KEY',
    'VITE_APP_CHECK_SITE_KEY',
  ];
  for (const key of namedClientValues) {
    if (PLACEHOLDER_RE.test(value(env, key))) failures.push(`${key} must not contain a placeholder value`);
  }

  requirePattern(failures, env, 'VITE_FIREBASE_API_KEY', GOOGLE_API_KEY_RE, 'must be a plausible Google API key');
  requirePattern(failures, env, 'VITE_GOOGLE_MAPS_API_KEY', GOOGLE_API_KEY_RE, 'must be a plausible Google Maps API key');
  requirePattern(failures, env, 'VITE_FIREBASE_APP_ID', FIREBASE_APP_ID_RE, 'must be a Firebase web App ID');
  if (value(env, 'VITE_FIREBASE_APP_ID') && value(env, 'VITE_FIREBASE_APP_ID') !== EXPECTED_FIREBASE_APP_ID) {
    failures.push('VITE_FIREBASE_APP_ID must equal the BIN GROUP production web app ID');
  }
  requirePattern(failures, env, 'VITE_FIREBASE_MESSAGING_SENDER_ID', MESSAGING_SENDER_ID_RE, 'must be a numeric Firebase sender ID');
  requirePattern(failures, env, 'VITE_FIREBASE_VAPID_KEY', VAPID_KEY_RE, 'must be a plausible Web Push VAPID public key');
  requirePattern(failures, env, 'VITE_APP_CHECK_SITE_KEY', RECAPTCHA_SITE_KEY_RE, 'must be a plausible reCAPTCHA site key');

  const firebaseApiKey = value(env, 'VITE_FIREBASE_API_KEY');
  const mapsApiKey = value(env, 'VITE_GOOGLE_MAPS_API_KEY');
  if (firebaseApiKey && mapsApiKey && firebaseApiKey === mapsApiKey) {
    failures.push('VITE_FIREBASE_API_KEY and VITE_GOOGLE_MAPS_API_KEY must use separate restricted credentials');
  }
  if (value(env, 'VITE_ENABLE_FIREBASE_APPCHECK') && value(env, 'VITE_ENABLE_FIREBASE_APPCHECK') !== 'true') {
    failures.push('VITE_ENABLE_FIREBASE_APPCHECK must equal true');
  }

  const appCheck = value(env, 'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN');
  if (appCheck && !UUID_RE.test(appCheck)) failures.push('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN must be a registered UUID');

  const exactUrls = {
    E2E_BASE_URL: EXPECTED_MAIN_URL,
    E2E_ADMIN_BASE_URL: EXPECTED_ADMIN_URL,
  };
  for (const [key, expected] of Object.entries(exactUrls)) {
    const current = value(env, key).replace(/\/+$/, '');
    if (current && current !== expected) failures.push(`${key} must equal ${expected}`);
  }

  requirePattern(failures, env, 'E2E_FOUNDER_EMAIL', EMAIL_RE, 'must be a valid email address');
  const rawFounderTotp = value(env, 'E2E_FOUNDER_TOTP_SECRET');
  if (rawFounderTotp && rawFounderTotp.length < 16) {
    failures.push('E2E_FOUNDER_TOTP_SECRET must contain at least 16 characters');
  }

  const techBEmail = value(env, 'E2E_TECHNICIAN_B_EMAIL');
  const techBPassword = value(env, 'E2E_TECHNICIAN_B_PASSWORD');
  if (Boolean(techBEmail) !== Boolean(techBPassword)) {
    failures.push('E2E_TECHNICIAN_B_EMAIL and E2E_TECHNICIAN_B_PASSWORD must both be set or both be absent');
  }

  const launchMode = value(env, 'LAUNCH_MODE');
  if (!['bank-pilot', 'public'].includes(launchMode)) failures.push('LAUNCH_MODE must be bank-pilot or public');
  if (launchMode === 'public' && value(env, 'RUN_PUBLIC_RELEASE_GATE') !== 'true') {
    failures.push('public launch mode requires RUN_PUBLIC_RELEASE_GATE=true');
  }
  if (launchMode === 'bank-pilot' && value(env, 'RUN_PUBLIC_RELEASE_GATE') === 'true') {
    failures.push('bank-pilot launch mode requires RUN_PUBLIC_RELEASE_GATE=false');
  }

  const paymentPolicy = value(env, 'PAYMENT_POLICY').toLowerCase();
  if (paymentPolicy !== PHASE1_PAYMENT_POLICY) {
    failures.push('PAYMENT_POLICY must equal phase1-manual while PHASE1_CASH_CHEQUE_V1 is active');
  }

  return failures;
}

export function productionWorkflowEnvSummary(env = process.env) {
  const bootstrapState = adminMfaBootstrapWorkflowState(env);
  return {
    projectIdMatched: value(env, 'GCP_PROJECT_ID') === EXPECTED_PROJECT_ID,
    firebaseAppIdMatched: value(env, 'VITE_FIREBASE_APP_ID') === EXPECTED_FIREBASE_APP_ID,
    mainUrlMatched: value(env, 'E2E_BASE_URL').replace(/\/+$/, '') === EXPECTED_MAIN_URL,
    adminUrlMatched: value(env, 'E2E_ADMIN_BASE_URL').replace(/\/+$/, '') === EXPECTED_ADMIN_URL,
    appCheckEnabled: value(env, 'VITE_ENABLE_FIREBASE_APPCHECK') === 'true',
    phase1PaymentPolicyMatched: value(env, 'PAYMENT_POLICY').toLowerCase() === PHASE1_PAYMENT_POLICY,
    founderMfaConfigured:
      (value(env, 'E2E_FOUNDER_TOTP_SECRET').toUpperCase().replace(/[\s=-]/g, '').length >= 16 &&
        /^[A-Z2-7]+$/.test(value(env, 'E2E_FOUNDER_TOTP_SECRET').toUpperCase().replace(/[\s=-]/g, ''))) ||
      /^\d{6}$/.test(value(env, 'E2E_FOUNDER_REAL_MFA_CODE')),
    adminMfaBootstrapRequested: bootstrapState.requested,
    adminMfaBootstrapAuthorized: bootstrapState.authorized,
    hrModuleEnabledByProductionWriter: hrEnabledByProductionWriter(),
    firebaseAndMapsKeysSeparated:
      Boolean(value(env, 'VITE_FIREBASE_API_KEY')) &&
      Boolean(value(env, 'VITE_GOOGLE_MAPS_API_KEY')) &&
      value(env, 'VITE_FIREBASE_API_KEY') !== value(env, 'VITE_GOOGLE_MAPS_API_KEY'),
    requiredValueCount: REQUIRED_PRODUCTION_VALUES.length,
    sensitiveValuesExcluded: true,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const failures = validateProductionWorkflowEnv(process.env);
  if (failures.length) {
    console.error('\n[production-preflight] FAIL');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  const eventNormalized = normalizeAdminMfaBootstrapWorkflowEvent(process.env);
  const summary = productionWorkflowEnvSummary(process.env);
  if (eventNormalized) {
    console.log('[production-preflight] Authorized Admin MFA bootstrap marker normalized for the exact protected deploy step');
  }
  console.log(
    '[production-preflight] PASS — deployment, five-role, App Check, HR, Maps, Web Push and Phase 1 Cash/Cheque policy are configured '
      + `(required=${summary.requiredValueCount}, phase1=${summary.phase1PaymentPolicyMatched}, hr=${summary.hrModuleEnabledByProductionWriter}, admin_mfa_bootstrap=${summary.adminMfaBootstrapAuthorized}, secrets_excluded=${summary.sensitiveValuesExcluded})`,
  );
}
