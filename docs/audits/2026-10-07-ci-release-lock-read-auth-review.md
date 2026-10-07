# CI release-lock authenticated-read repair — 7 October 2026

Scope: separate CI-only change on main `7ceb6aae7867567c8da3e04c73ceb9c00495e08a`. Owner directory #1719 remains a separate repair. Rashid authorized proceeding after the merge hold was reported.

## Observed failure

Play Integrity app/security jobs `112848837754` and `112855978141` each failed the unchanged live release-lock lookup with `GitHub lookup failed with HTTP 403`. The second job passed 184 rules and 280 callable cases; its launch suite had 2,083 passes, one failure and one expected skip.

Inspection found exactly five pull-request workflows running the full launch suite. Three already provide the workflow token with Actions read permission. Current Main Firestore Verification omitted the explicit token. Play Integrity omitted both token wiring and Actions read permission. This configuration permits anonymous requests, consistent with the observed GitHub API failure; fresh hosted execution must establish the fix's result.

## Minimal correction

Pass `${{ github.token }}` as `GITHUB_TOKEN` only to the full launch step in the two affected workflows. Add `actions: read` to Play Integrity's existing read-only permissions. The parsed-workflow regression verifies all five full-suite callers retain their launch step, authenticated token and read scope.

Baseline: five new tests, three passed and two failed on unchanged workflow configuration. After correction all five pass. Existing production-release-lock tests, scripts, workflow release dispatch authority, rules and Owner files are unchanged. No gate is skipped and no write permission is added.

## Validation and evidence

The focused suite also executes existing release-lock unit cases; both workflow and behavioral proof are retained. Mandatory local and exact-head hosted results are recorded in the CI repair PR before merge. Local fixtures do not replace the live hosted lookup. This change does not authorize production deployment, hard clearance or pilot reset.
