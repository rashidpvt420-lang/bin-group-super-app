#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_ADMIN_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const EXPECTED_ADMIN_HOST = 'bin-group-admin-panel.web.app';

const text = (value) => String(value ?? '').trim();
const fail = (message) => {
  console.error(`[admin-appcheck] FAIL — ${message}`);
  process.exit(1);
};
const safeError = (payload) => {
  const status = text(payload?.error?.status);
  const message = text(payload?.error?.message).replace(/[\r\n]+/g, ' ').slice(0, 240);
  return [status, message].filter(Boolean).join(': ') || 'unknown App Check exchange failure';
};

const projectId = text(process.env.GCP_PROJECT_ID) || EXPECTED_PROJECT_ID;
const appId = text(process.env.REACT_APP_ADMIN_FIREBASE_APP_ID || process.env.ADMIN_FIREBASE_APP_ID) || EXPECTED_ADMIN_APP_ID;
const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
const debugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
const adminBaseUrl = text(process.env.E2E_ADMIN_BASE_URL) || `https://${EXPECTED_ADMIN_HOST}`;
const commitSha = text(process.env.EXPECTED_COMMIT_SHA || process.env.GITHUB_SHA);
const gitHeadResult = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: false,
});
const checkedOutSha = text(gitHeadResult.stdout);

if (projectId !== EXPECTED_PROJECT_ID) fail(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}`);
if (appId !== EXPECTED_ADMIN_APP_ID) fail('Admin Firebase app ID does not match the canonical production web app');
if (!apiKey || !/^AIza[0-9A-Za-z_-]{30,}$/.test(apiKey)) fail('a protected Firebase web API key is required');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(debugToken)) {
  fail('a registered App Check debug UUID is required');
}
if (!/^[0-9a-f]{40}$/.test(commitSha)) fail('an exact 40-character commit SHA is required');
if ((gitHeadResult.status ?? 1) !== 0 || checkedOutSha !== commitSha) {
  fail(`checked-out SHA ${checkedOutSha || '(unresolved)'} must equal expected SHA ${commitSha}`);
}

let parsedAdminUrl;
try {
  parsedAdminUrl = new URL(adminBaseUrl);
} catch {
  fail('E2E_ADMIN_BASE_URL must be a valid URL');
}
if (parsedAdminUrl.protocol !== 'https:' || parsedAdminUrl.hostname !== EXPECTED_ADMIN_HOST) {
  fail(`E2E_ADMIN_BASE_URL must equal https://${EXPECTED_ADMIN_HOST}`);
}

const exchangeUrl = new URL(
  `https://content-firebaseappcheck.googleapis.com/v1/projects/${EXPECTED_PROJECT_ID}/apps/${encodeURIComponent(appId)}:exchangeDebugToken`,
);
exchangeUrl.searchParams.set('key', apiKey);

const response = await fetch(exchangeUrl, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    Referer: `${parsedAdminUrl.origin}/`,
  },
  body: JSON.stringify({ debugToken }),
});
const bodyText = await response.text();
let payload = null;
try {
  payload = bodyText ? JSON.parse(bodyText) : null;
} catch {
  payload = null;
}

if (!response.ok || !text(payload?.token)) {
  fail(`token exchange returned HTTP ${response.status}: ${safeError(payload)}`);
}

const evidence = {
  schemaVersion: 1,
  status: 'passed',
  source: 'admin-appcheck-debug-exchange-preflight',
  commitSha,
  checkedOutSha,
  projectId,
  appId,
  adminHost: parsedAdminUrl.hostname,
  httpStatus: response.status,
  tokenReturned: true,
  expireTime: text(payload?.expireTime) || null,
  observedAt: new Date().toISOString(),
  hardLaunchClaim: false,
};
const outputPath = path.resolve('launch_package/admin-appcheck-preflight.json');
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(`[admin-appcheck] PASS — exact Admin app token exchange returned HTTP ${response.status}`);
console.log(`[admin-appcheck] commit_sha=${commitSha}`);
console.log(`[admin-appcheck] evidence=${outputPath}`);
