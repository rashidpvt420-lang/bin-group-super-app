import { writeFile } from 'node:fs/promises';

const repository = process.env.REPOSITORY || '';
const headSha = process.env.HEAD_SHA || '';
const token = process.env.GH_TOKEN || '';

const result = {
  repository,
  headSha,
  githubChecks: [],
  apiProbes: [],
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
      .filter((run) => /codacy/i.test(`${run.name} ${run.app?.name || ''}`))
      .map((run) => ({
        id: run.id,
        name: run.name,
        app: run.app?.name || null,
        status: run.status,
        conclusion: run.conclusion,
        detailsUrl: run.details_url,
        output: run.output || null,
      }));
    for (const run of result.githubChecks) {
      if (!run.id) continue;
      const annotations = await fetchText(
        `https://api.github.com/repos/${repository}/check-runs/${run.id}/annotations?per_page=100`,
        {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      );
      try {
        run.annotations = JSON.parse(annotations.text);
      } catch {
        run.annotations = { status: annotations.status, prefix: annotations.text.slice(0, 500) };
      }
    }
  } catch {
    result.githubChecks = [{ status: checks.status, parseError: true, prefix: checks.text.slice(0, 500) }];
  }
}

const apiUrls = [
  'https://api.codacy.com/api/v3/analysis/organizations/gh/rashidpvt420-lang/repositories/bin-group-super-app/pull-requests/330/issues',
  'https://app.codacy.com/api/v3/analysis/organizations/gh/rashidpvt420-lang/repositories/bin-group-super-app/pull-requests/330/issues',
];

for (const url of apiUrls) {
  const probe = await fetchText(url);
  const entry = { url, finalUrl: probe.url, status: probe.status, ok: probe.ok, size: probe.text.length };
  try {
    const payload = JSON.parse(probe.text);
    entry.topLevelKeys = Object.keys(payload || {});
    const candidates = [payload, payload?.data, payload?.issues, payload?.items, payload?.results, payload?.data?.issues, payload?.data?.items];
    const rows = candidates.find(Array.isArray) || [];
    entry.issues = rows.map((item) => {
      const issue = item?.issue || item;
      return {
        filePath: issue?.filePath || issue?.file?.path || issue?.location?.filePath || null,
        lineNumber: issue?.lineNumber || issue?.line || issue?.location?.line || null,
        patternId: issue?.patternInfo?.id || issue?.patternId || issue?.pattern?.id || null,
        patternTitle: issue?.patternInfo?.title || issue?.title || issue?.pattern?.title || null,
        level: issue?.patternInfo?.level || issue?.level || null,
        category: issue?.patternInfo?.category || issue?.category || null,
        message: issue?.message || issue?.description || null,
      };
    });
    entry.payloadSample = rows.length ? undefined : payload;
  } catch {
    entry.nonJsonPrefix = probe.text.slice(0, 1000);
  }
  result.apiProbes.push(entry);
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
  githubChecks: result.githubChecks,
  apiProbes: result.apiProbes.map(({ payloadSample, nonJsonPrefix, ...probe }) => probe),
  pageProbe: result.pageProbe,
}, null, 2));
