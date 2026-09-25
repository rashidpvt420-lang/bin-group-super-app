#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const text = (value) => String(value ?? '').trim();
const projectId = text(process.env.GCP_PROJECT_ID || 'bin-group-57c60');
const keyString = text(process.env.VITE_GOOGLE_MAPS_API_KEY);

const REQUIRED_API_TARGETS = new Set([
  'maps-backend.googleapis.com',
  'places-backend.googleapis.com',
  'geocoding-backend.googleapis.com',
  'static-maps-backend.googleapis.com',
]);

const REQUIRED_REFERRER_GROUPS = [
  ['bin-groups.com/*'],
  ['www.bin-groups.com/*'],
  ['bin-group-57c60.web.app/*'],
  ['bin-group-admin-panel.web.app/*'],
  ['localhost/*'],
];

function fail(message) {
  console.error('[maps-key-restrictions] FAIL:', message);
  process.exit(1);
}

function gcloud(args) {
  try {
    return execFileSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const detail = text(error?.stderr || error?.message);
    fail(`gcloud command failed: ${detail || args.join(' ')}`);
  }
}

async function getJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.text();
  if (!response.ok) {
    let message = body;
    try {
      message = JSON.parse(body)?.error?.message || body;
    } catch {}
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
  return JSON.parse(body);
}

function normalizeReferrer(value) {
  return text(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function referrerCovered(allowed, required) {
  const wanted = normalizeReferrer(required);
  return allowed.some((entry) => {
    const normalized = normalizeReferrer(entry);
    if (normalized === wanted) return true;
    if (wanted === 'www.bin-groups.com/*' && normalized === '*.bin-groups.com/*') return true;
    return false;
  });
}

async function main() {
  if (!keyString || /^replace/i.test(keyString)) {
    fail('VITE_GOOGLE_MAPS_API_KEY is missing or placeholder.');
  }

  const accessToken = gcloud(['auth', 'print-access-token']);
  const projectNumber = gcloud(['projects', 'describe', projectId, '--format=value(projectNumber)']);
  if (!accessToken || !projectNumber) fail('Google Cloud authentication/project resolution failed.');

  let lookup;
  let key;
  try {
    lookup = await getJson(
      `https://apikeys.googleapis.com/v2/keys:lookupKey?keyString=${encodeURIComponent(keyString)}`,
      accessToken,
    );
    if (!lookup?.name) fail('API key lookup returned no key resource name.');
    key = await getJson(`https://apikeys.googleapis.com/v2/${lookup.name}`, accessToken);
  } catch (error) {
    fail(
      `Unable to read API key restrictions. Ensure API Keys API is enabled and the deployment service account has apikeys.keys.lookup/get. ${error instanceof Error ? error.message : error}`,
    );
  }

  const expectedParent = `projects/${projectNumber}/locations/global`;
  if (lookup.parent !== expectedParent) {
    fail(`Maps API key belongs to ${lookup.parent || 'unknown project'}, expected ${expectedParent}.`);
  }

  const restrictions = key?.restrictions || {};
  if (
    restrictions.androidKeyRestrictions ||
    restrictions.iosKeyRestrictions ||
    restrictions.serverKeyRestrictions
  ) {
    fail('Production Maps JavaScript key must use Website/browser restrictions, not Android, iOS, or server restrictions.');
  }

  const allowedReferrers = restrictions.browserKeyRestrictions?.allowedReferrers;
  if (!Array.isArray(allowedReferrers) || allowedReferrers.length === 0) {
    fail('Browser HTTP-referrer restrictions are missing.');
  }
  const normalizedReferrers = allowedReferrers.map(normalizeReferrer);
  if (normalizedReferrers.some((value) => value === '*' || value === '*/*' || value === 'http://*/*')) {
    fail('An unrestricted/wildcard Maps referrer is present.');
  }
  for (const alternatives of REQUIRED_REFERRER_GROUPS) {
    if (!alternatives.some((required) => referrerCovered(allowedReferrers, required))) {
      fail(`Required Maps referrer is not covered: ${alternatives.join(' OR ')}.`);
    }
  }

  const apiTargets = Array.isArray(restrictions.apiTargets) ? restrictions.apiTargets : [];
  const services = new Set(apiTargets.map((target) => text(target?.service)).filter(Boolean));
  if (services.size === 0) fail('API restrictions are missing; the Maps key can call unrestricted Google APIs.');
  for (const required of REQUIRED_API_TARGETS) {
    if (!services.has(required)) fail(`Required Maps API target is missing: ${required}.`);
  }
  for (const service of services) {
    if (!REQUIRED_API_TARGETS.has(service)) {
      fail(`Unexpected API target ${service}; use a separate key rather than widening the production Maps browser key.`);
    }
  }

  const enabledServices = new Set(
    gcloud(['services', 'list', '--enabled', '--project', projectId, '--format=value(config.name)'])
      .split(/\r?\n/)
      .map(text)
      .filter(Boolean),
  );
  for (const required of REQUIRED_API_TARGETS) {
    if (!enabledServices.has(required)) fail(`Required Google Maps service is not enabled in ${projectId}: ${required}.`);
  }

  console.log('[maps-key-restrictions] PASS');
  console.log('[maps-key-restrictions] project=' + projectId);
  console.log('[maps-key-restrictions] clientRestriction=browser');
  console.log('[maps-key-restrictions] requiredReferrerGroups=' + REQUIRED_REFERRER_GROUPS.length);
  console.log('[maps-key-restrictions] apiTargets=' + [...services].sort().join(','));
  console.log('[maps-key-restrictions] nativeMapsSdk=not-used-by-this-key');
}

await main();
