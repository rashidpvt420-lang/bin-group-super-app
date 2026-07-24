#!/usr/bin/env bash
set -euo pipefail

: "${REPOSITORY:?REPOSITORY is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo '::error::RELEASE_SHA must be a full lowercase 40-character SHA.'
  exit 1
}

current_main="$(gh api "repos/$REPOSITORY/git/ref/heads/main" --jq '.object.sha')"
[[ "$current_main" == "$RELEASE_SHA" ]] || {
  echo "::error::Current main $current_main no longer matches authorized diagnosis SHA $RELEASE_SHA."
  exit 1
}

checkout_sha="$(git rev-parse HEAD)"
[[ "$checkout_sha" == "$RELEASE_SHA" ]] || {
  echo "::error::Checked-out SHA $checkout_sha does not match authorized diagnosis SHA $RELEASE_SHA."
  exit 1
}

runs_json="$(
  gh api --paginate --slurp \
    "repos/$REPOSITORY/actions/workflows/firebase-production-deploy.yml/runs?event=workflow_dispatch&branch=main&status=completed&per_page=100" |
  jq -ce '[.[].workflow_runs[]]'
)"

result="$(printf '%s' "$runs_json" | node scripts/select-production-diagnosis-run.mjs "$RELEASE_SHA")" || {
  echo '::error::No completed failed Firebase Production Deploy run was found.'
  exit 1
}

run_id="$(jq -r '.runId' <<<"$result")"
run_sha="$(jq -r '.runSha' <<<"$result")"
run_url="$(jq -r '.runUrl' <<<"$result")"
age_seconds="$(jq -r '.ageSeconds' <<<"$result")"
matches_main="$(jq -r '.matchesCurrentMain' <<<"$result")"
stale_evidence="$(jq -r '.staleEvidence' <<<"$result")"

[[ "$run_id" =~ ^[0-9]+$ ]]
[[ "$run_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$run_url" =~ ^https://github\.com/ ]]
[[ "$age_seconds" =~ ^[0-9]+$ ]]
[[ "$matches_main" =~ ^(true|false)$ ]]
[[ "$stale_evidence" =~ ^(true|false)$ ]]

mkdir -p launch_package
raw_log="$(mktemp)"
trap 'rm -f "$raw_log"' EXIT

jobs="$(
  gh api --paginate --slurp \
    "repos/$REPOSITORY/actions/runs/$run_id/jobs?filter=latest&per_page=100" |
  jq -ce '{jobs: [.[].jobs[]]}'
)"

jq -e '.jobs | any(.conclusion == "failure")' <<<"$jobs" >/dev/null || {
  echo '::error::Selected production run has no failed job.'
  exit 1
}

mapfile -t failed_job_ids < <(jq -r '.jobs[] | select(.conclusion == "failure") | .id' <<<"$jobs")
for job_id in "${failed_job_ids[@]}"; do
  [[ "$job_id" =~ ^[0-9]+$ ]]
  printf '\n===== FAILED JOB %s =====\n' "$job_id" >> "$raw_log"
  gh api "repos/$REPOSITORY/actions/jobs/$job_id/logs" >> "$raw_log"
done

test -s "$raw_log"
node scripts/sanitize-production-diagnostic-log.mjs \
  "$raw_log" \
  launch_package/firebase-production-failure.log
test -s launch_package/firebase-production-failure.log

SOURCE_RUN_ID="$run_id" \
SOURCE_RUN_SHA="$run_sha" \
SOURCE_RUN_MAIN_SHA="$RELEASE_SHA" \
SOURCE_RUN_AGE_SECONDS="$age_seconds" \
SOURCE_RUN_MATCHES_MAIN_SHA="$matches_main" \
SOURCE_RUN_IS_STALE="$stale_evidence" \
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const requireEnv = (name, pattern) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing ${name} diagnostic metadata.`);
  if (pattern && !pattern.test(value)) throw new Error(`Malformed ${name} diagnostic metadata.`);
  return value;
};

const sourceRunId = requireEnv('SOURCE_RUN_ID', /^[0-9]+$/);
const sourceRunSha = requireEnv('SOURCE_RUN_SHA', /^[0-9a-f]{40}$/);
const resolvedMainSha = requireEnv('SOURCE_RUN_MAIN_SHA', /^[0-9a-f]{40}$/);
const sourceRunAgeSeconds = requireEnv('SOURCE_RUN_AGE_SECONDS', /^[0-9]+$/);
const sourceRunMatchesMainSha = requireEnv('SOURCE_RUN_MATCHES_MAIN_SHA', /^(true|false)$/);
const sourceRunIsStale = requireEnv('SOURCE_RUN_IS_STALE', /^(true|false)$/);
const sanitizedLog = readFileSync('launch_package/firebase-production-failure.log', 'utf8');
const lines = sanitizedLog.split(/\r?\n/);
const signal = /##\[error\]|\[production-deploy\]|\[deploy-verify\]|FirebaseError|admin[- ]mfa|multi[- ]factor|privileged|deployment (?:failed|stopped|blocked)|deploy failed|functions:|hosting:|firestore:|storage:|\[critical-evidence\]|business-(?:admin|owner|tenant|technician|broker|global)|tests\/e2e\/[^\s]+\.spec\.ts|playwright|error:|timeout|expect\(|locator|strict mode violation|unexpected|skipped=|failed=/i;
const selectedIndexes = new Set();
for (let index = 0; index < lines.length; index += 1) {
  if (!signal.test(lines[index])) continue;
  for (let offset = -3; offset <= 3; offset += 1) {
    const candidate = index + offset;
    if (candidate >= 0 && candidate < lines.length) selectedIndexes.add(candidate);
  }
}
const selected = [...selectedIndexes]
  .sort((a, b) => a - b)
  .map((index) => lines[index].slice(0, 900))
  .filter((line, index, all) => line && all.indexOf(line) === index)
  .slice(-120);
const failedSuiteSignals = selected
  .filter((line) => /\[critical-evidence\].*(?:failed|not recorded)|business-(?:admin|owner|tenant|technician|broker|global)|tests\/e2e\/[^\s]+\.spec\.ts|\d+ failed/i.test(line))
  .slice(-30);
const report = {
  schemaVersion: 4,
  status: 'FAILED',
  sourceWorkflow: 'Firebase Production Deploy',
  sourceRunId,
  sourceRunSha,
  resolvedMainSha,
  sourceRunAgeSeconds: Number.parseInt(sourceRunAgeSeconds, 10),
  sourceRunMatchesResolvedMainSha: sourceRunMatchesMainSha === 'true',
  sourceRunStaleFailureEvidence: sourceRunIsStale === 'true',
  normalizedErrorLines: selected,
  failedSuiteSignals,
  githubSecretMaskingApplied: true,
  personalIdentifiersRedacted: true,
  fullArtifactLogRedacted: true,
  rawJobLogUploaded: false,
  hardLaunchClaim: false,
  generatedAt: new Date().toISOString(),
};
writeFileSync('launch_package/firebase-production-failure.json', `${JSON.stringify(report, null, 2)}\n`);
NODE

errors="$(jq -r 'if (.normalizedErrorLines | length) == 0 then "- No normalized error line was found; inspect the redacted artifact." else (.normalizedErrorLines | map("- `" + . + "`") | join("\n")) end' launch_package/firebase-production-failure.json)"
suites="$(jq -r 'if (.failedSuiteSignals | length) == 0 then "- No failed-suite signal was extracted; inspect the redacted artifact." else (.failedSuiteSignals | map("- `" + . + "`") | join("\n")) end' launch_package/firebase-production-failure.json)"
artifact="firebase-production-manual-diagnosis-$run_sha-$run_id"
body="## Latest Firebase production failure diagnosis

- Resolved origin/main SHA: \`$RELEASE_SHA\`
- Exact source SHA: \`$run_sha\`
- Source run: $run_url
- Source run matches resolved main SHA: \`$matches_main\`
- Source run age (seconds): \`$age_seconds\`
- Source run is stale failure: \`$stale_evidence\`
- Diagnostic artifact: \`$artifact\`
- Full artifact log redacted: \`true\`
- Raw job log uploaded: \`false\`
- Hard-launch claim: \`false\`

### Failed suite signals
$suites

### Normalized error lines
$errors

The deployment remains fail-closed. Fix or complete the identified operational requirement before another protected bank-pilot dispatch."
gh api --method POST "repos/$REPOSITORY/issues/$ISSUE_NUMBER/comments" -f body="$body" >/dev/null

{
  echo "run_id=$run_id"
  echo "run_sha=$run_sha"
  echo "run_url=$run_url"
  echo "artifact_name=$artifact"
} >> "$GITHUB_OUTPUT"
