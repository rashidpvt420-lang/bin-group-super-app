/**
 * Single source of truth for the Firebase Production Deploy artifact names that
 * the Command Center backfill may consume.
 *
 * `.github/workflows/firebase-production-deploy.yml` uploads exactly
 * `production-deployment-${{ github.sha }}` (canonical, unsuffixed). Older
 * deploy runs used `production-deployment-<sha>-<runId>` (legacy). Both names
 * are bound to the exact release SHA; the legacy form is additionally bound to
 * the exact run ID. Nothing else is accepted.
 *
 * Name acceptance never replaces the other fail-closed controls: the caller must
 * still prove exactly one non-expired artifact on the exact successful
 * workflow_dispatch Firebase Production Deploy run on main, a sha256 digest, and
 * an exact head SHA / run ID binding.
 */

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RUN_ID_PATTERN = /^[1-9][0-9]*$/;

export function productionDeploymentArtifactNames(releaseSha, workflowRunId) {
  const sha = String(releaseSha ?? '');
  const runId = String(workflowRunId ?? '');
  if (!SHA_PATTERN.test(sha)) {
    throw new Error('production deployment artifact binding requires a full lowercase 40-character SHA');
  }
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error('production deployment artifact binding requires a numeric workflow run ID');
  }
  return Object.freeze({
    canonical: `production-deployment-${sha}`,
    legacy: `production-deployment-${sha}-${runId}`,
  });
}

export function isAcceptedProductionDeploymentArtifactName(artifactName, releaseSha, workflowRunId) {
  let names;
  try {
    names = productionDeploymentArtifactNames(releaseSha, workflowRunId);
  } catch {
    return false;
  }
  const value = String(artifactName ?? '');
  return value === names.canonical || value === names.legacy;
}
