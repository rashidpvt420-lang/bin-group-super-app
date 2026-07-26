#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { parseAuthorizedApprovers } from './lib/authorized-approvers.mjs';

const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const SOURCE_WORKFLOW_NAME = 'Firebase Production Deploy';
const SOURCE_WORKFLOW_PATH = '.github/workflows/firebase-production-deploy.yml';
const REQUIRED_JOB_NAME = 'Deploy Firebase production stack';
const OUTPUT_PATH = 'launch_package/trusted-production-deploy-source.json';
const MAX_SOURCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const text = (value) => String(value ?? '').trim();
const fail = (message) => {
  console.error(`[trusted-production-deploy-source] FAIL — ${message}`);
  process.exit(1);
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
  let payload;
  try { payload = await response.json(); }
  catch { fail(`GitHub API returned malformed JSON for ${path}`); }
  if (!response.ok) fail(`GitHub API ${path} failed with HTTP ${response.status}`);
  return payload;
}

if (process.env.GITHUB_ACTIONS !== 'true') fail('verification may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') {
  fail('verification requires the protected main repository');
}

const sourceRunId = text(process.env.PRODUCTION_DEPLOY_RUN_ID);
const expectedSha = text(process.env.EXPECTED_DEPLOYMENT_SHA || process.env.GITHUB_SHA);
if (!/^\d+$/.test(sourceRunId) || !/^[0-9a-f]{40}$/.test(expectedSha)) {
  fail('numeric production run ID and exact lowercase SHA are required');
}
if (expectedSha !== text(process.env.GITHUB_SHA)) fail('expected deployment SHA does not equal checked-out main');

let authorizedActors;
try { authorizedActors = parseAuthorizedApprovers(process.env.AUTHORIZED_FOUNDER_ACTORS); }
catch (error) { fail(error instanceof Error ? error.message : 'authorised Founder actors are invalid'); }
if (!authorizedActors.length) fail('AUTHORIZED_FOUNDER_ACTORS is empty');
if (!authorizedActors.includes(text(process.env.GITHUB_ACTOR))) {
  fail('current workflow actor is not an authorised Founder');
}

const run = await githubJson(`/actions/runs/${sourceRunId}`);
const sourceActor = text(run?.triggering_actor?.login || run?.actor?.login);
const createdAt = Date.parse(text(run?.created_at));
if (String(run?.id || '') !== sourceRunId) fail('source run ID mismatch');
if (run?.name !== SOURCE_WORKFLOW_NAME || run?.path !== SOURCE_WORKFLOW_PATH) fail('source workflow identity mismatch');
if (run?.event !== 'workflow_dispatch' || run?.head_branch !== 'main' || run?.head_sha !== expectedSha) {
  fail('source run is not the exact main deployment SHA');
}
if (run?.repository?.full_name !== REPOSITORY) fail('source run repository mismatch');
if (run?.status !== 'completed' || run?.conclusion !== 'success') fail('source production deployment run is not successful');
if (!authorizedActors.includes(sourceActor)) fail('source deployment was not triggered by an authorised Founder');
if (!Number.isFinite(createdAt) || createdAt > Date.now() + 5 * 60 * 1000 || Date.now() - createdAt > MAX_SOURCE_AGE_MS) {
  fail('source production deployment run is stale or future-dated');
}

const jobsPayload = await githubJson(`/actions/runs/${sourceRunId}/jobs?per_page=100`);
const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [];
const deploymentJob = jobs.find((job) => job?.name === REQUIRED_JOB_NAME);
if (!deploymentJob || deploymentJob.status !== 'completed' || deploymentJob.conclusion !== 'success') {
  fail('source deployment stack job is not successful');
}

const artifactsPayload = await githubJson(`/actions/runs/${sourceRunId}/artifacts?per_page=100`);
const artifacts = Array.isArray(artifactsPayload?.artifacts) ? artifactsPayload.artifacts : [];
const artifactName = `production-deployment-${expectedSha}`;
const deploymentArtifact = artifacts.find((artifact) => artifact?.name === artifactName && artifact?.expired !== true);
if (!deploymentArtifact) fail(`source run is missing ${artifactName}`);
const artifactDigest = text(deploymentArtifact.digest).toLowerCase();
if (!/^sha256:[a-f0-9]{64}$/.test(artifactDigest)) fail('source deployment artifact digest is invalid');

const proof = {
  schemaVersion: 1,
  status: 'passed',
  sourceWorkflowName: SOURCE_WORKFLOW_NAME,
  sourceWorkflowPath: SOURCE_WORKFLOW_PATH,
  sourceDeployRunId,
  sourceDeployJobId: String(deploymentJob.id || ''),
  sourceActor,
  commitSha: expectedSha,
  repository: REPOSITORY,
  artifactName,
  artifactId: String(deploymentArtifact.id || ''),
  artifactDigest,
  verifiedAt: new Date().toISOString(),
  hardLaunchClaim: false,
};
mkdirSync('launch_package', { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[trusted-production-deploy-source] PASS run=${sourceRunId} sha=${expectedSha}`);
