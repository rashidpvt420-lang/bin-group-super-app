import { pathToFileURL } from 'node:url';

export const RELEASE_WORKFLOW_PATHS = Object.freeze([
  'bank-pilot-dispatch.yml',
  'firebase-production-dispatch-current-main.yml',
  'firebase-production-deploy.yml',
  'founder-release-orchestrator-one-shot.yml',
]);

export function selectActiveReleaseRuns(workflowPath, workflowRuns) {
  if (!Array.isArray(workflowRuns)) {
    throw new Error(`GitHub returned an invalid workflow_runs payload for ${workflowPath}.`);
  }

  return workflowRuns
    .filter((run) => run && run.status !== 'completed')
    .map((run) => ({
      workflowPath,
      id: String(run.id ?? ''),
      status: String(run.status ?? 'unknown'),
      headSha: String(run.head_sha ?? ''),
      htmlUrl: String(run.html_url ?? ''),
    }));
}

async function githubJson(url, token, fetchImpl) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub Actions lookup failed with HTTP ${response.status}.`);
  }

  return response.json();
}

export async function verifyProductionReleaseMergeLock({
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
  apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com',
  fetchImpl = fetch,
} = {}) {
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY must be set to owner/repository.');
  }

  const active = [];
  for (const workflowPath of RELEASE_WORKFLOW_PATHS) {
    const endpoint = `${apiUrl}/repos/${repository}/actions/workflows/${encodeURIComponent(workflowPath)}/runs?per_page=100`;
    const payload = await githubJson(endpoint, token, fetchImpl);
    active.push(...selectActiveReleaseRuns(workflowPath, payload.workflow_runs));
  }

  if (active.length > 0) {
    const detail = active
      .map((run) => `${run.workflowPath}#${run.id || 'unknown'}:${run.status}`)
      .join(', ');
    throw new Error(
      `Production release control plane is active (${detail}). Main merges are locked until every listed release run completes.`,
    );
  }

  return { locked: false, activeRuns: [] };
}

async function main() {
  try {
    await verifyProductionReleaseMergeLock();
    console.log('Production release merge lock: CLEAR');
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
