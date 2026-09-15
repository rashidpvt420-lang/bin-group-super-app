#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault } from 'firebase-admin/app';
import {
  PRODUCTION,
  deploymentEvidencePath,
  gitSha,
  readJsonSafe,
  validateDeploymentDocument,
} from './lib/launch-honesty.mjs';
import { computeValidatedArtifactDigest } from './lib/launch-gate-common.mjs';
import { validateFunctionsDeploymentEvidence } from './lib/functions-deployment-evidence.mjs';
import {
  verifyFirebasePhoneAuthProduction,
  validateFirebasePhoneAuthEvidence,
} from './verify-firebase-phone-auth-production.mjs';
import {
  verifyAdminMfaProduction,
  validateAdminMfaEvidence,
} from './verify-admin-mfa-production.mjs';
import {
  buildHostedClientConfigEvidence,
  HOSTED_CLIENT_REQUIRED_FLAGS,
  summarizeHostedClientBundle,
  validateHostedClientConfigEvidence,
} from './verify-hosted-client-config.mjs';
import { extractEnterpriseSiteKey } from './resolve-admin-app-check-site-key.mjs';
import { runProductionOtpMailboxPreflight } from './lib/production-otp-mailbox-preflight.mjs';

export const REVALIDATION_RELATIVE = 'launch_package/hard-clearance-production-revalidation.json';
export const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
export const EXPECTED_REF = 'refs/heads/main';
export const EXPECTED_WORKFLOW = 'Live Role Smoke Tests';
export const GENERATE_JOB = 'hard-clearance-production-revalidation';
export const VERIFY_JOB = 'hard-public-launch-clearance';
export const MAX_REVALIDATION_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_HOSTING_FILES = 1500;
const MAX_HOSTING_FILE_BYTES = 25 * 1024 * 1024;
const MAX_HOSTING_BYTES = 256 * 1024 * 1024;
const MAX_APPCHECK_CONFIG_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const HOSTED_BINDING_ALGORITHM = 'sha256-path-null-content-v1';
const ADMIN_APPCHECK_HOSTNAME = 'firebaseappcheck.googleapis.com';
const ADMIN_APPCHECK_CONFIG_NAME =
  'projects/123413252227/apps/1:123413252227:web:285cb53bc26626d699f3b6/recaptchaEnterpriseConfig';
const HOSTED_SITES = Object.freeze({
  main: Object.freeze({ baseUrl: PRODUCTION.mainUrl, buildDirectory: 'dist' }),
  admin: Object.freeze({ baseUrl: PRODUCTION.adminUrl, buildDirectory: 'apps/admin-panel/build' }),
});

const text = (value) => String(value ?? '').trim();
const isSha = (value) => /^[0-9a-f]{40}$/.test(text(value));
const isNumeric = (value) => /^\d+$/.test(text(value));
const isSha256 = (value) => /^sha256:[a-f0-9]{64}$/.test(text(value));

export function revalidationPath(root = process.cwd()) {
  return path.join(root, REVALIDATION_RELATIVE);
}

function runCommand(command, args, env = process.env, cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || (result.error ? String(result.error.message || result.error) : ''),
  };
}

function runNode(args, env = process.env, cwd = process.cwd()) {
  return runCommand(process.execPath, args, env, cwd);
}

function requireCommandOk(label, result) {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
}

function assertWorkflowContext(expectedJob) {
  const failures = [];
  if (process.env.GITHUB_ACTIONS !== 'true') failures.push('GitHub Actions context is required');
  if (text(process.env.GITHUB_REPOSITORY) !== EXPECTED_REPOSITORY) failures.push('repository mismatch');
  if (text(process.env.GITHUB_REF) !== EXPECTED_REF) failures.push('refs/heads/main is required');
  if (text(process.env.GITHUB_WORKFLOW) !== EXPECTED_WORKFLOW) failures.push(`${EXPECTED_WORKFLOW} workflow is required`);
  if (text(process.env.GITHUB_JOB) !== expectedJob) failures.push(`${expectedJob} job is required`);
  if (!isNumeric(process.env.GITHUB_RUN_ID)) failures.push('numeric GITHUB_RUN_ID is required');
  if (!Number.isInteger(Number(process.env.GITHUB_RUN_ATTEMPT)) || Number(process.env.GITHUB_RUN_ATTEMPT) < 1) {
    failures.push('positive GITHUB_RUN_ATTEMPT is required');
  }
  if (failures.length) throw new Error(failures.join('; '));
}

function expectedReleaseSha(root = process.cwd()) {
  const releaseSha = text(process.env.HARD_LAUNCH_EXPECTED_SHA);
  if (!isSha(releaseSha)) throw new Error('HARD_LAUNCH_EXPECTED_SHA must be a lowercase 40-character SHA');
  const checkedOut = gitSha(root);
  if (checkedOut !== releaseSha) throw new Error('checked-out release commit must equal HARD_LAUNCH_EXPECTED_SHA');
  return releaseSha;
}

function expectedControlPlaneSha() {
  const value = text(process.env.CLEARANCE_CONTROL_PLANE_SHA);
  if (!isSha(value)) throw new Error('CLEARANCE_CONTROL_PLANE_SHA must be a lowercase 40-character SHA');
  return value;
}

function expectedLiveEvidenceRunId() {
  const value = text(process.env.LIVE_EVIDENCE_RUN_ID);
  if (!isNumeric(value)) throw new Error('LIVE_EVIDENCE_RUN_ID must be numeric');
  return value;
}

function requestCanonicalAdminAppCheckConfig(accessToken) {
  const pathName = `/v1/${ADMIN_APPCHECK_CONFIG_NAME}`;
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      protocol: 'https:',
      hostname: ADMIN_APPCHECK_HOSTNAME,
      port: 443,
      method: 'GET',
      path: pathName,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`[hard-clearance-revalidation] canonical Admin App Check lookup failed with HTTP ${status}`));
        return;
      }

      const chunks = [];
      let received = 0;
      response.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_APPCHECK_CONFIG_BYTES) {
          request.destroy(new Error('[hard-clearance-revalidation] canonical Admin App Check response exceeded safety limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks, received).toString('utf8')));
        } catch {
          reject(new Error('[hard-clearance-revalidation] canonical Admin App Check response was malformed'));
        }
      });
      response.on('error', reject);
    });
    request.setTimeout(FETCH_TIMEOUT_MS, () => {
      request.destroy(new Error('[hard-clearance-revalidation] canonical Admin App Check lookup timed out'));
    });
    request.on('error', reject);
    request.end();
  });
}

export async function resolveCanonicalAdminEnterpriseSiteKey({
  env = process.env,
  getAccessToken,
  requestConfig,
} = {}) {
  const accessTokenProvider = getAccessToken || (async () => {
    try {
      const credential = applicationDefault();
      const token = await credential.getAccessToken();
      return text(token?.access_token);
    } catch {
      throw new Error('[hard-clearance-revalidation] canonical Admin App Check credential acquisition failed');
    }
  });

  const accessToken = text(await accessTokenProvider());
  if (!accessToken) {
    throw new Error('[hard-clearance-revalidation] canonical Admin App Check access token was missing');
  }

  let config;
  try {
    config = requestConfig
      ? await requestConfig({
        hostname: ADMIN_APPCHECK_HOSTNAME,
        path: `/v1/${ADMIN_APPCHECK_CONFIG_NAME}`,
        accessToken,
      })
      : await requestCanonicalAdminAppCheckConfig(accessToken);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[hard-clearance-revalidation]')) throw error;
    throw new Error('[hard-clearance-revalidation] canonical Admin App Check lookup failed');
  }

  const siteKey = extractEnterpriseSiteKey(config, env.VITE_APP_CHECK_SITE_KEY);
  const configuredSiteKey = text(env.FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY);
  if (configuredSiteKey && configuredSiteKey !== siteKey) {
    throw new Error('[hard-clearance-revalidation] protected Admin App Check override does not match canonical Firebase config');
  }
  return siteKey;
}

function freshHostedClientEvidence(releaseSha, runAttempt, hostedBundles, env = process.env) {
  const evidenceEnv = {
    ...env,
    GITHUB_SHA: releaseSha,
    GITHUB_REPOSITORY: EXPECTED_REPOSITORY,
    GITHUB_REF: EXPECTED_REF,
    GITHUB_RUN_ID: text(process.env.GITHUB_RUN_ID),
    GITHUB_RUN_ATTEMPT: String(runAttempt),
  };
  const main = summarizeHostedClientBundle({
    texts: hostedBundles.main.texts,
    assetCount: hostedBundles.main.assetCount,
    site: 'main',
    env: evidenceEnv,
  });
  const admin = summarizeHostedClientBundle({
    texts: hostedBundles.admin.texts,
    assetCount: hostedBundles.admin.assetCount,
    site: 'admin',
    env: evidenceEnv,
  });
  for (const [site, summary] of [['main', main], ['admin', admin]]) {
    for (const flag of HOSTED_CLIENT_REQUIRED_FLAGS[site]) {
      if (summary[flag] !== true) throw new Error(`${site} hosted bundle ${flag} is false`);
    }
    if (summary.allRequiredMatched !== true) throw new Error(`${site} hosted client configuration is incomplete`);
  }
  return buildHostedClientConfigEvidence({ main, admin }, { env: evidenceEnv, now: new Date() });
}

/** Construct an asset URL only below one of the two fixed production Hosting origins. */
export function protectedHostedAssetUrl(site, relativePath) {
  const config = HOSTED_SITES[site];
  if (!config) throw new Error(`unsupported hosted site: ${site}`);
  const normalized = text(relativePath).replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.includes('\0')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`unsafe ${site} hosted asset path`);
  }

  const base = new URL(`${config.baseUrl}/`);
  const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join('/');
  const candidate = new URL(encodedPath, base);
  if (
    candidate.protocol !== 'https:'
    || candidate.origin !== base.origin
    || candidate.username
    || candidate.password
    || candidate.search
    || candidate.hash
  ) {
    throw new Error(`unsafe ${site} hosted asset URL`);
  }
  return candidate;
}

function protectedHostedHostname(site) {
  if (site === 'main') return 'bin-group-57c60.web.app';
  if (site === 'admin') return 'bin-group-admin-panel.web.app';
  throw new Error(`unsupported hosted site: ${site}`);
}

function requestProtectedHostedBytes(site, requestedUrl) {
  const hostname = protectedHostedHostname(site);
  if (
    !(requestedUrl instanceof URL)
    || requestedUrl.protocol !== 'https:'
    || requestedUrl.hostname !== hostname
    || requestedUrl.port
    || requestedUrl.username
    || requestedUrl.password
    || requestedUrl.search
    || requestedUrl.hash
  ) {
    throw new Error(`unsafe ${site} hosted asset URL`);
  }

  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      protocol: 'https:',
      hostname,
      port: 443,
      method: 'GET',
      path: requestedUrl.pathname,
      headers: {
        Accept: 'application/octet-stream',
        'Cache-Control': 'no-cache',
      },
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`${site} hosted asset returned HTTP ${status}`));
        return;
      }
      const declaredLength = Number(response.headers['content-length'] || 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_HOSTING_FILE_BYTES) {
        response.resume();
        reject(new Error(`${site} hosted asset exceeds the per-file safety limit`));
        return;
      }

      const chunks = [];
      let received = 0;
      response.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_HOSTING_FILE_BYTES) {
          request.destroy(new Error(`${site} hosted asset exceeds the per-file safety limit`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks, received)));
      response.on('error', reject);
    });
    request.setTimeout(FETCH_TIMEOUT_MS, () => {
      request.destroy(new Error(`${site} hosted asset request timed out`));
    });
    request.on('error', reject);
    request.end();
  });
}

function listRegularFiles(rootDir) {
  if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
    throw new Error(`frozen hosting directory is missing: ${rootDir}`);
  }
  const files = [];
  const walk = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`frozen hosting directory contains a symlink: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  walk(rootDir);
  if (!files.length) throw new Error(`frozen hosting directory is empty: ${rootDir}`);
  if (files.length > MAX_HOSTING_FILES) {
    throw new Error(`frozen hosting file count exceeds ${MAX_HOSTING_FILES}: ${rootDir}`);
  }
  return files;
}

function updateHostedDigest(hash, relativePath, bytes) {
  hash.update(relativePath);
  hash.update('\0');
  hash.update(bytes);
  hash.update('\0');
}

async function verifyHostedDirectoryBytes({ root, site, releaseSha }) {
  const config = HOSTED_SITES[site];
  if (!config) throw new Error(`unsupported hosted site: ${site}`);
  const directory = path.join(root, ...config.buildDirectory.split('/'));
  const expectedOrigin = new URL(`${config.baseUrl}/`).origin;
  const files = listRegularFiles(directory);
  const frozenRelativePaths = files.map((absolute) => (
    path.relative(directory, absolute).replaceAll(path.sep, '/')
  ));
  const allowedHostedAssetUrls = frozenRelativePaths.map((relative) => (
    protectedHostedAssetUrl(site, relative).href
  ));
  const rebuiltManifest = createHash('sha256');
  const liveManifest = createHash('sha256');
  const texts = [];
  let totalBytes = 0;

  for (const [index, absolute] of files.entries()) {
    const relative = frozenRelativePaths[index];
    const localBytes = readFileSync(absolute);
    totalBytes += localBytes.length;
    if (totalBytes > MAX_HOSTING_BYTES) {
      throw new Error(`${site} frozen hosting bytes exceed ${MAX_HOSTING_BYTES}`);
    }
    const requestedUrl = protectedHostedAssetUrl(site, relative);
    const requestedHref = requestedUrl.href;
    if (!allowedHostedAssetUrls.includes(requestedHref)) {
      throw new Error(`${site} hosted asset is absent from the frozen release URL allowlist`);
    }
    const liveBytes = await requestProtectedHostedBytes(site, requestedUrl);
    if (!liveBytes.equals(localBytes)) {
      throw new Error(`${site} hosted file differs from frozen release bytes: ${relative}`);
    }
    updateHostedDigest(rebuiltManifest, relative, localBytes);
    updateHostedDigest(liveManifest, relative, liveBytes);
    if (/\.(?:js|mjs)$/.test(relative)) texts.push(liveBytes.toString('utf8'));
  }

  if (!texts.length) throw new Error(`${site} frozen hosting build has no JavaScript assets`);
  return {
    binding: {
      site,
      origin: expectedOrigin,
      releaseCommitSha: releaseSha,
      fileCount: files.length,
      totalBytes,
      javascriptAssetCount: texts.length,
      rebuiltDigest: `sha256:${rebuiltManifest.digest('hex')}`,
      liveDigest: `sha256:${liveManifest.digest('hex')}`,
      exactBytesVerified: true,
    },
    texts,
  };
}

function prepareFrozenReleaseBuild(root, releaseSha, env = process.env) {
  const buildEnv = {
    ...env,
    GITHUB_SHA: releaseSha,
    RELEASE_COMMIT_SHA: releaseSha,
  };
  requireCommandOk(
    'write frozen production environment',
    runNode(['scripts/write-production-env.mjs'], buildEnv, root),
  );
  requireCommandOk(
    'prepare frozen production rules',
    runCommand('npm', ['run', 'prepare:rules'], buildEnv, root),
  );
  requireCommandOk(
    'build frozen shared package',
    runCommand('npm', ['run', 'build', '--workspace=@bin/shared'], buildEnv, root),
  );
  requireCommandOk(
    'build frozen public app',
    runCommand('npm', ['run', 'build'], buildEnv, root),
  );
  requireCommandOk(
    'build frozen admin app',
    runCommand('npm', ['run', 'build:admin'], { ...buildEnv, CI: 'false' }, root),
  );
  requireCommandOk(
    'build frozen Functions',
    runCommand('npm', ['run', 'build:functions'], buildEnv, root),
  );
}

function recordedArtifactDigest(deploymentDoc) {
  const artifact = text(deploymentDoc?.artifactDigest).toLowerCase();
  const validated = text(deploymentDoc?.validatedArtifactDigest).toLowerCase();
  if (!isSha256(artifact) || !isSha256(validated)) {
    throw new Error('original deployment artifact digests must be sha256:<64-hex>');
  }
  if (artifact !== validated) throw new Error('original deployment artifact digests disagree');
  return artifact;
}

async function verifyHostedReleaseBinding({ root, releaseSha, deploymentDoc, env = process.env }) {
  const expectedArtifactDigest = recordedArtifactDigest(deploymentDoc);

  prepareFrozenReleaseBuild(root, releaseSha, env);
  const rebuiltArtifactDigest = computeValidatedArtifactDigest(root);
  if (rebuiltArtifactDigest !== expectedArtifactDigest) {
    throw new Error('rebuilt frozen release digest does not match original protected deployment artifact digest');
  }

  const [mainResult, adminResult] = await Promise.all([
    verifyHostedDirectoryBytes({ root, site: 'main', releaseSha }),
    verifyHostedDirectoryBytes({ root, site: 'admin', releaseSha }),
  ]);

  return {
    binding: {
      schemaVersion: 1,
      status: 'passed',
      source: 'frozen-release-rebuild-and-live-byte-comparison',
      algorithm: HOSTED_BINDING_ALGORITHM,
      releaseCommitSha: releaseSha,
      originalArtifactDigest: expectedArtifactDigest,
      rebuiltArtifactDigest,
      exactBytesVerified: true,
      main: mainResult.binding,
      admin: adminResult.binding,
      sensitiveValuesExcluded: true,
      hardLaunchClaim: false,
    },
    hostedBundles: {
      main: { texts: mainResult.texts, assetCount: mainResult.binding.javascriptAssetCount },
      admin: { texts: adminResult.texts, assetCount: adminResult.binding.javascriptAssetCount },
    },
  };
}

function forbiddenProofKey(value) {
  const forbidden = new Set([
    'accesstoken',
    'authorization',
    'password',
    'clientid',
    'clientsecret',
    'refreshtoken',
    'apikey',
    'sitekey',
    'token',
    'secret',
  ]);
  if (!value || typeof value !== 'object') return '';
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key.toLowerCase())) return key;
    const child = forbiddenProofKey(nested);
    if (child) return child;
  }
  return '';
}

export function validateHostedReleaseBinding(binding, { releaseSha, deploymentDoc } = {}) {
  const failures = [];
  const exact = (actual, expected, label) => {
    if (String(actual ?? '') !== String(expected ?? '')) failures.push(`${label} mismatch`);
  };
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    return ['hosted release byte binding is missing or malformed'];
  }
  let expectedArtifactDigest = '';
  try {
    expectedArtifactDigest = recordedArtifactDigest(deploymentDoc);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  exact(binding.schemaVersion, 1, 'hosted release binding schemaVersion');
  exact(binding.status, 'passed', 'hosted release binding status');
  exact(binding.source, 'frozen-release-rebuild-and-live-byte-comparison', 'hosted release binding source');
  exact(binding.algorithm, HOSTED_BINDING_ALGORITHM, 'hosted release binding algorithm');
  exact(binding.releaseCommitSha, releaseSha, 'hosted release binding releaseCommitSha');
  exact(binding.exactBytesVerified, true, 'hosted release binding exactBytesVerified');
  exact(binding.originalArtifactDigest, expectedArtifactDigest, 'hosted release binding originalArtifactDigest');
  exact(binding.rebuiltArtifactDigest, expectedArtifactDigest, 'hosted release binding rebuiltArtifactDigest');
  exact(binding.sensitiveValuesExcluded, true, 'hosted release binding sensitiveValuesExcluded');
  exact(binding.hardLaunchClaim, false, 'hosted release binding hardLaunchClaim');
  if (!isSha256(binding.originalArtifactDigest)) failures.push('hosted release binding originalArtifactDigest is malformed');
  if (!isSha256(binding.rebuiltArtifactDigest)) failures.push('hosted release binding rebuiltArtifactDigest is malformed');

  for (const site of ['main', 'admin']) {
    const evidence = binding[site];
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
      failures.push(`${site} hosted release binding is missing`);
      continue;
    }
    exact(evidence.site, site, `${site} hosted release binding site`);
    exact(evidence.origin, new URL(`${HOSTED_SITES[site].baseUrl}/`).origin, `${site} hosted release binding origin`);
    exact(evidence.releaseCommitSha, releaseSha, `${site} hosted release binding releaseCommitSha`);
    exact(evidence.exactBytesVerified, true, `${site} hosted release binding exactBytesVerified`);
    if (!Number.isInteger(evidence.fileCount) || evidence.fileCount <= 0) {
      failures.push(`${site} hosted release binding fileCount must be positive`);
    }
    if (!Number.isInteger(evidence.totalBytes) || evidence.totalBytes <= 0 || evidence.totalBytes > MAX_HOSTING_BYTES) {
      failures.push(`${site} hosted release binding totalBytes is invalid`);
    }
    if (
      !Number.isInteger(evidence.javascriptAssetCount)
      || evidence.javascriptAssetCount <= 0
      || evidence.javascriptAssetCount > evidence.fileCount
    ) {
      failures.push(`${site} hosted release binding javascriptAssetCount is invalid`);
    }
    if (!isSha256(evidence.rebuiltDigest)) failures.push(`${site} hosted release binding rebuiltDigest is malformed`);
    if (!isSha256(evidence.liveDigest)) failures.push(`${site} hosted release binding liveDigest is malformed`);
    exact(evidence.liveDigest, evidence.rebuiltDigest, `${site} hosted release binding byte digest`);
  }
  return [...new Set(failures)];
}

export function validateHardClearanceProductionRevalidation(
  proof,
  {
    releaseSha,
    controlPlaneSha,
    liveEvidenceRunId,
    deploymentDoc,
    now = Date.now(),
    currentRunId = process.env.GITHUB_RUN_ID,
    currentRunAttempt = process.env.GITHUB_RUN_ATTEMPT,
  } = {},
) {
  const failures = [];
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return ['hard-clearance production revalidation proof is missing or malformed'];
  const exact = (actual, expected, label) => {
    if (String(actual ?? '') !== String(expected ?? '')) failures.push(`${label} mismatch`);
  };

  exact(proof.schemaVersion, 1, 'revalidation schemaVersion');
  exact(proof.status, 'passed', 'revalidation status');
  exact(proof.source, 'hard-clearance-production-revalidation', 'revalidation source');
  exact(proof.releaseCommitSha, releaseSha, 'revalidation releaseCommitSha');
  exact(proof.controlPlaneCommitSha, controlPlaneSha, 'revalidation controlPlaneCommitSha');
  exact(proof.controlPlaneScopeVerified, true, 'revalidation controlPlaneScopeVerified');
  exact(proof.repository, EXPECTED_REPOSITORY, 'revalidation repository');
  exact(proof.ref, EXPECTED_REF, 'revalidation ref');
  exact(proof.workflowRunId, String(currentRunId || ''), 'revalidation workflowRunId');
  exact(proof.liveEvidenceRunId, String(liveEvidenceRunId || ''), 'revalidation liveEvidenceRunId');
  exact(proof.e2eEnvironmentVerified, true, 'revalidation e2eEnvironmentVerified');
  exact(proof.appCheckConfigurationVerified, true, 'revalidation appCheckConfigurationVerified');
  exact(proof.hostedBundlesVerified, true, 'revalidation hostedBundlesVerified');
  exact(proof.hardLaunchClaim, false, 'revalidation hardLaunchClaim');

  const proofAttempt = Number(proof.workflowRunAttempt);
  const activeAttempt = Number(currentRunAttempt);
  if (!Number.isInteger(proofAttempt) || proofAttempt < 1) failures.push('revalidation workflowRunAttempt must be a positive integer');
  if (!Number.isInteger(activeAttempt) || activeAttempt < proofAttempt) failures.push('revalidation proof belongs to a later workflow attempt');

  const verifiedAt = Date.parse(text(proof.verifiedAt));
  if (!Number.isFinite(verifiedAt)) failures.push('revalidation verifiedAt must be a valid timestamp');
  else {
    if (verifiedAt > now + MAX_CLOCK_SKEW_MS) failures.push('revalidation verifiedAt is in the future');
    if (now - verifiedAt > MAX_REVALIDATION_AGE_MS) failures.push('revalidation proof is older than two hours');
  }

  if (!deploymentDoc || typeof deploymentDoc !== 'object') failures.push('original production deployment metadata is missing');
  else {
    for (const error of validateDeploymentDocument(deploymentDoc, releaseSha, { requireWorkflowProvenance: true })) {
      failures.push(`deployment: ${error}`);
    }
    for (const error of validateFunctionsDeploymentEvidence(deploymentDoc.functionsDeployment)) {
      failures.push(`deployment functions: ${error}`);
    }
    exact(proof.originalDeploymentRunId, String(deploymentDoc.workflowRunId || ''), 'revalidation originalDeploymentRunId');
  }

  for (const error of validateHostedReleaseBinding(proof.hostedReleaseBinding, { releaseSha, deploymentDoc })) {
    failures.push(`hosted release binding: ${error}`);
  }

  const evidenceOptions = {
    commitSha: releaseSha,
    repository: EXPECTED_REPOSITORY,
    ref: EXPECTED_REF,
    workflowRunId: String(currentRunId || ''),
    workflowRunAttempt: proofAttempt,
    now,
  };
  for (const error of validateFirebasePhoneAuthEvidence(proof.firebasePhoneAuth, evidenceOptions)) failures.push(`fresh phone auth: ${error}`);
  for (const error of validateAdminMfaEvidence(proof.adminMfa, evidenceOptions)) failures.push(`fresh admin MFA: ${error}`);
  for (const error of validateHostedClientConfigEvidence(proof.hostedClientConfig, evidenceOptions)) failures.push(`fresh hosted client: ${error}`);

  exact(proof.otpMailbox?.ok, true, 'OTP mailbox ok');
  exact(proof.otpMailbox?.mailboxesVerified, 2, 'OTP mailbox count');
  exact(proof.otpMailbox?.sentinelFullMessagesVerified, 2, 'OTP sentinel count');
  exact(proof.otpMailbox?.peppersVerified, 2, 'OTP pepper count');
  exact(proof.otpMailbox?.secretValuesLogged, false, 'OTP secretValuesLogged');
  exact(proof.otpMailbox?.hardLaunchClaim, false, 'OTP hardLaunchClaim');

  const forbidden = forbiddenProofKey(proof);
  if (forbidden) failures.push(`revalidation proof must not contain sensitive field ${forbidden}`);
  return [...new Set(failures)];
}

export async function generateHardClearanceProductionRevalidation({ root = process.cwd() } = {}) {
  assertWorkflowContext(GENERATE_JOB);
  if (text(process.env.CONTROL_PLANE_SCOPE_VERIFIED) !== 'true') {
    throw new Error('CONTROL_PLANE_SCOPE_VERIFIED=true is required');
  }
  const releaseSha = expectedReleaseSha(root);
  const controlPlaneSha = expectedControlPlaneSha();
  const liveEvidenceRunId = expectedLiveEvidenceRunId();
  const deploymentDoc = readJsonSafe(deploymentEvidencePath(root), null);
  const deploymentErrors = validateDeploymentDocument(deploymentDoc, releaseSha, { requireWorkflowProvenance: true });
  if (deploymentErrors.length) throw new Error(`original deployment provenance is invalid: ${deploymentErrors.join('; ')}`);
  const functionsErrors = validateFunctionsDeploymentEvidence(deploymentDoc.functionsDeployment);
  if (functionsErrors.length) throw new Error(`original Functions deployment evidence is invalid: ${functionsErrors.join('; ')}`);

  const enterpriseSiteKey = await resolveCanonicalAdminEnterpriseSiteKey();
  const revalidationEnv = {
    ...process.env,
    FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY: enterpriseSiteKey,
    REACT_APP_APP_CHECK_SITE_KEY: enterpriseSiteKey,
  };

  const e2eCheck = runNode(['scripts/verify-e2e-env.mjs'], revalidationEnv, root);
  if (!e2eCheck.ok) throw new Error(`fresh E2E environment verification failed: ${e2eCheck.stderr || e2eCheck.stdout}`);
  const appCheck = runNode(['scripts/ensure-appcheck.mjs'], revalidationEnv, root);
  if (!appCheck.ok) throw new Error(`fresh App Check configuration verification failed: ${appCheck.stderr || appCheck.stdout}`);

  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1);
  const evidenceEnv = {
    ...revalidationEnv,
    GITHUB_SHA: releaseSha,
    GITHUB_REPOSITORY: EXPECTED_REPOSITORY,
    GITHUB_REF: EXPECTED_REF,
    GITHUB_RUN_ID: text(process.env.GITHUB_RUN_ID),
    GITHUB_RUN_ATTEMPT: String(runAttempt),
  };
  const hosted = await verifyHostedReleaseBinding({
    root,
    releaseSha,
    deploymentDoc,
    env: revalidationEnv,
  });
  const [otpMailbox, firebasePhoneAuth, adminMfa, hostedClientConfig] = await Promise.all([
    runProductionOtpMailboxPreflight({ env: revalidationEnv }),
    verifyFirebasePhoneAuthProduction({ env: evidenceEnv }),
    verifyAdminMfaProduction({ env: evidenceEnv }),
    freshHostedClientEvidence(releaseSha, runAttempt, hosted.hostedBundles, revalidationEnv),
  ]);

  const proof = {
    schemaVersion: 1,
    status: 'passed',
    source: 'hard-clearance-production-revalidation',
    releaseCommitSha: releaseSha,
    controlPlaneCommitSha: controlPlaneSha,
    controlPlaneScopeVerified: true,
    repository: EXPECTED_REPOSITORY,
    ref: EXPECTED_REF,
    workflowRunId: text(process.env.GITHUB_RUN_ID),
    workflowRunAttempt: runAttempt,
    liveEvidenceRunId,
    originalDeploymentRunId: String(deploymentDoc.workflowRunId || ''),
    verifiedAt: new Date().toISOString(),
    e2eEnvironmentVerified: true,
    appCheckConfigurationVerified: true,
    hostedBundlesVerified: true,
    hostedReleaseBinding: hosted.binding,
    otpMailbox,
    firebasePhoneAuth,
    adminMfa,
    hostedClientConfig,
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };

  const errors = validateHardClearanceProductionRevalidation(proof, {
    releaseSha,
    controlPlaneSha,
    liveEvidenceRunId,
    deploymentDoc,
    currentRunId: process.env.GITHUB_RUN_ID,
    currentRunAttempt: process.env.GITHUB_RUN_ATTEMPT,
  });
  if (errors.length) throw new Error(`fresh production revalidation is not launch-safe: ${errors.join('; ')}`);

  const output = revalidationPath(root);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`[hard-clearance-revalidation] PASS — release=${releaseSha} control_plane=${controlPlaneSha}`);
  console.log(`[hard-clearance-revalidation] wrote ${output}`);
  return proof;
}

export function verifyHardClearanceProductionRevalidation({ root = process.cwd() } = {}) {
  assertWorkflowContext(VERIFY_JOB);
  const releaseSha = expectedReleaseSha(root);
  const controlPlaneSha = expectedControlPlaneSha();
  const liveEvidenceRunId = expectedLiveEvidenceRunId();
  const deploymentDoc = readJsonSafe(deploymentEvidencePath(root), null);
  const proof = readJsonSafe(revalidationPath(root), null);
  const errors = validateHardClearanceProductionRevalidation(proof, {
    releaseSha,
    controlPlaneSha,
    liveEvidenceRunId,
    deploymentDoc,
    currentRunId: process.env.GITHUB_RUN_ID,
    currentRunAttempt: process.env.GITHUB_RUN_ATTEMPT,
  });
  if (errors.length) {
    console.error('[hard-clearance-revalidation] NO-GO');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`[hard-clearance-revalidation] PASS — fresh production state verified for ${releaseSha}`);
  return true;
}

const directPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (directPath && directPath === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--generate')) await generateHardClearanceProductionRevalidation();
    else if (process.argv.includes('--verify')) verifyHardClearanceProductionRevalidation();
    else throw new Error('Use --generate or --verify');
  } catch (error) {
    console.error(`[hard-clearance-revalidation] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
