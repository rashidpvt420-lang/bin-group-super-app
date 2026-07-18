import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildHostedClientConfigEvidence,
  summarizeHostedClientBundle,
  validateHostedClientConfigEvidence,
} from '../../scripts/verify-hosted-client-config.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const SHA = 'b'.repeat(40);
const ENV = {
  GITHUB_SHA: SHA,
  GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ID: '882211',
  GITHUB_RUN_ATTEMPT: '3',
  VITE_FIREBASE_API_KEY: `AIza${'F'.repeat(35)}`,
  VITE_FIREBASE_APP_ID: '1:123413252227:web:abcdef1234567890',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123413252227',
  VITE_FIREBASE_VAPID_KEY: `B${'V'.repeat(86)}`,
  VITE_GOOGLE_MAPS_API_KEY: `AIza${'M'.repeat(35)}`,
  VITE_APP_CHECK_SITE_KEY: `6L${'A'.repeat(38)}`,
};

function mainTexts() {
  return [
    `bin-group-57c60 bin-group-57c60.firebaseapp.com bin-group-57c60.firebasestorage.app ${ENV.VITE_FIREBASE_API_KEY}`,
    `${ENV.VITE_FIREBASE_APP_ID} ${ENV.VITE_FIREBASE_MESSAGING_SENDER_ID} ${ENV.VITE_APP_CHECK_SITE_KEY}`,
    `${ENV.VITE_GOOGLE_MAPS_API_KEY} ${ENV.VITE_FIREBASE_VAPID_KEY}`,
  ];
}

function adminTexts() {
  return [
    `bin-group-57c60 bin-group-57c60.firebaseapp.com bin-group-57c60.firebasestorage.app`,
    `${ENV.VITE_FIREBASE_API_KEY} ${ENV.VITE_FIREBASE_APP_ID} ${ENV.VITE_FIREBASE_MESSAGING_SENDER_ID} ${ENV.VITE_APP_CHECK_SITE_KEY}`,
  ];
}

test('hosted client summaries require exact main and admin runtime values', () => {
  const main = summarizeHostedClientBundle({ texts: mainTexts(), assetCount: 7, site: 'main', env: ENV });
  const admin = summarizeHostedClientBundle({ texts: adminTexts(), assetCount: 2, site: 'admin', env: ENV });
  assert.equal(main.allRequiredMatched, true);
  assert.equal(main.mapsApiKeyMatched, true);
  assert.equal(main.vapidKeyMatched, true);
  assert.equal(admin.allRequiredMatched, true);
  assert.equal(admin.appCheckSiteKeyMatched, true);

  const missingMaps = summarizeHostedClientBundle({
    texts: mainTexts().map((source) => source.replace(ENV.VITE_GOOGLE_MAPS_API_KEY, '')),
    assetCount: 7,
    site: 'main',
    env: ENV,
  });
  assert.equal(missingMaps.mapsApiKeyMatched, false);
  assert.equal(missingMaps.allRequiredMatched, false);
});

test('hosted client evidence is exact-run bound and aggregate-only', () => {
  const now = new Date('2026-07-18T15:30:00.000Z');
  const main = summarizeHostedClientBundle({ texts: mainTexts(), assetCount: 7, site: 'main', env: ENV });
  const admin = summarizeHostedClientBundle({ texts: adminTexts(), assetCount: 2, site: 'admin', env: ENV });
  const evidence = buildHostedClientConfigEvidence({ main, admin }, { env: ENV, now });
  const failures = validateHostedClientConfigEvidence(evidence, {
    commitSha: SHA,
    repository: ENV.GITHUB_REPOSITORY,
    ref: ENV.GITHUB_REF,
    workflowRunId: ENV.GITHUB_RUN_ID,
    workflowRunAttempt: 3,
    now: now.getTime(),
  });
  assert.deepEqual(failures, []);
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.main.assetCount, 7);
  assert.equal(evidence.admin.assetCount, 2);
  assert.equal(evidence.sensitiveValuesExcluded, true);
  assert.equal(evidence.hardLaunchClaim, false);
  const serialized = JSON.stringify(evidence);
  for (const secretLikeValue of [
    ENV.VITE_FIREBASE_API_KEY,
    ENV.VITE_GOOGLE_MAPS_API_KEY,
    ENV.VITE_FIREBASE_VAPID_KEY,
    ENV.VITE_APP_CHECK_SITE_KEY,
  ]) assert.doesNotMatch(serialized, new RegExp(secretLikeValue));
});

test('hosted client evidence rejects missing flags, tampering, stale proof and secret fields', () => {
  const now = new Date('2026-07-18T15:30:00.000Z');
  const main = summarizeHostedClientBundle({ texts: mainTexts(), assetCount: 7, site: 'main', env: ENV });
  const admin = summarizeHostedClientBundle({ texts: adminTexts(), assetCount: 2, site: 'admin', env: ENV });
  const evidence = buildHostedClientConfigEvidence({ main, admin }, { env: ENV, now });

  const tampered = structuredClone(evidence);
  tampered.main.vapidKeyMatched = false;
  assert.match(validateHostedClientConfigEvidence(tampered, {
    commitSha: SHA,
    repository: ENV.GITHUB_REPOSITORY,
    ref: ENV.GITHUB_REF,
    workflowRunId: ENV.GITHUB_RUN_ID,
    workflowRunAttempt: 3,
    now: now.getTime(),
  }).join('\n'), /main vapidKeyMatched/);

  const stale = { ...evidence, verifiedAt: '2026-07-15T15:30:00.000Z' };
  assert.match(validateHostedClientConfigEvidence(stale, {
    commitSha: SHA,
    repository: ENV.GITHUB_REPOSITORY,
    ref: ENV.GITHUB_REF,
    workflowRunId: ENV.GITHUB_RUN_ID,
    workflowRunAttempt: 3,
    now: now.getTime(),
  }).join('\n'), /stale/);

  const disclosed = { ...evidence, firebaseApiKey: ENV.VITE_FIREBASE_API_KEY };
  assert.match(validateHostedClientConfigEvidence(disclosed, {
    commitSha: SHA,
    repository: ENV.GITHUB_REPOSITORY,
    ref: ENV.GITHUB_REF,
    workflowRunId: ENV.GITHUB_RUN_ID,
    workflowRunAttempt: 3,
    now: now.getTime(),
  }).join('\n'), /must not contain firebaseApiKey/);
});

test('postdeploy verification recursively scans same-origin JS assets and records clientRuntimeConfig', async () => {
  const source = await read('scripts/verify-production-deployment.mjs');
  assert.match(source, /MAX_BUNDLE_ASSETS = 250/);
  assert.match(source, /discoverJavascriptUrls/);
  assert.match(source, /crawlJavascriptAssets/);
  assert.match(source, /resolved\.origin === origin/);
  assert.match(source, /summarizeHostedClientBundle/);
  assert.match(source, /buildHostedClientConfigEvidence/);
  assert.match(source, /validateHostedClientConfigEvidence/);
  assert.match(source, /clientRuntimeConfig/);
  assert.match(source, /client_config=/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:VITE_FIREBASE_API_KEY|VITE_GOOGLE_MAPS_API_KEY|VITE_FIREBASE_VAPID_KEY|VITE_APP_CHECK_SITE_KEY)/);

  const sameRun = await read('scripts/verify-same-run-deployment-artifact.mjs');
  assert.match(sameRun, /validateHostedClientConfigEvidence\(deployment\.clientRuntimeConfig/);
});
