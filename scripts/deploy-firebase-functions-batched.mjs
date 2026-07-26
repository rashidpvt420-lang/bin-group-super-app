#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'bin-group-57c60';
const BATCH_SIZE = 8;
const INTER_BATCH_DELAY_SECONDS = 75;
const MAX_ATTEMPTS = 4;
const DISCOVERY_MARKER = '__BIN_GROUP_DEPLOYABLE_FUNCTIONS__=';
const PLAN_PATH = 'launch_package/functions-deployment-plan.json';

const fail = (message) => {
  console.error(`[functions-batched-deploy] FAIL — ${message}`);
  process.exit(1);
};

if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/main' ||
  process.env.DEPLOYMENT_ENVIRONMENT !== 'production' ||
  process.env.GCP_PROJECT_ID !== PROJECT_ID ||
  !/^[0-9a-f]{40}$/.test(String(process.env.GITHUB_SHA || ''))
) {
  fail('batched Functions deployment requires the protected exact-main production workflow');
}

const runtimePath = path.resolve('functions/lib/runtimeAll.js');
if (!existsSync(runtimePath)) fail('compiled Functions runtime is missing; run the Functions build first');

const discoveryCode = `
const runtime = require(${JSON.stringify(runtimePath)});
const names = Object.entries(runtime)
  .filter(([name, value]) =>
    /^[A-Za-z][A-Za-z0-9_]*$/.test(name) &&
    typeof value === 'function' &&
    Boolean(value.__endpoint || value.__trigger)
  )
  .map(([name]) => name)
  .sort();
console.log(${JSON.stringify(DISCOVERY_MARKER)} + JSON.stringify(names));
`;
const discovery = spawnSync(process.execPath, ['-e', discoveryCode], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  shell: false,
});
if ((discovery.status ?? 1) !== 0) {
  process.stderr.write(discovery.stderr || '');
  fail('compiled Functions runtime discovery failed');
}
const markerLine = String(discovery.stdout || '')
  .split(/\r?\n/)
  .find((line) => line.startsWith(DISCOVERY_MARKER));
if (!markerLine) fail('compiled Functions runtime did not emit a deployable export manifest');

let functionNames;
try {
  functionNames = JSON.parse(markerLine.slice(DISCOVERY_MARKER.length));
} catch {
  fail('deployable Functions export manifest is malformed');
}
if (!Array.isArray(functionNames) || functionNames.length === 0) {
  fail('no deployable Cloud Functions were discovered');
}
if (functionNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) {
  fail('discovered Function manifest contains an invalid export name');
}
if (new Set(functionNames).size !== functionNames.length) {
  fail('discovered Function manifest contains duplicate names');
}

const batches = [];
for (let index = 0; index < functionNames.length; index += BATCH_SIZE) {
  batches.push(functionNames.slice(index, index + BATCH_SIZE));
}

mkdirSync('launch_package', { recursive: true });
writeFileSync(PLAN_PATH, `${JSON.stringify({
  schemaVersion: 1,
  status: 'planned',
  projectId: PROJECT_ID,
  commitSha: process.env.GITHUB_SHA,
  functionCount: functionNames.length,
  batchSize: BATCH_SIZE,
  batchCount: batches.length,
  interBatchDelaySeconds: INTER_BATCH_DELAY_SECONDS,
  functions: functionNames,
  batches,
  generatedAt: new Date().toISOString(),
  hardLaunchClaim: false,
}, null, 2)}\n`, { mode: 0o600 });

function sleep(seconds) {
  const result = spawnSync('sleep', [String(seconds)], { stdio: 'inherit', shell: false });
  if ((result.status ?? 1) !== 0) fail(`sleep ${seconds}s failed`);
}

function deployBatch(batch, batchNumber) {
  const target = batch.map((name) => `functions:${name}`).join(',');
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(
      `[functions-batched-deploy] batch ${batchNumber}/${batches.length} ` +
      `(${batch.length} functions) attempt ${attempt}/${MAX_ATTEMPTS}: ${batch.join(', ')}`,
    );
    const result = spawnSync('npx', [
      'firebase',
      'deploy',
      '--only',
      target,
      '--project',
      PROJECT_ID,
      '--non-interactive',
      '--force',
    ], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    if ((result.status ?? 1) === 0) return;
    if (attempt < MAX_ATTEMPTS) {
      const retryDelay = INTER_BATCH_DELAY_SECONDS * attempt;
      console.warn(`[functions-batched-deploy] batch ${batchNumber} failed; cooling down ${retryDelay}s before retry`);
      sleep(retryDelay);
    }
  }
  fail(`Function batch ${batchNumber}/${batches.length} failed after ${MAX_ATTEMPTS} attempts`);
}

for (let index = 0; index < batches.length; index += 1) {
  deployBatch(batches[index], index + 1);
  if (index < batches.length - 1) {
    console.log(`[functions-batched-deploy] cooling down ${INTER_BATCH_DELAY_SECONDS}s before the next mutation batch`);
    sleep(INTER_BATCH_DELAY_SECONDS);
  }
}

const completed = JSON.parse(String(await import('node:fs').then(({ readFileSync }) => readFileSync(PLAN_PATH, 'utf8'))));
completed.status = 'passed';
completed.completedAt = new Date().toISOString();
writeFileSync(PLAN_PATH, `${JSON.stringify(completed, null, 2)}\n`, { mode: 0o600 });
console.log(`[functions-batched-deploy] PASS — deployed ${functionNames.length} functions in ${batches.length} rate-limited batches`);
