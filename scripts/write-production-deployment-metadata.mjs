#!/usr/bin/env node
/**
 * Write launch_package/production-deployment.json after a successful production deploy.
 * Only emits status:"passed" when every required component is listed as successful.
 * Does not invent credentials. hardLaunchClaim remains false.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  HARD_LAUNCH_CLAIM,
  PRODUCTION,
  deploymentEvidencePath,
  gitSha,
} from './lib/launch-honesty.mjs';

const REQUIRED_COMPONENTS = Object.freeze([
  'hosting',
  'firestoreRules',
  'firestoreIndexes',
  'storageRules',
  'functions',
]);

function argValue(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return '';
  return String(process.argv[idx + 1] || '').trim();
}

const componentsRaw = argValue('components') || process.env.DEPLOY_COMPONENTS || '';
const components = componentsRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const missing = REQUIRED_COMPONENTS.filter((c) => !components.includes(c));
if (missing.length) {
  console.error(
    `[write-deploy-meta] REFUSED: missing successful components: ${missing.join(', ')}. Cannot write status=passed.`,
  );
  process.exit(1);
}

const commitSha =
  String(process.env.GITHUB_SHA || process.env.DEPLOYED_COMMIT_SHA || '').trim() || gitSha();
if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
  console.error('[write-deploy-meta] REFUSED: deployedCommitSha must be a full 40-char SHA');
  process.exit(1);
}

const workflowRunId = String(process.env.GITHUB_RUN_ID || '').trim() || null;
const workflowRunAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null;
const workflowRef = String(process.env.GITHUB_REF || '').trim() || null;
const repository = String(process.env.GITHUB_REPOSITORY || '').trim() || null;
const artifactDigest = String(process.env.VALIDATED_ARTIFACT_DIGEST || '').trim().toLowerCase() || null;
if (artifactDigest && !/^sha256:[a-f0-9]{64}$/.test(artifactDigest)) {
  console.error('[write-deploy-meta] REFUSED: VALIDATED_ARTIFACT_DIGEST must be sha256:<64-hex>');
  process.exit(1);
}

const doc = {
  status: 'passed',
  projectId: PRODUCTION.projectId,
  mainUrl: PRODUCTION.mainUrl,
  adminUrl: PRODUCTION.adminUrl,
  deployedCommitSha: commitSha,
  deployedAt: new Date().toISOString(),
  workflowRunId,
  workflowRunAttempt,
  workflowRef,
  repository,
  successfulComponents: [...REQUIRED_COMPONENTS],
  artifactDigest,
  validatedArtifactDigest: artifactDigest,
  httpChecksOk: false,
  bundleVerified: false,
  verifiedAt: null,
  hardLaunchClaim: HARD_LAUNCH_CLAIM,
  source: 'firebase-production-deploy-workflow',
};

const out = deploymentEvidencePath();
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`[write-deploy-meta] wrote ${out}`);
console.log(`[write-deploy-meta] deployedCommitSha=${commitSha}`);
console.log(`[write-deploy-meta] hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
process.exit(0);
