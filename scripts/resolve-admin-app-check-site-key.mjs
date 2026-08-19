#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { applicationDefault } from 'firebase-admin/app';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_PROJECT_NUMBER = '123413252227';
const EXPECTED_ADMIN_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const EXPECTED_CONFIG_NAME =
  `projects/${EXPECTED_PROJECT_NUMBER}/apps/${EXPECTED_ADMIN_APP_ID}/recaptchaEnterpriseConfig`;
const CONFIG_URL = `https://firebaseappcheck.googleapis.com/v1/${EXPECTED_CONFIG_NAME}`;
const SITE_KEY_RE = /^[A-Za-z0-9_-]{30,100}$/;
const PLACEHOLDER_RE = /(?:REPLACE|undefined|null|VALIDATION_ONLY)/i;
const PROTECTED_WORKFLOW_JOBS = Object.freeze([
  Object.freeze({ workflow: 'Firebase Production Deploy', job: 'deploy-firebase-production-stack' }),
  Object.freeze({ workflow: 'Live Role Smoke Tests', job: 'live-evidence' }),
  Object.freeze({ workflow: 'Admin Production Evidence', job: 'admin-operational-evidence' }),
]);

const clean = (value) => String(value || '').trim();

function isApprovedProtectedContext(env) {
  const workflow = clean(env.GITHUB_WORKFLOW);
  const job = clean(env.GITHUB_JOB);
  return PROTECTED_WORKFLOW_JOBS.some((entry) => entry.workflow === workflow && entry.job === job);
}

export function assertProtectedProductionContext(env = process.env) {
  const failures = [];
  if (clean(env.GITHUB_ACTIONS) !== 'true') failures.push('GITHUB_ACTIONS=true');
  if (!isApprovedProtectedContext(env)) {
    failures.push('an approved protected workflow/job pair');
  }
  if (clean(env.DEPLOYMENT_ENVIRONMENT) !== 'production') {
    failures.push('DEPLOYMENT_ENVIRONMENT=production');
  }
  if (clean(env.GITHUB_REF) !== 'refs/heads/main') failures.push('refs/heads/main');
  if (!/^[0-9a-f]{40}$/.test(clean(env.GITHUB_SHA))) failures.push('an exact lowercase commit SHA');
  if (clean(env.GCP_PROJECT_ID) !== EXPECTED_PROJECT_ID) {
    failures.push(`GCP_PROJECT_ID=${EXPECTED_PROJECT_ID}`);
  }
  if (!clean(env.GITHUB_ENV)) failures.push('GITHUB_ENV');

  if (failures.length) {
    throw new Error(
      `[admin-app-check-config] protected production context required: ${failures.join(', ')}`,
    );
  }
}

export function validateEnterpriseSiteKey(siteKey, publicSiteKey = '') {
  const normalized = clean(siteKey);
  if (!SITE_KEY_RE.test(normalized) || PLACEHOLDER_RE.test(normalized)) {
    throw new Error('[admin-app-check-config] Firebase returned a missing or malformed Enterprise site key');
  }
  if (normalized === clean(publicSiteKey)) {
    throw new Error('[admin-app-check-config] Admin Enterprise and public App Check site keys must remain isolated');
  }
  return normalized;
}

export function extractEnterpriseSiteKey(responseData, publicSiteKey = '') {
  if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
    throw new Error('[admin-app-check-config] Firebase returned a malformed Enterprise config');
  }
  if (clean(responseData.name) !== EXPECTED_CONFIG_NAME) {
    throw new Error('[admin-app-check-config] Firebase returned an Enterprise config for the wrong app');
  }
  return validateEnterpriseSiteKey(responseData.siteKey, publicSiteKey);
}

function exportSiteKey(githubEnvironmentPath, siteKey) {
  appendFileSync(
    githubEnvironmentPath,
    `FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY=${siteKey}\nREACT_APP_APP_CHECK_SITE_KEY=${siteKey}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
}

export async function resolveAdminAppCheckSiteKey({
  env = process.env,
  requestConfig,
} = {}) {
  assertProtectedProductionContext(env);

  const configuredSiteKey = clean(env.FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY);
  if (configuredSiteKey) {
    const siteKey = validateEnterpriseSiteKey(configuredSiteKey, env.VITE_APP_CHECK_SITE_KEY);
    exportSiteKey(clean(env.GITHUB_ENV), siteKey);
    console.log('[admin-app-check-config] protected Enterprise site key validated for the canonical Admin app');
    return { source: 'protected-environment' };
  }

  const fetchConfig = requestConfig || (async () => {
    const credential = applicationDefault();
    const token = await credential.getAccessToken();
    const response = await fetch(CONFIG_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!response.ok) {
      throw new Error(
        `[admin-app-check-config] Firebase App Check config lookup failed with HTTP ${response.status}`,
      );
    }
    return response.json();
  });

  const responseData = await fetchConfig({
    configName: EXPECTED_CONFIG_NAME,
    url: CONFIG_URL,
  });
  const siteKey = extractEnterpriseSiteKey(responseData, env.VITE_APP_CHECK_SITE_KEY);
  exportSiteKey(clean(env.GITHUB_ENV), siteKey);
  console.log('[admin-app-check-config] canonical Firebase Enterprise config resolved for the Admin app');
  return { source: 'firebase-app-check-api' };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    await resolveAdminAppCheckSiteKey();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
