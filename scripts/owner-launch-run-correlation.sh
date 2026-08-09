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
  local requested_max_polls="${4:-60}"
  local delay_seconds="${5:-5}"
  local max_polls="$requested_max_polls"
  local selector_error
  local runs_json='[]'
  selector_error="$(mktemp)"

  # Protected production dispatches can sit in the GitHub Actions queue for
  # several minutes. Keep ordinary correlations unchanged, but give the two
  # production-chain workflows enough time to become observable without
  # weakening any exact-SHA, baseline, or success requirement.
  case "$workflow" in
    firebase-production-dispatch-current-main.yml|firebase-production-deploy.yml)
      if (( max_polls < 180 )); then
        max_polls=180
      fi
      ;;
  esac

  local poll
  for poll in $(seq 1 "$max_polls"); do
    local selected rc
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
      local run_id run_url matched_run run_status run_conclusion
      run_id="$(jq -r '.runId // empty' <<<"$selected")"
      run_url="$(jq -r '.runUrl // empty' <<<"$selected")"
      matched_run="$(jq -c --argjson id "$run_id" '[.[] | select(.id == $id)] | first // {}' <<<"$runs_json")"
      run_status="$(jq -r '.status // "unknown"' <<<"$matched_run")"
      run_conclusion="$(jq -r '.conclusion // ""' <<<"$matched_run")"
      printf '[owner-correlation] selected workflow=%s run=%s status=%s conclusion=%s poll=%s/%s url=%s\n' \
        "$workflow" "$run_id" "$run_status" "${run_conclusion:-pending}" "$poll" "$max_polls" "$run_url" >&2

      # The bank-pilot wrapper is an authorization/dispatch transaction, not
      # merely an observable run. Do not proceed to production correlation
      # until that wrapper itself has completed successfully. If it fails,
      # surface the exact wrapper run immediately instead of waiting blindly
      # for a production run that can never exist.
      if [[ "$workflow" == 'firebase-production-dispatch-current-main.yml' ]]; then
        local completion_poll wrapper_json wrapper_status wrapper_conclusion wrapper_sha wrapper_event wrapper_branch
        for completion_poll in $(seq 1 180); do
          wrapper_json="$(gh api "repos/$REPOSITORY/actions/runs/$run_id")"
          wrapper_status="$(jq -r '.status // "unknown"' <<<"$wrapper_json")"
          wrapper_conclusion="$(jq -r '.conclusion // ""' <<<"$wrapper_json")"
          wrapper_sha="$(jq -r '.head_sha // ""' <<<"$wrapper_json")"
          wrapper_event="$(jq -r '.event // ""' <<<"$wrapper_json")"
          wrapper_branch="$(jq -r '.head_branch // ""' <<<"$wrapper_json")"

          if [[ "$wrapper_sha" != "$expected_sha" || "$wrapper_event" != 'workflow_dispatch' || "$wrapper_branch" != 'main' ]]; then
            printf '::error::Protected bank-pilot wrapper provenance changed unexpectedly: run=%s sha=%s event=%s branch=%s url=%s\n' \
              "$run_id" "$wrapper_sha" "$wrapper_event" "$wrapper_branch" "$run_url" >&2
            rm -f "$selector_error"
            return 1
          fi

          if [[ "$wrapper_status" == 'completed' ]]; then
            if [[ "$wrapper_conclusion" == 'success' ]]; then
              printf '[owner-correlation] wrapper completed successfully run=%s poll=%s/180 url=%s\n' \
                "$run_id" "$completion_poll" "$run_url" >&2
              break
            fi
            printf '::error::Protected bank-pilot wrapper failed before Firebase Production Deploy correlation: run=%s conclusion=%s url=%s\n' \
              "$run_id" "${wrapper_conclusion:-unknown}" "$run_url" >&2
            rm -f "$selector_error"
            return 1
          fi

          if (( completion_poll % 30 == 0 )); then
            printf '[owner-correlation] waiting for wrapper completion run=%s status=%s poll=%s/180 url=%s\n' \
              "$run_id" "$wrapper_status" "$completion_poll" "$run_url" >&2
          fi
          sleep 5
        done

        if [[ "${wrapper_status:-unknown}" != 'completed' || "${wrapper_conclusion:-}" != 'success' ]]; then
          printf '::error::Timed out waiting for protected bank-pilot wrapper completion: run=%s status=%s conclusion=%s url=%s\n' \
            "$run_id" "${wrapper_status:-unknown}" "${wrapper_conclusion:-pending}" "$run_url" >&2
          rm -f "$selector_error"
          return 1
        fi
      fi

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

    if (( poll % 30 == 0 )); then
      printf '[owner-correlation] waiting workflow=%s expected_sha=%s poll=%s/%s\n' \
        "$workflow" "$expected_sha" "$poll" "$max_polls" >&2
    fi
    sleep "$delay_seconds"
  done

  local baseline_json
  baseline_json="$(cat "$baseline_file")"
  printf '[owner-correlation] timeout workflow=%s expected_sha=%s after=%ss. New workflow-dispatch candidates (sanitized):\n' \
    "$workflow" "$expected_sha" "$((max_polls * delay_seconds))" >&2
  printf '%s' "$runs_json" |
    jq -c --argjson baseline "$baseline_json" '
      [ .[]
        | select((.id as $id | ($baseline | index($id))) == null)
        | {id, head_sha, status, conclusion, created_at, html_url}
      ]
      | sort_by(.created_at)
      | reverse
      | .[:10]
    ' >&2 || true
  printf '::error::Timed out waiting for a new exact-SHA run of %s for %s.\n' "$workflow" "$expected_sha" >&2

  rm -f "$selector_error"
  return 2
}
