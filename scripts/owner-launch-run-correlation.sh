#!/usr/bin/env bash

# Shared fail-closed correlation helpers for Owner Launch Command.
# The caller must export REPOSITORY and provide an exact expected SHA.

owner_snapshot_workflow_run_ids() {
  local workflow="$1"
  local output_file="$2"

  gh api --paginate --slurp \
    "repos/$REPOSITORY/actions/workflows/$workflow/runs?event=workflow_dispatch&branch=main&per_page=100" |
    jq -ce '[.[].workflow_runs[] | .id]' > "$output_file"

  jq -e 'type == "array" and all(.[]; type == "number" and . > 0)' "$output_file" >/dev/null
}

owner_locate_new_exact_sha_workflow_run() {
  local workflow="$1"
  local expected_sha="$2"
  local baseline_file="$3"
  local max_polls="${4:-60}"
  local delay_seconds="${5:-5}"
  local selector_error
  selector_error="$(mktemp)"

  for _ in $(seq 1 "$max_polls"); do
    local runs_json selected rc
    runs_json="$(
      gh api --paginate --slurp \
        "repos/$REPOSITORY/actions/workflows/$workflow/runs?event=workflow_dispatch&branch=main&per_page=100" |
        jq -ce '[.[].workflow_runs[]]'
    )"

    if selected="$(
      printf '%s' "$runs_json" |
        node scripts/select-new-exact-sha-workflow-run.mjs "$expected_sha" "$baseline_file" \
          2>"$selector_error"
    )"; then
      rm -f "$selector_error"
      printf '%s' "$selected"
      return 0
    else
      rc=$?
    fi

    if [[ "$rc" -ne 2 ]]; then
      cat "$selector_error" >&2
      rm -f "$selector_error"
      return "$rc"
    fi
    sleep "$delay_seconds"
  done

  rm -f "$selector_error"
  return 2
}
