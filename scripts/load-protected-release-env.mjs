#!/usr/bin/env node
/**
 * Load the protected release environment from one Google Secret Manager JSON
 * bundle after Workload Identity Federation authentication.
 *
 * The secret payload is never printed. Values are exported through GITHUB_ENV
 * for later workflow steps. Local use may pass PROTECTED_RELEASE_ENV_JSON.
 */
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const REQUIRED_KEYS = [
  'HARD_LAUNCH_APPROVAL_HMAC_KEY',
  'AUTHORIZED_FOUNDER_ACTORS',
  'AUTHORIZED_FOUNDER_EMAILS',
  'PRODUCTION_APPROVED_BY',
  'PREDEPLOY_STRIPE_PROOF_OK',
  'POSTDEPLOY_STRIPE_LIVE_OK',
  'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_APP_CHECK_SITE_KEY',
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

function readBundle() {
  const injected = String(process.env.PROTECTED_RELEASE_ENV_JSON || '').trim();
  if (injected) return injected;

  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('PROTECTED_RELEASE_ENV_JSON is required outside GitHub Actions');
  }
  const projectId = String(
    process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'bin-group-57c60',
  ).trim();
  const secretName = String(process.env.PROTECTED_RELEASE_SECRET_NAME || 'bin-group-production-release-env').trim();
  const result = spawnSync(
    'gcloud',
    ['secrets', 'versions', 'access', 'latest', `--secret=${secretName}`, `--project=${projectId}`],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, shell: false },
  );
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Unable to read Secret Manager bundle ${secretName}: ${String(result.stderr || '').trim()}`);
  }
  return String(result.stdout || '').trim();
}

function validateValue(key, value) {
  const text = String(value ?? '');
  if (!text.trim()) throw new Error(`Protected release bundle is missing ${key}`);
  if (text.includes('\0')) throw new Error(`${key} contains an invalid null byte`);
  return text;
}

function exportToGitHubEnv(key, value) {
  const envFile = String(process.env.GITHUB_ENV || '').trim();
  if (!envFile) return;
  const marker = `BIN_GROUP_${randomUUID().replaceAll('-', '')}`;
  appendFileSync(envFile, `${key}<<${marker}\n${value}\n${marker}\n`, { mode: 0o600 });
}

try {
  const raw = readBundle();
  const bundle = JSON.parse(raw);
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    throw new Error('Protected release bundle must be a JSON object');
  }

  for (const key of REQUIRED_KEYS) {
    const value = validateValue(key, bundle[key]);
    process.env[key] = value;
    exportToGitHubEnv(key, value);
  }

  const aliases = {
    FIREBASE_APPCHECK_DEBUG_TOKEN: bundle.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN,
    E2E_BASE_URL: bundle.E2E_BASE_URL || 'https://bin-group-57c60.web.app',
    VITE_ENABLE_FIREBASE_APPCHECK: bundle.VITE_ENABLE_FIREBASE_APPCHECK || 'true',
    REACT_APP_ENABLE_FIREBASE_APPCHECK: bundle.REACT_APP_ENABLE_FIREBASE_APPCHECK || 'true',
    REACT_APP_APP_CHECK_SITE_KEY: bundle.REACT_APP_APP_CHECK_SITE_KEY || bundle.VITE_APP_CHECK_SITE_KEY,
    REACT_APP_FIREBASE_API_KEY: bundle.REACT_APP_FIREBASE_API_KEY || bundle.VITE_FIREBASE_API_KEY,
    REACT_APP_FIREBASE_APP_ID: bundle.REACT_APP_FIREBASE_APP_ID || bundle.VITE_FIREBASE_APP_ID,
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID:
      bundle.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || bundle.VITE_FIREBASE_MESSAGING_SENDER_ID,
    REACT_APP_FIREBASE_AUTH_DOMAIN: bundle.REACT_APP_FIREBASE_AUTH_DOMAIN || 'bin-group-57c60.firebaseapp.com',
    REACT_APP_FIREBASE_PROJECT_ID: bundle.REACT_APP_FIREBASE_PROJECT_ID || 'bin-group-57c60',
    REACT_APP_FIREBASE_STORAGE_BUCKET:
      bundle.REACT_APP_FIREBASE_STORAGE_BUCKET || 'bin-group-57c60.firebasestorage.app',
  };
  for (const [key, value] of Object.entries(aliases)) {
    const validated = validateValue(key, value);
    process.env[key] = validated;
    exportToGitHubEnv(key, validated);
  }

  console.log(`[protected-env] PASS — loaded ${REQUIRED_KEYS.length} required values without printing secrets.`);
} catch (error) {
  console.error(`[protected-env] FAIL: ${error.message}`);
  process.exit(1);
}
