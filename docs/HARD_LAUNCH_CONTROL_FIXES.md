# Hard-launch controls — redesigned (fail-closed)

The monolithic `scripts/hard-launch-approval-gate.mjs` implementation on
`2da80b2d` was **not** an acceptable hard-launch gate. It is removed and
replaced by a single coherent production lifecycle that integrates two
compatible layers (not two competing final judges).

## Authoritative lifecycle

**Primary fail-closed technical control:**

| Gate | Script | When |
|---|---|---|
| Exact-main dispatcher | `.github/workflows/firebase-production-dispatch-current-main.yml` | Operator entrypoint; stabilizes current `main`, derives incident state, then dispatches the protected workflow |
| Incident attestation producer | `scripts/create-production-incidents-attestation.mjs` | First artifact producer inside the protected `production` job |
| Pre-deployment approval | `scripts/predeploy-approval-gate.mjs` | After builds + digest binding, **before** Firebase deploy |
| Production deploy | `scripts/deploy-firebase-production.mjs` | Exactly once after predeploy gates |
| Post-deployment release | `scripts/postdeploy-release-gate.mjs` | Optional public-release job after same-run deployment artifact + live evidence |

**Complementary cryptographic founder layer:**

| Gate | Script | Role |
|---|---|---|
| Founder authorization | `scripts/create-hard-launch-authorization.mjs` | HMAC-signs founder dispatch authorization bound to SHA/run |
| Signed predeploy authorization | `scripts/hard-launch-predeploy-gate.mjs` | Validates HMAC authorization + incidents before deploy (**deploy only**) |
| Signed decision | `scripts/hard-launch-decision-gate.mjs` | Records the post-evidence decision; `hardLaunchClaim` stays `false` for bank-pilot and becomes `true` only after public postdeploy + Stripe live proof clear |

GitHub `environment: production` and the split gates provide environment and technical fail-closed controls. The HMAC layer adds a cryptographically signed founder/run binding. They cooperate: HMAC authorizes deploy readiness; split predeploy enforces digests and build markers; only after same-SHA deploy, live evidence, postdeploy clearance, and Stripe live verification may the signed decision set `hardLaunchClaim=true`.

## Operator entrypoint

Operators start production from:

`START HERE - Firebase Production Deploy`

The operator does **not** manually enter:

- `expected_commit_sha`
- `incident_attestation`
- `incident_last_deployment_failed`
- `incident_last_deployment_failed_at`

The dispatcher stabilizes current `main`, binds the exact 40-character SHA, inspects the latest completed protected deployment, enforces the 30-minute failed-deployment cooldown, and derives `CLEAR` versus `WITH_HOLDS`. It then passes the derived values to the protected `Firebase Production Deploy` workflow.

The operator still supplies truthful active-incident JSON, explicit rollback-hold state/reason, and a current evidence reference. Public mode additionally requires a verified hard-clearance run ID and real Stripe live session/webhook identifiers.

## Incident artifact provenance

`production-incidents.json` is **not** accepted as a static committed green fixture.

It is produced on every protected deployment by `create-production-incidents-attestation.mjs` from values passed by the exact-main dispatcher:

- derived incident attestation: `ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR` or `ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS`
- operator-supplied active incidents JSON and explicit rollback hold/reason
- dispatcher-derived latest-deployment failure state and timestamp
- non-empty evidence references, with the failed protected run appended when recovery is required
- repository, exact main SHA, workflow run/attempt, actor, workflow name, and timestamp bindings

Missing, incomplete, contradictory, stale, or manually forged incident state fails closed. Gates reject active P0/P1 incidents, rollback holds, invalid timestamps, and failed deployments still inside the cooldown window.

## Predeploy requirements

- `GITHUB_ACTIONS=true` and `DEPLOYMENT_ENVIRONMENT=production`
- Full lowercase 40-character `GITHUB_SHA`, already bound by the dispatcher
- `VALIDATED_ARTIFACT_DIGEST=sha256:<64-hex>` from built main and Admin artifacts
- `launch_package/predeploy-approval.json` bound to `commitSha`, `artifactDigest`, `releaseId`, `approvedAt`, and `approvedBy`
- `approvedVia=github-environment-protection`
- `AUTHORIZED_FOUNDER_EMAILS` and `AUTHORIZED_FOUNDER_ACTORS` configured and non-empty
- Runtime `production-incidents.json` present, recent, bound to the run/SHA, and free of P0/P1 or rollback holds
- Invalid, future, and stale timestamps rejected
- Does **not** require `production-deployment.json` before deployment

## Postdeploy requirements

- Workflow-generated `production-deployment.json` with `source=firebase-production-deploy-workflow`
- Same workflow-run, exact-SHA, exact-artifact binding
- Pilot-required live evidence for the same commit
- Gate 11 route smoke, business workflow, Admin, audit, App Check, and SMTP evidence
- No App Check 403 or permission-denied contamination
- Operational readiness containing all required evidence-specific gates
- Verified 24-hour controlled-pilot provenance with no open P0/P1 incident
- Stripe live proof for `launch_mode=public`
- Incidents rechecked after deploy
- HMAC-signed final decision whose evidence hashes match the exact runtime artifacts

## Workflow integration

`START HERE - Firebase Production Deploy`:

1. Validates founder confirmation, launch mode, active incident JSON, rollback inputs, evidence references, and public-only fields.
2. Reads the latest completed protected production run.
3. Derives failed-state recovery and enforces the cooldown.
4. Stabilizes current `main` and dispatches the protected workflow with the exact SHA.
5. Resolves only a run with that SHA and an accepted dispatcher actor; cancels race-dispatched runs.

Protected `Firebase Production Deploy`:

1. Uses the protected `production` environment.
2. Creates the runtime incidents artifact from dispatcher-derived state.
3. Creates HMAC founder authorization and enforces signed predeploy approval.
4. Builds, computes the artifact digest, and verifies approval binding.
5. Deploys via `node scripts/deploy-firebase-production.mjs` exactly once.
6. Generates live role/business evidence and records a bank-pilot decision without a public claim.
7. Uploads exact-SHA deployment metadata after verification.
8. In public mode, downloads the same-run artifact, verifies hard-clearance provenance and Stripe live proof, runs the postdeploy gate, then writes the signed final decision.

## Runtime blocker command

`npm run launch:blockers` now treats `launch_package/hard-launch-readiness.json` as baseline planning metadata only. Its final result is determined by current runtime artifacts through `evaluateHardLaunchEligibility`, followed by HMAC verification of `hard-launch-decision.json` and all bound evidence hashes.

A copied or edited JSON file cannot produce a GO result. The protected `HARD_LAUNCH_APPROVAL_HMAC_KEY` is required to verify the final signed decision.

## Tests

```bash
npm run test:launch-honesty
node --test tests/launch/*.test.mjs
```

## Decision

Hard-launch controls remain fail-closed. Public launch is **NO-GO** until production deployment, same-SHA live proofs, a verified 24-hour pilot, public postdeploy clearance, real Stripe live proof, and the signed final decision all validate together.
