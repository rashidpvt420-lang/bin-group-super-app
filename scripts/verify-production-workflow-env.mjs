#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_MAIN_URL = 'https://bin-group-57c60.web.app';
const EXPECTED_ADMIN_URL = 'https://bin-group-admin-panel.web.app';
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
  'E2E_OWNER_EMAIL',
  'E2E_OWNER_PASSWORD',
  'E2E_TENANT_EMAIL',
  'E2E_TENANT_PASSWORD',
  'E2E_TECHNICIAN_EMAIL',
  'E2E_TECHNICIAN_PASSWORD',
  'E2E_BROKER_EMAIL',
  'E2E_BROKER_PASSWORD',
]);

const value = (env, key) => String(env?.[key] || '').trim();

function requirePattern(failures, env, key, pattern, description) {
  const current = value(env, key);
  if (current && !pattern.test(current)) failures.push(`${key} ${description}`);
}

export function validateProductionWorkflowEnv(env = process.env) {
  const failures = [];
  for (const key of REQUIRED_PRODUCTION_VALUES) {
    if (!value(env, key)) failures.push(`Missing required production value: ${key}`);
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

  return failures;
}

export function productionWorkflowEnvSummary(env = process.env) {
  return {
    projectIdMatched: value(env, 'GCP_PROJECT_ID') === EXPECTED_PROJECT_ID,
    mainUrlMatched: value(env, 'E2E_BASE_URL').replace(/\/+$/, '') === EXPECTED_MAIN_URL,
    adminUrlMatched: value(env, 'E2E_ADMIN_BASE_URL').replace(/\/+$/, '') === EXPECTED_ADMIN_URL,
    appCheckEnabled: value(env, 'VITE_ENABLE_FIREBASE_APPCHECK') === 'true',
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
  const summary = productionWorkflowEnvSummary(process.env);
  console.log(
    '[production-preflight] PASS — deployment, five-role, App Check, Maps and Web Push values are configured '
      + `(required=${summary.requiredValueCount}, secrets_excluded=${summary.sensitiveValuesExcluded})`,
  );
}
