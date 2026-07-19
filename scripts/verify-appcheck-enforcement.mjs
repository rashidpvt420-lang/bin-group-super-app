#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'bin-group-57c60';
const text = (value) => String(value ?? '').trim();
const fail = (message) => {
  console.error(`[appcheck-enforcement] FAIL — ${message}`);
  process.exit(1);
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const parseJsonResponse = async (response) => {
  const bodyText = await response.text();
  try { return bodyText ? JSON.parse(bodyText) : null; }
  catch { return { raw: bodyText.slice(0, 500) }; }
};

const commitSha = text(process.env.GITHUB_SHA);
const workflowRunId = text(process.env.GITHUB_RUN_ID);
const appId = text(process.env.VITE_FIREBASE_APP_ID);
const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
const debugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
const email = text(process.env.E2E_TENANT_EMAIL).toLowerCase();
const password = text(process.env.E2E_TENANT_PASSWORD);

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') {
  fail('App Check enforcement proof may only run in the protected main workflow');
}
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(workflowRunId)) {
  fail('exact commit SHA and numeric workflow run ID are required');
}
if (!appId || !apiKey) fail('protected Firebase app ID and API key bindings are required');
if (!debugToken || debugToken === 'true' || debugToken === 'false') fail('a registered App Check debug UUID is required');
if (!email || !password) fail('E2E_TENANT_EMAIL and E2E_TENANT_PASSWORD are required');

const signInEndpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword');
signInEndpoint.searchParams.set('key', apiKey);
const signInResponse = await fetch(signInEndpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    Referer: 'https://bin-group-57c60.web.app/',
  },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
});
const signInPayload = await parseJsonResponse(signInResponse);
if (!signInResponse.ok || !text(signInPayload?.idToken) || !text(signInPayload?.localId)) {
  fail(`Firebase Auth sign-in failed with HTTP ${signInResponse.status}`);
}
const idToken = text(signInPayload.idToken);
const uid = text(signInPayload.localId);

const exchangeEndpoint = new URL(
  `https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(appId)}:exchangeDebugToken`,
);
exchangeEndpoint.searchParams.set('key', apiKey);
const exchangeResponse = await fetch(exchangeEndpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    Referer: 'https://bin-group-57c60.web.app/',
  },
  body: JSON.stringify({ debugToken }),
});
const exchangePayload = await parseJsonResponse(exchangeResponse);
if (!exchangeResponse.ok || !text(exchangePayload?.token)) {
  fail(`registered App Check debug token exchange failed with HTTP ${exchangeResponse.status}`);
}
const appCheckToken = text(exchangePayload.token);
const documentUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;

const invalidResponse = await fetch(documentUrl, {
  headers: {
    Authorization: `Bearer ${idToken}`,
    'X-Firebase-AppCheck': `invalid-${crypto.randomUUID()}`,
  },
});
await parseJsonResponse(invalidResponse);
const invalidTokenStatus = invalidResponse.status;
const invalidTokenRejected = invalidTokenStatus === 401 || invalidTokenStatus === 403;
if (!invalidTokenRejected) {
  fail(`Cloud Firestore accepted an invalid App Check token with HTTP ${invalidTokenStatus}`);
}

const validResponse = await fetch(documentUrl, {
  headers: {
    Authorization: `Bearer ${idToken}`,
    'X-Firebase-AppCheck': appCheckToken,
  },
});
await parseJsonResponse(validResponse);
const validTokenStatus = validResponse.status;
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
