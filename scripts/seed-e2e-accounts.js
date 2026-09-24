#!/usr/bin/env node
/**
 * Retired legacy universal-password E2E seeder.
 * It previously mutated Auth/claims directly and could expose the injected password in logs.
 */
console.error('[seed-e2e-accounts] REFUSED: legacy universal-password seeding is retired. Use the protected per-role E2E fixture workflows.');
process.exit(1);
