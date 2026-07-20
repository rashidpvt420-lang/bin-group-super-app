#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MIN_CONTROLLED_PILOT_MS,
  validateLiveEvidenceRun,
} from '../../scripts/lib/live-pilot-provenance.mjs';

const SHA = 'a'.repeat(40);
const RUN_ID = '29780559464';
const START = Date.parse('2026-07-20T10:00:00.000Z');

function validRun(overrides = {}) {
  return {
    id: Number(RUN_ID),
    name: 'Live Role Smoke Tests',
    path: '.github/workflows/live-role-smoke.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: SHA,
    status: 'completed',
    conclusion: 'success',
    updated_at: new Date(START).toISOString(),
    html_url: `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/${RUN_ID}`,
    repository: { full_name: 'rashidpvt420-lang/bin-group-super-app' },
    ...overrides,
  };
}

test('accepts an exact-SHA successful live-evidence run after a real 24-hour pilot', () => {
  const result = validateLiveEvidenceRun(validRun(), {
    expectedSha: SHA,
    now: START + MIN_CONTROLLED_PILOT_MS,
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.runId, RUN_ID);
  assert.equal(result.pilotStartedAt, '2026-07-20T10:00:00.000Z');
  assert.equal(result.pilotCompletedAt, '2026-07-21T10:00:00.000Z');
  assert.equal(result.durationMs, MIN_CONTROLLED_PILOT_MS);
});

test('rejects an incomplete pilot and any stale or unrelated workflow provenance', () => {
  const tooEarly = validateLiveEvidenceRun(validRun(), {
    expectedSha: SHA,
    now: START + MIN_CONTROLLED_PILOT_MS - 1,
  });
  assert.ok(tooEarly.errors.includes('controlled pilot has not completed 24 hours'));

  for (const [overrides, expected] of [
    [{ head_sha: 'b'.repeat(40) }, 'live evidence run SHA must equal the exact release SHA'],
    [{ path: '.github/workflows/other.yml' }, 'live evidence workflow path mismatch'],
    [{ event: 'schedule' }, 'live evidence must come from workflow_dispatch'],
    [{ head_branch: 'feature' }, 'live evidence must come from main'],
    [{ conclusion: 'failure' }, 'live evidence run must conclude successfully'],
  ]) {
    const result = validateLiveEvidenceRun(validRun(overrides), {
      expectedSha: SHA,
      now: START + MIN_CONTROLLED_PILOT_MS,
    });
    assert.ok(result.errors.includes(expected), `missing error: ${expected}`);
  }
});

test('hard-clearance workflow derives timestamps and cannot trust manual pilot dates', async () => {
  const workflow = await readFile('.github/workflows/live-role-smoke.yml', 'utf8');
  const writer = await readFile('scripts/write-pilot-incident-report.mjs', 'utf8');
  const resolver = await readFile('scripts/resolve-live-pilot-window.mjs', 'utf8');

  assert.match(workflow, /Verify live-evidence run provenance and enforce a real 24-hour pilot/);
  assert.match(workflow, /node scripts\/resolve-live-pilot-window\.mjs/);
  assert.doesNotMatch(workflow, /PILOT_STARTED_AT:\s*\$\{\{ inputs\.pilot_started_at \}\}/);
  assert.doesNotMatch(workflow, /PILOT_COMPLETED_AT:\s*\$\{\{ inputs\.pilot_completed_at \}\}/);
  assert.match(workflow, /launch_package\/live-evidence-provenance\.json/);

  for (const marker of [
    'LIVE_EVIDENCE_RUN_ID',
    'LIVE_EVIDENCE_RUN_URL',
    'LIVE_EVIDENCE_COMPLETED_AT',
    'LIVE_EVIDENCE_COMMIT_SHA',
  ]) {
    assert.ok(resolver.includes(marker), `resolver missing ${marker}`);
    assert.ok(writer.includes(marker), `pilot report missing ${marker}`);
  }
});
