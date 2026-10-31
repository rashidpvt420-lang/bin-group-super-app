#!/usr/bin/env bash
# Firestore backup + delete-protection plan for bin-group-57c60 (nam5).
# DRY-RUN BY DEFAULT: prints commands only. Applying requires BOTH --apply and
# CONFIRM_PROJECT=bin-group-57c60, and must only be run after founder approval.
set -euo pipefail
PROJECT="bin-group-57c60"
DB="(default)"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

CMDS=(
  "gcloud firestore backups schedules create --project=${PROJECT} --database='${DB}' --recurrence=daily --retention=7d"
  "gcloud firestore backups schedules create --project=${PROJECT} --database='${DB}' --recurrence=weekly --day-of-week=SUN --retention=28d"
  "gcloud firestore databases update --project=${PROJECT} --database='${DB}' --delete-protection"
  "gcloud firestore backups schedules list --project=${PROJECT} --database='${DB}'"
  "gcloud firestore databases describe --project=${PROJECT} --database='${DB}' --format='value(deleteProtectionState,pointInTimeRecoveryEnablement)'"
)

if [[ $APPLY -eq 0 ]]; then
  echo "# DRY RUN — nothing executed. Commands that --apply would run:"
  printf '%s\n' "${CMDS[@]}"
  exit 0
fi
if [[ "${CONFIRM_PROJECT:-}" != "${PROJECT}" ]]; then
  echo "Refusing: set CONFIRM_PROJECT=${PROJECT} to apply." >&2; exit 2
fi
command -v gcloud >/dev/null || { echo "gcloud not installed" >&2; exit 3; }
for c in "${CMDS[@]}"; do echo "+ $c"; eval "$c"; done
