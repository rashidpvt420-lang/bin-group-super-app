#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deploymentEvidencePath, gitSha } from './lib/launch-honesty.mjs';
import {
  HARD_CLEARANCE_PRODUCTION_STATE_RELATIVE_PATH,
  sha256Text,
  validateHardClearanceProductionState,
} from './lib/hard-clearance-production-state.mjs';

const EXPECTED_WORKFLOW = 'Live Role Smoke Tests';
const EXPECTED_JOB = 'hard-public-launch-clearance';
const text = (value) => String(value ?? '').trim();

function readJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is missing or malformed.`);
  }
}

export function verifyHardClearanceProductionState({
  root = process.cwd(),
  env = process.env,
  now = Date.now(),
  currentCommitSha = gitSha(root),
  deploymentPath = deploymentEvidencePath(root),
  statePath = path.join(root, HARD_CLEARANCE_PRODUCTION_STATE_RELATIVE_PATH),
} = {}) {
  const expectedReleaseSha = text(env.HARD_LAUNCH_EXPECTED_SHA || env.GITHUB_SHA);
  if (text(env.GITHUB_ACTIONS) !== 'true') {
    throw new Error('Hard-clearance production state may only be consumed by GitHub Actions.');
  }
  if (text(env.GITHUB_EVENT_NAME) !== 'workflow_dispatch') {
    throw new Error('Hard-clearance production state requires a protected workflow dispatch.');
  }
  if (text(env.GITHUB_WORKFLOW) !== EXPECTED_WORKFLOW || text(env.GITHUB_JOB) !== EXPECTED_JOB) {
    throw new Error('Hard-clearance production state is outside the protected clearance job.');
  }
  if (currentCommitSha !== expectedReleaseSha || text(env.GITHUB_SHA) !== expectedReleaseSha) {
    throw new Error('Hard-clearance production state is not executing from the exact release commit.');
  }

  const deploymentRaw = readFileSync(deploymentPath, 'utf8');
  const deploymentDoc = readJson(deploymentRaw, 'production-deployment.json');
  const state = readJson(readFileSync(statePath, 'utf8'), 'hard-clearance-production-state.json');
  const failures = validateHardClearanceProductionState(state, {
    expectedReleaseSha,
    repository: text(env.GITHUB_REPOSITORY),
    ref: text(env.GITHUB_REF),
    workflowName: text(env.GITHUB_WORKFLOW),
    workflowRunId: text(env.GITHUB_RUN_ID),
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    deploymentDoc,
    originalDeploymentDigest: sha256Text(deploymentRaw),
    now,
  });
  if (failures.length > 0) {
    throw new Error(`Hard-clearance production state was rejected: ${failures.join('; ')}`);
  }
  console.log(
    '[hard-clearance-state] PASS — fresh production state is same-run, exact-SHA, '
      + 'original-deployment-bound, and value-free',
  );
  return state;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  try {
    verifyHardClearanceProductionState();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Hard-clearance state verification failed.';
    console.error(`[hard-clearance-state] FAIL ${message}`);
    process.exit(1);
  }
}
