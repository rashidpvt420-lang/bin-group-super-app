import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  isTrustedProductionDeployAutomation,
  requireAuthorizedApprover,
} from '../../scripts/lib/authorized-approvers.mjs';

const files = {
  orchestratorWorkflow: new URL('../../.github/workflows/postdeploy-external-evidence-chain.yml', import.meta.url),
  providerWorkflow: new URL('../../.github/workflows/postdeploy-operational-provider-evidence.yml', import.meta.url),
  applicationWorkflow: new URL('../../.github/workflows/postdeploy-operational-application-evidence.yml', import.meta.url),
  rotationWorkflow: new URL('../../.github/workflows/postdeploy-privileged-access-rotation-evidence.yml', import.meta.url),
  dispatcher: new URL('../../scripts/dispatch-postdeploy-external-evidence.mjs', import.meta.url),
  sourceVerifier: new URL('../../scripts/verify-trusted-production-deploy-source.mjs', import.meta.url),
  applicationVerifier: new URL('../../scripts/verify-operational-application-evidence.mjs', import.meta.url),
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, url]) => [key, await readFile(url, 'utf8')])),
);

function ordered(content, fragments) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = content.indexOf(fragment, cursor + 1);
    assert.ok(next > cursor, `expected ${JSON.stringify(fragment)} after offset ${cursor}`);
    cursor = next;
  }
}

test('postdeploy orchestration scripts parse under Node 22 syntax', () => {
  for (const url of [files.dispatcher, files.sourceVerifier, files.applicationVerifier]) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(url)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${fileURLToPath(url)} failed syntax validation:\n${result.stderr || result.stdout}`);
  }
});

test('trusted automation requires the GitHub Actions bot and exact verified source run equality', () => {
  const validEnv = {
    AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang',
    TRUSTED_PRODUCTION_DEPLOY_EVIDENCE: 'true',
    SOURCE_DEPLOY_RUN_ID: '123456',
    TRUSTED_PRODUCTION_DEPLOY_RUN_ID: '123456',
  };
  assert.equal(isTrustedProductionDeployAutomation('github-actions[bot]', validEnv), true);
  assert.equal(requireAuthorizedApprover('github-actions[bot]', validEnv), 'github-actions[bot]');
  assert.equal(isTrustedProductionDeployAutomation('github-actions[bot]', { ...validEnv, TRUSTED_PRODUCTION_DEPLOY_RUN_ID: '654321' }), false);
  assert.equal(isTrustedProductionDeployAutomation('github-actions[bot]', { ...validEnv, TRUSTED_PRODUCTION_DEPLOY_EVIDENCE: 'false' }), false);
  assert.equal(isTrustedProductionDeployAutomation('rashidpvt420-lang', validEnv), false);
  assert.throws(() => requireAuthorizedApprover('github-actions[bot]', { ...validEnv, SOURCE_DEPLOY_RUN_ID: '' }), /Unauthorized GitHub actor/);
});

test('source verifier proves exact successful founder-triggered deployment job and artifact', () => {
  for (const fragment of [
    "SOURCE_WORKFLOW_NAME = 'Firebase Production Deploy'",
    "SOURCE_WORKFLOW_PATH = '.github/workflows/firebase-production-deploy.yml'",
    "REQUIRED_JOB_NAME = 'Deploy Firebase production stack'",
    "run?.event !== 'workflow_dispatch'",
    "run?.head_branch !== 'main'",
    "run?.head_sha !== expectedSha",
    "run?.status !== 'completed'",
    "run?.conclusion !== 'success'",
    'authorizedActors.includes(sourceActor)',
    'Date.now() - createdAt > 24 * 60 * 60 * 1000',
    'deploymentJob.status !== \'completed\'',
    'deploymentJob.conclusion !== \'success\'',
    '`production-deployment-${expectedSha}`',
    '/^sha256:[a-f0-9]{64}$/.test(artifactDigest)',
    'TRUSTED_PRODUCTION_DEPLOY_EVIDENCE=true',
    'TRUSTED_PRODUCTION_DEPLOY_RUN_ID=${sourceRunId}',
  ]) {
    assert.match(source.sourceVerifier, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source.sourceVerifier, /GITHUB_ACTOR !== 'github-actions\[bot\]'/);
  assert.doesNotMatch(source.sourceVerifier, /hardLaunchClaim:\s*true/);
});

test('orchestrator runs only after a successful workflow-dispatch production deployment', () => {
  assert.match(source.orchestratorWorkflow, /^name:\s*Postdeploy External Evidence Chain/m);
  assert.match(source.orchestratorWorkflow, /workflow_run:[\s\S]*Firebase Production Deploy[\s\S]*completed/);
  assert.match(source.orchestratorWorkflow, /permissions:[\s\S]*contents:\s*read[\s\S]*actions:\s*write/);
  assert.match(source.orchestratorWorkflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(source.orchestratorWorkflow, /github\.event\.workflow_run\.event == 'workflow_dispatch'/);
  assert.match(source.orchestratorWorkflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(source.orchestratorWorkflow, /SOURCE_DEPLOY_RUN_ID:\s*\$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(source.orchestratorWorkflow, /SOURCE_DEPLOY_SHA:\s*\$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(source.orchestratorWorkflow, /node scripts\/dispatch-postdeploy-external-evidence\.mjs/);
});

test('dispatcher rejects SHA drift and waits for every exact child workflow to succeed', () => {
  assert.match(source.dispatcher, /main advanced from deployed SHA/);
  assert.match(source.dispatcher, /currentMainSha !== sourceSha/);
  assert.match(source.dispatcher, /run\?\.name !== SOURCE_WORKFLOW_NAME/);
  assert.match(source.dispatcher, /run\?\.path !== SOURCE_WORKFLOW_PATH/);
  assert.match(source.dispatcher, /run\?\.conclusion !== 'success'/);
  assert.match(source.dispatcher, /authorizedActors\.includes\(sourceActor\)/);
  assert.match(source.dispatcher, /source deployment artifact digest is missing or invalid/);
  assert.match(source.dispatcher, /method:\s*'POST'/);
  assert.match(source.dispatcher, /\/dispatches/);
  assert.match(source.dispatcher, /text\(run\.display_title\)\.includes\(marker\)/);
  assert.match(source.dispatcher, /text\(run\.actor\?\.login\) === 'github-actions\[bot\]'/);
  assert.match(source.dispatcher, /completed\?\.conclusion !== 'success'/);
  assert.match(source.dispatcher, /for \(const definition of children\)/);
  assert.match(source.dispatcher, /hardLaunchClaim:\s*false/);
  ordered(source.dispatcher, [
    "key: 'provider'",
    "key: 'application'",
    "key: 'rotation'",
    'for (const definition of children)',
  ]);
});

test('provider child preserves canonical workflow identity and protected environment', () => {
  assert.match(source.providerWorkflow, /^name:\s*Operational Provider Evidence/m);
  assert.match(source.providerWorkflow, /^\s{2}verify-and-publish:/m);
  assert.match(source.providerWorkflow, /environment:\s*hard-public-launch/);
  assert.match(source.providerWorkflow, /SOURCE_DEPLOY_RUN_ID:\s*\$\{\{ inputs\.source_deploy_run_id \}\}/);
  ordered(source.providerWorkflow, [
    'Verify trusted parent production deployment',
    'Enforce deployment-triggered provider evidence inputs',
    'Verify BIN GROUP branded SMTP delivery',
    'Verify production App Check enforcement',
    'Publish and finalize baseline provider evidence',
  ]);
  assert.match(source.providerWorkflow, /brandedEmailDelivery appCheckEnforcement/);
  assert.match(source.providerWorkflow, /TRUSTED_PRODUCTION_DEPLOY_RUN_ID.*SOURCE_DEPLOY_RUN_ID/);
});

test('application child publishes every exact-deployment application gate under Founder TOTP', () => {
  assert.match(source.applicationWorkflow, /^name:\s*Operational Application Evidence/m);
  assert.match(source.applicationWorkflow, /^\s{2}verify-and-publish:/m);
  assert.match(source.applicationWorkflow, /environment:\s*hard-public-launch/);
  for (const secret of ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'E2E_FOUNDER_TOTP_SECRET']) {
    assert.match(source.applicationWorkflow, new RegExp(`${secret}:`));
  }
  for (const gate of [
    'ownerPaymentActivation',
    'paymentUnlockExactlyOnce',
    'tenantNotificationDelivery',
    'brokerCommissionLockExactlyOnce',
    'adminStaffClaims',
    'renewalScheduler',
  ]) {
    assert.match(source.applicationWorkflow, new RegExp(gate));
  }
  ordered(source.applicationWorkflow, [
    'Verify trusted parent production deployment',
    'Download exact production deployment metadata',
    'Function reconciliation evidence is missing',
    'verify-operational-application-provenance.mjs',
    'verify-operational-application-evidence-mfa.mjs',
    'bind-operational-application-provenance.mjs',
    'publish-operational-application-evidence.mjs',
  ]);
});

test('rotation child proves real Admin login and secret rotation under operations protection', () => {
  assert.match(source.rotationWorkflow, /^name:\s*Privileged Access Rotation Evidence/m);
  assert.match(source.rotationWorkflow, /^\s{2}verify-rotation:/m);
  assert.match(source.rotationWorkflow, /environment:\s*hard-launch-operations/);
  ordered(source.rotationWorkflow, [
    'Verify trusted parent production deployment',
    'Prove rotated Admin credential is accepted by Firebase Auth',
    'Verify provider-backed credential rotation',
    'Bind Admin login proof to the rotation record',
    'Publish canonical privileged-rotation evidence',
  ]);
});

test('application verifier no longer hard-codes one human actor', () => {
  assert.match(source.applicationVerifier, /requireAuthorizedApprover\(process\.env\.GITHUB_ACTOR\)/);
  assert.doesNotMatch(source.applicationVerifier, /GITHUB_ACTOR !== 'rashidpvt420-lang'/);
});
