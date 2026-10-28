import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('../../scripts/dispatch-postdeploy-external-evidence.mjs', import.meta.url).pathname;
const SHA = 'c30a3b633cdc7b5ca1610091fcfe406a8c87948c';
const SOURCE_RUN = '40697672228';

const children = {
  'postdeploy-operational-provider-evidence.yml': ['Operational Provider Evidence', 'Verify and publish provider evidence', 'postdeploy-operational-provider-'],
  'postdeploy-operational-application-evidence.yml': ['Operational Application Evidence', 'Verify and publish application evidence', 'postdeploy-operational-application-'],
  'postdeploy-privileged-access-rotation-evidence.yml': ['Privileged Access Rotation Evidence', 'Verify privileged access rotation', 'postdeploy-privileged-access-rotation-'],
};

// Preload that fakes the GitHub REST API exactly as it behaves for run-name workflows:
// the run `name` and `display_title` are both the rendered run-name.
const preload = (runNameMode) => `
const SHA = ${JSON.stringify(SHA)};
const SOURCE_RUN = ${JSON.stringify(SOURCE_RUN)};
const children = ${JSON.stringify(children)};
const mode = ${JSON.stringify(runNameMode)};
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
const dispatched = new Set();
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const childByRunId = (id) => Object.entries(children).find(([file]) => String(id) === String(900 + Object.keys(children).indexOf(file)));
const runFor = (file) => {
  const [wf, , ] = children[file];
  const title = wf + ' source-deploy-' + SOURCE_RUN;
  return {
    id: 900 + Object.keys(children).indexOf(file), name: mode === 'bare' ? wf : title, display_title: title,
    path: '.github/workflows/' + file, event: 'workflow_dispatch', head_branch: 'main', head_sha: SHA,
    actor: { login: 'github-actions[bot]' }, repository: { full_name: 'rashidpvt420-lang/bin-group-super-app' },
    status: 'completed', conclusion: 'success', updated_at: new Date().toISOString(),
  };
};
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname.replace('/repos/rashidpvt420-lang/bin-group-super-app', '');
  if (path === '/git/ref/heads/main') return json({ object: { sha: SHA } });
  if (path === '/actions/runs/' + SOURCE_RUN) return json({
    id: Number(SOURCE_RUN), name: 'Firebase Production Deploy', path: '.github/workflows/firebase-production-deploy.yml',
    event: 'workflow_dispatch', head_branch: 'main', head_sha: SHA, status: 'completed', conclusion: 'success',
    repository: { full_name: 'rashidpvt420-lang/bin-group-super-app' }, triggering_actor: { login: 'rashidpvt420-lang' },
    created_at: new Date().toISOString(),
  });
  if (path.startsWith('/actions/runs/' + SOURCE_RUN + '/jobs')) return json({ jobs: [{ id: 1, name: 'Deploy Firebase production stack', status: 'completed', conclusion: 'success' }] });
  if (path.startsWith('/actions/runs/' + SOURCE_RUN + '/artifacts')) return json({ artifacts: [{ id: 2, name: 'production-deployment-' + SHA, expired: false, digest: 'sha256:' + 'a'.repeat(64) }] });
  const dispatch = path.match(/^\\/actions\\/workflows\\/([^/]+)\\/dispatches$/);
  if (dispatch) { dispatched.add(decodeURIComponent(dispatch[1])); return new Response(null, { status: 204 }); }
  const list = path.match(/^\\/actions\\/workflows\\/([^/]+)\\/runs$/);
  if (list) { const file = decodeURIComponent(list[1]); return json({ workflow_runs: dispatched.has(file) ? [runFor(file)] : [] }); }
  const runMatch = path.match(/^\\/actions\\/runs\\/(\\d+)(\\/jobs|\\/artifacts)?$/);
  if (runMatch) {
    const entry = childByRunId(runMatch[1]);
    if (entry) {
      const [file, [, jobName, prefix]] = entry;
      if (runMatch[2] === '/jobs') return json({ jobs: [{ id: 3, name: jobName, status: 'completed', conclusion: 'success' }] });
      if (runMatch[2] === '/artifacts') return json({ artifacts: [{ id: 4, name: prefix + SHA, expired: false, digest: 'sha256:' + 'b'.repeat(64) }] });
      return json(runFor(file));
    }
  }
  return new Response('not found', { status: 404 });
};
`;

function runDispatcher(mode) {
  const dir = mkdtempSync(join(tmpdir(), 'dispatcher-'));
  const preloadPath = join(dir, 'preload.mjs');
  writeFileSync(preloadPath, preload(mode));
  const result = spawnSync(process.execPath, ['--import', preloadPath, SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GH_TOKEN: 'test-token-not-a-secret',
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_WORKFLOW: 'Postdeploy External Evidence Chain',
      GITHUB_JOB: 'dispatch-and-wait',
      AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang',
      SOURCE_DEPLOY_RUN_ID: SOURCE_RUN,
      SOURCE_DEPLOY_SHA: SHA,
    },
  });
  let proof = null;
  try { proof = JSON.parse(readFileSync(join(dir, 'launch_package/postdeploy-external-evidence-chain.json'), 'utf8')); } catch { /* none */ }
  return { ...result, proof };
}

test('dispatcher accepts children whose run name is the rendered run-name (production behaviour)', () => {
  const result = runDispatcher('run-name');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.proof.status, 'passed');
  assert.equal(result.proof.childRuns.length, 3);
  assert.deepEqual(result.proof.childRuns.map((child) => child.key), ['provider', 'application', 'rotation']);
});

test('dispatcher still fails closed when the child run name does not match this source deployment', () => {
  const result = runDispatcher('bare');
  assert.notEqual(result.status, 0);
  assert.equal(result.proof.status, 'failed');
  assert.match(result.proof.failureReason, /evidence child workflow identity changed/);
});
