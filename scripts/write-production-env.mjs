#!/usr/bin/env node

import { appendFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const ADMIN_FIREBASE_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const VALIDATION_ONLY_ENTERPRISE_SITE_KEY = 'BIN_GROUP_VALIDATION_ONLY_ENTERPRISE_SITE_KEY';

const clean = (value) => String(value || '').trim();
const isMalformed = (value) => !value || /REPLACE|undefined|null/i.test(value);

const isExactProductionValidationJob = () => (
  clean(process.env.GITHUB_ACTIONS) === 'true' &&
  clean(process.env.GITHUB_WORKFLOW) === 'Firebase Production Deploy' &&
  clean(process.env.GITHUB_JOB) === 'validate-production-build' &&
  clean(process.env.DEPLOYMENT_ENVIRONMENT) !== 'production'
);

const rawEnterpriseSiteKey = clean(process.env.FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY);
const useValidationOnlyEnterpriseSiteKey =
  !rawEnterpriseSiteKey && isExactProductionValidationJob();
const enterpriseSiteKey = useValidationOnlyEnterpriseSiteKey
  ? VALIDATION_ONLY_ENTERPRISE_SITE_KEY
  : rawEnterpriseSiteKey;

const required = [
  'VITE_APP_CHECK_SITE_KEY',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_VAPID_KEY',
];

const failures = [];
for (const key of required) {
  const value = clean(process.env[key]);
  if (isMalformed(value)) failures.push(key);
}

if (!useValidationOnlyEnterpriseSiteKey && isMalformed(enterpriseSiteKey)) {
  failures.push('FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY');
}

if (
  !useValidationOnlyEnterpriseSiteKey &&
  enterpriseSiteKey === VALIDATION_ONLY_ENTERPRISE_SITE_KEY
) {
  failures.push('FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY');
}

if (failures.length) {
  console.error(`[production-env] missing or malformed values: ${failures.join(', ')}`);
  process.exit(1);
}

if (useValidationOnlyEnterpriseSiteKey) {
  console.warn(
    '[production-env] using a non-deployable Enterprise App Check placeholder for the exact validation job only; the protected production deployment job must supply FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY and rebuild',
  );
  const githubEnvironmentPath = clean(process.env.GITHUB_ENV);
  if (githubEnvironmentPath) {
    appendFileSync(
      githubEnvironmentPath,
      `REACT_APP_APP_CHECK_SITE_KEY=${VALIDATION_ONLY_ENTERPRISE_SITE_KEY}\n`,
      { mode: 0o600 },
    );
  }
}

const rootLines = [
  ['VITE_GOOGLE_MAPS_API_KEY', process.env.VITE_GOOGLE_MAPS_API_KEY || ''],
  ['VITE_APP_CHECK_SITE_KEY', process.env.VITE_APP_CHECK_SITE_KEY],
  ['VITE_ENABLE_FIREBASE_APPCHECK', 'true'],
  ['VITE_ENABLE_HR_MODULE', 'true'],
  ['VITE_FIREBASE_API_KEY', process.env.VITE_FIREBASE_API_KEY],
  ['VITE_FIREBASE_APP_ID', process.env.VITE_FIREBASE_APP_ID],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', process.env.VITE_FIREBASE_MESSAGING_SENDER_ID],
  ['VITE_FIREBASE_VAPID_KEY', process.env.VITE_FIREBASE_VAPID_KEY],
];

const adminLines = [
  ['GENERATE_SOURCEMAP', 'false'],
  ['REACT_APP_ENABLE_FIREBASE_APPCHECK', 'true'],
  ['REACT_APP_ENABLE_HR_MODULE', 'true'],
  ['REACT_APP_APP_CHECK_SITE_KEY', enterpriseSiteKey],
  ['REACT_APP_FIREBASE_API_KEY', process.env.VITE_FIREBASE_API_KEY],
  ['REACT_APP_ADMIN_FIREBASE_APP_ID', ADMIN_FIREBASE_APP_ID],
  ['REACT_APP_FIREBASE_MESSAGING_SENDER_ID', process.env.VITE_FIREBASE_MESSAGING_SENDER_ID],
  ['REACT_APP_FIREBASE_AUTH_DOMAIN', 'bin-group-57c60.firebaseapp.com'],
  ['REACT_APP_FIREBASE_PROJECT_ID', 'bin-group-57c60'],
  ['REACT_APP_FIREBASE_STORAGE_BUCKET', 'bin-group-57c60.firebasestorage.app'],
];

function serialize(entries) {
  return `${entries.map(([key, value]) => `${key}=${String(value ?? '')}`).join('\n')}\n`;
}

writeFileSync('.env.production', serialize(rootLines), { mode: 0o600 });
copyFileSync('.env.production', '.env.local');
mkdirSync(path.resolve('apps/admin-panel'), { recursive: true });
writeFileSync('apps/admin-panel/.env.production', serialize(adminLines), { mode: 0o600 });
copyFileSync('apps/admin-panel/.env.production', 'apps/admin-panel/.env.local');
console.log(
  useValidationOnlyEnterpriseSiteKey
    ? '[production-env] validation-only environment files created; no deployable Admin Enterprise App Check key was written'
    : '[production-env] production environment files created with public App Check, Admin Enterprise App Check, HR and canonical Admin Firebase identity enabled',
);
