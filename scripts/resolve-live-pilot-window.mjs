#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateLiveEvidenceRun } from './lib/live-pilot-provenance.mjs';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Live pilot provenance may only be resolved in GitHub Actions.');
if (process.env.GITHUB_WORKFLOW !== 'Live Role Smoke Tests') throw new Error('Unexpected workflow context.');
if (process.env.GITHUB_JOB !== 'hard-public-launch-clearance') throw new Error('Unexpected hard-clearance job context.');
if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Hard clearance requires refs/heads/main.');

const repository = requireEnv('GITHUB_REPOSITORY');
if (repository !== 'rashidpvt420-lang/bin-group-super-app') throw new Error('Unexpected GitHub repository.');

const runId = requireEnv('LIVE_EVIDENCE_RUN_ID');
const expectedSha = requireEnv('HARD_LAUNCH_EXPECTED_SHA');
const token = requireEnv('GITHUB_TOKEN');
const githubEnv = requireEnv('GITHUB_ENV');
const apiUrl = String(process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');

if (!/^\d+$/.test(runId)) throw new Error('LIVE_EVIDENCE_RUN_ID must be numeric.');

const response = await fetch(`${apiUrl}/repos/${repository}/actions/runs/${runId}`, {
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  },
});
if (!response.ok) throw new Error(`Unable to fetch live evidence run ${runId}: HTTP ${response.status}`);

const run = await response.json();
const resolved = validateLiveEvidenceRun(run, { expectedSha, expectedRepository: repository, now: Date.now() });
if (resolved.errors.length) {
  console.error('[live-pilot-provenance] REFUSED');
  for (const error of resolved.errors) console.error(`- ${error}`);
  process.exit(1);
}

const envLines = [
  `PILOT_STARTED_AT=${resolved.pilotStartedAt}`,
  `PILOT_COMPLETED_AT=${resolved.pilotCompletedAt}`,
  `LIVE_EVIDENCE_RUN_ID=${resolved.runId}`,
  `LIVE_EVIDENCE_RUN_URL=${resolved.runUrl}`,
  `LIVE_EVIDENCE_COMPLETED_AT=${resolved.pilotStartedAt}`,
  `LIVE_EVIDENCE_COMMIT_SHA=${resolved.commitSha}`,
];
appendFileSync(githubEnv, `${envLines.join('\n')}\n`);

const output = path.resolve('launch_package', 'live-evidence-provenance.json');
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({
  schemaVersion: 1,
  status: 'passed',
  source: 'github-actions-live-evidence-run',
  commitSha: resolved.commitSha,
  repository: resolved.repository,
  liveEvidenceRunId: resolved.runId,
  liveEvidenceRunUrl: resolved.runUrl,
  liveEvidenceCompletedAt: resolved.pilotStartedAt,
  pilotStartedAt: resolved.pilotStartedAt,
  pilotCompletedAt: resolved.pilotCompletedAt,
  durationMs: resolved.durationMs,
  generatedAt: new Date().toISOString(),
  generatedByWorkflow: true,
  githubRunId: String(process.env.GITHUB_RUN_ID || ''),
  githubRunAttempt: String(process.env.GITHUB_RUN_ATTEMPT || '1'),
}, null, 2)}\n`);

console.log(`[live-pilot-provenance] PASS — run ${resolved.runId} completed at ${resolved.pilotStartedAt}; controlled pilot duration ${(resolved.durationMs / 3600000).toFixed(2)}h.`);
