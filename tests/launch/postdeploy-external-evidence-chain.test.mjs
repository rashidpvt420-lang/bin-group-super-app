import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const paths = Object.freeze({
  chain: '.github/workflows/postdeploy-external-evidence-chain.yml',
  provider: '.github/workflows/postdeploy-operational-provider-evidence.yml',
  application: '.github/workflows/postdeploy-operational-application-evidence.yml',
  rotation: '.github/workflows/postdeploy-privileged-access-rotation-evidence.yml',
  dispatcher: 'scripts/dispatch-postdeploy-external-evidence.mjs',
  trustedSource: 'scripts/verify-trusted-production-deploy-source.mjs',
  approvers: 'scripts/lib/authorized-approvers.mjs',
  verifier: 'scripts/verify-operational-application-evidence.mjs',
  publisher: 'scripts/publish-operational-application-evidence.mjs',
});

const ordered = (source, fragments) => {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1);
    assert.ok(next > cursor, `missing or out-of-order fragment: ${fragment}`);
    cursor = next;
  }
};

const requireJobScopedOidc = (workflow) => {
  const jobsIndex = workflow.indexOf('\njobs:');
  assert.ok(jobsIndex >= 0, 'workflow jobs block is missing');
  assert.doesNotMatch(workflow.slice(0, jobsIndex), /id-token:\s*write/);
  assert.match(workflow.slice(jobsIndex), /permissions:[\s\S]*id-token:\s*write/);
  assert.doesNotMatch(workflow, /ref:\s*\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /Checkout current main evidence commit/);
};

test('postdeploy chain is bound to a successful exact-main Firebase production workflow', async () => {
  const [workflow, dispatcher] = await Promise.all([read(paths.chain), read(paths.dispatcher)]);
  assert.match(workflow, /^name:\s*Postdeploy External Evidence Chain/m);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /Firebase Production Deploy/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'workflow_dispatch'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  const jobsIndex = workflow.indexOf('\njobs:');
  assert.doesNotMatch(workflow.slice(0, jobsIndex), /actions:\s*write/);
  assert.match(workflow.slice(jobsIndex), /permissions:[\s\S]*actions:\s*write/);
  assert.match(workflow, /Checkout current main orchestration commit/);
  assert.doesNotMatch(workflow, /ref:\s*\$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /if-no-files-found:\s*error/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.doesNotMatch(workflow, /pull_request_target|repository_dispatch/);

  assert.match(dispatcher, /SOURCE_WORKFLOW_PATH = '\.github\/workflows\/firebase-production-deploy\.yml'/);
  assert.match(dispatcher, /SOURCE_DEPLOY_JOB = 'Deploy Firebase production stack'/);
  assert.match(dispatcher, /run\?\.event !== 'workflow_dispatch'/);
  assert.match(dispatcher, /run\?\.head_branch !== 'main'/);
  assert.match(dispatcher, /authorizedActors\.includes\(sourceActor\)/);
  assert.match(dispatcher, /requireCurrentMain\(sourceSha, 'source verification'\)/);
  assert.match(dispatcher, /source production deployment run is stale or future-dated/);
  assert.match(dispatcher, /production-deployment-\$\{sourceSha\}/);
  assert.match(dispatcher, /\^sha256:\[a-f0-9\]\{64\}\$/);
});

test('dispatcher verifies each child workflow, job, exact SHA and artifact and writes failure evidence', async () => {
  const dispatcher = await read(paths.dispatcher);
  for (const value of [
    'postdeploy-operational-provider-evidence.yml',
    'postdeploy-operational-application-evidence.yml',
    'postdeploy-privileged-access-rotation-evidence.yml',
    'Verify and publish provider evidence',
    'Verify and publish application evidence',
    'Verify privileged access rotation',
  ]) assert.match(dispatcher, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(dispatcher, /completed\?\.head_sha !== sourceSha/);
  assert.match(dispatcher, /completed\?\.actor\?\.login/);
  assert.match(dispatcher, /requiredJob\.conclusion !== 'success'/);
  assert.match(dispatcher, /verifyChildArtifacts/);
  assert.match(dispatcher, /candidate\?\.expired !== true/);
  assert.match(dispatcher, /requireCurrentMain\(sourceSha, `\$\{definition\.key\} completion`\)/);
  assert.match(dispatcher, /status: 'failed'/);
  assert.match(dispatcher, /failureReason: sanitizeReason/);
  assert.match(dispatcher, /writeFileSync\(OUTPUT_PATH/);
  assert.match(dispatcher, /hardLaunchClaim: false/);
  assert.doesNotMatch(dispatcher, /response\.text\(\)/);
  assert.match(dispatcher, /await response\.json\(\)/);
});

test('automation trust is scoped to verified child workflows and never added globally', async () => {
  const [trusted, approvers] = await Promise.all([read(paths.trustedSource), read(paths.approvers)]);
  assert.doesNotMatch(approvers, /github-actions\[bot\]|TRUSTED_PRODUCTION_DEPLOY/);
  assert.match(trusted, /ALLOWED_CHILD_CONTEXTS = new Map/);
  assert.match(trusted, /Operational Provider Evidence/);
  assert.match(trusted, /Operational Application Evidence/);
  assert.match(trusted, /Privileged Access Rotation Evidence/);
  assert.match(trusted, /process\.env\.GITHUB_ACTOR !== AUTOMATION_ACTOR/);
  assert.match(trusted, /SOURCE_AUTHORIZED_FOUNDER_ACTORS/);
  assert.match(trusted, /currentMainSha !== expectedSha/);
  assert.match(trusted, /authorizedActors\.includes\(sourceActor\)/);
  assert.match(trusted, /source deployment stack job is not successful/);
  assert.match(trusted, /source run is missing \$\{artifactName\}/);
  assert.match(trusted, /AUTHORIZED_FOUNDER_ACTORS=\$\{childActors\}/);
  assert.doesNotMatch(trusted, /response\.text\(\)/);
  assert.match(trusted, /await response\.json\(\)/);
  ordered(trusted, [
    'authorizedActors.includes(sourceActor)',
    'deploymentArtifact.digest',
    'writeFileSync(OUTPUT_PATH',
    'AUTHORIZED_FOUNDER_ACTORS=${childActors}',
  ]);
});

test('provider child retains protected environment and scopes operational authorization after parent verification', async () => {
  const workflow = await read(paths.provider);
  assert.match(workflow, /^name:\s*Operational Provider Evidence/m);
  assert.match(workflow, /^\s{2}verify-and-publish:/m);
  assert.match(workflow, /name:\s*Verify and publish provider evidence/);
  assert.match(workflow, /environment:\s*hard-public-launch/);
  requireJobScopedOidc(workflow);
  assert.match(workflow, /SOURCE_AUTHORIZED_FOUNDER_ACTORS:/);
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf('steps:')), /\n\s+AUTHORIZED_FOUNDER_ACTORS:/);
  ordered(workflow, [
    'Verify trusted parent production deployment',
    'Enforce deployment-triggered provider evidence inputs',
    'Authenticate Google Cloud',
    'Verify BIN GROUP branded SMTP delivery',
    'Verify production App Check enforcement',
    'Publish and finalize baseline provider evidence',
  ]);
  assert.match(workflow, /TRUSTED_PRODUCTION_DEPLOY_RUN_ID/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS.*github-actions\[bot\]/);
  assert.match(workflow, /postdeploy-operational-provider-\$\{\{ inputs\.expected_commit_sha \}\}/);
});

test('application child uses the validated canonical verifier and scopes Founder secrets to one step', async () => {
  const workflow = await read(paths.application);
  assert.match(workflow, /^name:\s*Operational Application Evidence/m);
  assert.match(workflow, /name:\s*Verify and publish application evidence/);
  assert.match(workflow, /environment:\s*hard-public-launch/);
  requireJobScopedOidc(workflow);
  const steps = workflow.indexOf('\n    steps:');
  const evidence = workflow.indexOf('- name: Auto-discover, verify, and publish all application evidence');
  const upload = workflow.indexOf('- name: Upload deployment-triggered application proof batch');
  assert.ok(steps >= 0 && evidence > steps && upload > evidence);
  assert.doesNotMatch(workflow.slice(0, steps), /E2E_FOUNDER_EMAIL:|E2E_FOUNDER_PASSWORD:|E2E_FOUNDER_TOTP_SECRET:/);
  const evidenceScope = workflow.slice(evidence, upload);
  assert.match(evidenceScope, /E2E_FOUNDER_EMAIL:/);
  assert.match(evidenceScope, /E2E_FOUNDER_PASSWORD:/);
  assert.match(evidenceScope, /E2E_FOUNDER_TOTP_SECRET:/);
  ordered(evidenceScope, [
    'verify-operational-application-provenance.mjs',
    'verify-operational-application-evidence-mfa.mjs',
    'bind-operational-application-provenance.mjs',
    'publish-operational-application-evidence.mjs',
  ]);
  assert.match(workflow, /functionsDeployment\?\.reconciliation/);
  assert.match(workflow, /postdeploy-operational-application-\$\{\{ inputs\.expected_commit_sha \}\}/);
});

test('rotation child proves real Admin authentication before publishing protected rotation evidence', async () => {
  const workflow = await read(paths.rotation);
  assert.match(workflow, /^name:\s*Privileged Access Rotation Evidence/m);
  assert.match(workflow, /name:\s*Verify privileged access rotation/);
  assert.match(workflow, /environment:\s*hard-launch-operations/);
  requireJobScopedOidc(workflow);
  ordered(workflow, [
    'Verify trusted parent production deployment',
    'Prove rotated Admin credential is accepted by Firebase Auth',
    'Verify provider-backed credential rotation',
    'Bind Admin login proof to the rotation record',
    'Publish canonical privileged-rotation evidence',
  ]);
  assert.match(workflow, /E2E_ADMIN_PASSWORD:/);
  assert.match(workflow, /postdeploy-privileged-access-rotation-\$\{\{ inputs\.expected_commit_sha \}\}/);
});

test('canonical application proof contract remains intact', async () => {
  const [verifier, publisher] = await Promise.all([read(paths.verifier), read(paths.publisher)]);
  assert.match(verifier, /action === 'ADMIN_APPROVE_PAYMENT'/);
  assert.match(verifier, /where\('paymentId', '==', bindings\.paymentId\)/);
  assert.match(verifier, /collection\('staffAccess'\)/);
  for (const field of ['authDisabled', 'staffRegistryCount', 'permissionsHash', 'createdAt']) {
    assert.match(verifier, new RegExp(field));
  }
  for (const field of ['watchId', 'sourceIdHash', 'tenantBindingHash', 'renewalStatus']) {
    assert.match(verifier, new RegExp(field));
  }
  assert.match(verifier, /source: 'operational-application-production-verifier'/);
  const factorChecks = publisher.match(/requiredHash\(e\.replaySecondFactorHash, 'replaySecondFactorHash', errors\)/g) || [];
  assert.equal(factorChecks.length, 2);
});
