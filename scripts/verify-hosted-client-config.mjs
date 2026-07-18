#!/usr/bin/env node

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EVIDENCE_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const MAX_CLOCK_SKEW_MS = 1000 * 60 * 5;

const text = (value) => String(value ?? '').trim();

const MAIN_REQUIRED_FLAGS = Object.freeze([
  'projectIdMatched',
  'authDomainMatched',
  'storageBucketMatched',
  'firebaseApiKeyMatched',
  'firebaseAppIdMatched',
  'messagingSenderIdMatched',
  'appCheckSiteKeyMatched',
  'mapsApiKeyMatched',
  'vapidKeyMatched',
]);

const ADMIN_REQUIRED_FLAGS = Object.freeze([
  'projectIdMatched',
  'authDomainMatched',
  'storageBucketMatched',
  'firebaseApiKeyMatched',
  'firebaseAppIdMatched',
  'messagingSenderIdMatched',
  'appCheckSiteKeyMatched',
]);

function containsAny(texts, value) {
  const expected = text(value);
  return Boolean(expected) && texts.some((source) => String(source || '').includes(expected));
}

export function summarizeHostedClientBundle({
  texts = [],
  assetCount = 0,
  site,
  env = process.env,
} = {}) {
  const sources = Array.isArray(texts) ? texts : [];
  const summary = {
    assetCount: Number.isInteger(assetCount) && assetCount >= 0 ? assetCount : 0,
    projectIdMatched: containsAny(sources, EXPECTED_PROJECT_ID),
    authDomainMatched: containsAny(sources, 'bin-group-57c60.firebaseapp.com'),
    storageBucketMatched:
      containsAny(sources, 'bin-group-57c60.firebasestorage.app') ||
      containsAny(sources, 'bin-group-57c60.appspot.com'),
    firebaseApiKeyMatched: containsAny(sources, env.VITE_FIREBASE_API_KEY),
    firebaseAppIdMatched: containsAny(sources, env.VITE_FIREBASE_APP_ID),
    messagingSenderIdMatched: containsAny(sources, env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appCheckSiteKeyMatched: containsAny(sources, env.VITE_APP_CHECK_SITE_KEY),
    mapsApiKeyMatched: containsAny(sources, env.VITE_GOOGLE_MAPS_API_KEY),
    vapidKeyMatched: containsAny(sources, env.VITE_FIREBASE_VAPID_KEY),
  };
  const requiredFlags = site === 'admin' ? ADMIN_REQUIRED_FLAGS : MAIN_REQUIRED_FLAGS;
  return {
    ...summary,
    allRequiredMatched:
      summary.assetCount > 0 && requiredFlags.every((key) => summary[key] === true),
  };
}

export function buildHostedClientConfigEvidence({ main, admin }, {
  env = process.env,
  now = new Date(),
} = {}) {
  return {
    schemaVersion: 1,
    status: main?.allRequiredMatched === true && admin?.allRequiredMatched === true ? 'passed' : 'failed',
    source: 'live-hosted-bundle-scan',
    projectId: EXPECTED_PROJECT_ID,
    commitSha: text(env.GITHUB_SHA) || null,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    main: {
      assetCount: Number(main?.assetCount || 0),
      ...Object.fromEntries(MAIN_REQUIRED_FLAGS.map((key) => [key, main?.[key] === true])),
      allRequiredMatched: main?.allRequiredMatched === true,
    },
    admin: {
      assetCount: Number(admin?.assetCount || 0),
      ...Object.fromEntries(ADMIN_REQUIRED_FLAGS.map((key) => [key, admin?.[key] === true])),
      allRequiredMatched: admin?.allRequiredMatched === true,
    },
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };
}

function requireExact(actual, expected, label, failures) {
  if (String(actual ?? '') !== String(expected ?? '')) failures.push(`${label} mismatch.`);
}

function validateSite(siteEvidence, flags, label, failures) {
  if (!siteEvidence || typeof siteEvidence !== 'object' || Array.isArray(siteEvidence)) {
    failures.push(`${label} hosted client evidence is missing.`);
    return;
  }
  if (!Number.isInteger(siteEvidence.assetCount) || siteEvidence.assetCount <= 0) {
    failures.push(`${label} hosted client evidence assetCount must be a positive integer.`);
  }
  for (const flag of flags) requireExact(siteEvidence[flag], true, `${label} ${flag}`, failures);
  requireExact(siteEvidence.allRequiredMatched, true, `${label} allRequiredMatched`, failures);
}

export function validateHostedClientConfigEvidence(evidence, {
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
    return ['Hosted client configuration deployment evidence is missing.'];
  }
  requireExact(evidence.schemaVersion, 1, 'Hosted client evidence schemaVersion', failures);
  requireExact(evidence.status, 'passed', 'Hosted client evidence status', failures);
  requireExact(evidence.source, 'live-hosted-bundle-scan', 'Hosted client evidence source', failures);
  requireExact(evidence.projectId, EXPECTED_PROJECT_ID, 'Hosted client evidence projectId', failures);
  requireExact(evidence.commitSha, commitSha, 'Hosted client evidence commitSha', failures);
  requireExact(evidence.repository, repository, 'Hosted client evidence repository', failures);
  requireExact(evidence.ref, ref, 'Hosted client evidence ref', failures);
  requireExact(evidence.workflowRunId, workflowRunId, 'Hosted client evidence workflowRunId', failures);
  requireExact(evidence.workflowRunAttempt, workflowRunAttempt, 'Hosted client evidence workflowRunAttempt', failures);
  requireExact(evidence.sensitiveValuesExcluded, true, 'Hosted client evidence sensitiveValuesExcluded', failures);
  requireExact(evidence.hardLaunchClaim, false, 'Hosted client evidence hardLaunchClaim', failures);
  validateSite(evidence.main, MAIN_REQUIRED_FLAGS, 'main', failures);
  validateSite(evidence.admin, ADMIN_REQUIRED_FLAGS, 'admin', failures);

  const verifiedAt = Date.parse(text(evidence.verifiedAt));
  if (!Number.isFinite(verifiedAt)) {
    failures.push('Hosted client evidence verifiedAt must be a valid ISO timestamp.');
  } else {
    if (verifiedAt > now + MAX_CLOCK_SKEW_MS) failures.push('Hosted client evidence verifiedAt is in the future.');
    if (now - verifiedAt > maxAgeMs) failures.push('Hosted client evidence verifiedAt is stale.');
  }

  for (const forbidden of [
    'firebaseApiKey',
    'googleMapsApiKey',
    'vapidKey',
    'appCheckSiteKey',
    'apiKey',
    'secret',
    'token',
  ]) {
    if (Object.prototype.hasOwnProperty.call(evidence, forbidden)) {
      failures.push(`Hosted client evidence must not contain ${forbidden}.`);
    }
  }
  return failures;
}

export const HOSTED_CLIENT_REQUIRED_FLAGS = Object.freeze({
  main: MAIN_REQUIRED_FLAGS,
  admin: ADMIN_REQUIRED_FLAGS,
});
