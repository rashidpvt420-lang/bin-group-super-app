# Hard-Launch Control Gates — Predeploy / Postdeploy

## Why this replaced the single `hard-launch-approval-gate.mjs`

The original single-gate design (commit `2da80b2d` and its predecessors) had several
critical defects identified in review:

- A missing `production-incidents.json` was treated as "production is clean" (fail-open).
- The founder "signature" was only a regex-validated hex/UUID string — anyone who could
  edit the JSON file could fabricate approval.
- Approval was not bound to a specific commit SHA or build artifact — one approval could
  authorize deploying an unrelated commit.
- The gate required `production-deployment.json` (proof the commit is already deployed)
  while being documented as a *pre*-deployment check — a contradiction.
- `AUTHORIZED_FOUNDER_EMAILS` silently defaulted to `ceo@bin-groups.com` when unset.
- Timestamp staleness checks used `age > max`, which a `NaN` (invalid/missing timestamp)
  silently passes in JavaScript.
- It never checked authenticated smoke, business workflows, App Check token failures,
  Stripe proof, or pilot completion — it could approve a release while the app was still
  failing in production.

This is fixed by splitting the single gate into two gates with different, non-overlapping
responsibilities, and by making every check fail-closed: missing, malformed, or
unverifiable input is always a failure, never treated as "clean".

## `scripts/predeploy-approval-gate.mjs`

Runs as the **first step** of the `deploy-firebase-production-stack` job in
`.github/workflows/firebase-production-deploy.yml`, which itself only starts after a
required reviewer approves the protected GitHub `environment: production` — that
reviewer approval, recorded in GitHub's own audit log, is the real identity proof. This
script does not try to re-implement identity verification (no regex-validated
"signature" is treated as proof of anything). It verifies the release content:

- `GITHUB_SHA` must be a full 40-character lowercase commit SHA.
- `VALIDATED_ARTIFACT_DIGEST` must be present (computed by
  `scripts/compute-artifact-digest.mjs` over `dist/`, `apps/admin-panel/build/`, and
  `functions/lib/` in the `validate-production-build` job, and re-verified as byte-
  identical after the deploy job's own rebuild).
- `AUTHORIZED_FOUNDER_EMAILS` must be configured — no default fallback.
- `launch_package/launch-proof-gates.json` must have `hardLaunchApproved: true`, a
  recent (`hardLaunchApprovedAt`, ≤24h) approval, and a `founderAuthorization` object
  whose `founderEmail` is on the authorized list, whose `commitSha` equals `GITHUB_SHA`,
  and whose `artifactDigest` equals `VALIDATED_ARTIFACT_DIGEST`. A stale, missing, or
  future timestamp fails.
- `launch_package/production-incidents.json` must exist, parse, have a recent
  `updatedAt`, and show no active incidents, no rollback hold, and no active
  post-failure cooldown. **A missing file is a failure**, not "production is clean".
- `npm run test:stability` (rules hardening, audit bridge, build/rules stability) must
  pass. Live production evidence (business E2E, launch audit) is intentionally *not*
  required here — it cannot exist yet for a commit that hasn't been deployed.

## `scripts/postdeploy-release-gate.mjs`

Runs **after** the deploy job has actually deployed hosting/rules/functions for this
commit, and before the deployment artifact is uploaded / the release can be considered
verified. Everything here targets **live production**:

- `launch_package/production-deployment.json` must exist, be workflow-generated (written
  by `scripts/write-production-deployment-metadata.mjs`, which stamps `workflowRunId`,
  `workflowRef`, and `source: firebase-production-deploy-workflow` — not a hand-edited
  file), have `deployedCommitSha === GITHUB_SHA`, and `artifactDigest ===
  VALIDATED_ARTIFACT_DIGEST`.
- Production route check (`test:e2e:gate11:routes` against the live URLs).
- App Check debug-token readiness (`e2e:ensure-appcheck`).
- SMTP live delivery (`scripts/test-trigger-email.mjs`).
- Business E2E + launch audit + deployment evidence, via the existing
  `run-critical-evidence.mjs --suite all-required` execution-bound evidence system
  (`scripts/lib/launch-honesty.mjs`), then re-validated with `evaluatePilotEligibility`
  — every required suite (owner/tenant/technician/broker/admin/global business flows +
  launch audit) must have zero failed and zero skipped tests, with the recorded
  Playwright JSON artifact cryptographically re-hashed from disk (not trusted from the
  evidence file alone).
- Every recorded artifact is scanned for `appCheck/fetch-status-error` — a real App
  Check infrastructure failure, distinct from the expected 403s produced by deliberate
  negative-path security-rule assertions.
- `live_billing` (Stripe) must be attested in `launch_package/hard-launch-readiness.json`
  for **public** launches; under `LAUNCH_BANK_ONLY=1` it is explicitly deferred, not
  silently skipped.
- Incidents are re-checked (something could have broken *during* deployment).
- `pilot_no_p0_p1` is read for informational purposes only — an unattested pilot window
  does not block a controlled-pilot deploy, it only blocks marking the release
  `PUBLIC_LAUNCH_READY`.

## What neither gate does

- Neither stores or fabricates production credentials — secrets stay in GitHub Secrets.
- Neither edits `launch_package/hard-launch-readiness.json` — that file is read-only from
  these gates' perspective; it is updated by the existing, separate attestation process.
- Neither treats a free-text "signature" field as cryptographic identity proof. The real
  authorization boundary is the protected GitHub environment's required-reviewer gate.

## Operational requirements

- Keep `launch_package/production-incidents.json`'s `updatedAt` current (≤24h old) even
  when there are no incidents — a stale timestamp fails closed by design, so on-call
  should "touch" this file (re-save with a fresh `updatedAt`) as part of routine
  check-ins, not only when something breaks.
- Founder approval in `launch_package/launch-proof-gates.json` must be re-created for
  every release — it is bound to the exact commit SHA and artifact digest and expires
  after 24 hours, by design.

## Tests

```bash
node --test tests/launch/predeploy-approval-gate.test.mjs
node --test tests/launch/postdeploy-release-gate.test.mjs
```

Covers: missing files, malformed JSON, future timestamps, stale timestamps, missing
`AUTHORIZED_FOUNDER_EMAILS`, a garbage "signature" (confirmed to no longer cause a
failure), wrong commit SHA, wrong artifact digest, active incidents, rollback holds,
App Check token-fetch failures, missing/invalid business-workflow evidence, and a fully
valid end-to-end release. Checks that spawn real E2E/SMTP/build processes are
integration-level by nature and are exercised by actually running the gates inside the
deploy workflow, not by these unit tests.
