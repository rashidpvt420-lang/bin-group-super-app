#!/usr/bin/env node
/**
 * Strict fail-closed production deployment verification.
 * Status must be exactly "passed" — pending/missing/unknown/skipped/waived/failed all NO-GO.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  HARD_LAUNCH_CLAIM,
  PRODUCTION,
  deploymentEvidencePath,
  gitSha,
  readJsonSafe,
  validateDeploymentDocument,
} from './lib/launch-honesty.mjs';
import { validateFirebasePhoneAuthEvidence } from './verify-firebase-phone-auth-production.mjs';
import { validateAdminMfaEvidence } from './verify-admin-mfa-production.mjs';
import {
  HOSTED_CLIENT_REQUIRED_FLAGS,
  buildHostedClientConfigEvidence,
  summarizeHostedClientBundle,
  validateHostedClientConfigEvidence,
} from './verify-hosted-client-config.mjs';

const writeEvidence = process.argv.includes('--write-evidence');
const commitSha = gitSha();
const failures = [];
const MAX_BUNDLE_ASSETS = 250;

function fail(msg) {
  failures.push(msg);
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow' });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function extractConfig(text) {
  const found = {};
  if (text.includes(PRODUCTION.projectId)) found.projectId = PRODUCTION.projectId;
  const auth = text.match(/bin-group-57c60\.firebaseapp\.com/);
  if (auth) found.authDomain = auth[0];
  const appId = text.match(/1:123413252227:web:[a-z0-9]+/i);
  if (appId) found.appId = appId[0];
  const bucket = text.match(/bin-group-57c60\.(?:firebasestorage\.app|appspot\.com)/);
  if (bucket) found.storageBucket = bucket[0];
  return found;
}

function discoverJavascriptUrls(source, baseUrl, origin) {
  const urls = [];
  const patterns = [
    /(?:src|href)=["']([^"']+\.(?:js|mjs)(?:\?[^"']*)?)["']/g,
    /["'`]([^"'`\\\s]+\.(?:js|mjs)(?:\?[^"'`\\\s]*)?)["'`]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      try {
        const resolved = new URL(match[1], baseUrl);
        if (resolved.origin === origin) urls.push(resolved.toString());
      } catch {
        // Ignore non-URL source fragments.
      }
    }
  }
  return urls;
}

async function crawlJavascriptAssets(html, siteUrl) {
  const origin = new URL(siteUrl).origin;
  const queue = discoverJavascriptUrls(html, siteUrl, origin);
  const visited = new Set();
  const texts = [];

  while (queue.length > 0 && visited.size < MAX_BUNDLE_ASSETS) {
    const assetUrl = queue.shift();
    if (!assetUrl || visited.has(assetUrl)) continue;
    visited.add(assetUrl);
    try {
      const result = await fetchText(assetUrl);
      if (!result.ok) continue;
      texts.push(result.text);
      for (const discovered of discoverJavascriptUrls(result.text, assetUrl, origin)) {
        if (!visited.has(discovered) && queue.length + visited.size < MAX_BUNDLE_ASSETS * 2) {
          queue.push(discovered);
        }
      }
    } catch {
      // Continue scanning other same-origin assets.
    }
  }

  return { texts, assetCount: visited.size };
}

function reportMissingRuntimeFlags(label, site, summary) {
  for (const flag of HOSTED_CLIENT_REQUIRED_FLAGS[site]) {
    if (summary[flag] !== true) fail(`${label}: hosted bundle ${flag} is false`);
  }
  if (summary.assetCount <= 0) fail(`${label}: hosted bundle asset scan found no JavaScript assets`);
  if (summary.allRequiredMatched !== true) fail(`${label}: hosted client configuration is incomplete`);
}

async function verifySite(label, url, site) {
  console.log(`[deploy-verify] checking ${label} ${url}`);
  let html;
  try {
    const res = await fetchText(url);
    if (!res.ok) {
      fail(`${label}: HTTP ${res.status}`);
      return { httpOk: false, bundleVerified: false, runtimeSummary: { assetCount: 0 } };
    }
    html = res.text;
  } catch (err) {
    fail(`${label}: fetch failed (${err.message})`);
    return { httpOk: false, bundleVerified: false, runtimeSummary: { assetCount: 0 } };
  }

  const crawl = await crawlJavascriptAssets(html, url);
  if (!crawl.texts.length) {
    fail(`${label}: no readable JavaScript assets in hosted application`);
    return { httpOk: true, bundleVerified: false, runtimeSummary: { assetCount: crawl.assetCount } };
  }

  const config = {};
  for (const source of crawl.texts) Object.assign(config, extractConfig(source));
  const runtimeSummary = summarizeHostedClientBundle({
    texts: crawl.texts,
    assetCount: crawl.assetCount,
    site,
    env: process.env,
  });

  if (config.projectId !== PRODUCTION.projectId) fail(`${label}: projectId missing/mismatch in bundle`);
  if (config.authDomain !== PRODUCTION.authDomain) fail(`${label}: authDomain mismatch`);
  if (!String(config.appId || '').includes(PRODUCTION.appIdSuffix)) {
    fail(`${label}: appId does not match intended web app`);
  }
  reportMissingRuntimeFlags(label, site, runtimeSummary);

  const bundleVerified =
    config.projectId === PRODUCTION.projectId &&
    config.authDomain === PRODUCTION.authDomain &&
    String(config.appId || '').includes(PRODUCTION.appIdSuffix) &&
    runtimeSummary.allRequiredMatched === true;

  console.log(
    `[deploy-verify] ${label} bundle project=${config.projectId || '(missing)'} `
      + `assets=${runtimeSummary.assetCount} client_config=${runtimeSummary.allRequiredMatched === true ? 'matched' : 'incomplete'}`,
  );
  return { httpOk: true, bundleVerified, config, runtimeSummary };
}

const existing = readJsonSafe(deploymentEvidencePath(), null);

// Existing metadata must already claim passed + matching SHA before we accept write.
// Live HTTP/bundle checks always run.
const main = await verifySite('main', PRODUCTION.mainUrl, 'main');
const admin = await verifySite('admin', PRODUCTION.adminUrl, 'admin');

const httpChecksOk = main.httpOk === true && admin.httpOk === true;
const bundleVerified = main.bundleVerified === true && admin.bundleVerified === true;
const clientRuntimeConfig = buildHostedClientConfigEvidence({
  main: main.runtimeSummary,
  admin: admin.runtimeSummary,
}, { env: process.env, now: new Date() });

if (!httpChecksOk) fail('HTTP checks failed for main and/or admin hosting');
if (!bundleVerified) fail('Firebase bundle/project/client configuration verification failed');

let status = 'passed';
let deployedCommitSha = existing?.deployedCommitSha;
let deployedAt = existing?.deployedAt;

if (!existing) {
  fail('production-deployment.json missing — cannot prove deployedCommitSha equals current commit');
  status = 'missing';
} else {
  const metaStatus = String(existing.status || '').toLowerCase();
  if (metaStatus !== 'passed') {
    fail(`deployment metadata status must be exactly "passed" (got "${existing.status || 'missing'}")`);
    status = metaStatus || 'unknown';
  }
  for (const bad of ['pending', 'unknown', 'skipped', 'waived', 'failed', 'missing']) {
    if (metaStatus === bad) fail(`deployment status "${bad}" is not allowed`);
  }
  if (existing.projectId && existing.projectId !== PRODUCTION.projectId) {
    fail(`metadata projectId mismatch (${existing.projectId})`);
  }
  if (!existing.deployedCommitSha) {
    fail('metadata missing deployedCommitSha');
  } else if (existing.deployedCommitSha !== commitSha) {
    fail(`deployedCommitSha ${existing.deployedCommitSha} != current ${commitSha}`);
  }
  if (!existing.deployedAt) fail('metadata missing deployedAt timestamp');

  for (const phoneAuthFailure of validateFirebasePhoneAuthEvidence(existing.firebasePhoneAuth, {
    commitSha,
    repository: existing.repository,
    ref: existing.workflowRef,
    workflowRunId: existing.workflowRunId,
    workflowRunAttempt: existing.workflowRunAttempt,
    now: Date.now(),
  })) fail(phoneAuthFailure);

  for (const adminMfaFailure of validateAdminMfaEvidence(existing.adminMfa, {
    commitSha,
    repository: existing.repository,
    ref: existing.workflowRef,
    workflowRunId: existing.workflowRunId,
    workflowRunAttempt: existing.workflowRunAttempt,
    now: Date.now(),
  })) fail(adminMfaFailure);

  for (const clientConfigFailure of validateHostedClientConfigEvidence(clientRuntimeConfig, {
    commitSha,
    repository: existing.repository,
    ref: existing.workflowRef,
    workflowRunId: existing.workflowRunId,
    workflowRunAttempt: existing.workflowRunAttempt,
    now: Date.now(),
  })) fail(clientConfigFailure);
}

const doc = {
  status: failures.length ? (status === 'passed' ? 'failed' : status) : 'passed',
  projectId: PRODUCTION.projectId,
  mainUrl: PRODUCTION.mainUrl,
  adminUrl: PRODUCTION.adminUrl,
  deployedCommitSha: deployedCommitSha || null,
  localCommitSha: commitSha,
  deployedAt: deployedAt || null,
  verifiedAt: new Date().toISOString(),
  httpChecksOk,
  bundleVerified,
  clientRuntimeConfig,
  hardLaunchClaim: HARD_LAUNCH_CLAIM,
  workflowRunId: existing?.workflowRunId ?? null,
  workflowRunAttempt: existing?.workflowRunAttempt ?? null,
  workflowRef: existing?.workflowRef ?? null,
  repository: existing?.repository ?? null,
  successfulComponents: existing?.successfulComponents || existing?.components || null,
  source: existing?.source || null,
};

const validationErrors = validateDeploymentDocument(
  failures.length
    ? { ...doc, status: doc.status === 'passed' ? 'failed' : doc.status, deployedCommitSha: deployedCommitSha || 'missing' }
    : { ...doc, deployedCommitSha: commitSha, deployedAt: deployedAt || new Date().toISOString(), status: 'passed', httpChecksOk: true, bundleVerified: true },
  commitSha,
);

const canPass = failures.length === 0 && httpChecksOk && bundleVerified && deployedCommitSha === commitSha && deployedAt;

if (writeEvidence && canPass) {
  const out = {
    ...existing,
    ...doc,
    status: 'passed',
    deployedCommitSha: commitSha,
    deployedAt,
    verifiedAt: doc.verifiedAt,
    httpChecksOk: true,
    bundleVerified: true,
    clientRuntimeConfig,
    hardLaunchClaim: false,
  };
  mkdirSync(path.dirname(deploymentEvidencePath()), { recursive: true });
  writeFileSync(deploymentEvidencePath(), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`[deploy-verify] wrote ${deploymentEvidencePath()}`);
}

if (!canPass || failures.length || validationErrors.length) {
  console.error('\n[deploy-verify] FAIL (fail-closed)');
  for (const item of failures) console.error(`- ${item}`);
  for (const item of validationErrors) console.error(`- ${item}`);
  console.error(`hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
  process.exit(1);
}

console.log('[deploy-verify] PASS — production main + admin hosting and client configuration verified');
console.log(`hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
process.exit(0);
