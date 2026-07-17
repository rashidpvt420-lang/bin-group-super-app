import { setTimeout as sleep } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';

const repository = process.env.REPOSITORY || '';
const headSha = process.env.HEAD_SHA || '';
const token = process.env.GH_TOKEN || '';
const codacyApiUrl = 'https://api.codacy.com/api/v3/analysis/organizations/gh/rashidpvt420-lang/repositories/bin-group-super-app/pull-requests/330/issues';

const result = {
  repository,
  headSha,
  githubChecks: [],
  codacyAnalysis: null,
  pageProbe: null,
};

async function fetchText(url, headers = {}) {
  try {
    const response = await fetch(url, { headers, redirect: 'follow' });
    const text = await response.text();
    return { ok: response.ok, status: response.status, url: response.url, text };
  } catch (error) {
    return { ok: false, status: 0, url, text: '', error: error instanceof Error ? error.message : String(error) };
  }
}

function normalizeIssue(entry) {
  const issue = entry?.issue || entry;
  return {
    filePath: issue?.filePath || issue?.file?.path || issue?.location?.filePath || null,
    lineNumber: issue?.lineNumber || issue?.line || issue?.location?.line || null,
    patternId: issue?.patternInfo?.id || issue?.patternId || issue?.pattern?.id || null,
    patternTitle: issue?.patternInfo?.title || issue?.title || issue?.pattern?.title || null,
    level: issue?.patternInfo?.level || issue?.level || null,
    category: issue?.patternInfo?.category || issue?.category || null,
    message: issue?.message || issue?.description || null,
    status: issue?.status || entry?.status || null,
  };
}

if (repository && headSha && token) {
  const checks = await fetchText(
    `https://api.github.com/repos/${repository}/commits/${headSha}/check-runs?per_page=100`,
    {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  );
  try {
    const payload = JSON.parse(checks.text);
    const runs = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
    result.githubChecks = runs
      .filter((run) => /codacy/i.test(`${run.name} ${run.app?.name || ''}`) && run.app?.name !== 'GitHub Actions')
      .map((run) => ({
        id: run.id,
        name: run.name,
        app: run.app?.name || null,
        status: run.status,
        conclusion: run.conclusion,
        detailsUrl: run.details_url,
        output: run.output || null,
      }));
  } catch {
    result.githubChecks = [{ status: checks.status, parseError: true, prefix: checks.text.slice(0, 500) }];
  }
}

for (let attempt = 1; attempt <= 48; attempt += 1) {
  const probe = await fetchText(codacyApiUrl);
  let parsed = null;
  try {
    parsed = JSON.parse(probe.text);
  } catch {
    parsed = null;
  }
  const rows = Array.isArray(parsed?.data) ? parsed.data : [];
  result.codacyAnalysis = {
    attempt,
    finalUrl: probe.url,
    status: probe.status,
    ok: probe.ok,
    analyzed: parsed?.analyzed === true,
    pagination: parsed?.pagination || null,
    issues: rows.map(normalizeIssue),
    nonJsonPrefix: parsed ? null : probe.text.slice(0, 1000),
  };
  console.log(`Codacy current-head analysis attempt ${attempt}/48: analyzed=${result.codacyAnalysis.analyzed} issues=${result.codacyAnalysis.issues.length}`);
  if (result.codacyAnalysis.analyzed) break;
  await sleep(15_000);
}

const page = await fetchText('https://app.codacy.com/gh/rashidpvt420-lang/bin-group-super-app/pull-requests/330/issues');
const needles = [
  'secureOwnerProfileOperations.ts',
  'OwnerPhoneVerificationCard.tsx',
  'OwnerProfilePage.tsx',
  'critical',
  'patternId',
  'security',
];
const matches = {};
for (const needle of needles) {
  const index = page.text.toLowerCase().indexOf(needle.toLowerCase());
  matches[needle] = index >= 0 ? page.text.slice(Math.max(0, index - 300), index + 900) : null;
}
result.pageProbe = { finalUrl: page.url, status: page.status, ok: page.ok, size: page.text.length, matches };

await writeFile('codacy-pr-diagnostic.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  headSha,
  githubChecks: result.githubChecks,
  codacyAnalysis: result.codacyAnalysis,
}, null, 2));

if (!result.codacyAnalysis?.analyzed) {
  console.error('Codacy did not finish analyzing the current PR head within the diagnostic window.');
  process.exit(1);
}
