# BIN Connect Full Inbox Audit

## Added in this sprint

- Shared user-facing BIN Connect inbox page.
- Thread list and live message view for signed-in participants.
- Reply flow for owner, tenant, technician, broker, and staff portals.
- Full conversation continuation instead of only creating a thread from the floating widget.
- Property ID, unit ID, and ticket ID context fields in the floating chat box.
- Direct owner route `/owner/bin-connect`.
- Build-time route wiring for tenant `/tenant/bin-connect`, technician `/technician/bin-connect`, and broker `/broker/bin-connect`.

## Why this matters

BIN Connect becomes the in-app alternative to scattered WhatsApp messages. Owners, tenants, technicians, brokers, and Majlis/government-property staff can keep communication inside the operational record, with admin visibility through the BIN Connect admin inbox.

## Still required for full WhatsApp-level parity

- Real participant selector from Firestore users/properties/units instead of recipient hint text.
- File/photo/voice attachments.
- Push notifications when a reply is added.
- Admin conversion buttons: create ticket, complaint, RFQ, HR/support task, or dashboard feature backlog item.
- Unread counters per participant.
- Thread assignment to named admin/CEO/technician.

## Launch status

This improves controlled-pilot communication readiness. It does not mark hard public launch proof gates as passed.
