export const MIN_CONTROLLED_PILOT_MS = 24 * 60 * 60 * 1000;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const EXPECTED_LIVE_EVIDENCE_WORKFLOW = 'Live Role Smoke Tests';
export const EXPECTED_LIVE_EVIDENCE_WORKFLOW_PATH = '.github/workflows/live-role-smoke.yml';

function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeRepository(run) {
  return String(run?.repository?.full_name || run?.head_repository?.full_name || '').trim();
}

export function validateLiveEvidenceRun(run, {
  expectedSha,
  expectedControlPlaneSha = expectedSha,
  expectedRepository = 'rashidpvt420-lang/bin-group-super-app',
  now = Date.now(),
} = {}) {
  const errors = [];
  const runId = String(run?.id || '').trim();
  const sha = String(expectedSha || '').trim();
  const controlPlaneSha = String(expectedControlPlaneSha || '').trim();
  const repository = normalizeRepository(run);
  const completedAtMs = parseTimestamp(run?.updated_at || run?.run_started_at);
  const runUrl = String(run?.html_url || '').trim();

  if (!/^\d+$/.test(runId)) errors.push('live evidence run ID must be numeric');
  if (!/^[0-9a-f]{40}$/.test(sha)) errors.push('expected SHA must be a lowercase 40-character commit SHA');
  if (!/^[0-9a-f]{40}$/.test(controlPlaneSha)) errors.push('expected control-plane SHA must be a lowercase 40-character commit SHA');
  if (run?.name !== EXPECTED_LIVE_EVIDENCE_WORKFLOW) errors.push('live evidence workflow name mismatch');
  if (run?.path !== EXPECTED_LIVE_EVIDENCE_WORKFLOW_PATH) errors.push('live evidence workflow path mismatch');
  if (run?.event !== 'workflow_dispatch') errors.push('live evidence must come from workflow_dispatch');
  if (run?.head_branch !== 'main') errors.push('live evidence must come from main');
  if (run?.head_sha !== controlPlaneSha) errors.push('live evidence run SHA must equal the exact control-plane SHA');
  if (run?.status !== 'completed') errors.push('live evidence run must be completed');
  if (run?.conclusion !== 'success') errors.push('live evidence run must conclude successfully');
  if (repository && repository !== expectedRepository) errors.push('live evidence repository mismatch');
  if (!/^https:\/\/github\.com\/rashidpvt420-lang\/bin-group-super-app\/actions\/runs\/\d+\/?$/.test(runUrl)) {
    errors.push('live evidence run URL must target the protected repository');
  }
  if (!Number.isFinite(completedAtMs)) {
    errors.push('live evidence run must expose a valid completion timestamp');
  } else {
    if (completedAtMs > now + MAX_CLOCK_SKEW_MS) errors.push('live evidence completion cannot be in the future');
    if (now - completedAtMs < MIN_CONTROLLED_PILOT_MS) errors.push('controlled pilot has not completed 24 hours');
  }

  const pilotStartedAt = Number.isFinite(completedAtMs) ? new Date(completedAtMs).toISOString() : '';
  const pilotCompletedAt = Number.isFinite(now) ? new Date(now).toISOString() : '';

  return {
    errors: [...new Set(errors)],
    runId,
    runUrl,
    commitSha: sha,
    controlPlaneCommitSha: controlPlaneSha,
    repository: repository || expectedRepository,
    pilotStartedAt,
    pilotCompletedAt,
    durationMs: Number.isFinite(completedAtMs) && Number.isFinite(now) ? now - completedAtMs : NaN,
  };
}

export function validateLiveEvidenceArtifactBinding(artifact, {
  expectedReleaseSha,
  expectedControlPlaneSha,
  expectedRunId,
  expectedProductionDeployRunId,
  expectedRunAttempt = 1,
} = {}) {
  const errors = [];
  const releaseSha = String(expectedReleaseSha || '').trim();
  const controlPlaneSha = String(expectedControlPlaneSha || '').trim();
  const runId = String(expectedRunId || '').trim();
  const deployRunId = String(expectedProductionDeployRunId || '').trim();

  if (!/^[0-9a-f]{40}$/.test(releaseSha)) errors.push('expected release SHA must be a lowercase 40-character commit SHA');
  if (!/^[0-9a-f]{40}$/.test(controlPlaneSha)) errors.push('expected control-plane SHA must be a lowercase 40-character commit SHA');
  if (!/^\d+$/.test(runId)) errors.push('expected live-evidence run ID must be numeric');
  if (!/^\d+$/.test(deployRunId)) errors.push('expected production deployment run ID must be numeric');
  if (artifact?.schemaVersion !== 1) errors.push('live-evidence artifact binding schema version mismatch');
  if (artifact?.source !== 'github-actions-live-evidence-run') errors.push('live-evidence artifact binding source mismatch');
  if (artifact?.releaseCommitSha !== releaseSha) errors.push('live-evidence artifact release SHA mismatch');
  if (artifact?.controlPlaneCommitSha !== controlPlaneSha) errors.push('live-evidence artifact control-plane SHA mismatch');
  if (String(artifact?.liveEvidenceRunId || '') !== runId) errors.push('live-evidence artifact run ID mismatch');
  if (String(artifact?.productionDeployRunId || '') !== deployRunId) errors.push('live-evidence artifact deployment run ID mismatch');
  if (Number(artifact?.runAttempt) !== Number(expectedRunAttempt)) errors.push('live-evidence artifact attempt mismatch');

  return [...new Set(errors)];
}
