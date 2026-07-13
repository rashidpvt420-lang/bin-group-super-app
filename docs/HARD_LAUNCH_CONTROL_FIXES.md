# Hard-launch controls — redesigned (fail-closed)

The monolithic `scripts/hard-launch-approval-gate.mjs` implementation on
`2da80b2d` was **not** an acceptable hard-launch gate. It is removed and
replaced by a single coherent production lifecycle that integrates two
compatible layers (not two competing final judges).

## Authoritative lifecycle

**Primary fail-closed technical control (this redesign):**

| Gate | Script | When |
|---|---|---|
| Incident attestation producer | `scripts/create-production-incidents-artifact.mjs` | First artifact producer inside protected `production` job |
| Pre-deployment approval | `scripts/predeploy-approval-gate.mjs` | After builds + digest binding, **before** Firebase deploy |
| Production deploy | `scripts/deploy-firebase-production.mjs` | Exactly once after predeploy gates |
| Post-deployment release | `scripts/postdeploy-release-gate.mjs` | Optional public-release job after same-run deployment artifact + live evidence |

**Complementary cryptographic founder layer (retained, not contradictory):**

| Gate | Script | Role |
|---|---|---|
| Founder authorization | `scripts/create-hard-launch-authorization.mjs` | HMAC-signs founder dispatch attestation bound to SHA/run |
| Signed predeploy authorization | `scripts/hard-launch-predeploy-gate.mjs` | Validates HMAC auth + incidents before deploy (**deploy only**) |
| Signed decision | `scripts/hard-launch-decision-gate.mjs` | Records post-evidence decision; `hardLaunchClaim` stays `false` for bank-pilot and for public until postdeploy + Stripe live proof clear |

Why both layers: GitHub `environment: production` + split gates provide environment and technical fail-closed controls. The HMAC layer adds a cryptographically signed founder/run binding that the split gates intentionally do not forge. They cooperate: HMAC authorizes deploy readiness; split predeploy enforces digests/build markers; only after same-SHA deploy + live evidence + postdeploy Stripe clearance may the signed decision set `hardLaunchClaim=true`. Neither gate invents a pass.

`HARD_LAUNCH_CLAIM` / `hardLaunchClaim` remains `false` unless the signed decision logic legitimately computes otherwise after those prerequisites.

## Incident artifact provenance

`production-incidents.json` is **not** accepted as a static committed green fixture for deploy.

It is produced each protected run by `create-production-incidents-artifact.mjs` from explicit workflow_dispatch attestations:

- `incident_attestation` must be exactly `ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR` or `ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS`
- active incidents JSON, rollback hold, last-deploy-failure fields, and non-empty evidence references
- bound to repository, main SHA, workflow run/attempt, actor, workflow name, and timestamp

Missing/incomplete/contradictory attestations fail closed. Gates still reject P0/P1, rollback holds, and cooldown windows.

## Predeploy requirements

- `GITHUB_ACTIONS=true` and `DEPLOYMENT_ENVIRONMENT=production` (protected environment approval is the human authorization)
- Full lowercase 40-char `GITHUB_SHA`
- `VALIDATED_ARTIFACT_DIGEST=sha256:<64-hex>` from built main+admin artifacts
- `launch_package/predeploy-approval.json` bound to `commitSha`, `artifactDigest`, `releaseId`, `approvedAt`, `approvedBy`
- `approvedVia` must be `github-environment-protection` — **UUID/hex signatures are rejected**
- `AUTHORIZED_FOUNDER_EMAILS` required (no silent default)
- Runtime `production-incidents.json` **must exist**, be valid JSON, have recent `updatedAt`, and show no P0/P1 / rollback hold
- Timestamps reject invalid, future, and stale values
- Does **not** require `production-deployment.json`

## Postdeploy requirements

- Workflow-generated `production-deployment.json` (`source=firebase-production-deploy-workflow`)
- Artifact must be from the **same workflow run** and SHA (download only after deploy job upload)
- `deployedCommitSha === GITHUB_SHA` and digest match
- Pilot-required live evidence for the same commit (roles, App Check, audit, hosting)
- Gate 11 smoke 12/12, business workflows 9/9
- No App Check 403 / permission-denied contamination in evidence
- SMTP / App Check / routes markers
- Stripe live proof for `LAUNCH_MODE=public`
- `pilot_no_p0_p1` evidence
- Incidents rechecked after deploy

## Workflow integration

`Firebase Production Deploy`:

1. Protected `environment: production` (required reviewers)
2. Create incidents artifact from dispatch attestation
3. HMAC founder authorize + signed predeploy authorization
4. Build → compute artifact digest → write approval binding → **predeploy gate**
5. **Deploy** via `node scripts/deploy-firebase-production.mjs` (hosting, Firestore rules/indexes, Storage rules, Functions) → write/verify metadata
6. Live role/business evidence → signed hard-launch decision (bank-pilot never claims public launch; public waits for postdeploy clearance)
7. Upload `production-deployment-${{ github.sha }}` only after deploy verification
8. Optional `public-release-clearance` downloads the same-run artifact, re-verifies binding, runs **postdeploy gate**, then may finalize signed decision for public mode

## Tests

```bash
npm run test:launch-honesty
node --test tests/launch/*.test.mjs
```

## Decision

Hard-launch control implementation: redesigned fail-closed (does not override failing production evidence).

Hard public launch: **NO-GO** until production deploy + live proofs + postdeploy clearance on the same SHA.
