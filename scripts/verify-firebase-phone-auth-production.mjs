#!/usr/bin/env node

import admin from 'firebase-admin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_PROJECT_NUMBER = '123413252227';
const DEFAULT_REQUIRED_DOMAINS = Object.freeze([
  'bin-group-57c60.web.app',
  'bin-group-57c60.firebaseapp.com',
]);
const DEFAULT_REQUIRED_SMS_REGION = 'AE';
const EVIDENCE_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const MAX_CLOCK_SKEW_MS = 1000 * 60 * 5;

function normalizedList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function expectedConfigResourceNames(projectId, projectNumber) {
  return new Set([
    `projects/${projectId}/config`,
    `projects/${projectNumber}/config`,
  ]);
}

export function validateFirebasePhoneAuthConfig(
  config,
  {
    projectId = EXPECTED_PROJECT_ID,
    projectNumber = EXPECTED_PROJECT_NUMBER,
    requiredDomains = DEFAULT_REQUIRED_DOMAINS,
    requiredSmsRegion = DEFAULT_REQUIRED_SMS_REGION,
  } = {},
) {
  const failures = [];
  const normalizedProjectId = String(projectId || '').trim();
  const normalizedProjectNumber = String(projectNumber || '').trim();
  const requiredRegion = String(requiredSmsRegion || '').trim().toUpperCase();
  const domains = new Set(normalizedList(config?.authorizedDomains).map((domain) => domain.toLowerCase()));
  const missingDomains = normalizedList(requiredDomains)
    .map((domain) => domain.toLowerCase())
    .filter((domain) => !domains.has(domain));

  if (normalizedProjectId !== EXPECTED_PROJECT_ID) {
    failures.push(`project must be ${EXPECTED_PROJECT_ID}`);
  }
  if (normalizedProjectNumber !== EXPECTED_PROJECT_NUMBER) {
    failures.push(`project number must be ${EXPECTED_PROJECT_NUMBER}`);
  }
  const configResourceName = String(config?.name || '').trim();
  if (!expectedConfigResourceNames(normalizedProjectId, normalizedProjectNumber).has(configResourceName)) {
    failures.push('Identity Toolkit config resource does not match the production project');
  }
  if (config?.signIn?.phoneNumber?.enabled !== true) {
    failures.push('Firebase Authentication Phone provider is not enabled');
  }
  if (missingDomains.length) {
    failures.push(`missing authorized domain(s): ${missingDomains.join(', ')}`);
  }

  const allowedRegions = normalizedList(config?.smsRegionConfig?.allowlistOnly?.allowedRegions)
    .map((region) => region.toUpperCase());
  if (!config?.smsRegionConfig?.allowlistOnly || allowedRegions.length === 0) {
    failures.push('SMS region policy must use an explicit allowlist-only policy');
  } else if (!allowedRegions.includes(requiredRegion)) {
    failures.push(`SMS region allowlist does not include ${requiredRegion}`);
  }

  const testPhoneNumberCount = config?.signIn?.phoneNumber?.testPhoneNumbers
    && typeof config.signIn.phoneNumber.testPhoneNumbers === 'object'
    ? Object.keys(config.signIn.phoneNumber.testPhoneNumbers).length
    : 0;

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      projectId: normalizedProjectId,
      phoneProviderEnabled: config?.signIn?.phoneNumber?.enabled === true,
      requiredDomainsPresent: missingDomains.length === 0,
      authorizedDomainCount: domains.size,
      smsPolicy: config?.smsRegionConfig?.allowlistOnly ? 'allowlist-only' : 'missing-or-not-allowlist',
      requiredSmsRegion: requiredRegion,
      requiredSmsRegionAllowed: allowedRegions.includes(requiredRegion),
      allowedRegionCount: allowedRegions.length,
      testPhoneNumberCount,
    },
  };
}

export function buildFirebasePhoneAuthEvidence(summary, {
  env = process.env,
  now = new Date(),
} = {}) {
  return {
    schemaVersion: 1,
    status: 'passed',
    source: 'identity-toolkit-admin-v2',
    projectId: String(summary?.projectId || '').trim(),
    commitSha: String(env.GITHUB_SHA || '').trim() || null,
    repository: String(env.GITHUB_REPOSITORY || '').trim() || null,
    ref: String(env.GITHUB_REF || '').trim() || null,
    workflowRunId: String(env.GITHUB_RUN_ID || '').trim() || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    phoneProviderEnabled: summary?.phoneProviderEnabled === true,
    requiredDomainsPresent: summary?.requiredDomainsPresent === true,
    authorizedDomainCount: Number(summary?.authorizedDomainCount || 0),
    smsPolicy: String(summary?.smsPolicy || ''),
    requiredSmsRegion: String(summary?.requiredSmsRegion || '').toUpperCase(),
    requiredSmsRegionAllowed: summary?.requiredSmsRegionAllowed === true,
    allowedRegionCount: Number(summary?.allowedRegionCount || 0),
    testPhoneNumberCount: Number(summary?.testPhoneNumberCount || 0),
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };
}

export function validateFirebasePhoneAuthEvidence(evidence, {
  commitSha,
  repository,
  ref,
  workflowRunId,
  workflowRunAttempt,
  now = Date.now(),
  maxAgeMs = EVIDENCE_MAX_AGE_MS,
} = {}) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return ['Firebase Phone Auth deployment evidence is missing.'];
  }

  const requireExact = (actual, expected, label) => {
    if (String(actual ?? '') !== String(expected ?? '')) failures.push(`${label} mismatch.`);
  };
  requireExact(evidence.schemaVersion, 1, 'Phone Auth evidence schemaVersion');
  requireExact(evidence.status, 'passed', 'Phone Auth evidence status');
  requireExact(evidence.source, 'identity-toolkit-admin-v2', 'Phone Auth evidence source');
  requireExact(evidence.projectId, EXPECTED_PROJECT_ID, 'Phone Auth evidence projectId');
  requireExact(evidence.commitSha, commitSha, 'Phone Auth evidence commitSha');
  requireExact(evidence.repository, repository, 'Phone Auth evidence repository');
  requireExact(evidence.ref, ref, 'Phone Auth evidence ref');
  requireExact(evidence.workflowRunId, workflowRunId, 'Phone Auth evidence workflowRunId');
  requireExact(evidence.workflowRunAttempt, workflowRunAttempt, 'Phone Auth evidence workflowRunAttempt');
  requireExact(evidence.phoneProviderEnabled, true, 'Phone Auth provider enabled');
  requireExact(evidence.requiredDomainsPresent, true, 'Phone Auth required domains');
  requireExact(evidence.smsPolicy, 'allowlist-only', 'Phone Auth SMS policy');
  requireExact(evidence.requiredSmsRegion, DEFAULT_REQUIRED_SMS_REGION, 'Phone Auth required SMS region');
  requireExact(evidence.requiredSmsRegionAllowed, true, 'Phone Auth required SMS region allowed');
  requireExact(evidence.sensitiveValuesExcluded, true, 'Phone Auth sensitiveValuesExcluded');
  requireExact(evidence.hardLaunchClaim, false, 'Phone Auth hardLaunchClaim');

  for (const key of ['authorizedDomainCount', 'allowedRegionCount', 'testPhoneNumberCount']) {
    if (!Number.isInteger(evidence[key]) || evidence[key] < 0) {
      failures.push(`Phone Auth evidence ${key} must be a non-negative integer.`);
    }
  }

  const verifiedAt = Date.parse(String(evidence.verifiedAt || ''));
  if (!Number.isFinite(verifiedAt)) {
    failures.push('Phone Auth evidence verifiedAt must be a valid ISO timestamp.');
  } else {
    if (verifiedAt > now + MAX_CLOCK_SKEW_MS) failures.push('Phone Auth evidence verifiedAt is in the future.');
    if (now - verifiedAt > maxAgeMs) failures.push('Phone Auth evidence verifiedAt is stale.');
  }

  for (const forbidden of ['accessToken', 'authorization', 'phoneNumber', 'phoneNumbers', 'testPhoneNumbers', 'verificationCode', 'smsCode']) {
    if (Object.prototype.hasOwnProperty.call(evidence, forbidden)) {
      failures.push(`Phone Auth evidence must not contain ${forbidden}.`);
    }
  }
  return failures;
}

export async function fetchFirebasePhoneAuthConfig({ projectId = EXPECTED_PROJECT_ID } = {}) {
  const app = initializeFirebaseAdmin(admin, projectId);
  const credential = app.options.credential || admin.credential.applicationDefault();
  const accessToken = await credential.getAccessToken();
  const token = String(accessToken?.access_token || '').trim();
  if (!token) throw new Error('Application Default Credentials did not return an access token.');

  const endpoint = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Identity Toolkit config lookup failed with HTTP ${response.status}.`);
  }
  return response.json();
}

export async function verifyFirebasePhoneAuthProduction({
  projectId = resolveFirebaseAdminProjectId(),
  requiredDomains = process.env.FIREBASE_PHONE_AUTH_REQUIRED_DOMAINS || DEFAULT_REQUIRED_DOMAINS,
  requiredSmsRegion = process.env.FIREBASE_PHONE_AUTH_REQUIRED_SMS_REGION || DEFAULT_REQUIRED_SMS_REGION,
  configFetcher = fetchFirebasePhoneAuthConfig,
  env = process.env,
  now = new Date(),
} = {}) {
  if (String(projectId || '').trim() !== EXPECTED_PROJECT_ID) {
    throw new Error(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  }

  const config = await configFetcher({ projectId: EXPECTED_PROJECT_ID });
  const result = validateFirebasePhoneAuthConfig(config, {
    projectId: EXPECTED_PROJECT_ID,
    projectNumber: EXPECTED_PROJECT_NUMBER,
    requiredDomains,
    requiredSmsRegion,
  });
  if (!result.ok) {
    throw new Error(`Firebase Phone Auth production configuration is not launch-safe: ${result.failures.join('; ')}`);
  }

  const summary = result.summary;
  const evidence = buildFirebasePhoneAuthEvidence(summary, { env, now });
  console.log(
    '[firebase-phone-auth] production preflight passed '
      + `provider=${summary.phoneProviderEnabled ? 'enabled' : 'disabled'} `
      + `domains=${summary.authorizedDomainCount} `
      + `sms_policy=${summary.smsPolicy} `
      + `region_${summary.requiredSmsRegion}=${summary.requiredSmsRegionAllowed ? 'allowed' : 'blocked'} `
      + `test_numbers=${summary.testPhoneNumberCount}`,
  );
  return evidence;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  verifyFirebasePhoneAuthProduction().catch((error) => {
    const message = error instanceof Error ? error.message : 'Firebase Phone Auth production preflight failed.';
    console.error(`[firebase-phone-auth] ${message}`);
    process.exit(1);
  });
}
