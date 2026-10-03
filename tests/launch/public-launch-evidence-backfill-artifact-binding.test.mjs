#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  isAcceptedProductionDeploymentArtifactName,
  productionDeploymentArtifactNames,
} from '../../scripts/lib/production-deployment-artifact.mjs';

const repoRoot = process.cwd();
const deployWorkflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
const backfillWorkflow = readFileSync('.github/workflows/public-launch-evidence-backfill.yml', 'utf8');
const builderSource = readFileSync('scripts/build-command-center-evidence-manifest.mjs', 'utf8');
const publisherSource = readFileSync('scripts/record-firestore-evidence.js', 'utf8');

// Shapes mirror the real Firebase Production Deploy run 36977950876 for release bb4df313.
const SHA = 'bb4df313df36e1636423ed90e8a77c990a6c50ff';
const OTHER_SHA = '9e345fddb5c25437b70be115b974e71dabdf1681';
const RUN_ID = '36977950876';
const OTHER_RUN_ID = '36995600275';
const DIGEST = 'sha256:1a6b705479a570b0dfb4f37fc2749f7aa7fcc965fe5ed537eb27cecb9610a024';

function deployWorkflowArtifactName(sha) {
  const uploads = [...deployWorkflow.matchAll(/name: (production-deployment-\$\{\{ github\.sha \}\}[^\s]*)/g)].map((match) => match[1]);
  assert.ok(uploads.length > 0, 'deploy workflow must publish a production-deployment artifact');
  assert.equal(new Set(uploads).size, 1, 'deploy workflow must use one production-deployment artifact name');
  return uploads[0].replace('${{ github.sha }}', sha);
}

test('the artifact name the real deploy workflow uploads is the canonical accepted name', () => {
  const produced = deployWorkflowArtifactName(SHA);
  assert.equal(produced, `production-deployment-${SHA}`);
  assert.equal(productionDeploymentArtifactNames(SHA, RUN_ID).canonical, produced);
  assert.equal(isAcceptedProductionDeploymentArtifactName(produced, SHA, RUN_ID), true);
  assert.equal(isAcceptedProductionDeploymentArtifactName(`production-deployment-${SHA}-${RUN_ID}`, SHA, RUN_ID), true);
});

test('artifact name helper rejects wrong SHA, wrong run, malformed and unrelated names', () => {
  const rejected = [
    `production-deployment-${OTHER_SHA}`,
    `production-deployment-${OTHER_SHA}-${RUN_ID}`,
    `production-deployment-${SHA}-${OTHER_RUN_ID}`,
    `production-deployment-${SHA.toUpperCase()}`,
    `production-deployment-${SHA.slice(0, 8)}`,
    `production-deployment-${SHA}-`,
    `production-deployment-${SHA} `,
    ` production-deployment-${SHA}`,
    `production-deployment-${SHA}-${RUN_ID}-extra`,
    `live-launch-evidence-${SHA}`,
    `command-center-evidence-backfill-${SHA}-${RUN_ID}`,
    '',
    null,
    undefined,
  ];
  for (const name of rejected) {
    assert.equal(isAcceptedProductionDeploymentArtifactName(name, SHA, RUN_ID), false, `must reject ${JSON.stringify(name)}`);
  }
  assert.equal(isAcceptedProductionDeploymentArtifactName(`production-deployment-${SHA}`, SHA.toUpperCase(), RUN_ID), false);
  assert.equal(isAcceptedProductionDeploymentArtifactName(`production-deployment-${SHA}`, SHA, 'abc'), false);
  assert.equal(isAcceptedProductionDeploymentArtifactName(`production-deployment-${SHA}`, SHA, ''), false);
  assert.throws(() => productionDeploymentArtifactNames('deadbeef', RUN_ID), /40-character SHA/);
  assert.throws(() => productionDeploymentArtifactNames(SHA, '12x'), /numeric workflow run ID/);
});

test('builder and publisher share the single artifact-name authority', () => {
  for (const source of [builderSource, publisherSource]) {
    assert.match(source, /from '\.\/lib\/production-deployment-artifact\.mjs'/);
    assert.match(source, /isAcceptedProductionDeploymentArtifactName\(/);
  }
  assert.match(builderSource, /live-launch-evidence-\$\{releaseSha\}/);
});

function extractStepScript(workflow, stepName) {
  const start = workflow.indexOf(`- name: ${stepName}`);
  assert.ok(start >= 0, `missing step: ${stepName}`);
  const rest = workflow.slice(start);
  const next = rest.indexOf('\n      - name:', 1);
  const block = next > 0 ? rest.slice(0, next) : rest;
  const runIndex = block.indexOf('run: |\n');
  assert.ok(runIndex >= 0, `${stepName} must have a run block`);
  const lines = block.slice(runIndex + 'run: |\n'.length).split('\n');
  const indent = lines.find((line) => line.trim())?.match(/^ */)?.[0].length ?? 0;
  return lines.map((line) => line.slice(indent)).join('\n');
}

const verifyScript = extractStepScript(backfillWorkflow, 'Verify successful exact-SHA Firebase Production Deploy');

function deployRun(overrides = {}) {
  return {
    id: Number(RUN_ID),
    name: 'Firebase Production Deploy',
    path: '.github/workflows/firebase-production-deploy.yml',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    head_sha: SHA,
    ...overrides,
  };
}

function artifact(overrides = {}) {
  return {
    id: 11219584916,
    name: `production-deployment-${SHA}`,
    expired: false,
    digest: DIGEST,
    workflow_run: { id: Number(RUN_ID), head_sha: SHA, head_branch: 'main' },
    ...overrides,
  };
}

function listing(artifacts, totalCount = artifacts.length) {
  return { total_count: totalCount, artifacts };
}

function runVerifyStep({ run = deployRun(), artifacts = listing([artifact()]), sourceSha = SHA, sourceRunId = RUN_ID } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'backfill-verify-'));
  try {
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run));
    writeFileSync(path.join(dir, 'artifacts.json'), JSON.stringify(artifacts));
    const fakeGh = path.join(dir, 'gh');
    writeFileSync(fakeGh, `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "api" ]] || exit 64
case "$2" in
  "repos/rashidpvt420-lang/bin-group-super-app/actions/runs/${sourceRunId}") cat "${dir}/run.json" ;;
  "repos/rashidpvt420-lang/bin-group-super-app/actions/runs/${sourceRunId}/artifacts?per_page=100") cat "${dir}/artifacts.json" ;;
  *) echo "unexpected gh api path: $2" >&2; exit 65 ;;
esac
`);
    chmodSync(fakeGh, 0o755);
    const outputFile = path.join(dir, 'github-output');
    writeFileSync(outputFile, '');
    const result = spawnSync('bash', ['-c', verifyScript], {
      encoding: 'utf8',
      timeout: 20_000,
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
        SOURCE_SHA: sourceSha,
        SOURCE_RUN_ID: sourceRunId,
        GITHUB_OUTPUT: outputFile,
      },
    });
    const outputs = Object.fromEntries(readFileSync(outputFile, 'utf8').split('\n').filter(Boolean).map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }));
    return { status: result.status, stderr: result.stderr, stdout: result.stdout, outputs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('backfill verify step accepts the real unsuffixed deploy artifact and binds name, id and digest', () => {
  const result = runVerifyStep();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs.artifact_name, deployWorkflowArtifactName(SHA));
  assert.equal(result.outputs.artifact_id, '11219584916');
  assert.equal(result.outputs.artifact_digest, DIGEST);
});

test('backfill verify step still accepts a lone legacy run-suffixed deploy artifact', () => {
  const result = runVerifyStep({ artifacts: listing([artifact({ name: `production-deployment-${SHA}-${RUN_ID}` })]) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs.artifact_name, `production-deployment-${SHA}-${RUN_ID}`);
});

test('backfill verify step fails closed on expired, multiple, mismatched or unbound artifacts', () => {
  const cases = {
    expired: listing([artifact({ expired: true })]),
    'no artifacts': listing([]),
    'canonical and legacy both present': listing([
      artifact(),
      artifact({ id: 2, name: `production-deployment-${SHA}-${RUN_ID}` }),
    ]),
    'duplicate canonical': listing([artifact(), artifact({ id: 2 })]),
    'wrong SHA name': listing([artifact({ name: `production-deployment-${OTHER_SHA}` })]),
    'other run legacy name': listing([artifact({ name: `production-deployment-${SHA}-${OTHER_RUN_ID}` })]),
    'live evidence name': listing([artifact({ name: `live-launch-evidence-${SHA}` })]),
    'artifact from another run': listing([artifact({ workflow_run: { id: Number(OTHER_RUN_ID), head_sha: SHA } })]),
    'artifact from another SHA': listing([artifact({ workflow_run: { id: Number(RUN_ID), head_sha: OTHER_SHA } })]),
    'missing digest': listing([artifact({ digest: null })]),
    'malformed digest': listing([artifact({ digest: 'sha1:abc' })]),
    'truncated listing': listing([artifact()], 101),
  };
  for (const [label, artifacts] of Object.entries(cases)) {
    const result = runVerifyStep({ artifacts });
    assert.notEqual(result.status, 0, `${label} must fail closed`);
    assert.equal(result.outputs.artifact_name, undefined, `${label} must not emit an artifact`);
  }
});

test('backfill verify step still requires a successful workflow_dispatch deploy on main for the exact SHA', () => {
  const cases = {
    'wrong workflow': deployRun({ name: 'Live Role Smoke Tests', path: '.github/workflows/live-role-smoke.yml' }),
    'push event': deployRun({ event: 'push' }),
    'failed run': deployRun({ conclusion: 'failure' }),
    'in progress': deployRun({ status: 'in_progress', conclusion: null }),
    'non-main branch': deployRun({ head_branch: 'feature' }),
    'different head SHA': deployRun({ head_sha: OTHER_SHA }),
  };
  for (const [label, run] of Object.entries(cases)) {
    const result = runVerifyStep({ run });
    assert.notEqual(result.status, 0, `${label} must fail closed`);
    assert.equal(result.outputs.artifact_name, undefined, `${label} must not emit an artifact`);
  }
});

function runBuilder({ mode = 'production-deployment-backfill', artifactName, runId = RUN_ID }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'backfill-builder-'));
  try {
    return spawnSync(process.execPath, [path.join(repoRoot, 'scripts/build-command-center-evidence-manifest.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20_000,
      env: {
        PATH: process.env.PATH,
        GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
        SOURCE_EVIDENCE_MODE: mode,
        SOURCE_EVIDENCE_SHA: SHA,
        SOURCE_EVIDENCE_RUN_ID: runId,
        SOURCE_EVIDENCE_ARTIFACT_NAME: artifactName,
        SOURCE_EVIDENCE_ARTIFACT_DIGEST: DIGEST,
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('manifest builder accepts canonical/legacy deploy names in backfill mode and rejects everything else', () => {
  for (const name of [deployWorkflowArtifactName(SHA), `production-deployment-${SHA}-${RUN_ID}`]) {
    const result = runBuilder({ artifactName: name });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /source artifact name mismatch/, `${name} must pass the name gate`);
    assert.match(result.stderr, /launch-evidence-batch\.json is missing or malformed/);
  }
  for (const name of [
    `production-deployment-${OTHER_SHA}`,
    `production-deployment-${SHA}-${OTHER_RUN_ID}`,
    `live-launch-evidence-${SHA}`,
  ]) {
    const result = runBuilder({ artifactName: name });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /source artifact name mismatch/, `${name} must be rejected`);
  }
  const liveMode = runBuilder({ mode: 'live-role-smoke', artifactName: `production-deployment-${SHA}` });
  assert.match(liveMode.stderr, /source artifact name mismatch/, 'live-role-smoke mode must stay bound to live-launch-evidence-<sha>');
});

function runPublisherWrite({ artifactName, verified = 'true' }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'backfill-publisher-'));
  try {
    const manifestPath = path.join(dir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 2,
      releaseSha: SHA,
      workflowRunId: RUN_ID,
      records: [{
        collection: 'signed_in_smoke_checks',
        role: 'owner',
        status: 'passed',
        accountEmail: 'owner@example.test',
        route: '/owner',
        requiredRoute: '/owner',
        checkpoints: 'test fixture',
        proofRef: `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/${RUN_ID}`,
        notes: 'test fixture',
      }],
    }));
    const command = `/bin-launch publish-command-center-evidence ${SHA} ${RUN_ID}`;
    const eventPath = path.join(dir, 'event.json');
    writeFileSync(eventPath, JSON.stringify({
      issue: { number: 434 },
      comment: { body: command, user: { login: 'rashidpvt420-lang' }, author_association: 'OWNER' },
    }));
    return spawnSync(process.execPath, [path.join(repoRoot, 'scripts/record-firestore-evidence.js'), '--manifest', manifestPath, '--write'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20_000,
      env: {
        PATH: process.env.PATH,
        // Never reach production even if a regression skipped the gates below.
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:9',
        GOOGLE_APPLICATION_CREDENTIALS: path.join(dir, 'no-credentials.json'),
        GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
        GCP_PROJECT_ID: 'bin-group-57c60',
        GITHUB_EVENT_NAME: 'issue_comment',
        GITHUB_WORKFLOW: 'Public Launch Evidence Backfill',
        GITHUB_EVENT_PATH: eventPath,
        SOURCE_EVIDENCE_MODE: 'production-deployment-backfill',
        SOURCE_EVIDENCE_SHA: SHA,
        SOURCE_EVIDENCE_RUN_ID: RUN_ID,
        SOURCE_EVIDENCE_WORKFLOW: 'Firebase Production Deploy',
        SOURCE_EVIDENCE_ARTIFACT_NAME: artifactName,
        SOURCE_EVIDENCE_ARTIFACT_DIGEST: DIGEST,
        SOURCE_EVIDENCE_VERIFIED: verified,
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('publisher write context accepts the canonical deploy name and rejects mismatched names before any write', () => {
  for (const name of [deployWorkflowArtifactName(SHA), `production-deployment-${SHA}-${RUN_ID}`]) {
    // SOURCE_EVIDENCE_VERIFIED=false stops the run after the artifact-name gate and before any Firestore access.
    const result = runPublisherWrite({ artifactName: name, verified: 'false' });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /artifact name does not match/, `${name} must pass the name gate`);
    assert.match(result.stderr, /SOURCE_EVIDENCE_VERIFIED must be true/);
  }
  for (const name of [
    `production-deployment-${OTHER_SHA}`,
    `production-deployment-${SHA}-${OTHER_RUN_ID}`,
    `live-launch-evidence-${SHA}`,
    '',
  ]) {
    const result = runPublisherWrite({ artifactName: name });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /verified production artifact name does not match exact SHA\/run binding/, `${JSON.stringify(name)} must be rejected`);
  }
});
