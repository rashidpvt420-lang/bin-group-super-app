#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'bin-group-57c60';
const CONFIG_NAME = `projects/${PROJECT_ID}/config`;
const CONFIG_URL = `https://identitytoolkit.googleapis.com/admin/v2/${CONFIG_NAME}`;
const PUBLIC_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1';
const OUTPUT_PATH = path.resolve('launch_package/artifacts/owner-auth-recovery.json');
const args = new Set(process.argv.slice(2));
const repairRequested = args.has('--repair');
const probeRequested = args.has('--probe');
const text = (value) => String(value ?? '').trim();
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function fail(message) {
  throw new Error(`[owner-auth-recovery] ${message}`);
}

async function parseJson(response) {
  const bodyText = await response.text();
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    return { raw: bodyText.slice(0, 300) };
  }
}

async function authorizedRequest(url, options = {}) {
  const accessToken = text(process.env.GOOGLE_OAUTH_ACCESS_TOKEN);
  if (!accessToken) fail('GOOGLE_OAUTH_ACCESS_TOKEN is required.');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    const message = text(payload?.error?.message || payload?.raw || `HTTP ${response.status}`);
    fail(`Identity Platform Admin API failed with HTTP ${response.status}: ${message.slice(0, 240)}`);
  }
  return payload;
}

async function readBlockingTriggers() {
  const config = await authorizedRequest(CONFIG_URL);
  const triggers = config?.blockingFunctions?.triggers;
  if (!triggers || typeof triggers !== 'object' || Array.isArray(triggers)) return {};
  return triggers;
}

async function clearBlockingTriggers() {
  const updateUrl = new URL(CONFIG_URL);
  updateUrl.searchParams.set('updateMask', 'blockingFunctions.triggers');
  await authorizedRequest(updateUrl, {
    method: 'PATCH',
    body: JSON.stringify({
      name: CONFIG_NAME,
      blockingFunctions: { triggers: {} },
    }),
  });
}

async function publicSignupProbe() {
  const apiKey = text(process.env.VITE_FIREBASE_API_KEY) || 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s';
  if (!apiKey) fail('VITE_FIREBASE_API_KEY is required for the public Auth probe.');

  const nonce = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `owner-auth-probe-${nonce}@bin-groups.com`;
  const password = `BinProbe-${randomUUID()}-Aa1!`;
  const endpoint = new URL(`${PUBLIC_AUTH_URL}/accounts:signUp`);
  endpoint.searchParams.set('key', apiKey);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://bin-groups.com',
      Referer: 'https://bin-groups.com/',
    },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const payload = await parseJson(response);
  if (!response.ok || !text(payload?.idToken) || !text(payload?.localId)) {
    const rawMessage = text(payload?.error?.message || payload?.raw || `HTTP ${response.status}`);
    const blockingFailure = /BLOCKING_FUNCTION|HTTP Cloud Function|Page not found/i.test(rawMessage);
    fail(`${blockingFailure ? 'Public signup is still blocked by an Identity Platform hook' : 'Public signup probe failed'} (HTTP ${response.status}, code=${rawMessage.slice(0, 180)}).`);
  }

  const deleteEndpoint = new URL(`${PUBLIC_AUTH_URL}/accounts:delete`);
  deleteEndpoint.searchParams.set('key', apiKey);
  const deleteResponse = await fetch(deleteEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://bin-groups.com',
      Referer: 'https://bin-groups.com/',
    },
    body: JSON.stringify({ idToken: text(payload.idToken) }),
  });
  await parseJson(deleteResponse);
  if (!deleteResponse.ok) fail(`Public signup probe account cleanup failed with HTTP ${deleteResponse.status}.`);

  return {
    passed: true,
    uidHash: sha256(payload.localId),
    emailHash: sha256(email.toLowerCase()),
  };
}

async function main() {
  const projectId = text(process.env.GCP_PROJECT_ID) || PROJECT_ID;
  if (projectId !== PROJECT_ID) fail(`GCP_PROJECT_ID must equal ${PROJECT_ID}.`);
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') {
    fail('Live owner Auth recovery may only run against refs/heads/main.');
  }

  const startedAt = new Date().toISOString();
  const initialTriggers = await readBlockingTriggers();
  const initialTriggerNames = Object.keys(initialTriggers).sort();

  if (initialTriggerNames.length > 0 && !repairRequested) {
    fail(`Unexpected Identity Platform blocking triggers remain configured: ${initialTriggerNames.join(', ')}.`);
  }
  if (initialTriggerNames.length > 0) await clearBlockingTriggers();

  const finalTriggers = await readBlockingTriggers();
  const finalTriggerNames = Object.keys(finalTriggers).sort();
  if (finalTriggerNames.length > 0) {
    fail(`Blocking-trigger cleanup did not converge: ${finalTriggerNames.join(', ')}.`);
  }

  const signupProbe = probeRequested ? await publicSignupProbe() : { passed: false, skipped: true };
  const proof = {
    schemaVersion: 1,
    status: 'passed',
    source: 'repair-owner-auth-blocking-functions',
    projectId: PROJECT_ID,
    commitSha: text(process.env.GITHUB_SHA),
    workflowRunId: text(process.env.GITHUB_RUN_ID),
    startedAt,
    finishedAt: new Date().toISOString(),
    repairRequested,
    initialTriggerCount: initialTriggerNames.length,
    removedTriggerNames: initialTriggerNames,
    finalTriggerCount: finalTriggerNames.length,
    publicSignupProbe: signupProbe,
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  console.log(`[owner-auth-recovery] PASS removed=${initialTriggerNames.length} signupProbe=${signupProbe.passed === true ? 'passed' : 'skipped'}`);
  console.log(`[owner-auth-recovery] wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '[owner-auth-recovery] Unknown failure');
  process.exit(1);
});
