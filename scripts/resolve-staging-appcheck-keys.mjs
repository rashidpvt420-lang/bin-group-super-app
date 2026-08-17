#!/usr/bin/env node

// Trigger marker: deploy isolated Staff OS Functions runtime.
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';

const text = (value) => String(value ?? '').trim();
const stagingProjectId = text(process.env.STAGING_PROJECT_ID);
const productionProjectId = text(process.env.PRODUCTION_PROJECT_ID);
const webAppIdFile = text(process.env.STAGING_WEB_APP_ID_FILE);
const sitesFile = text(process.env.STAGING_HOSTING_SITES_FILE);
const enterpriseOverride = text(process.env.STAGING_ENTERPRISE_APP_CHECK_SITE_KEY_OVERRIDE);
const githubEnv = text(process.env.GITHUB_ENV);

const TRUSTED_ORIGIN = 'https://firebaseappcheck.googleapis.com';
const TRUSTED_HOSTNAME = 'firebaseappcheck.googleapis.com';
const canonicalStagingProjectId = 'bin-group-staging';
const canonicalStagingProjectNumber = '355288045402';
const canonicalStagingWebAppId = '1:355288045402:web:a4afd4661bf961068b4563';
// reCAPTCHA Enterprise site keys are public client identifiers. This key is
// domain-restricted to the isolated staging Hosting site and is never used by production.
const canonicalStagingEnterpriseSiteKey = '6LfQAIktAAAAAM7BIHq0oVbh8Y_TxpCLfCJ4CeFD';

if (!stagingProjectId) throw new Error('STAGING_PROJECT_ID is required.');
if (!productionProjectId) throw new Error('PRODUCTION_PROJECT_ID is required.');
if (stagingProjectId !== canonicalStagingProjectId) {
  throw new Error(`Refusing unknown staging project ${stagingProjectId}.`);
}
if (stagingProjectId === productionProjectId || stagingProjectId === 'bin-group-57c60') {
  throw new Error('Refusing to resolve staging App Check configuration against production.');
}
if (!webAppIdFile || !sitesFile) throw new Error('Staging Web App ID and Hosting sites files are required.');
if (!githubEnv) throw new Error('GITHUB_ENV is required in the staging deployment workflow.');

const webAppId = text(readFileSync(webAppIdFile, 'utf8'));
if (!webAppId) throw new Error('Staging Firebase Web App ID is empty.');
if (webAppId !== canonicalStagingWebAppId) {
  throw new Error(`Refusing unexpected staging Web App ${webAppId}.`);
}

const sitesPayload = JSON.parse(readFileSync(sitesFile, 'utf8'));
const rawSites = sitesPayload?.result?.sites || sitesPayload?.result || sitesPayload?.sites || [];
const siteRows = Array.isArray(rawSites) ? rawSites : [];
const siteIds = siteRows
  .map((site) => text(site?.site || site?.siteId || text(site?.name).split('/').pop()))
  .filter(Boolean)
  .filter((siteId) => siteId !== productionProjectId && siteId !== 'bin-group-admin-panel');

if (siteIds.length === 0) throw new Error('No non-production Firebase Hosting site exists in staging.');

const preferredSiteOrder = [
  'bin-group-staging',
  'home-os-owner-app',
  'home-os-owner-portal',
  'home-os-technician-portal',
  'home-os-tenant-portal',
  'home-os-admin-panel',
];
const deploymentSite = preferredSiteOrder.find((siteId) => siteIds.includes(siteId)) || siteIds[0];

function run(command, args) {
  return text(execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

const projectNumber = run('gcloud', ['projects', 'describe', stagingProjectId, '--format=value(projectNumber)']);
if (!/^\d+$/.test(projectNumber)) throw new Error('Unable to resolve the staging Google Cloud project number.');
if (projectNumber !== canonicalStagingProjectNumber) {
  throw new Error(`Unexpected staging project number ${projectNumber}.`);
}

// The staging deploy identity intentionally does not need Service Usage Admin.
// Firebase Admin includes the App Check get/update permissions needed here.
const accessToken = run('gcloud', ['auth', 'print-access-token']);
if (!accessToken) throw new Error('Unable to obtain a Google Cloud access token for staging App Check inspection.');

function validateTrustedEndpointUrl(targetUrl) {
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error(`Endpoint URL protocol must be https:, got ${parsed.protocol}`);
  }
  if (parsed.hostname !== TRUSTED_HOSTNAME) {
    throw new Error(`Endpoint URL hostname must be ${TRUSTED_HOSTNAME}, got ${parsed.hostname}`);
  }
}

async function getEnterpriseAppCheckConfig() {
  const targetUrl = `${TRUSTED_ORIGIN}/v1/projects/${canonicalStagingProjectNumber}/apps/${encodeURIComponent(canonicalStagingWebAppId)}/recaptchaEnterpriseConfig`;
  validateTrustedEndpointUrl(targetUrl);

  const response = await fetch(targetUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    const disabled = response.status === 403 && /has not been used|disabled/i.test(body);
    if (disabled) {
      throw new Error(
        `Firebase App Check API is not available for ${stagingProjectId}. ` +
        `Confirm firebaseappcheck.googleapis.com is enabled on staging and retry.`,
      );
    }
    throw new Error(`App Check API request failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json();
}

async function bindEnterpriseSiteKey(siteKey) {
  const targetUrl = `${TRUSTED_ORIGIN}/v1/projects/${canonicalStagingProjectNumber}/apps/${encodeURIComponent(canonicalStagingWebAppId)}/recaptchaEnterpriseConfig?updateMask=siteKey`;
  validateTrustedEndpointUrl(targetUrl);

  const name = `projects/${canonicalStagingProjectNumber}/apps/${canonicalStagingWebAppId}/recaptchaEnterpriseConfig`;
  const response = await fetch(targetUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, siteKey }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unable to bind staging Enterprise App Check site key (${response.status}): ${body.slice(0, 500)}`);
  }
  return response.json();
}

function plausibleSiteKey(value) {
  const key = text(value);
  return /^6L[A-Za-z0-9_-]{30,}$/.test(key) && !/(example|replace|dummy|placeholder|test[_-]?key)/i.test(key);
}

let enterpriseSiteKey = enterpriseOverride;
let enterpriseSource = enterpriseSiteKey ? 'explicit staging override' : '';
if (!enterpriseSiteKey) {
  let enterpriseConfig = await getEnterpriseAppCheckConfig();
  enterpriseSiteKey = text(enterpriseConfig?.siteKey);
  enterpriseSource = 'Firebase App Check API';

  if (!plausibleSiteKey(enterpriseSiteKey)) {
    if (!plausibleSiteKey(canonicalStagingEnterpriseSiteKey)) {
      throw new Error('Canonical staging Enterprise site key is malformed.');
    }
    enterpriseConfig = await bindEnterpriseSiteKey(canonicalStagingEnterpriseSiteKey);
    enterpriseSiteKey = text(enterpriseConfig?.siteKey);
    enterpriseSource = 'Firebase App Check API bootstrap';
  }
}

if (!plausibleSiteKey(enterpriseSiteKey)) {
  throw new Error(`Staging Web App ${webAppId} still has no usable reCAPTCHA Enterprise App Check site key.`);
}

// Fail closed if the staging registration resolves to a different key than the
// domain-restricted staging key we created. Never silently accept a production key.
if (!enterpriseOverride && enterpriseSiteKey !== canonicalStagingEnterpriseSiteKey) {
  throw new Error('Staging App Check resolved an unexpected Enterprise site key; refusing to deploy.');
}

if (process.env.GITHUB_ACTIONS === 'true') {
  console.log(`::add-mask::${enterpriseSiteKey}`);
}

appendFileSync(githubEnv, [
  `STAGING_HOSTING_SITE=${deploymentSite}`,
  `VITE_APP_CHECK_SITE_KEY=${enterpriseSiteKey}`,
  `REACT_APP_APP_CHECK_SITE_KEY=${enterpriseSiteKey}`,
].join('\n') + '\n');

const fingerprint = (key) => `${key.slice(0, 6)}…${key.slice(-4)}`;
console.log(`[staging-appcheck] project=${stagingProjectId} app=${webAppId}`);
console.log(`[staging-appcheck] deploymentSite=${deploymentSite}`);
console.log(`[staging-appcheck] enterprise=${fingerprint(enterpriseSiteKey)} source=${enterpriseSource}`);
console.log('[staging-appcheck] One Enterprise registration protects both staging frontends.');
