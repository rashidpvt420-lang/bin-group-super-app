#!/usr/bin/env bash
set -euo pipefail

: "${COMMAND:?COMMAND is required}"
: "${REPOSITORY:?REPOSITORY is required}"
: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

case "$COMMAND" in
  '/bin-launch review-privileged-accounts'|'/bin-launch execute-privileged-cleanup') ;;
  *)
    echo '::error::Unsupported privileged-account command.'
    exit 1
    ;;
esac

[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo '::error::RELEASE_SHA must be a full lowercase 40-character SHA.'
  exit 1
}

source scripts/owner-launch-run-correlation.sh

post_comment() {
  gh api --method POST "repos/$REPOSITORY/issues/$ISSUE_NUMBER/comments" -f body="$1" >/dev/null
}

wait_for_success() {
  local run_id="$1"
  local attempts="$2"
  for _ in $(seq 1 "$attempts"); do
    local run_json status conclusion
    run_json="$(gh api "repos/$REPOSITORY/actions/runs/$run_id")"
    status="$(jq -r '.status' <<<"$run_json")"
    conclusion="$(jq -r '.conclusion // empty' <<<"$run_json")"
    if [[ "$status" == 'completed' ]]; then
      [[ "$conclusion" == 'success' ]]
      return
    fi
    sleep 15
  done
  return 1
}

current_main="$(gh api "repos/$REPOSITORY/commits/main" --jq '.sha')"
[[ "$current_main" == "$RELEASE_SHA" ]] || {
  echo "::error::Current main $current_main does not match authorized cleanup SHA $RELEASE_SHA."
  exit 1
}
checkout_sha="$(git rev-parse HEAD)"
[[ "$checkout_sha" == "$RELEASE_SHA" ]] || {
  echo "::error::Checked-out SHA $checkout_sha does not match authorized cleanup SHA $RELEASE_SHA."
  exit 1
}

owner_snapshot_workflow_run_ids \
  privileged-account-cleanup-dry-run.yml \
  privileged-review-baseline-run-ids.json

jq -n \
  --arg ref main \
  --arg sha "$RELEASE_SHA" \
  '{ref:$ref,inputs:{expected_commit_sha:$sha,confirmation:"REVIEW_PRIVILEGED_ACCOUNT_CLEANUP_BIN_GROUP"}}' \
  > privileged-review-dispatch.json

gh api --method POST \
  "repos/$REPOSITORY/actions/workflows/privileged-account-cleanup-dry-run.yml/dispatches" \
  --input privileged-review-dispatch.json

review_record="$(
  owner_locate_new_exact_sha_workflow_run \
    privileged-account-cleanup-dry-run.yml \
    "$RELEASE_SHA" \
    privileged-review-baseline-run-ids.json \
    60 \
    5
)" || {
  post_comment "Privileged-account review was dispatched once for \`$RELEASE_SHA\`, but no unique new exact-SHA run could be correlated. No duplicate review was attempted."
  exit 1
}
review_run_id="$(jq -r '.runId' <<<"$review_record")"
review_run_url="$(jq -r '.runUrl' <<<"$review_record")"
post_comment "Privileged-account review started for exact SHA \`$RELEASE_SHA\`: $review_run_url"

if ! wait_for_success "$review_run_id" 160; then
  post_comment "Privileged-account review failed or timed out for \`$RELEASE_SHA\`: $review_run_url"
  exit 1
fi

review_artifacts="$(
  gh api --paginate --slurp \
    "repos/$REPOSITORY/actions/runs/$review_run_id/artifacts?per_page=100" |
    jq -ce '{artifacts: [.[].artifacts[]]}'
)"
review_artifact_name="privileged-account-cleanup-review-$RELEASE_SHA"
review_artifact_id="$(jq -r --arg expected "$review_artifact_name" '[.artifacts[] | select(.name == $expected and .expired == false)] | first | .id // empty' <<<"$review_artifacts")"
[[ "$review_artifact_id" =~ ^[0-9]+$ ]] || {
  post_comment "Privileged-account review completed but the exact-SHA artifact \`$review_artifact_name\` is missing."
  exit 1
}

gh api "repos/$REPOSITORY/actions/artifacts/$review_artifact_id/zip" > privileged-review.zip
rm -rf privileged-review
mkdir -p privileged-review
unzip -q privileged-review.zip -d privileged-review
review_report="$(find privileged-review -type f -name 'privileged-account-cleanup.json' -print -quit)"
[[ -n "$review_report" && -s "$review_report" ]]

jq -e --arg sha "$RELEASE_SHA" '
  .schemaVersion == 2 and
  .commitSha == $sha and
  .status == "dry-run" and
  .mutationPerformed == false and
  .deletedAccountCount == 0 and
  .sensitiveValuesExcluded == true and
  .auditLogsPreserved == true and
  .nonPrivilegedAccountsUntouched == true and
  .hardLaunchClaim == false
' "$review_report" >/dev/null

founder_ready="$(jq -r '.canonicalFounderReady' "$review_report")"
execution_eligible="$(jq -r '.executionEligible' "$review_report")"
target_count="$(jq -r '.deletionTargetCount' "$review_report")"
privileged_count="$(jq -r '.privilegedAccountCountBefore' "$review_report")"

[[ "$founder_ready" =~ ^(true|false)$ ]]
[[ "$execution_eligible" =~ ^(true|false)$ ]]
[[ "$target_count" =~ ^[0-9]+$ ]]
[[ "$privileged_count" =~ ^[0-9]+$ ]]

post_comment "## Privileged-account review

- Exact SHA: \`$RELEASE_SHA\`
- Review run: $review_run_url
- Privileged accounts: \`$privileged_count\`
- Unexpected deletion targets: \`$target_count\`
- Canonical Founder ready: \`$founder_ready\`
- Cleanup execution eligible: \`$execution_eligible\`
- Mutation performed: \`false\`
- Sensitive values excluded: \`true\`
- Hard-launch claim: \`false\`"

{
  echo "review_run_id=$review_run_id"
  echo "review_run_url=$review_run_url"
  echo "founder_ready=$founder_ready"
  echo "execution_eligible=$execution_eligible"
  echo "target_count=$target_count"
  echo "privileged_count=$privileged_count"
} >> "$GITHUB_OUTPUT"

if [[ "$COMMAND" == '/bin-launch review-privileged-accounts' ]]; then
  exit 0
fi

latest_main="$(gh api "repos/$REPOSITORY/commits/main" --jq '.sha')"
[[ "$latest_main" == "$RELEASE_SHA" ]] || {
  post_comment "Main moved away from \`$RELEASE_SHA\` after privileged-account review. Destructive cleanup was not dispatched."
  exit 1
}
[[ "$founder_ready" == 'true' ]] || {
  echo '::error::Canonical Founder is not ready; destructive cleanup refused.'
  exit 1
}
[[ "$execution_eligible" == 'true' ]] || {
  echo '::error::Review did not authorize destructive cleanup.'
  exit 1
}
[[ "$target_count" =~ ^[1-9][0-9]*$ ]] || {
  echo '::error::Review must contain a positive deletion target count.'
  exit 1
}

owner_snapshot_workflow_run_ids \
  privileged-account-cleanup-production.yml \
  privileged-cleanup-baseline-run-ids.json

jq -n \
  --arg ref main \
  --arg sha "$RELEASE_SHA" \
  '{ref:$ref,inputs:{expected_commit_sha:$sha,confirmation:"REVIEW_SINGLE_FOUNDER_PRIVILEGED_ACCOUNTS",canonical_founder_email:"ceo@bin-groups.com",execute_cleanup:true,destructive_confirmation:"DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP"}}' \
  > privileged-cleanup-dispatch.json

gh api --method POST \
  "repos/$REPOSITORY/actions/workflows/privileged-account-cleanup-production.yml/dispatches" \
  --input privileged-cleanup-dispatch.json

cleanup_record="$(
  owner_locate_new_exact_sha_workflow_run \
    privileged-account-cleanup-production.yml \
    "$RELEASE_SHA" \
    privileged-cleanup-baseline-run-ids.json \
    60 \
    5
)" || {
  post_comment "Protected cleanup was dispatched once for \`$RELEASE_SHA\`, but no unique new exact-SHA run could be correlated. No duplicate destructive dispatch was attempted."
  exit 1
}
cleanup_run_id="$(jq -r '.runId' <<<"$cleanup_record")"
cleanup_run_url="$(jq -r '.runUrl' <<<"$cleanup_record")"
post_comment "Protected privileged-account cleanup started for exact SHA \`$RELEASE_SHA\`: $cleanup_run_url"

if ! wait_for_success "$cleanup_run_id" 120; then
  post_comment "Protected privileged-account cleanup failed or timed out for \`$RELEASE_SHA\`: $cleanup_run_url"
  exit 1
fi

latest_main="$(gh api "repos/$REPOSITORY/commits/main" --jq '.sha')"
[[ "$latest_main" == "$RELEASE_SHA" ]] || {
  post_comment "Protected cleanup completed, but main moved away from \`$RELEASE_SHA\`; its result cannot be used as current launch evidence."
  exit 1
}

cleanup_artifacts="$(
  gh api --paginate --slurp \
    "repos/$REPOSITORY/actions/runs/$cleanup_run_id/artifacts?per_page=100" |
    jq -ce '{artifacts: [.[].artifacts[]]}'
)"
cleanup_artifact_prefix="privileged-account-cleanup-$RELEASE_SHA-$cleanup_run_id-"
cleanup_artifact_id="$(jq -r --arg prefix "$cleanup_artifact_prefix" '[.artifacts[] | select((.name | startswith($prefix)) and .expired == false)] | first | .id // empty' <<<"$cleanup_artifacts")"
[[ "$cleanup_artifact_id" =~ ^[0-9]+$ ]] || {
  post_comment "Protected cleanup completed but its exact-SHA evidence artifact is missing: $cleanup_run_url"
  exit 1
}

gh api "repos/$REPOSITORY/actions/artifacts/$cleanup_artifact_id/zip" > privileged-cleanup.zip
rm -rf privileged-cleanup
mkdir -p privileged-cleanup
unzip -q privileged-cleanup.zip -d privileged-cleanup
cleanup_report="$(find privileged-cleanup -type f -name 'privileged-account-cleanup.json' -print -quit)"
[[ -n "$cleanup_report" && -s "$cleanup_report" ]]

jq -e \
  --arg sha "$RELEASE_SHA" \
  --arg workflow_run_id "$cleanup_run_id" \
  --argjson expected "$target_count" '
    .schemaVersion == 1 and
    .status == "executed" and
    .commitSha == $sha and
    .workflowRunId == $workflow_run_id and
    .canonicalFounderReady == true and
    .deletionTargetCount == $expected and
    .deletedAccountCount == $expected and
    .sensitiveValuesExcluded == true and
    .auditLogsPreserved == true and
    .nonPrivilegedAccountsUntouched == true and
    .hardLaunchClaim == false
  ' "$cleanup_report" >/dev/null

deleted_count="$(jq -r '.deletedAccountCount' "$cleanup_report")"
post_comment "## Privileged-account cleanup completed

- Exact SHA: \`$RELEASE_SHA\`
- Cleanup run: $cleanup_run_url
- Unexpected privileged accounts deleted: \`$deleted_count\`
- Reviewed deletion targets: \`$target_count\`
- Canonical Founder retained: \`true\`
- Audit logs preserved: \`true\`
- Non-privileged accounts untouched: \`true\`
- Hard-launch claim: \`false\`

Next protected action: run \`/bin-launch bank-pilot-after-mfa\`."

{
  echo "cleanup_run_id=$cleanup_run_id"
  echo "cleanup_run_url=$cleanup_run_url"
  echo "deleted_count=$deleted_count"
} >> "$GITHUB_OUTPUT"
