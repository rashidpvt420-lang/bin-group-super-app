#!/usr/bin/env node

import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = String(process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || 'bin-group-57c60').trim();
const API_KEY = String(process.env.VITE_FIREBASE_API_KEY || '').trim();
const DEBUG_TOKEN = String(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim();
const MAIN_APP_ID = String(process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_WEB_APP_ID || '').trim();
const ADMIN_APP_ID = String(
  process.env.REACT_APP_ADMIN_FIREBASE_APP_ID
  || process.env.REACT_APP_FIREBASE_APP_ID
  || process.env.ADMIN_FIREBASE_APP_ID
  || '1:123413252227:web:285cb53bc26626d699f3b6',
).trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projectNumberOf = (appId) => String(appId).match(/^1:(\d+):/)?.[1] || '';
const PROJECT_NUMBER = projectNumberOf(MAIN_APP_ID) || projectNumberOf(ADMIN_APP_ID);

const fail = (message) => {
  console.error(`[appcheck-protected-sync] FAIL ${message}`);
  process.exit(1);
};
const mask = (value) => value && value.length >= 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : '(invalid)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (process.env.GITHUB_ACTIONS !== 'true'
  || process.env.GITHUB_REF !== 'refs/heads/main'
  || process.env.GITHUB_WORKFLOW !== 'Firebase Production Deploy'
  || String(process.env.DEPLOYMENT_ENVIRONMENT || '').toLowerCase() !== 'production') {
  fail('refusing to synchronize debug tokens outside the protected production deployment workflow');
}
if (PROJECT_ID !== 'bin-group-57c60') fail(`unexpected Firebase project ${PROJECT_ID}`);
if (!API_KEY) fail('missing VITE_FIREBASE_API_KEY');
if (!UUID_RE.test(DEBUG_TOKEN)) fail('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN must be the stable registered UUID');
if (!MAIN_APP_ID) fail('missing VITE_FIREBASE_APP_ID for the main web app');
if (!ADMIN_APP_ID) fail('missing Admin Firebase web app ID');
if (!PROJECT_NUMBER) fail('unable to derive Firebase project number from the web app IDs');
if ([MAIN_APP_ID, ADMIN_APP_ID].some((appId) => projectNumberOf(appId) !== PROJECT_NUMBER)) {
  fail('main and Admin Firebase app IDs are not bound to the same project number');
}

async function exchange(appId) {
  // exchangeDebugToken accepts a Firebase project ID in place of the project
  // number. Keep this aligned with the existing production verifier.
  const url = `https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}`
    + `/apps/${encodeURIComponent(appId)}:exchangeDebugToken?key=${encodeURIComponent(API_KEY)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Referer: appId === ADMIN_APP_ID
        ? 'https://bin-group-admin-panel.web.app/'
        : 'https://bin-group-57c60.web.app/',
    },
    body: JSON.stringify({ debugToken: DEBUG_TOKEN }),
  });
  const body = await response.text();
  let payload = null;
  try { payload = body ? JSON.parse(body) : null; } catch { payload = null; }
  return { ok: response.ok && Boolean(payload?.token), status: response.status };
}

let authClient = null;
async function register(appId, label) {
  if (!authClient) {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    authClient = await auth.getClient();
  }
  // CreateDebugToken's documented parent uses the project number. v1beta is
  // the management API surface for creating the per-app token resource.
  const parent = `projects/${PROJECT_NUMBER}/apps/${encodeURIComponent(appId)}`;
  try {
    await authClient.request({
      url: `https://firebaseappcheck.googleapis.com/v1beta/${parent}/debugTokens`,
      method: 'POST',
      data: {
        displayName: `Playwright E2E Stable ${label}`,
        token: DEBUG_TOKEN,
      },
    });
    console.log(`[appcheck-protected-sync] registered stable token for ${label} app=${mask(appId)}`);
  } catch (error) {
    const status = Number(error?.response?.status || error?.code || 0);
    // A concurrent deployment or an already-created token can surface as a
    // conflict. Re-check exchangeability before treating it as a failure.
    if (status === 409) {
      console.log(`[appcheck-protected-sync] ${label} registration already exists; verifying exchange`);
      return;
    }
    if (status === 429 || status === 400) {
      fail(`${label} debug-token registration was rejected (HTTP ${status}). If the app has reached Firebase's debug-token limit, remove obsolete tokens manually; this workflow will never delete unrelated security tokens.`);
    }
    fail(`${label} debug-token registration failed HTTP ${status || 'unknown'}`);
  }
}

async function ensure(appId, label) {
  let result = await exchange(appId);
  if (result.ok) {
    console.log(`[appcheck-protected-sync] ${label} token already exchangeable app=${mask(appId)} token=${mask(DEBUG_TOKEN)}`);
    return;
  }
  if (result.status !== 403) {
    fail(`${label} App Check exchange failed HTTP ${result.status}; refusing to mutate registration for a non-registration error`);
  }

  console.log(`[appcheck-protected-sync] ${label} token is not exchangeable; creating the same stable UUID for this Firebase app`);
  await register(appId, label);

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await sleep(attempt === 1 ? 1_000 : 2_500);
    result = await exchange(appId);
    if (result.ok) {
      console.log(`[appcheck-protected-sync] ${label} token exchange verified after synchronization`);
      return;
    }
  }
  fail(`${label} App Check token still cannot be exchanged after registration synchronization`);
}

const apps = new Map();
apps.set(MAIN_APP_ID, 'main');
if (!apps.has(ADMIN_APP_ID)) apps.set(ADMIN_APP_ID, 'admin');

for (const [appId, label] of apps.entries()) {
  await ensure(appId, label);
}

console.log(`[appcheck-protected-sync] PASS verified ${apps.size} Firebase web app registration(s) without rotating the E2E UUID`);
