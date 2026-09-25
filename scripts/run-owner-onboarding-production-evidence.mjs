#!/usr/bin/env node

// Phase 11 compatibility alias.
// The historical payment-first Owner evidence flow is retired. Production
// evidence must execute the canonical five-page inspection-first lifecycle,
// which enforces Cash/Cheque only, final server re-quote, immutable receipt
// evidence, Admin MFA approval, and exact-to-fils payment authority.
await import('./run-owner-inspection-first-production-evidence.mjs');
