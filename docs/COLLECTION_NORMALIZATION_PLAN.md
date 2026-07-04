# BIN GROUP Collection Normalization Plan

The app must stop growing duplicate collection names. This plan defines the canonical names, legacy aliases, migration order, and validation checks.

## Canonical collections

| Domain | Canonical collection | Legacy names to retire |
|---|---|---|
| Maintenance tickets | `maintenanceTickets` | `tickets` |
| Payments | `payment_transactions` | `payments`, `paymentConfirmations` |
| Audit trail | `audit_logs` | `auditLogs` |
| Owner approval requests | `owner_approval_requests` | none confirmed |
| Owner documents | `owner_documents` | none confirmed |
| Broker leads | `broker_leads` | none confirmed |
| Broker attribution | `broker_attributions` | none confirmed |
| Broker commissions | `broker_commissions` | none confirmed |

## Migration rules

1. Do not delete legacy collections first.
2. Create read adapters that prefer canonical collections and only fall back to legacy collections.
3. Block new writes to legacy collections after all runtime pages are moved.
4. Run a backfill script with idempotent document IDs.
5. Compare document counts and key field checks.
6. Only then archive legacy collections.

## Ticket migration target

Canonical collection: `maintenanceTickets`.

Required fields:

- `ticketId` or document ID.
- `ownerId` when applicable.
- `tenantId` when applicable.
- `propertyId`.
- `unitId` when applicable.
- `category` or `trade`.
- `priority` and `slaPriority`.
- `slaMinutes`.
- `status`.
- `createdAt`.
- `updatedAt`.
- `assignedTechnicianId` when dispatched.
- `beforePhotos` or tenant evidence field.
- `afterPhotos` or completion evidence field.

## Payment migration target

Canonical collection: `payment_transactions`.

Required fields:

- `paymentId` or document ID.
- `ownerId`.
- `contractId`.
- `propertyId` when applicable.
- `amount`.
- `currency`.
- `method`.
- `status`.
- `verificationState`.
- `createdAt`.
- `updatedAt`.

## Audit migration target

Canonical collection: `audit_logs`.

Required fields:

- `actorId`.
- `actorRole`.
- `action`.
- `targetType`.
- `targetId`.
- `createdAt`.
- `metadata` when available.

## Validation checks

Before public launch, run:

- Count canonical ticket documents.
- Count legacy ticket documents.
- Count canonical payment documents.
- Count legacy payment documents.
- Count canonical audit documents.
- Count legacy audit documents.
- Verify no runtime write path still writes to legacy names.
- Verify Firestore rules cover canonical collections.
- Verify admin dashboards read canonical collections.

## Launch rule

Full commercial launch is blocked until duplicate collection writes are either removed or guarded by a documented backward-compatible adapter.
