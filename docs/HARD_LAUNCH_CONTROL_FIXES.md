# Hard-launch controls — redesigned (fail-closed)

The monolithic `scripts/hard-launch-approval-gate.mjs` implementation on
`2da80b2d` was **not** an acceptable hard-launch gate. It is removed and
replaced by two distinct fail-closed controls.

## Split

| Gate | Script | When |
|---|---|---|
| Pre-deployment approval | `scripts/predeploy-approval-gate.mjs` | Inside protected GitHub `production` environment, **before** Firebase deploy |
| Post-deployment release | `scripts/postdeploy-release-gate.mjs` | After workflow-generated deployment metadata + live evidence, before public-release clearance |

`HARD_LAUNCH_CLAIM` remains `false`. Neither gate flips that constant.

## Predeploy requirements

- `GITHUB_ACTIONS=true` and `DEPLOYMENT_ENVIRONMENT=production` (protected environment approval is the human authorization)
- Full lowercase 40-char `GITHUB_SHA`
- `VALIDATED_ARTIFACT_DIGEST=sha256:<64-hex>` from built main+admin artifacts
- `launch_package/predeploy-approval.json` bound to `commitSha`, `artifactDigest`, `releaseId`, `approvedAt`, `approvedBy`
- `approvedVia` must be `github-environment-protection` — **UUID/hex signatures are rejected**
- `AUTHORIZED_FOUNDER_EMAILS` required (no silent default)
- `production-incidents.json` **must exist**, be valid JSON, have recent `updatedAt`, and show no P0/P1 / rollback hold
- Timestamps reject invalid, future, and stale values
- Does **not** require `production-deployment.json`

## Postdeploy requirements

- Workflow-generated `production-deployment.json` (`source=firebase-production-deploy-workflow`)
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
2. Build → compute artifact digest → write approval binding → **predeploy gate**
3. Deploy Hosting/rules/storage/Functions → write/verify deployment metadata → upload artifact
4. Optional `public-release-clearance` job when `run_public_release_gate=true` runs **postdeploy gate**

## Tests

```bash
node --test tests/launch/predeploy-approval-gate.test.mjs
node --test tests/launch/postdeploy-release-gate.test.mjs
```

## Decision

Hard-launch control implementation: redesigned fail-closed (does not override failing production evidence).

Hard public launch: **NO-GO** until production deploy + live proofs + postdeploy clearance on the same SHA.
