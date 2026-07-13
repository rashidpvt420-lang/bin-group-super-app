import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const workflowPath = '.github/workflows/firebase-production-deploy.yml';
const workflow = readFileSync(workflowPath, 'utf8');
const legacyProductionWorkflowPath = '.github/workflows/production.yml';
const legacyProductionWorkflow = readFileSync(legacyProductionWorkflowPath, 'utf8');

function runBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*)run:\s*\|\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() && line.search(/\S/) <= indent) break;
      body.push(line);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

test('workflow does not interpolate dispatch inputs directly inside shell', () => {
  for (const block of runBlocks(workflow)) {
    assert.doesNotMatch(block, /\$\{\{\s*(?:inputs|github\.event\.inputs)\./);
  }
});

test('workflow uses least-privilege permissions', () => {
  assert.doesNotMatch(workflow, /^\s*actions:\s*write\s*$/m);
  assert.match(workflow, /^\s*contents:\s*read\s*$/m);
  assert.match(workflow, /^\s*id-token:\s*write\s*$/m);
});

test('dispatch values are passed through step environment variables', () => {
  assert.match(workflow, /DISPATCH_CONFIRMATION:\s*\$\{\{\s*inputs\.confirmation\s*\}\}/);
  assert.match(workflow, /EXPECTED_COMMIT_SHA:\s*\$\{\{\s*inputs\.expected_commit_sha\s*\}\}/);
  assert.match(workflow, /CURRENT_COMMIT_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(workflow, /CURRENT_REF:\s*\$\{\{\s*github\.ref\s*\}\}/);
});

test('production dispatch requires main and exact full SHA', () => {
  assert.match(workflow, /CURRENT_REF[^\n]*refs\/heads\/main|refs\/heads\/main[^\n]*CURRENT_REF/);
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /EXPECTED_COMMIT_SHA[^\n]*CURRENT_COMMIT_SHA|CURRENT_COMMIT_SHA[^\n]*EXPECTED_COMMIT_SHA/);
});

test('production deploy cannot be cancelled in progress', () => {
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test('production deployment remains approval-gated', () => {
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /PRODUCTION_CONFIRMATION_PHRASE:\s*DEPLOY_PRODUCTION_BIN_GROUP_57C60/);
});

test('legacy production workflow is retired and cannot deploy', () => {
  assert.match(legacyProductionWorkflow, /Retired production entrypoint/);
  assert.match(legacyProductionWorkflow, /signed founder authorization and live evidence gates/);
  assert.match(legacyProductionWorkflow, /\bexit 1\b/);
  assert.doesNotMatch(legacyProductionWorkflow, /^\s*id-token:\s*write\s*$/m);
  assert.doesNotMatch(legacyProductionWorkflow, /google-github-actions\/auth/);
  assert.doesNotMatch(legacyProductionWorkflow, /GCP_WORKLOAD_IDENTITY_PROVIDER/);
  assert.doesNotMatch(legacyProductionWorkflow, /GCP_SERVICE_ACCOUNT/);
  assert.doesNotMatch(legacyProductionWorkflow, /\bnpx\s+firebase\s+deploy\b/);
  assert.doesNotMatch(legacyProductionWorkflow, /\bfirebase\s+deploy\b/);
});

test('five-profile optional second technician credentials are documented when referenced', () => {
  const walkthrough = readFileSync('tests/e2e/launch-five-profile-walkthrough.spec.ts', 'utf8');
  const example = readFileSync('.env.e2e.example', 'utf8');
  if (walkthrough.includes('E2E_TECHNICIAN_B_EMAIL')) {
    assert.match(example, /^E2E_TECHNICIAN_B_EMAIL=/m);
    assert.match(example, /^E2E_TECHNICIAN_B_PASSWORD=/m);
  }
});

test('walkthrough does not silently reuse technician A password for technician B', () => {
  const walkthrough = readFileSync('tests/e2e/launch-five-profile-walkthrough.spec.ts', 'utf8');
  assert.doesNotMatch(
    walkthrough,
    /E2E_TECHNICIAN_B_PASSWORD\s*\|\|\s*process\.env\.E2E_TECHNICIAN_PASSWORD/,
  );
  assert.match(walkthrough, /E2E_TECHNICIAN_B_PASSWORD/);
  assert.match(walkthrough, /must both be set together/i);
});

test('production workflow run blocks never embed user-controlled github expressions', () => {
  for (const block of runBlocks(workflow)) {
    assert.doesNotMatch(block, /\$\{\{\s*github\.event\.inputs\./);
    assert.doesNotMatch(block, /\$\{\{\s*inputs\./);
  }
  assert.match(workflow, /DISPATCH_CONFIRMATION:\s*\$\{\{\s*inputs\.confirmation\s*\}\}/);
});

test('explicit admin build verification is local-only before deployment', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'admin-local-only-'));
  try {
    mkdirSync(path.join(directory, 'static', 'js'), { recursive: true });
    writeFileSync(
      path.join(directory, 'static', 'js', 'main.js'),
      `const firebaseConfig={
        apiKey:"AIza1234567890abcdefghijklmnop",
        authDomain:"bin-group-57c60.firebaseapp.com",
        projectId:"bin-group-57c60",
        storageBucket:"bin-group-57c60.firebasestorage.app",
        messagingSenderId:"123413252227",
        appId:"1:123413252227:web:285cb53bc26626d699f3b6"
      };`,
    );
    const result = spawnSync(
      process.execPath,
      [
        'scripts/verify-admin-firebase-build.mjs',
        '--build',
        directory,
        '--url',
        'http://127.0.0.1:1/must-not-be-fetched',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /live verification deferred/i);
    assert.doesNotMatch(`${result.stderr}\n${result.stdout}`, /live admin fetch failed/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('App Check helper initializes current document and future navigations', () => {
  const helper = readFileSync('tests/e2e/helpers/appCheckDebug.ts', 'utf8');
  assert.match(helper, /page\.addInitScript/);
  assert.match(helper, /await page\.evaluate/);
  assert.match(helper, /FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*init\.debugToken/);
  assert.doesNotMatch(helper, /addInitScript\([\s\S]*?validated\s*,\s*fingerprint\s*\)/);
});
