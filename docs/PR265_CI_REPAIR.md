# PR 265 CI repair evidence

Base: `2bbb9869804064e56046f0f795fcc59ff7cea7f6`

The repair aligns CI verifiers with the deployed server-authoritative runtime without changing production behavior:

- audit callable export verification follows `runtimeAll.ts -> runtime.ts -> userAuditOperations.ts`;
- scheduled-service intake verification covers the callable-backed tenant ticket path and requires its runtime export;
- production deployment artifact download assertions inspect the complete YAML step instead of relying on a fixed character window;
- Firestore participant checks short-circuit direct ownership before expensive profile and email lookups;
- technician approval uses the canonical technician profile instead of a duplicated users fallback;
- Storage custom-claim access is null-safe;
- server-authored payout, contract and invoice fixtures are seeded with rules disabled rather than through privileged browser writes.

The branch removes all transient repair workflows and restores the canonical `BIN GROUP CI` workflow before final validation.

Required final checks on the exact branch head:

- scheduled-services completeness;
- production stability guard;
- launch-honesty and workflow-security suite;
- root TypeScript check and lint;
- shared, public, admin and Firebase Functions builds;
- Firestore and Storage emulator tests;
- mobile-store source readiness;
- PR Validation and Codacy.

No Firebase, Stripe, secret, environment, or production deployment mutation was performed. Hard public launch remains fail-closed.
