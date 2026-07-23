#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RUN_URL_PATTERN = /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/[1-9][0-9]*$/;

function positiveRunId(value, label) {
  const text = String(value ?? '').trim();
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error(`${label} must be a positive GitHub Actions run ID.`);
  }
  return text;
}

function validCreatedAt(value) {
  const text = String(value ?? '').trim();
  const epoch = Date.parse(text);
  if (!text || !Number.isFinite(epoch)) {
    throw new Error('New exact-SHA workflow run has an invalid created_at timestamp.');
  }
  return { text, epoch };
}

export function selectNewExactShaWorkflowRun({ runs, baselineRunIds, expectedSha }) {
  const sha = String(expectedSha || '').trim();
  if (!SHA_PATTERN.test(sha)) {
    throw new Error('expectedSha must be a lowercase 40-character commit SHA.');
  }
  if (!Array.isArray(runs)) {
    throw new Error('runs must be a JSON array.');
  }
  if (!Array.isArray(baselineRunIds)) {
    throw new Error('baselineRunIds must be a JSON array.');
  }

  const baseline = new Set(
    baselineRunIds.map((id, index) => positiveRunId(id, `baselineRunIds[${index}]`)),
  );
  const candidates = [];

  for (const run of runs) {
    if (!run || typeof run !== 'object') continue;
    if (run.event !== 'workflow_dispatch') continue;
    if (run.head_branch !== 'main') continue;
    if (run.head_sha !== sha) continue;

    const runId = positiveRunId(run.id, 'New exact-SHA workflow run ID');
    if (baseline.has(runId)) continue;

    const runSha = String(run.head_sha || '').trim();
    if (!SHA_PATTERN.test(runSha)) {
      throw new Error('New exact-SHA workflow run has a malformed head_sha.');
    }
    const runUrl = String(run.html_url || '').trim();
    if (!RUN_URL_PATTERN.test(runUrl)) {
      throw new Error('New exact-SHA workflow run has a malformed html_url.');
    }
    const createdAt = validCreatedAt(run.created_at);

    candidates.push({
      runId,
      runSha,
      runUrl,
      createdAt: createdAt.text,
      createdAtEpoch: createdAt.epoch,
    });
  }

  candidates.sort((left, right) =>
    left.createdAtEpoch - right.createdAtEpoch || Number(left.runId) - Number(right.runId));

  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous exact-SHA workflow correlation: ${candidates.length} new runs were observed.`,
    );
  }

  const [{ createdAtEpoch: _createdAtEpoch, ...selected }] = candidates;
  return selected;
}

function main() {
  const expectedSha = String(process.argv[2] || '').trim();
  const baselinePath = String(process.argv[3] || '').trim();
  if (!baselinePath) {
    console.error('Usage: select-new-exact-sha-workflow-run.mjs <expected-sha> <baseline-json-file>');
    process.exit(1);
  }

  let runs;
  let baselineRunIds;
  try {
    runs = JSON.parse(readFileSync(0, 'utf8'));
    baselineRunIds = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const selected = selectNewExactShaWorkflowRun({ runs, baselineRunIds, expectedSha });
    if (!selected) process.exit(2);
    process.stdout.write(`${JSON.stringify(selected)}\n`);
  } catch (error) {
    console.error(`[exact-sha-run-selector] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
