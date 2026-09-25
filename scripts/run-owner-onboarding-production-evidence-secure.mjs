#!/usr/bin/env node

// Phase 11 compatibility alias.
// Mailbox-authoritative Owner evidence is now built into the canonical
// inspection-first production runner through E2E_OWNER_MAILBOX_EMAIL and the
// protected Gmail credential inputs. Never reconstruct the retired payment-first
// runner or re-enable BANK_TRANSFER/Stripe through this alias.
await import('./run-owner-inspection-first-production-evidence.mjs');
