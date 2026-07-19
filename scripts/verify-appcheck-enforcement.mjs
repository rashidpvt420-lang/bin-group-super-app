#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'bin-group-57c60';
const DEFAULT_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const DEFAULT_API_KEY = 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s';
const text = (value) => String(value ?? '').trim();
const fail = (message) => {
  console.error(`[appcheck-enforcement] FAIL — ${message}`);
  process.exit(1);
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const commitSha = text(process.env.GITHUB_SHA);
const workflowRunId = text(process.env.GITHUB_RUN_ID);
const appId = text(process.env.VITE_FIREBASE_APP_ID || DEFAULT_APP_ID);
const apiKey = text(process.env.VITE_FIREBASE_API_KEY || DEFAULT_API_KEY);
const debugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
const email = text(process.env.E2E_TENANT_EMAIL).toLowerCase();
const password = text(process.env.E2E_TENANT_PASSWORD);

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') {
  fail('App Check enforcement proof may only run in the protected main workflow');
}
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(workflowRunId)) {
  fail('exact commit SHA and numeric workflow run ID are required');
}
if (!debugToken || debugToken === 'true' || debugToken === 'false') fail('a registered App Check debug UUID is required');
if (!email || !password) fail('E2E_TENANT_EMAIL and E2E_TENANT_PASSWORD are required');

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let payload = null;
  try { payload = bodyText ? JSON.parse(bodyText) : null; }
  catch { payload = { raw: bodyText.slice(0, 500) }; }
  return { response, payload };
}

const signIn = await jsonRequest(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
);
if (!signIn.response.ok || !text(signIn.payload?.idToken) || !text(signIn.payload?.localId)) {
  fail(`Firebase Auth sign-in failed with HTTP ${signIn.response.status}`);
}
const idToken = text(signIn.payload.idToken);
const uid = text(signIn.payload.localId);

const exchange = await jsonRequest(
  `https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(appId)}:exchangeDebugToken?key=${encodeURIComponent(apiKey)}`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Referer: 'https://bin-group-57c60.web.app/',
    },
    body: JSON.stringify({ debugToken }),
  },
);
if (!exchange.response.ok || !text(exchange.payload?.token)) {
  fail(`registered App Check debug token exchange failed with HTTP ${exchange.response.status}`);
}
const appCheckToken = text(exchange.payload.token);
const documentUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;

const invalidProbe = await jsonRequest(documentUrl, {
  headers: {
    Authorization: `Bearer ${idToken}`,
    'X-Firebase-AppCheck': `invalid-${crypto.randomUUID()}`,
  },
});
const invalidTokenStatus = invalidProbe.response.status;
const invalidTokenRejected = invalidTokenStatus === 401 || invalidTokenStatus === 403;
if (!invalidTokenRejected) {
  fail(`Cloud Firestore accepted an invalid App Check token with HTTP ${invalidTokenStatus}`);
}

const validProbe = await jsonRequest(documentUrl, {
  headers: {
    Authorization: `Bearer ${idToken}`,
    'X-Firebase-AppCheck': appCheckToken,
  },
});
const validTokenStatus = validProbe.response.status;
const validTokenAccepted = validTokenStatus === 200 || validTokenStatus === 404;
if (!validTokenAccepted) {
  fail(`Cloud Firestore rejected a valid App Check token with HTTP ${validTokenStatus}`);
}

const observedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  status: 'passed',
  source: 'firebase-appcheck-enforcement-verifier',
  commitSha,
  projectId: PROJECT_ID,
  appId,
  workflowRunId,
  service: 'cloud-firestore',
  invalidTokenStatus,
  invalidTokenRejected,
  validTokenStatus,
  validTokenAccepted,
  authenticatedUidHash: sha256(uid),
  observedAt,
  hardLaunchClaim: false,
};
const outputPath = path.resolve('launch_package/appcheck-enforcement-proof.json');
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[appcheck-enforcement] PASS invalid=${invalidTokenStatus} valid=${validTokenStatus}`);
console.log(`[appcheck-enforcement] wrote ${outputPath}`);
