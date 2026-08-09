import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classifyPermanentFirebaseDeploymentFailure } from '../../scripts/lib/firebase-deployment-failure-classifier.mjs';
import { verifyFirebaseDeployedFunctionSecretContract } from '../../scripts/verify-firebase-deployed-function-secret-contract.mjs';
import { verifyFirebaseDeploymentReadiness } from '../../scripts/verify-firebase-deployment-readiness.mjs';

const repo = 'bin-group-57c60';

const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('billing and project-write deploy failures are classified as permanent', () => {
  assert.deepEqual(
    classifyPermanentFirebaseDeploymentFailure('HTTP Error: 403, This API method requires billing to be enabled.'),
    {
      code: 'PROJECT_BILLING_REQUIRED',
      message: 'Cloud Billing is not active for the Firebase project. Link bin-group-57c60 to an active billing account before retrying.',
    },
  );
  assert.deepEqual(
    classifyPermanentFirebaseDeploymentFailure('HTTP Error: 403, Write access to project bin-group-57c60 was denied.'),
    {
      code: 'PROJECT_WRITE_ACCESS_DENIED',
      message: 'The deployment identity does not have the required Google Cloud project write access. Correct IAM or project access before retrying.',
    },
  );
  assert.equal(classifyPermanentFirebaseDeploymentFailure('HTTP Error: 429 quota exceeded'), null);
});

test('deployment readiness confirms billing before checking Cloud Functions access', async () => {
  const requests = [];
  const result = await verifyFirebaseDeploymentReadiness({
    projectId: repo,
    tokenProvider: async () => 'test-access-token',
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).includes('cloudbilling.googleapis.com')) {
        return jsonResponse(200, { billingEnabled: true });
      }
      return jsonResponse(200, { functions: [] });
    },
  });

  assert.equal(result.billingActive, true);
  assert.equal(result.cloudFunctionsListAccess, true);
  assert.equal(requests.length, 2);
  assert.match(requests[0], /cloudbilling\.googleapis\.com/);
  assert.match(requests[1], /cloudfunctions\.googleapis\.com/);
});

test('deployment readiness stops before Cloud Functions when billing is inactive', async () => {
  const requests = [];
  await assert.rejects(
    verifyFirebaseDeploymentReadiness({
      projectId: repo,
      tokenProvider: async () => 'test-access-token',
      fetchImpl: async (url) => {
        requests.push(String(url));
        return jsonResponse(200, { billingEnabled: false });
      },
    }),
    /Cloud Billing is not active/,
  );
  assert.equal(requests.length, 1);
});

test('compiled Function secret contract fails closed on drift without accessing secret values', () => {
  const result = verifyFirebaseDeployedFunctionSecretContract({
    expectedSecretNames: ['ALPHA_SECRET', 'BETA_SECRET'],
    discoverSecretNames: () => ['BETA_SECRET', 'ALPHA_SECRET'],
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.secretValuesExcluded, true);
  assert.equal(result.deploymentPerformed, false);

  assert.throws(
    () => verifyFirebaseDeployedFunctionSecretContract({
      expectedSecretNames: ['ALPHA_SECRET'],
      discoverSecretNames: () => ['ALPHA_SECRET', 'BETA_SECRET'],
    }),
    /missing from preflight: BETA_SECRET/,
  );
});

test('production workflows run the read-only cloud readiness gate before any deploy', () => {
  const deployWorkflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
  const preflightWorkflow = readFileSync('.github/workflows/production-readiness-preflight.yml', 'utf8');
  const deployJob = deployWorkflow.indexOf('deploy-firebase-production-stack:');
  const deployAuth = deployWorkflow.indexOf('Authenticate to Google Cloud by Workload Identity Federation', deployJob);
  const deployInstall = deployWorkflow.indexOf('Install dependencies with retry', deployJob);
  const deployGcloudSetup = deployWorkflow.indexOf('Set up Google Cloud CLI for protected Secret Manager checks', deployJob);
  const deployReadiness = deployWorkflow.indexOf('Verify Firebase project billing and Cloud Functions deployment access', deployJob);
  const deployCommand = deployWorkflow.indexOf('node scripts/deploy-firebase-production.mjs', deployJob);
  const deployFunctionsBuild = deployWorkflow.indexOf('Build Firebase Functions', deployJob);
  const deploySecretContract = deployWorkflow.indexOf('Verify compiled Firebase Function secret contract', deployJob);

  assert.ok(deployJob >= 0, 'production deploy job must exist');
  assert.ok(deployGcloudSetup > deployAuth, 'production deploy must configure gcloud after Workload Identity authentication');
  assert.ok(deployInstall > deployGcloudSetup, 'production deploy must configure gcloud before installing dependencies');
  assert.ok(deployReadiness > deployInstall, 'production deploy must install dependencies before the readiness script');
  assert.ok(deployCommand > deployReadiness, 'production deploy must verify cloud readiness before Firebase mutations');
  assert.ok(deploySecretContract > deployFunctionsBuild, 'production deploy must verify the compiled Function secret contract after building Functions');
  assert.ok(deployCommand > deploySecretContract, 'production deploy must verify the compiled Function secret contract before Firebase mutations');
  assert.match(preflightWorkflow, /Verify Firebase project billing and Cloud Functions deployment access/);
  assert.match(preflightWorkflow, /node scripts\/verify-firebase-deployment-readiness\.mjs/);
  assert.match(preflightWorkflow, /Build Firebase Functions for deployment-secret contract verification/);
  assert.match(preflightWorkflow, /verify-firebase-deployed-function-secret-contract\.mjs/);
  assert.match(deployWorkflow, /google-github-actions\/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db/);
});

test('the deploy runner exits instead of retrying permanent Google Cloud failures', () => {
  const source = readFileSync('scripts/deploy-firebase-production.mjs', 'utf8');
  assert.match(source, /classifyPermanentFirebaseDeploymentFailure/);
  assert.match(source, /will not retry/);
  assert.match(source, /process\.exit\(1\)/);
});
