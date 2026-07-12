#!/usr/bin/env node
/**
 * Pilot launch watch — fail closed.
 * Never starts pilot unless every required current-commit production evidence exists.
 * Admin login alone is never enough. hardLaunchClaim remains false.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  HARD_LAUNCH_CLAIM,
  REQUIRED_PILOT_EVIDENCE,
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  gitSha,
  readJsonSafe,
} from './lib/launch-honesty.mjs';

const outDir = path.join(process.cwd(), 'launch_package');
const lockPath = path.join(outDir, 'pilot-start.lock.json');
const statusPath = path.join(outDir, 'launch-status.json');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  return result.status ?? 1;
}

function invalidate(reason, sha) {
  if (!existsSync(lockPath)) return;
  const lock = readJsonSafe(lockPath, {});
  writeFileSync(
    lockPath,
    `${JSON.stringify({
      ...lock,
      status: 'invalidated',
      invalidatedAt: new Date().toISOString(),
      reason,
      commitSha: sha,
      hardLaunchClaim: false,
    }, null, 2)}\n`,
  );
}

const mode = process.argv.includes('--invalidate')
  ? 'invalidate'
  : process.argv.includes('--start')
    ? 'start'
    : 'watch';

mkdirSync(outDir, { recursive: true });
const sha = gitSha();

if (mode === 'invalidate') {
  invalidate('manual invalidate', sha);
  console.log('[pilot-watch] pilot start invalidated');
  process.exit(0);
}

console.log('[pilot-watch] refreshing launch status...');
const statusCode = run(process.execPath, ['scripts/launch-status.mjs']);
const status = readJsonSafe(statusPath, {});
const evidence = readJsonSafe(evidencePath(), { records: [] });
const deploymentDoc = readJsonSafe(deploymentEvidencePath(), null);
const eligibility = evaluatePilotEligibility({
  evidenceBatch: evidence,
  commitSha: sha,
  deploymentDoc,
});

if (statusCode !== 0 || !status.automationOk || !eligibility.pilotEligible) {
  invalidate('smoke/launch-status/business evidence failing', sha);
  console.error('[pilot-watch] FAIL — required evidence missing/invalid; pilot not eligible');
  console.error(`[pilot-watch] missing=${eligibility.missing.join(', ') || '(none)'}`);
  console.error(`[pilot-watch] invalid=${eligibility.invalid.join(' | ') || '(none)'}`);
  console.error(`[pilot-watch] required=${REQUIRED_PILOT_EVIDENCE.join(', ')}`);
  console.error(`[pilot-watch] hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
  process.exit(1);
}

if (mode === 'start') {
  writeFileSync(
    lockPath,
    `${JSON.stringify({
      status: 'started',
      startedAt: new Date().toISOString(),
      commitSha: sha,
      note: 'Controlled pilot only — hard launch not claimed',
      hardLaunchClaim: HARD_LAUNCH_CLAIM,
      requiredEvidence: [...REQUIRED_PILOT_EVIDENCE],
    }, null, 2)}\n`,
  );
  console.log(`[pilot-watch] controlled pilot start recorded (hardLaunchClaim=${HARD_LAUNCH_CLAIM})`);
  process.exit(0);
}

const lock = readJsonSafe(lockPath, null);
if (lock?.status === 'started' && lock.commitSha === sha) {
  console.log(`[pilot-watch] PASS — existing controlled pilot remains eligible (hardLaunchClaim=${HARD_LAUNCH_CLAIM})`);
  process.exit(0);
}

console.log(`[pilot-watch] PASS — eligible, but pilot not started (pass --start). hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
process.exit(0);
