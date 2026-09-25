#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const projectId = String(process.env.VITE_FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || 'bin-group-57c60').trim();
const bundleId = 'ae.bingroups.superapp';
const androidPackage = 'ae.bingroups.superapp';
const canonicalAdminWebAppId = '1:123413252227:web:285cb53bc26626d699f3b6';

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
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return JSON.parse(body);
}

async function getJsonIfPresent(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      'X-Goog-User-Project': projectId,
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

async function requireWebAppCheck(appId, label, token, projectNumber, enterpriseOnly = false) {
  const encoded = encodeURIComponent(appId);
  const enterprise = await getJsonIfPresent(
    'https://firebaseappcheck.googleapis.com/v1/projects/' + projectNumber + '/apps/' +
      encoded + '/recaptchaEnterpriseConfig',
    token,
  );
  if (enterprise && String(enterprise.siteKey || '').trim()) {
    return 'recaptcha-enterprise';
  }
  if (enterpriseOnly) fail(label + ' web app must use reCAPTCHA Enterprise App Check.');

  const v3 = await getJsonIfPresent(
    'https://firebaseappcheck.googleapis.com/v1/projects/' + projectNumber + '/apps/' +
      encoded + '/recaptchaV3Config',
    token,
  );
  if (v3?.siteSecretSet === true) return 'recaptcha-v3';
  fail(label + ' web app has no valid reCAPTCHA Enterprise/V3 App Check registration.');
}

async function requireAppCheckService(serviceId, token, projectNumber) {
  const service = await getJson(
    'https://firebaseappcheck.googleapis.com/v1/projects/' + projectNumber + '/services/' +
      encodeURIComponent(serviceId),
    token,
  );
  if (service?.enforcementMode !== 'ENFORCED') {
    fail('Firebase App Check enforcement is not ENFORCED for ' + serviceId + '.');
  }
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

let webApps;
try {
  webApps = await getJson(
    'https://firebase.googleapis.com/v1beta1/projects/' + projectId + '/webApps?pageSize=100',
    token,
  );
} catch (error) {
  fail('Unable to list Firebase Web apps: ' + (error instanceof Error ? error.message : error));
}
const activeWebApps = (webApps.apps || []).filter((app) => String(app?.state || 'ACTIVE') === 'ACTIVE');
if (!activeWebApps.length) fail('No active Firebase Web app is registered.');
const mainWebAppId = String(process.env.VITE_FIREBASE_APP_ID || '').trim();
const requiredMainWebApp = mainWebAppId
  ? activeWebApps.find((app) => app?.appId === mainWebAppId)
  : activeWebApps.find((app) => app?.appId === canonicalAdminWebAppId) || activeWebApps[0];
if (!requiredMainWebApp?.appId) fail('Configured production Firebase Web app is not active.');
const adminWebApp = activeWebApps.find((app) => app?.appId === canonicalAdminWebAppId);
if (!adminWebApp) fail('Canonical Admin Firebase Web app is not active.');
const mainWebProvider = await requireWebAppCheck(requiredMainWebApp.appId, 'Main', token, projectNumber);
const adminWebProvider = await requireWebAppCheck(adminWebApp.appId, 'Admin', token, projectNumber, true);

let androidApps;
try {
  androidApps = await getJson(
    'https://firebase.googleapis.com/v1beta1/projects/' + projectId + '/androidApps?pageSize=100',
    token,
  );
} catch (error) {
  fail('Unable to list Firebase Android apps: ' + (error instanceof Error ? error.message : error));
}
const androidMatches = (androidApps.apps || []).filter((app) =>
  app?.packageName === androidPackage && String(app?.state || 'ACTIVE') === 'ACTIVE'
);
if (androidMatches.length !== 1 || !androidMatches[0]?.appId) {
  fail('Expected exactly one active Firebase Android app for ' + androidPackage + '.');
}
const androidApp = androidMatches[0];
const playIntegrity = await getJson(
  'https://firebaseappcheck.googleapis.com/v1/projects/' + projectNumber + '/apps/' +
    encodeURIComponent(androidApp.appId) + '/playIntegrityConfig',
  token,
);
if (
  !String(playIntegrity?.name || '').endsWith('/playIntegrityConfig') ||
  playIntegrity?.appIntegrity?.allowUnrecognizedVersion === true ||
  playIntegrity?.accountDetails?.requireLicensed !== true
) {
  fail('Firebase Android Play Integrity App Check policy is not fail-closed for Play delivery.');
}

for (const serviceId of [
  'identitytoolkit.googleapis.com',
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
]) {
  await requireAppCheckService(serviceId, token, projectNumber);
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
console.log('[phase10-firebase-config] webMainAppCheck=' + mainWebProvider);
console.log('[phase10-firebase-config] webAdminAppCheck=' + adminWebProvider);
console.log('[phase10-firebase-config] androidApp=' + androidApp.appId);
console.log('[phase10-firebase-config] androidAppCheck=play-integrity');
console.log('[phase10-firebase-config] iosApp=' + iosApp.appId);
console.log('[phase10-firebase-config] iosAppCheck=app-attest');
console.log('[phase10-firebase-config] enforcement=auth,firestore,storage');
