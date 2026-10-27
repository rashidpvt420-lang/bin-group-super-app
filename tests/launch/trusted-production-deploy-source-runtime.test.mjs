import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/verify-trusted-production-deploy-source.mjs');
const SHA = 'a'.repeat(40);
const RUN_ID = '40532577409';

// Preloaded into the child process so the script's GitHub API calls are answered locally.
const fetchStub = `
const sha = process.env.TEST_SHA;
const runId = process.env.TEST_RUN_ID;
const respond = (body) => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/git/ref/heads/main')) return respond({ object: { sha } });
  if (u.includes('/jobs')) return respond({ jobs: [{ id: 77, name: 'Deploy Firebase production stack', status: 'completed', conclusion: 'success' }] });
  if (u.includes('/artifacts')) return respond({ artifacts: [{ id: 88, name: 'production-deployment-' + sha, expired: false, digest: 'sha256:' + 'b'.repeat(64) }] });
  if (u.includes('/actions/runs/')) return respond({
    id: Number(runId), name: 'Firebase Production Deploy', path: '.github/workflows/firebase-production-deploy.yml',
    event: 'workflow_dispatch', head_branch: 'main', head_sha: sha, status: 'completed', conclusion: 'success',
    created_at: new Date(Date.now() - 60 * 1000).toISOString(),
    triggering_actor: { login: 'founder-actor' }, repository: { full_name: 'rashidpvt420-lang/bin-group-super-app' },
  });
  throw new Error('unexpected fetch ' + u);
};
`;

function runVerifier() {
  const dir = mkdtempSync(path.join(tmpdir(), 'trusted-source-'));
  const stubPath = path.join(dir, 'fetch-stub.mjs');
  const envFile = path.join(dir, 'github-env');
  writeFileSync(stubPath, fetchStub);
  writeFileSync(envFile, '');
  const result = spawnSync(process.execPath, ['--import', stubPath, script], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_ACTOR: 'github-actions[bot]',
      GITHUB_WORKFLOW: 'Operational Provider Evidence',
      GITHUB_JOB: 'verify-and-publish',
      GITHUB_SHA: SHA,
      GITHUB_ENV: envFile,
      GH_TOKEN: 'test-token-not-real',
      SOURCE_DEPLOY_RUN_ID: RUN_ID,
      SOURCE_AUTHORIZED_FOUNDER_ACTORS: 'founder-actor',
      TEST_SHA: SHA,
      TEST_RUN_ID: RUN_ID,
    },
  });
  return { dir, envFile, result };
}

test('trusted production deploy source verifier passes end to end and records the source run ID', () => {
  const { dir, envFile, result } = runVerifier();
  assert.equal(result.status, 0, `verifier must pass; stderr: ${result.stderr}`);
  assert.doesNotMatch(result.stderr, /ReferenceError|sourceDeployRunId is not defined/);
  const proofPath = path.join(dir, 'launch_package', 'trusted-production-deploy-source.json');
  assert.ok(existsSync(proofPath), 'proof file must be written');
  const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
  assert.equal(proof.status, 'passed');
  assert.equal(proof.sourceDeployRunId, RUN_ID);
  assert.equal(proof.commitSha, SHA);
  assert.equal(proof.hardLaunchClaim, false);
  const githubEnv = readFileSync(envFile, 'utf8');
  assert.match(githubEnv, new RegExp(`TRUSTED_PRODUCTION_DEPLOY_RUN_ID=${RUN_ID}`));
});
