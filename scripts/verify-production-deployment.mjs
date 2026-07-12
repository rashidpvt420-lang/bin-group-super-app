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

const writeEvidence = process.argv.includes('--write-evidence');
const commitSha = gitSha();
const failures = [];

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
  const apiKey = text.match(/AIza[0-9A-Za-z\-_]{20,}/);
  if (apiKey) found.apiKey = apiKey[0];
  return found;
}

async function verifySite(label, url) {
  console.log(`[deploy-verify] checking ${label} ${url}`);
  let html;
  try {
    const res = await fetchText(url);
    if (!res.ok) {
      fail(`${label}: HTTP ${res.status}`);
      return { httpOk: false, bundleVerified: false };
    }
    html = res.text;
  } catch (err) {
    fail(`${label}: fetch failed (${err.message})`);
    return { httpOk: false, bundleVerified: false };
  }

  const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|mjs))["']/g)].map((m) => new URL(m[1], url).toString());
  if (!assets.length) {
    fail(`${label}: no JS assets in index.html`);
    return { httpOk: true, bundleVerified: false };
  }

  let config = {};
  for (const asset of assets.slice(0, 20)) {
    try {
      const res = await fetchText(asset);
      if (!res.ok) continue;
      Object.assign(config, extractConfig(res.text));
    } catch {
      // continue
    }
  }

  if (config.projectId !== PRODUCTION.projectId) {
    fail(`${label}: projectId missing/mismatch in bundle`);
    return { httpOk: true, bundleVerified: false, config };
  }
  if (config.authDomain !== PRODUCTION.authDomain) {
    fail(`${label}: authDomain mismatch`);
  }
  if (!String(config.appId || '').includes(PRODUCTION.appIdSuffix)) {
    fail(`${label}: appId does not match intended web app`);
  }
  console.log(`[deploy-verify] ${label} bundle projectId=${config.projectId} appId=${String(config.appId || '').slice(0, 12)}…`);
  return { httpOk: true, bundleVerified: true, config };
}

const existing = readJsonSafe(deploymentEvidencePath(), null);

// Existing metadata must already claim passed + matching SHA before we accept write.
// Live HTTP/bundle checks always run.
const main = await verifySite('main', PRODUCTION.mainUrl);
const admin = await verifySite('admin', PRODUCTION.adminUrl);

const httpChecksOk = main.httpOk === true && admin.httpOk === true;
const bundleVerified = main.bundleVerified === true && admin.bundleVerified === true;

if (!httpChecksOk) fail('HTTP checks failed for main and/or admin hosting');
if (!bundleVerified) fail('Firebase bundle/project verification failed');

// Strict metadata: prefer existing production-deployment.json from deploy pipeline.
let status = 'passed';
let deployedCommitSha = existing?.deployedCommitSha;
let deployedAt = existing?.deployedAt;

if (!existing) {
  // Without a deploy metadata file we cannot prove deployed SHA == current SHA.
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

// If live checks passed AND metadata matches SHA, allow writing a refreshed verified doc.
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

console.log('[deploy-verify] PASS — production main + admin hosting verified');
console.log(`hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
process.exit(0);
