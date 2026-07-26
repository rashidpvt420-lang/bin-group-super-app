#!/usr/bin/env node

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseAuthorizedApprovers } from './lib/authorized-approvers.mjs';

const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const SOURCE_WORKFLOW_NAME = 'Firebase Production Deploy';
const SOURCE_WORKFLOW_PATH = '.github/workflows/firebase-production-deploy.yml';
const REQUIRED_DEPLOY_JOB = 'Deploy Firebase production stack';
const AUTOMATION_ACTOR = 'github-actions[bot]';
const OUTPUT_PATH = 'launch_package/trusted-production-deploy-source.json';
const ALLOWED_CHILD_CONTEXTS = new Map([
  ['Operational Provider Evidence', 'verify-and-publish'],
  ['Operational Application Evidence', 'verify-and-publish'],
  ['Privileged Access Rotation Evidence', 'verify-rotation'],
]);
const text = (value) => String(value ?? '').trim();
const fail = (message) => {
  throw new Error(`[trusted-production-deploy-source] ${message}`);
};

async function githubJson(path) {
  const token = text(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
  if (!token) fail('GH_TOKEN is required');
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) fail(`GitHub API ${path} failed with HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    fail(`GitHub API ${path} returned malformed JSON`);
  }
}

try {
  if (process.env.GITHUB_ACTIONS !== 'true') fail('verification may only run in GitHub Actions');
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') {
    fail('verification requires protected main');
  }
  if (process.env.GITHUB_ACTOR !== AUTOMATION_ACTOR) {
    fail('postdeploy child evidence must be dispatched by github-actions[bot]');
  }
  if (ALLOWED_CHILD_CONTEXTS.get(text(process.env.GITHUB_WORKFLOW)) !== text(process.env.GITHUB_JOB)) {
    fail('unexpected postdeploy child workflow context');
  }

  const sourceRunId = text(process.env.SOURCE_DEPLOY_RUN_ID);
  const expectedSha = text(process.env.GITHUB_SHA);
  if (!/^\d+$/.test(sourceRunId) || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    fail('numeric source run ID and exact lowercase SHA are required');
  }

  let authorizedActors;
  try {
    authorizedActors = parseAuthorizedApprovers(process.env.SOURCE_AUTHORIZED_FOUNDER_ACTORS);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'authorized Founder actor list is invalid');
  }
  if (!authorizedActors.length) fail('SOURCE_AUTHORIZED_FOUNDER_ACTORS is empty');

  const [run, mainRef, jobsPayload, artifactsPayload] = await Promise.all([
    githubJson(`/actions/runs/${sourceRunId}`),
    githubJson('/git/ref/heads/main'),
    githubJson(`/actions/runs/${sourceRunId}/jobs?per_page=100`),
    githubJson(`/actions/runs/${sourceRunId}/artifacts?per_page=100`),
  ]);

  const currentMainSha = text(mainRef?.object?.sha);
  const sourceActor = text(run?.triggering_actor?.login || run?.actor?.login);
  const createdAt = Date.parse(text(run?.created_at));
  if (String(run?.id || '') !== sourceRunId) fail('source run ID mismatch');
  if (run?.name !== SOURCE_WORKFLOW_NAME || run?.path !== SOURCE_WORKFLOW_PATH) {
    fail('source workflow identity mismatch');
  }
  if (run?.event !== 'workflow_dispatch' || run?.head_branch !== 'main' || run?.head_sha !== expectedSha) {
    fail('source run is not the exact main deployment SHA');
  }
  if (run?.repository?.full_name !== REPOSITORY) fail('source run repository mismatch');
  if (run?.status !== 'completed' || run?.conclusion !== 'success') {
    fail('source production deployment run is not successfully completed');
  }
  if (currentMainSha !== expectedSha) {
    fail(`main advanced from deployed SHA ${expectedSha} to ${currentMainSha || '(missing)'}`);
  }
  if (!authorizedActors.includes(sourceActor)) {
    fail('source production deployment was not triggered by an authorized Founder actor');
  }
  if (
    !Number.isFinite(createdAt)
    || Date.now() - createdAt > 24 * 60 * 60 * 1000
    || createdAt > Date.now() + 5 * 60 * 1000
  ) {
    fail('source production deployment run is stale or future-dated');
  }

  const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [];
  const deploymentJob = jobs.find((job) => job?.name === REQUIRED_DEPLOY_JOB);
  if (!deploymentJob || deploymentJob.status !== 'completed' || deploymentJob.conclusion !== 'success') {
    fail('source deployment stack job is not successful');
  }

  const artifacts = Array.isArray(artifactsPayload?.artifacts) ? artifactsPayload.artifacts : [];
  const artifactName = `production-deployment-${expectedSha}`;
  const deploymentArtifact = artifacts.find(
    (artifact) => artifact?.name === artifactName && artifact?.expired !== true,
  );
  if (!deploymentArtifact) fail(`source run is missing ${artifactName}`);
  const artifactDigest = text(deploymentArtifact.digest).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(artifactDigest)) {
    fail('source deployment artifact digest is missing or invalid');
  }

  const proof = {
    schemaVersion: 1,
    status: 'passed',
    sourceWorkflowName: SOURCE_WORKFLOW_NAME,
    sourceWorkflowPath: SOURCE_WORKFLOW_PATH,
    sourceDeployRunId,
    sourceDeployJobId: String(deploymentJob.id || ''),
    sourceActor,
    commitSha: expectedSha,
    currentMainSha,
    repository: REPOSITORY,
    artifactName,
    artifactId: String(deploymentArtifact.id || ''),
    artifactDigest,
    childWorkflow: text(process.env.GITHUB_WORKFLOW),
    childJob: text(process.env.GITHUB_JOB),
    verifiedAt: new Date().toISOString(),
    hardLaunchClaim: false,
  };
  mkdirSync('launch_package', { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });

  const childActors = [...new Set([...authorizedActors, AUTOMATION_ACTOR])].join(',');
  appendFileSync(
    process.env.GITHUB_ENV,
    [
      'TRUSTED_PRODUCTION_DEPLOY_EVIDENCE=true',
      `TRUSTED_PRODUCTION_DEPLOY_RUN_ID=${sourceRunId}`,
      `AUTHORIZED_FOUNDER_ACTORS=${childActors}`,
      '',
    ].join('\n'),
  );
  console.log(`[trusted-production-deploy-source] PASS run=${sourceRunId} sha=${expectedSha}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '[trusted-production-deploy-source] verification failed');
  process.exit(1);
}
