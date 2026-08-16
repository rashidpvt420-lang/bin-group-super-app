#!/usr/bin/env node

// Trigger marker: revalidate staging after Enterprise App Check registration.
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';

const text = (value) => String(value ?? '').trim();
const stagingProjectId = text(process.env.STAGING_PROJECT_ID);
const productionProjectId = text(process.env.PRODUCTION_PROJECT_ID);
const webAppIdFile = text(process.env.STAGING_WEB_APP_ID_FILE);
const sitesFile = text(process.env.STAGING_HOSTING_SITES_FILE);
const enterpriseOverride = text(process.env.STAGING_ENTERPRISE_APP_CHECK_SITE_KEY_OVERRIDE);
const githubEnv = text(process.env.GITHUB_ENV);

if (!stagingProjectId) throw new Error('STAGING_PROJECT_ID is required.');
if (!productionProjectId) throw new Error('PRODUCTION_PROJECT_ID is required.');
if (stagingProjectId === productionProjectId || stagingProjectId === 'bin-group-57c60') {
  throw new Error('Refusing to resolve staging App Check configuration against production.');
}
if (!webAppIdFile || !sitesFile) throw new Error('Staging Web App ID and Hosting sites files are required.');
if (!githubEnv) throw new Error('GITHUB_ENV is required in the staging deployment workflow.');

const webAppId = text(readFileSync(webAppIdFile, 'utf8'));
if (!webAppId) throw new Error('Staging Firebase Web App ID is empty.');

const sitesPayload = JSON.parse(readFileSync(sitesFile, 'utf8'));
const rawSites = sitesPayload?.result?.sites || sitesPayload?.result || sitesPayload?.sites || [];
const siteRows = Array.isArray(rawSites) ? rawSites : [];
const siteIds = siteRows
  .map((site) => text(site?.site || site?.siteId || text(site?.name).split('/').pop()))
  .filter(Boolean)
  .filter((siteId) => siteId !== productionProjectId && siteId !== 'bin-group-admin-panel');

if (siteIds.length === 0) throw new Error('No non-production Firebase Hosting site exists in staging.');

const preferredSiteOrder = [
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

// The staging deploy identity intentionally does not need Service Usage Admin.
// Query the App Check resource itself and use one Enterprise registration for
// both staging frontends. Production remains on its existing provider defaults.
const accessToken = run('gcloud', ['auth', 'print-access-token']);
if (!accessToken) throw new Error('Unable to obtain a Google Cloud access token for staging App Check inspection.');

const appIdPath = encodeURIComponent(webAppId);
const appCheckBase = `https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/apps/${appIdPath}`;

async function getJson(url, { allowNotFound = false } = {}) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    const disabled = response.status === 403 && /has not been used|disabled/i.test(body);
    if (disabled) {
      throw new Error(
        `Firebase App Check API is not yet available to the staging deployment identity for ${stagingProjectId}. ` +
        `Confirm firebaseappcheck.googleapis.com is enabled on staging, wait for Google Cloud propagation, and retry.`,
      );
    }
    throw new Error(`App Check API request failed (${response.status}): ${body.slice(0, 300)}`);
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
  const enterpriseConfig = await getJson(`${appCheckBase}/recaptchaEnterpriseConfig`, { allowNotFound: true });
  enterpriseSiteKey = text(enterpriseConfig?.siteKey);
  enterpriseSource = 'Firebase App Check API';
}

if (!plausibleSiteKey(enterpriseSiteKey)) {
  throw new Error(
    `Staging Web App ${webAppId} has no usable reCAPTCHA Enterprise App Check site key. ` +
    `Register this staging Web App with reCAPTCHA Enterprise in Firebase App Check and retry.`,
  );
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
console.log('[staging-appcheck] One Enterprise registration will protect both staging frontends.');
