#!/usr/bin/env node

const failures = [];
const required = [
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
  'VITE_APP_CHECK_SITE_KEY',
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
];

for (const key of required) {
  if (!String(process.env[key] || '').trim()) failures.push(`Missing required production value: ${key}`);
}

const hmac = String(process.env.HARD_LAUNCH_APPROVAL_HMAC_KEY || '');
if (hmac && hmac.length < 32) failures.push('HARD_LAUNCH_APPROVAL_HMAC_KEY must contain at least 32 characters');

const appCheck = String(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (appCheck && !uuid.test(appCheck)) failures.push('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN must be a registered UUID');

for (const key of ['E2E_BASE_URL', 'E2E_ADMIN_BASE_URL']) {
  const value = String(process.env[key] || '').trim();
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') failures.push(`${key} must use https`);
    } catch {
      failures.push(`${key} must be a valid URL`);
    }
  }
}

const techBEmail = String(process.env.E2E_TECHNICIAN_B_EMAIL || '').trim();
const techBPassword = String(process.env.E2E_TECHNICIAN_B_PASSWORD || '').trim();
if (Boolean(techBEmail) !== Boolean(techBPassword)) {
  failures.push('E2E_TECHNICIAN_B_EMAIL and E2E_TECHNICIAN_B_PASSWORD must both be set or both be absent');
}

const launchMode = String(process.env.LAUNCH_MODE || '').trim();
if (!['bank-pilot', 'public'].includes(launchMode)) failures.push('LAUNCH_MODE must be bank-pilot or public');
if (launchMode === 'public') {
  if (String(process.env.RUN_PUBLIC_RELEASE_GATE || '') !== 'true') failures.push('public launch mode requires RUN_PUBLIC_RELEASE_GATE=true');
}

if (failures.length) {
  console.error('\n[production-preflight] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[production-preflight] PASS — deployment, five-role, and App Check values are configured');
