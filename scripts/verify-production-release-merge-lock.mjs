import { pathToFileURL } from 'node:url';

export const RELEASE_WORKFLOW_PATHS = Object.freeze([
  'bank-pilot-dispatch.yml',
  'firebase-production-dispatch-current-main.yml',
  'firebase-production-deploy.yml',
  'founder-release-orchestrator-one-shot.yml',
]);

const OWNER_DISPATCH_TITLE = 'Dispatch protected bank pilot workflow';
const OWNER_DISPATCH_HEAD_PREFIX = 'ops/dispatch-bank-pilot-workflow-';

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

export function isCanonicalOwnerDispatchPr(pr, repositoryOwner) {
  return Boolean(
    pr
      && pr.draft === true
      && pr.base?.ref === 'main'
      && pr.head?.repo?.full_name
      && pr.head.repo.full_name === pr.base?.repo?.full_name
      && pr.user?.login === repositoryOwner
      && String(pr.head?.ref || '').startsWith(OWNER_DISPATCH_HEAD_PREFIX)
      && pr.title === OWNER_DISPATCH_TITLE,
  );
}

async function githubJson(url, token, fetchImpl) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub lookup failed with HTTP ${response.status}.`);
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

export async function verifyReleaseStartHasNoOpenWorkPr({
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
  apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com',
  fetchImpl = fetch,
} = {}) {
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY must be set to owner/repository.');
  }
  const [repositoryOwner] = repository.split('/');
  const openPulls = [];

  for (let page = 1; page <= 20; page += 1) {
    const endpoint = `${apiUrl}/repos/${repository}/pulls?state=open&base=main&per_page=100&page=${page}`;
    const payload = await githubJson(endpoint, token, fetchImpl);
    if (!Array.isArray(payload)) {
      throw new Error('GitHub returned an invalid open-pull-request payload.');
    }
    openPulls.push(...payload);
    if (payload.length < 100) break;
    if (page === 20) {
      throw new Error('Open pull-request lookup exceeded the fail-closed pagination bound.');
    }
  }

  const blockers = openPulls.filter((pr) => !isCanonicalOwnerDispatchPr(pr, repositoryOwner));
  if (blockers.length > 0) {
    const detail = blockers
      .map((pr) => `#${pr.number ?? 'unknown'}:${String(pr.head?.ref || 'unknown')}`)
      .join(', ');
    throw new Error(
      `Production release cannot start while ordinary pull requests to main are open (${detail}). Merge or close them before deployment.`,
    );
  }

  return {
    clear: true,
    allowedOwnerDispatchPulls: openPulls.filter((pr) => isCanonicalOwnerDispatchPr(pr, repositoryOwner)).length,
  };
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
