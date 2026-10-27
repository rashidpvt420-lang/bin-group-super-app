/**
 * Frozen-release / control-plane binding for postdeploy public-release gates.
 *
 * Public deploys may run on a reviewed control-plane commit (GITHUB_SHA) while
 * the hard-clearance evidence (pilot incident report, operational readiness)
 * was produced for a separately frozen release SHA. When FROZEN_RELEASE_SHA is
 * supplied, those documents must be bound to the frozen release AND to the
 * current control plane:
 *   - the frozen SHA must be a full lowercase SHA;
 *   - the hard-clearance production revalidation proof must pin
 *     releaseCommitSha === FROZEN_RELEASE_SHA and
 *     controlPlaneCommitSha === GITHUB_SHA with controlPlaneScopeVerified;
 *   - each document's githubRunId must equal HARD_CLEARANCE_RUN_ID (that run's
 *     head_sha is verified === GITHUB_SHA by the workflow before this runs).
 * Without FROZEN_RELEASE_SHA, callers keep their exact legacy behaviour.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SHA_RE = /^[0-9a-f]{40}$/;

export function frozenReleaseShaFromEnv(env = process.env) {
  const raw = env.FROZEN_RELEASE_SHA;
  if (raw === undefined || raw === null || String(raw) === '') return null;
  return String(raw);
}

function readRevalidationProof(root, directory, errors) {
  const dir = path.resolve(root, directory);
  const candidates = [
    path.join(dir, 'hard-clearance-production-revalidation.json'),
    path.join(dir, 'launch_package', 'hard-clearance-production-revalidation.json'),
  ].filter((candidate) => existsSync(candidate));
  if (candidates.length === 0) {
    errors.push('frozen release: hard-clearance-production-revalidation.json is missing');
    return null;
  }
  if (candidates.length > 1) {
    errors.push('frozen release: duplicate hard-clearance production revalidation proofs');
    return null;
  }
  try {
    return JSON.parse(readFileSync(candidates[0], 'utf8'));
  } catch (error) {
    errors.push(`frozen release: hard-clearance production revalidation proof is malformed: ${error.message}`);
    return null;
  }
}

/**
 * Validates the frozen-release context. Returns { frozenSha, runId, errors }.
 * Only call when frozenReleaseShaFromEnv(env) is non-null.
 */
export function verifyFrozenReleaseContext({ env = process.env, root = process.cwd() } = {}) {
  const errors = [];
  const frozenSha = String(env.FROZEN_RELEASE_SHA || '');
  const controlSha = String(env.CLEARANCE_CONTROL_PLANE_SHA || env.GITHUB_SHA || '');
  const runId = String(env.HARD_CLEARANCE_RUN_ID || '');
  const directory = String(env.HARD_CLEARANCE_DIRECTORY || '');
  if (!SHA_RE.test(frozenSha)) errors.push('FROZEN_RELEASE_SHA must be a full lowercase 40-character SHA');
  if (!SHA_RE.test(controlSha)) errors.push('GITHUB_SHA must be a full lowercase 40-character SHA');
  if (!/^\d+$/.test(runId)) errors.push('HARD_CLEARANCE_RUN_ID must be numeric when FROZEN_RELEASE_SHA is set');
  if (!directory) {
    errors.push('HARD_CLEARANCE_DIRECTORY is required when FROZEN_RELEASE_SHA is set');
  } else {
    const proof = readRevalidationProof(root, directory, errors);
    if (proof) {
      if (proof.releaseCommitSha !== frozenSha) {
        errors.push('frozen release SHA does not equal the verified hard-clearance releaseCommitSha');
      }
      if (proof.controlPlaneCommitSha !== controlSha) {
        errors.push('hard-clearance controlPlaneCommitSha does not equal GITHUB_SHA');
      }
      if (proof.controlPlaneScopeVerified !== true) {
        errors.push('hard-clearance controlPlaneScopeVerified must be true');
      }
    }
  }
  return { frozenSha, controlSha, runId, errors };
}

/** Control-plane binding shared by every frozen-release document. */
export function frozenDocumentBindingErrors(doc, label, context) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return [`${label} missing or malformed`];
  if (String(doc.githubRunId || '') !== context.runId) {
    errors.push(`${label} githubRunId must equal the verified HARD_CLEARANCE_RUN_ID`);
  }
  return errors;
}
