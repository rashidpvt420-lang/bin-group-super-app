# BIN GROUP Super App — Historical Launch-Readiness Audit

> **Historical archive:** This file records an earlier point-in-time audit and is not authoritative for the current repository, production deployment, controlled pilot, or hard-launch decision. Historical branch names, counts, findings and provider states were removed because they became stale and could mislead operators.

## Current sources of truth

Use these sources instead:

- `TESTING.md` for current validation commands and hosted evidence sequence.
- `docs/RELEASE_BLOCKERS.md` for the fail-closed release decision rule.
- `docs/FULL_FIVE_PROFILE_AUDIT.md` for the current five-profile authority boundaries.
- `docs/PROPERTY_ONBOARDING_AUDIT.md` for the canonical Owner onboarding controls.
- `OPERATIONS_ONLY_CHECKLIST.md` for evidence that cannot be established from source code.
- The controlled-pilot operations issue for incident, rollback and deployment history.
- Protected GitHub workflow artifacts for exact-SHA build, rules, deployment and live-evidence truth.

## Audit interpretation

Earlier audits were useful for discovering code defects, duplicate surfaces and provider dependencies. Their individual findings must not be assumed to remain open or resolved without checking current `main` and exact-head CI.

The repository currently treats the following as separate claims:

1. **Source disposition:** code and rules pass the required validation matrix.
2. **Production deployment:** a protected full-stack deployment completed and produced verified metadata.
3. **Pilot eligibility:** exact-SHA hosted evidence and incident state satisfy the controlled-pilot gate.
4. **Hard public launch:** all payment, delivery, App Check, five-profile, pilot and final-decision evidence binds to the same approved SHA and workflow chain.

A source-code pass does not imply claims 2 through 4.

## Persistent architectural considerations

The following require continuing discipline even when current CI is green:

- Keep Owner, Tenant, Technician, Broker and Admin authority server-side for privileged or financial mutations.
- Keep the main-app Admin bridge distinct from the dedicated privileged Admin panel.
- Prevent drift between duplicate or legacy app packages and the canonical role portals.
- Preserve exact-SHA deployment, artifact-digest and same-run evidence bindings.
- Treat App Check, payment-provider processing, production email delivery and credentialed hosted E2E as operational evidence.
- Keep `tickets` and `maintenanceTickets` migration work behind canonical server authority until consolidation is complete.

## Decision

**HARD PUBLIC LAUNCH remains `NO-GO` unless the current protected runtime evidence chain passes.** This archive cannot authorize deployment, pilot eligibility or public release.
