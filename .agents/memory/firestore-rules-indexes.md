---
name: Firestore rules & indexes gotcha
description: Why new Firestore-backed pages work in dev but break in production, and how to prevent it.
---

# Rule
When a page reads a Firestore collection for a non-admin role, you MUST add:
1. A `match /collection/{id}` block in `firestore.rules` BEFORE the final catch-all `match /{document=**}` (which is admin-only — so any collection without its own block is denied to owners/tenants/technicians/brokers).
2. Any required composite index in `firestore.indexes.json` for compound `where`+`orderBy` queries.

**Why:** The dev environment / Firestore console often has permissive or cached behavior, but a real production deploy enforces rules + requires indexes. Pages like owner statements (`payouts` by `ownerEmail`+`createdAt`) and technician earnings (`technicianPayouts` by `technicianId`+`createdAt`, and `maintenanceTickets` by `assignedTechnicianId`+`status`+`updatedAt`) will silently return nothing / throw permission or missing-index errors only in production.

# Reusable helpers in firestore.rules
- `isAdmin()`, `isFinance()`, `ownerCanRead(data)` (owns||emailOwns), `emailOwns(data)` (matches ownerEmail/tenantEmail/etc.), `isTechnicianId(x)` (x==auth.uid).
- Ticket message create is gated by `safeTicketMessageCreate(ticketId)` — it enforces `senderUid==auth.uid` (and senderId/userId/createdBy) to stop sender spoofing in `maintenanceTickets/{id}/messages`.
