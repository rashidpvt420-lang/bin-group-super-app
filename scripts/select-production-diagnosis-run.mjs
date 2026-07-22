/**
 * Deterministic Firebase Production Deploy run selector.
 *
 * Exported function: selectProductionDiagnosisRun(mainSha, runs[, { now }])
 *
 * Priority 1 – newest completed failed Firebase Production Deploy
 *   workflow_dispatch run on main whose head_sha equals the resolved main SHA.
 * Priority 2 – newest such run on main regardless of SHA.
 *
 * Rejects: unrelated workflows, successful/cancelled runs, malformed records,
 *          diagnosis-workflow runs.
 *
 * CLI: node scripts/select-production-diagnosis-run.mjs <mainSha>
 *      (runs JSON array read from stdin, result JSON written to stdout)
 */

import { fileURLToPath } from 'node:url';

const WORKFLOW_NAME = 'Firebase Production Deploy';
const WORKFLOW_PATH = '.github/workflows/firebase-production-deploy.yml';
const STALE_THRESHOLD_SECONDS = 86400; // 24 hours

function isValidRunId(id) {
  return Number.isInteger(id) && id > 0;
}

function isValidSha(sha) {
  return typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha);
}

function isValidUrl(url) {
  return typeof url === 'string' && /^https:\/\/github\.com\//.test(url);
}

function isValidTimestamp(ts) {
  return typeof ts === 'string' && !Number.isNaN(Date.parse(ts));
}

/**
 * Returns true only if the run should be considered as a selection candidate.
 * Excludes unrelated workflows, non-failure conclusions, non-dispatch events,
 * and any record with malformed required fields.
 */
function isEligibleRun(run) {
  if (!run || typeof run !== 'object') return false;
  if (run.conclusion !== 'failure') return false;
  if (run.status !== 'completed') return false;
  if (run.event !== 'workflow_dispatch') return false;
  if (run.path !== WORKFLOW_PATH) return false;
  if ((run.name ?? '') !== WORKFLOW_NAME) return false;
  if (!isValidRunId(run.id)) return false;
  if (!run.head_sha || !isValidSha(run.head_sha)) return false;
  if (!run.html_url || !isValidUrl(run.html_url)) return false;
  if (!run.created_at || !isValidTimestamp(run.created_at)) return false;
  return true;
}

/**
 * Select the best failed Firebase Production Deploy run.
 *
 * @param {string} mainSha - Resolved current main branch SHA (40 lowercase hex chars).
 * @param {unknown[]} runs - Flat array of GitHub Actions workflow_run API objects.
 * @param {{ now?: number }} [opts] - Optional. `now` overrides Date.now() for tests.
 * @returns {{ runId: number, runSha: string, runUrl: string, createdAt: string,
 *             ageSeconds: number, matchesCurrentMain: boolean, staleEvidence: boolean }}
 * @throws {Error} On invalid mainSha, non-array runs, or no eligible run found.
 */
export function selectProductionDiagnosisRun(mainSha, runs, { now = Date.now() } = {}) {
  if (!isValidSha(mainSha)) {
    throw new Error(`Malformed mainSha diagnostic metadata: ${JSON.stringify(mainSha)}`);
  }
  if (!Array.isArray(runs)) {
    throw new Error('runs must be an array');
  }

  const eligible = runs.filter(isEligibleRun);

  if (eligible.length === 0) {
    throw new Error('No completed failed Firebase Production Deploy run was found');
  }

  // Sort ascending by created_at; last element is the newest.
  const sorted = [...eligible].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Priority 1: newest run whose head_sha matches the resolved main SHA.
  const mainShaMatches = sorted.filter((r) => r.head_sha === mainSha);

  let selected;
  let matchesCurrentMain;

  if (mainShaMatches.length > 0) {
    selected = mainShaMatches[mainShaMatches.length - 1];
    matchesCurrentMain = true;
  } else {
    // Priority 2: newest run overall.
    selected = sorted[sorted.length - 1];
    matchesCurrentMain = false;
  }

  const ageSeconds = Math.floor((now - Date.parse(selected.created_at)) / 1000);
  const staleEvidence = ageSeconds > STALE_THRESHOLD_SECONDS;

  return {
    runId: selected.id,
    runSha: selected.head_sha,
    runUrl: selected.html_url,
    createdAt: selected.created_at,
    ageSeconds,
    matchesCurrentMain,
    staleEvidence,
  };
}

// ─── CLI interface ────────────────────────────────────────────────────────────
// Usage: echo "$runs_json" | node scripts/select-production-diagnosis-run.mjs <mainSha>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mainSha = process.argv[2] ?? '';
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  let runs;
  try {
    runs = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`Failed to parse runs JSON: ${e.message}\n`);
    process.exit(1);
  }

  let result;
  try {
    result = selectProductionDiagnosisRun(mainSha, runs);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}
