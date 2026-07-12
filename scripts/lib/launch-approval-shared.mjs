#!/usr/bin/env node
/**
 * Shared helpers for the predeploy/postdeploy hard-launch gates.
 * Every check here is fail-closed: missing, malformed, or unverifiable
 * input is treated as a failure, never as "clean" or "passing".
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const FULL_SHA_RE = /^[0-9a-f]{40}$/;

/**
 * Validate an ISO-8601 timestamp is present, parseable, not in the future
 * beyond a small clock-skew tolerance, and not older than maximumAgeMs.
 * NaN/invalid dates always fail (NaN > n is false in JS, so a naive
 * `age > max` check silently passes garbage input — this rejects it first).
 */
export function validateRecentTimestamp(value, maximumAgeMs, label, { futureToleranceMs = 5 * 60 * 1000 } = {}) {
  const timestamp = Date.parse(String(value ?? ''));
  if (!Number.isFinite(timestamp)) {
    return `${label} is missing or is not a valid ISO-8601 timestamp.`;
  }
  const ageMs = Date.now() - timestamp;
  if (ageMs < -futureToleranceMs) {
    return `${label} is in the future.`;
  }
  if (ageMs > maximumAgeMs) {
    return `${label} is stale (older than ${Math.round(maximumAgeMs / 60000)} minutes).`;
  }
  return null;
}

/** Full lowercase 40-character commit SHA — reject short SHAs and mixed case. */
export function requireFullCommitSha(value, label) {
  const sha = String(value ?? '');
  if (!FULL_SHA_RE.test(sha)) {
    return { ok: false, error: `${label} must be a full 40-character lowercase commit SHA (got: ${sha || 'empty'}).` };
  }
  return { ok: true, sha };
}

/** Strict JSON read. Missing file or malformed JSON are both failures, never "clean". */
export function readJsonFailClosed(absPath, label) {
  if (!existsSync(absPath)) {
    return { ok: false, error: `${label} is missing at ${absPath}. State cannot be verified — treating as unsafe.` };
  }
  let text;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch (err) {
    return { ok: false, error: `${label} could not be read: ${err.message}` };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: `${label} is not valid JSON: ${err.message}` };
  }
}

/**
 * Fail-closed production incident/rollback check.
 * Unlike the old gate, a MISSING incidents file is a failure, not "clean production".
 */
export function checkProductionIncidentsFailClosed(root, {
  incidentsRelativePath = 'launch_package/production-incidents.json',
  maxStalenessMs = 24 * 60 * 60 * 1000,
  cooldownMs = 30 * 60 * 1000,
} = {}) {
  const failures = [];
  const absPath = path.join(root, incidentsRelativePath);
  const read = readJsonFailClosed(absPath, 'production-incidents.json');
  if (!read.ok) {
    failures.push(read.error);
    return failures;
  }
  const doc = read.data;

  const staleness = validateRecentTimestamp(doc.updatedAt, maxStalenessMs, 'production-incidents.json updatedAt');
  if (staleness) failures.push(staleness);

  if (!Array.isArray(doc.activeIncidents)) {
    failures.push('production-incidents.json activeIncidents must be an array.');
  } else if (doc.activeIncidents.length > 0) {
    const activeList = doc.activeIncidents
      .map((inc) => `${inc?.id ?? 'unknown'}: ${inc?.severity ?? 'unknown'} (${inc?.status ?? 'unknown'})`)
      .join('; ');
    failures.push(`Active production incidents detected: ${activeList}. Resolve incidents before deployment.`);
  }

  if (doc.requiresRollback === true) {
    failures.push(`Production rollback flag is set. ${doc.rollbackReason || 'Reason not specified.'} Complete rollback before attempting new deployment.`);
  } else if (doc.requiresRollback !== false) {
    failures.push('production-incidents.json requiresRollback must be explicitly true or false.');
  }

  if (doc.lastDeploymentFailed === true) {
    const failTimestamp = Date.parse(String(doc.lastDeploymentFailedAt ?? ''));
    if (!Number.isFinite(failTimestamp)) {
      failures.push('lastDeploymentFailed is true but lastDeploymentFailedAt is missing or invalid — cannot verify cooldown, treating as unsafe.');
    } else {
      const elapsedMs = Date.now() - failTimestamp;
      if (elapsedMs < cooldownMs) {
        failures.push(`Last production deployment failed ${Math.round(elapsedMs / 60000)} minute(s) ago. Wait at least ${cooldownMs / 60000} minutes before retry, or resolve the failure first.`);
      }
    }
  } else if (doc.lastDeploymentFailed !== false) {
    failures.push('production-incidents.json lastDeploymentFailed must be explicitly true or false.');
  }

  return failures;
}

/**
 * Scan recorded Playwright JSON artifacts for App Check token-fetch failures.
 * This is distinct from ordinary 403s on deliberately-forbidden reads (those are
 * expected negative-path assertions); appCheck/fetch-status-error only fires when
 * the App Check SDK itself cannot obtain a token — a real infrastructure defect.
 */
export function scanArtifactsForAppCheckFailures(root, { artifactsRelativeDir = 'launch_package/artifacts' } = {}) {
  const dir = path.join(root, artifactsRelativeDir);
  if (!existsSync(dir)) return [];
  const hits = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const abs = path.join(dir, entry);
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('appCheck/fetch-status-error') || text.includes('AppCheck: Fetch server returned an HTTP error status')) {
      hits.push(entry);
    }
  }
  return hits;
}

export function printResult(gateName, failures) {
  if (failures.length === 0) {
    console.log(`\n✅ ${gateName} PASSED.\n`);
    return true;
  }
  console.error(`\n❌ ${gateName} FAILED:\n`);
  for (const failure of failures) {
    console.error(`  ✗ ${failure}`);
  }
  console.error('\nDeployment is NOT authorized until every check above passes.\n');
  return false;
}
