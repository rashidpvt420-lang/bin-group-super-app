# Hard-live Batch 3 Owner Status

## Added in branch

- Added OwnerRentHandoverControlCenter component for owner-facing rent due, rent collected, balance, collection rate, pending verification, overdue tenants, pending approvals, and handover entry points.
- Added OwnerInspectionsPage for owner move-in / move-out evidence review from propertyInspections by ownerId, ownerUid, and ownerEmail.

## Partially done

- Owner dashboard integration is still pending. The control-center component exists but must be mounted into OwnerDashboardResolvedPage.
- Owner /inspections route integration is still pending. The page exists but OwnerApp route wiring still needs to be applied.

## Still left after Batch 3

- Owner payment proof drawer/detail page.
- Owner damage claim and settlement write actions.
- Technician proof readiness and close-blocking.
- Broker attribution proof chain.
- Contract/PDF QR/hash proof linkage.
- Passport tabs, map/GPS, and AI Studio approval workflow.
