# Post-merge Firestore cleanup

This branch removes the temporary self-modifying repair workflow after verification and fixes two durability defects discovered after PR #276 merged:

- `scripts/verify-firestore-launch-hardening.mjs` declared `technicianUpdate` twice and could not execute.
- `scripts/apply-current-main-firestore-expression-budget.mjs` could restore the older expensive technician helper when run directly.

The branch canonicalizes the bounded technician evidence rule, requires Java 21 emulator verification with zero `maximum of 1000 expressions` matches, and reruns stability, launch-honesty, typecheck, lint, app builds, and Functions build before merge.
