# Production Dispatch Automation

The **START HERE - Firebase Production Deploy** workflow is the only operator-facing launcher for protected Firebase production deployment.

## Automatically derived evidence

The launcher reads the latest completed `Firebase Production Deploy` run from GitHub Actions and derives:

- whether the latest deployment failed;
- the authoritative failed-run timestamp;
- the required 30-minute cooling period;
- `ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR` versus `ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS`;
- a GitHub production-run evidence reference when failed-state recovery is active.

Operators cannot manually type the incident attestation or manually claim the latest deployment result.

## Preserved controls

The launcher still requires the production and hard-launch confirmation phrases, validates active-incident JSON, enforces rollback reasons, validates all public-only evidence, binds a stable exact `main` SHA, resolves the dispatched workflow by exact SHA and accepted actor, and cancels a race-dispatched run.

The launcher never deploys Firebase itself and makes no hard-launch claim.
