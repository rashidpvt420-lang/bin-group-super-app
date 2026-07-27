#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { parseAuthorizedApprovers } from './lib/authorized-approvers.mjs';

const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const SOURCE_WORKFLOW_NAME = 'Firebase Production Deploy';
const SOURCE_WORKFLOW_PATH = '.github/workflows/firebase-production-deploy.yml';
const SOURCE_DEPLOY_JOB = 'Deploy Firebase production stack';
const OUTPUT_PATH = 'launch_package/postdeploy-external-evidence-chain.json';
const AUTOMATION_ACTOR = 'github-actions[bot]';
const POLL_INTERVAL_MS = 15_000;
const DISCOVERY_TIMEOUT_MS = 10 * 60 * 1000;
const CHILD_TIMEOUT_MS = 90 * 60 * 1000;
const text = (value) => String(value ?? '').trim();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sanitizeReason = (value) => text(value).replace(/[\r\n]+/g, ' ').slice(0, 400);
const fail = (message) => {
  throw new Error(message);
};

const children = Object.freeze([
  {
    key: 'provider',
    workflowFile: 'postdeploy-operational-provider-evidence.yml',
    workflowPath: '.github/workflows/postdeploy-operational-provider-evidence.yml',
    workflowName: 'Operational Provider Evidence',
    jobName: 'Verify and publish provider evidence',
    artifactPrefix: 'postdeploy-operational-provider-',
    confirmation: 'PUBLISH_OPERATIONAL_PROVIDER_EVIDENCE',
  },
  {
    key: 'application',
    workflowFile: 'postdeploy-operational-application-evidence.yml',
    workflowPath: '.github/workflows/postdeploy-operational-application-evidence.yml',
    workflowName: 'Operational Application Evidence',
    jobName: 'Verify and publish application evidence',
    artifactPrefix: 'postdeploy-operational-application-',
    confirmation: 'PUBLISH_OPERATIONAL_APPLICATION_EVIDENCE',
  },
  {
    key: 'rotation',
    workflowFile: 'postdeploy-privileged-access-rotation-evidence.yml',
    workflowPath: '.github/workflows/postdeploy-privileged-access-rotation-evidence.yml',
    workflowName: 'Privileged Access Rotation Evidence',
    jobName: 'Verify privileged access rotation',
    artifactPrefix: 'postdeploy-privileged-access-rotation-',
    confirmation: 'VERIFY_PRIVILEGED_ACCESS_ROTATION',
  },
]);

const token = text(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
if (!token) {
  console.error('[postdeploy-external-evidence] GH_TOKEN is required');
  process.exit(1);
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) fail(`GitHub API ${path} failed with HTTP ${response.status}`);
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    fail(`GitHub API ${path} returned malformed JSON`);
  }
}

async function currentMainSha() {
  const mainRef = await github('/git/ref/heads/main');
  return text(mainRef?.object?.sha);
}

async function requireCurrentMain(sourceSha, stage) {
  const current = await currentMainSha();
  if (current !== sourceSha) {
    fail(`main advanced during ${stage}: deployed=${sourceSha} current=${current || '(missing)'}`);
  }
  return current;
}

async function verifySource(sourceRunId, sourceSha) {
  const authorizedActors = parseAuthorizedApprovers(process.env.AUTHORIZED_FOUNDER_ACTORS);
  if (!authorizedActors.length) fail('AUTHORIZED_FOUNDER_ACTORS is empty');

  const [run, jobsPayload, artifactsPayload] = await Promise.all([
    github(`/actions/runs/${sourceRunId}`),
    github(`/actions/runs/${sourceRunId}/jobs?per_page=100`),
    github(`/actions/runs/${sourceRunId}/artifacts?per_page=100`),
  ]);
  const currentMain = await requireCurrentMain(sourceSha, 'source verification');
  const sourceActor = text(run?.triggering_actor?.login || run?.actor?.login);
  const createdAt = Date.parse(text(run?.created_at));
  if (String(run?.id || '') !== sourceRunId) fail('source run ID mismatch');
  if (run?.name !== SOURCE_WORKFLOW_NAME || run?.path !== SOURCE_WORKFLOW_PATH) {
    fail('source workflow identity mismatch');
  }
  if (run?.event !== 'workflow_dispatch' || run?.head_branch !== 'main' || run?.head_sha !== sourceSha) {
    fail('source run is not the exact main deployment SHA');
  }
  if (run?.repository?.full_name !== REPOSITORY) fail('source run repository mismatch');
  if (run?.status !== 'completed' || run?.conclusion !== 'success') {
    fail('source production deployment run did not complete successfully');
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
  const deploymentJob = jobs.find((job) => job?.name === SOURCE_DEPLOY_JOB);
  if (!deploymentJob || deploymentJob.status !== 'completed' || deploymentJob.conclusion !== 'success') {
    fail('source deployment stack job is not successful');
  }

  const artifacts = Array.isArray(artifactsPayload?.artifacts) ? artifactsPayload.artifacts : [];
  const artifactName = `production-deployment-${sourceSha}`;
  const artifact = artifacts.find((candidate) => candidate?.name === artifactName && candidate?.expired !== true);
  if (!artifact) fail(`source run is missing ${artifactName}`);
  const artifactDigest = text(artifact.digest).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(artifactDigest)) {
    fail('source deployment artifact digest is missing or invalid');
  }

  return {
    sourceActor,
    currentMainSha: currentMain,
    deploymentJobId: String(deploymentJob.id || ''),
    artifactName,
    artifactId: String(artifact.id || ''),
    artifactDigest,
  };
}

async function listWorkflowRuns(workflowFile) {
  const encoded = encodeURIComponent(workflowFile);
  const payload = await github(
    `/actions/workflows/${encoded}/runs?branch=main&event=workflow_dispatch&per_page=100`,
  );
  return Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
}

async function verifyChildArtifacts(definition, childRunId, sourceSha) {
  const payload = await github(`/actions/runs/${childRunId}/artifacts?per_page=100`);
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const expectedName = `${definition.artifactPrefix}${sourceSha}`;
  const artifact = artifacts.find((candidate) => candidate?.name === expectedName && candidate?.expired !== true);
  if (!artifact) fail(`${definition.key} child run is missing ${expectedName}`);
  const digest = text(artifact.digest).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    fail(`${definition.key} child artifact digest is invalid`);
  }
  return {
    name: expectedName,
    id: String(artifact.id || ''),
    digest,
  };
}

async function dispatchChild(definition, sourceRunId, sourceSha) {
  await requireCurrentMain(sourceSha, `${definition.key} pre-dispatch`);
  const previousRuns = await listWorkflowRuns(definition.workflowFile);
  const previousIds = new Set(previousRuns.map((run) => String(run.id)));
  const marker = `source-deploy-${sourceRunId}`;
  const encoded = encodeURIComponent(definition.workflowFile);
  await github(`/actions/workflows/${encoded}/dispatches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        expected_commit_sha: sourceSha,
        source_deploy_run_id: sourceRunId,
        confirmation: definition.confirmation,
      },
    }),
  });

  const discoveryDeadline = Date.now() + DISCOVERY_TIMEOUT_MS;
  let childRun = null;
  while (Date.now() < discoveryDeadline) {
    await sleep(POLL_INTERVAL_MS);
    const runs = await listWorkflowRuns(definition.workflowFile);
    childRun = runs.find((run) => (
      !previousIds.has(String(run.id))
      && run.event === 'workflow_dispatch'
      && run.head_branch === 'main'
      && run.head_sha === sourceSha
      && text(run.display_title).includes(marker)
      && text(run.actor?.login) === AUTOMATION_ACTOR
      && run.repository?.full_name === REPOSITORY
    ));
    if (childRun) break;
  }
  if (!childRun) fail(`${definition.key} evidence child run was not discovered for ${marker}`);

  const childRunId = String(childRun.id);
  const completionDeadline = Date.now() + CHILD_TIMEOUT_MS;
  let completed = childRun;
  while (Date.now() < completionDeadline) {
    completed = await github(`/actions/runs/${childRunId}`);
    if (completed?.status === 'completed') break;
    await sleep(POLL_INTERVAL_MS);
  }
  if (completed?.status !== 'completed') fail(`${definition.key} evidence child run ${childRunId} timed out`);
  if (completed?.conclusion !== 'success') {
    fail(`${definition.key} evidence child run ${childRunId} concluded ${completed?.conclusion || 'unknown'}`);
  }
  if (completed?.name !== definition.workflowName || completed?.path !== definition.workflowPath) {
    fail(`${definition.key} evidence child workflow identity changed`);
  }
  if (completed?.head_sha !== sourceSha || completed?.head_branch !== 'main') {
    fail(`${definition.key} evidence child run is not bound to the deployed main SHA`);
  }
  if (text(completed?.actor?.login) !== AUTOMATION_ACTOR) {
    fail(`${definition.key} evidence child actor mismatch`);
  }

  const jobsPayload = await github(`/actions/runs/${childRunId}/jobs?per_page=100`);
  const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [];
  const requiredJob = jobs.find((job) => job?.name === definition.jobName);
  if (!requiredJob || requiredJob.status !== 'completed' || requiredJob.conclusion !== 'success') {
    fail(`${definition.key} required child job is not successful`);
  }
  await requireCurrentMain(sourceSha, `${definition.key} completion`);
  const artifact = await verifyChildArtifacts(definition, childRunId, sourceSha);

  return {
    key: definition.key,
    workflowName: definition.workflowName,
    workflowPath: definition.workflowPath,
    jobName: definition.jobName,
    jobId: String(requiredJob.id || ''),
    runId: childRunId,
    conclusion: completed.conclusion,
    commitSha: completed.head_sha,
    actor: text(completed.actor?.login),
    artifact,
    completedAt: text(completed.updated_at),
  };
}

mkdirSync('launch_package', { recursive: true });
const sourceRunId = text(process.env.SOURCE_DEPLOY_RUN_ID);
const sourceSha = text(process.env.SOURCE_DEPLOY_SHA);
let proof = {
  schemaVersion: 1,
  status: 'failed',
  sourceWorkflowName: SOURCE_WORKFLOW_NAME,
  sourceWorkflowPath: SOURCE_WORKFLOW_PATH,
  sourceDeployRunId: sourceRunId || null,
  sourceDeploySha: sourceSha || null,
  childRuns: [],
  hardLaunchClaim: false,
};

try {
  if (process.env.GITHUB_ACTIONS !== 'true') fail('dispatcher may only run in GitHub Actions');
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') {
    fail('dispatcher requires protected main');
  }
  if (
    process.env.GITHUB_WORKFLOW !== 'Postdeploy External Evidence Chain'
    || process.env.GITHUB_JOB !== 'dispatch-and-wait'
  ) {
    fail('unexpected orchestration workflow context');
  }
  if (!/^\d+$/.test(sourceRunId) || !/^[0-9a-f]{40}$/.test(sourceSha)) {
    fail('numeric source run ID and exact lowercase SHA are required');
  }

  const source = await verifySource(sourceRunId, sourceSha);
  const childRuns = [];
  for (const definition of children) {
    console.log(`[postdeploy-external-evidence] dispatching ${definition.key} for source run ${sourceRunId}`);
    childRuns.push(await dispatchChild(definition, sourceRunId, sourceSha));
  }

  proof = {
    ...proof,
    status: 'passed',
    sourceActor: source.sourceActor,
    sourceDeployJobId: source.deploymentJobId,
    sourceArtifactName: source.artifactName,
    sourceArtifactId: source.artifactId,
    sourceArtifactDigest: source.artifactDigest,
    currentMainSha: source.currentMainSha,
    childRuns,
    completedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  console.log(`[postdeploy-external-evidence] PASS source=${sourceRunId} children=${childRuns.length}`);
} catch (error) {
  proof = {
    ...proof,
    status: 'failed',
    failureReason: sanitizeReason(error instanceof Error ? error.message : 'postdeploy chain failed'),
    failedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  console.error(`[postdeploy-external-evidence] FAIL — ${proof.failureReason}`);
  process.exit(1);
}
