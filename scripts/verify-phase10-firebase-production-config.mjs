#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const projectId = String(process.env.VITE_FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || 'bin-group-57c60').trim();
const bundleId = 'ae.bingroups.superapp';

function fail(message) {
  console.error('[phase10-firebase-config] FAIL:', message);
  process.exit(1);
}
function gcloud(args) {
  try {
    return execFileSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    fail(String(error?.stderr || error?.message || 'gcloud failed'));
  }
}
async function getJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      'X-Goog-User-Project': projectId,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + body);
  return JSON.parse(body);
}

const token = gcloud(['auth', 'print-access-token']);
const projectNumber = gcloud(['projects', 'describe', projectId, '--format=value(projectNumber)']);
if (!token || !projectNumber) fail('Unable to resolve Google Cloud auth/project number.');

let authConfig;
try {
  authConfig = await getJson(
    'https://identitytoolkit.googleapis.com/admin/v2/projects/' + projectId + '/config',
    token,
  );
} catch (error) {
  fail('Unable to read Firebase Auth project config: ' + (error instanceof Error ? error.message : error));
}

if (authConfig?.signIn?.email?.enabled !== true || authConfig?.signIn?.email?.passwordRequired !== true) {
  fail('Email/password Authentication must be enabled and password-required.');
}
if (authConfig?.signIn?.anonymous?.enabled === true) fail('Anonymous Authentication must remain disabled.');
if (!['ENABLED', 'MANDATORY'].includes(String(authConfig?.mfa?.state || ''))) {
  fail('Project MFA must be ENABLED or MANDATORY.');
}
const phoneEnabled = Array.isArray(authConfig?.mfa?.enabledProviders)
  && authConfig.mfa.enabledProviders.includes('PHONE_SMS');
if (!phoneEnabled) fail('Phone SMS MFA provider is not enabled.');
const totp = (authConfig?.mfa?.providerConfigs || []).find((entry) => entry?.totpProviderConfig);
if (!totp || !['ENABLED', 'MANDATORY'].includes(String(totp?.state || ''))) {
  fail('TOTP MFA provider is not enabled.');
}

const requiredDomains = [
  'bin-groups.com',
  'www.bin-groups.com',
  'bin-group-57c60.web.app',
  'bin-group-admin-panel.web.app',
  'bin-group-57c60.firebaseapp.com',
];
const domains = new Set(authConfig?.authorizedDomains || []);
for (const domain of requiredDomains) {
  if (!domains.has(domain)) fail('Firebase Auth authorized domain missing: ' + domain);
}

for (const providerId of ['google.com', 'apple.com']) {
  let provider;
  try {
    provider = await getJson(
      'https://identitytoolkit.googleapis.com/admin/v2/projects/' + projectId + '/defaultSupportedIdpConfigs/' + providerId,
      token,
    );
  } catch (error) {
    fail(providerId + ' Authentication provider is unavailable: ' + (error instanceof Error ? error.message : error));
  }
  if (provider?.enabled !== true) fail(providerId + ' Authentication provider is disabled.');
  if (providerId === 'apple.com') {
    const bundleIds = provider?.appleSignInConfig?.bundleIds || [];
    if (!bundleIds.includes(bundleId)) fail('Apple Sign-In does not authorize bundle ID ' + bundleId + '.');
  }
}

let iosApps;
try {
  iosApps = await getJson(
    'https://firebase.googleapis.com/v1beta1/projects/' + projectId + '/iosApps?pageSize=100',
    token,
  );
} catch (error) {
  fail('Unable to list Firebase iOS apps: ' + (error instanceof Error ? error.message : error));
}
const matches = (iosApps.apps || []).filter((app) =>
  app?.bundleId === bundleId && String(app?.state || 'ACTIVE') === 'ACTIVE'
);
if (matches.length !== 1) fail('Expected exactly one active Firebase iOS app for ' + bundleId + '.');
const iosApp = matches[0];
if (!iosApp?.appId || !iosApp?.teamId) fail('Firebase iOS app must include appId and Apple Team ID.');

try {
  const appAttest = await getJson(
    'https://firebaseappcheck.googleapis.com/v1/projects/' + projectNumber + '/apps/' +
      encodeURIComponent(iosApp.appId) + '/appAttestConfig',
    token,
  );
  if (!String(appAttest?.name || '').endsWith('/appAttestConfig')) {
    fail('Firebase iOS App Attest configuration is invalid.');
  }
} catch (error) {
  fail('Firebase iOS App Attest is not configured: ' + (error instanceof Error ? error.message : error));
}

console.log('[phase10-firebase-config] PASS');
console.log('[phase10-firebase-config] auth=email-password,google,apple');
console.log('[phase10-firebase-config] mfa=phone,totp');
console.log('[phase10-firebase-config] iosApp=' + iosApp.appId);
console.log('[phase10-firebase-config] iosAppCheck=app-attest');
