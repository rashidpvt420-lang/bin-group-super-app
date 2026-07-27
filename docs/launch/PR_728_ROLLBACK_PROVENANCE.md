# PR 728 rollback provenance

This branch restores the repository tree to protected-green commit `680d761128f9e23e5acaee547ba8abda1b840591` after merged PR #728 introduced launch-contract and workflow regressions.

Before the clean rollback commit was published, the restored tree passed:

- launch-honesty tests;
- TypeScript and lint;
- unified app, Admin app and Firebase Functions builds;
- deterministic Firestore rule preparation and hardening verification;
- Firestore and Storage emulator suites.

The temporary rollback workflow removed itself before publication. This document provides a user-authored exact-head CI trigger and makes no production deployment, pilot-completion or public-launch claim.

`hardLaunchClaim=false`
