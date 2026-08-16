#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';

const text = (value) => String(value ?? '').trim();
const stagingProjectId = text(process.env.STAGING_PROJECT_ID);
const productionProjectId = text(process.env.PRODUCTION_PROJECT_ID);
const webAppIdFile = text(process.env.STAGING_WEB_APP_ID_FILE);
const sitesFile = text(process.env.STAGING_HOSTING_SITES_FILE);
const v3Override = text(process.env.STAGING_V3_APP_CHECK_SITE_KEY_OVERRIDE);
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

// Do not infer API state from Service Usage permissions. The staging deploy
// identity intentionally does not need serviceusage.services.get/enable. Query
// Firebase App Check directly instead; if the API is disabled, the App Check
// endpoint itself returns an authoritative error without broadening IAM.
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

async function extractKeysFromHostedSite(siteId) {
  const base = `https://${siteId}.web.app/`;
  let html;
  try {
    const response = await fetch(base, { redirect: 'follow' });
    if (!response.ok) return [];
    html = await response.text();
  } catch {
    return [];
  }

  const assetMatches = [...html.matchAll(/(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)]
    .map((match) => match[1])
    .slice(0, 12);
  const keys = new Set();

  for (const assetPath of assetMatches) {
    try {
      const assetUrl = new URL(assetPath, base).toString();
      const response = await fetch(assetUrl, { redirect: 'follow' });
      if (!response.ok) continue;
      const js = await response.text();
      for (const match of js.matchAll(/6L[A-Za-z0-9_-]{30,}/g)) {
        if (plausibleSiteKey(match[0])) keys.add(match[0]);
      }
    } catch {
      // Continue scanning other staging assets. A single stale/broken asset is not authoritative.
    }
  }

  return [...keys];
}

let enterpriseSiteKey = enterpriseOverride;
if (!enterpriseSiteKey) {
  const enterpriseConfig = await getJson(`${appCheckBase}/recaptchaEnterpriseConfig`, { allowNotFound: true });
  enterpriseSiteKey = text(enterpriseConfig?.siteKey);
}
if (!plausibleSiteKey(enterpriseSiteKey)) {
  throw new Error('Staging Web App has no usable reCAPTCHA Enterprise App Check site key.');
}

const v3Config = await getJson(`${appCheckBase}/recaptchaV3Config`, { allowNotFound: true });
if (!v3Override && v3Config?.siteSecretSet !== true) {
  throw new Error('Staging Web App does not have an active reCAPTCHA v3 App Check secret configuration.');
}

let v3SiteKey = v3Override;
let v3Source = v3SiteKey ? 'explicit staging override' : '';
if (!v3SiteKey) {
  const nonAdminSites = siteIds.filter((siteId) => !siteId.toLowerCase().includes('admin'));
  const scanOrder = [
    ...preferredSiteOrder.filter((siteId) => nonAdminSites.includes(siteId)),
    ...nonAdminSites.filter((siteId) => !preferredSiteOrder.includes(siteId)),
  ];

  for (const siteId of scanOrder) {
    const keys = await extractKeysFromHostedSite(siteId);
    if (keys.length === 1) {
      v3SiteKey = keys[0];
      v3Source = `existing staging bundle ${siteId}`;
      break;
    }
    if (keys.length > 1) {
      throw new Error(`Ambiguous App Check site keys found in existing staging bundle ${siteId}; refusing to guess.`);
    }
  }
}

if (!plausibleSiteKey(v3SiteKey)) {
  throw new Error('Could not safely recover the staging reCAPTCHA v3 site key from a staging-only source.');
}

if (process.env.GITHUB_ACTIONS === 'true') {
  console.log(`::add-mask::${v3SiteKey}`);
  console.log(`::add-mask::${enterpriseSiteKey}`);
}

appendFileSync(githubEnv, [
  `STAGING_HOSTING_SITE=${deploymentSite}`,
  `VITE_APP_CHECK_SITE_KEY=${v3SiteKey}`,
  `REACT_APP_APP_CHECK_SITE_KEY=${enterpriseSiteKey}`,
].join('\n') + '\n');

const fingerprint = (key) => `${key.slice(0, 6)}…${key.slice(-4)}`;
console.log(`[staging-appcheck] project=${stagingProjectId} app=${webAppId}`);
console.log(`[staging-appcheck] deploymentSite=${deploymentSite}`);
console.log(`[staging-appcheck] v3=${fingerprint(v3SiteKey)} source=${v3Source}`);
console.log(`[staging-appcheck] enterprise=${fingerprint(enterpriseSiteKey)} source=${enterpriseOverride ? 'explicit staging override' : 'Firebase App Check API'}`);
console.log('[staging-appcheck] App Check configuration resolved from staging-only authority.');
