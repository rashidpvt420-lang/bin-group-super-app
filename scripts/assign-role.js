#!/usr/bin/env node
/**
 * Retired local role-assignment helper.
 * Privileged role changes must be server-authoritative and audited.
 */
console.error('[assign-role] REFUSED: local custom-claim mutation is retired. Use the protected Admin Staff Access workflow.');
process.exit(1);
