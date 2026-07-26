import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const ordered = (source, fragments) => {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1);
    assert.notEqual(next, -1, `missing required fragment: ${fragment}`);
    assert.ok(next > cursor, `fragment is out of order: ${fragment}`);
    cursor = next;
  }
};

const workflows = [
  '.github/workflows/operational-provider-evidence.yml',
  '.github/workflows/privileged-access-rotation-evidence.yml',
  '.github/workflows/technician-physical-evidence.yml',
];

test('all external production evidence requires an exact successful deployment run', () => {
  for (const path of workflows) {
    const source = read(path);
    assert.match(source, /production_deploy_run_id:/, `${path} must request a deployment run`);
    assert.match(source, /required:\s*true[\s\S]*production_deploy_run_id must be numeric/, `${path} must require and validate the run ID`);
    assert.match(source, /actions:\s*read/, `${path} must read protected workflow artifacts`);
    assert.match(source, /verify-trusted-production-deploy-source\.mjs/, `${path} must verify the source workflow run`);
    assert.match(source, /production-deployment-\$\{\{ inputs\.expected_commit_sha \}\}/, `${path} must download the exact-SHA artifact`);
    assert.match(source, /run-id:\s*\$\{\{ inputs\.production_deploy_run_id \}\}/, `${path} must select the exact deployment run`);
    assert.match(source, /verify-exact-production-deployment-artifact\.mjs/, `${path} must validate deployment metadata`);
    assert.doesNotMatch(source, /GITHUB_ACTOR"?\s*==\s*"?github-actions\[bot\]/, `${path} must not authorize a bot as Founder`);
  }
});

test('deployment binding runs before every external provider or operational proof', () => {
  const provider = read('.github/workflows/operational-provider-evidence.yml');
  ordered(provider, [
    'verify-trusted-production-deploy-source.mjs',
    'verify-exact-production-deployment-artifact.mjs',
    'Verify BIN GROUP branded SMTP delivery',
    'Verify production App Check enforcement',
    'Verify live Sovereign AI providers',
    'Verify live Stripe payment',
    'Publish and finalize canonical provider evidence',
  ]);

  const rotation = read('.github/workflows/privileged-access-rotation-evidence.yml');
  ordered(rotation, [
    'verify-trusted-production-deploy-source.mjs',
    'verify-exact-production-deployment-artifact.mjs',
    'Prove rotated Admin credential is accepted by Firebase Auth',
    'Verify provider-backed credential rotation',
    'Publish canonical privileged-rotation evidence',
  ]);

  const technician = read('.github/workflows/technician-physical-evidence.yml');
  ordered(technician, [
    'verify-trusted-production-deploy-source.mjs',
    'verify-exact-production-deployment-artifact.mjs',
    'Verify real physical technician mission',
    'Publish canonical technician operational evidence',
  ]);
});

test('source verifier requires the successful Founder-triggered Firebase deployment workflow', () => {
  const source = read('scripts/verify-trusted-production-deploy-source.mjs');
  assert.match(source, /SOURCE_WORKFLOW_NAME = 'Firebase Production Deploy'/);
  assert.match(source, /SOURCE_WORKFLOW_PATH = '\.github\/workflows\/firebase-production-deploy\.yml'/);
  assert.match(source, /REQUIRED_JOB_NAME = 'Deploy Firebase production stack'/);
  assert.match(source, /run\?\.event !== 'workflow_dispatch'/);
  assert.match(source, /run\?\.head_branch !== 'main'/);
  assert.match(source, /run\?\.head_sha !== expectedSha/);
  assert.match(source, /run\?\.conclusion !== 'success'/);
  assert.match(source, /authorizedActors\.includes\(sourceActor\)/);
  assert.match(source, /deploymentJob\.conclusion !== 'success'/);
  assert.match(source, /production-deployment-\$\{expectedSha\}/);
  assert.match(source, /artifact\.expired !== true/);
  assert.match(source, /MAX_SOURCE_AGE_MS/);
  assert.doesNotMatch(source, /GITHUB_ACTOR !== 'github-actions\[bot\]'/);
});

test('shared deployment verifier rejects stale, mismatched and unreconciled deployments', () => {
  const source = read('scripts/verify-exact-production-deployment-artifact.mjs');
  assert.match(source, /deployment\.status !== 'passed'/);
  assert.match(source, /deployment\.projectId !== EXPECTED_PROJECT_ID/);
  assert.match(source, /deployment\.deployedCommitSha/);
  assert.match(source, /deployment\.workflowRunId/);
  assert.match(source, /deployment\.workflowRef !== 'refs\/heads\/main'/);
  assert.match(source, /validatedArtifactDigest/);
  assert.match(source, /reconciliation\.status !== 'passed'/);
  assert.match(source, /currentMissingAfter/);
  assert.match(source, /obsoleteOwnedRemaining/);
  assert.match(source, /EXPECTED_DEPLOYMENT_SHA/);
  assert.match(source, /PRODUCTION_DEPLOY_RUN_ID/);
  assert.doesNotMatch(source, /github-actions\[bot\]/);
});
