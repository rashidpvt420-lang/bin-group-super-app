#!/usr/bin/env node
/**
 * Retired historical migration/repair helper.
 * Local service-account files must not grant production mutation authority.
 */
console.error('[migration-repair] REFUSED: retired production migration helper. Use reviewed, idempotent migrations through protected operations.');
process.exit(1);
