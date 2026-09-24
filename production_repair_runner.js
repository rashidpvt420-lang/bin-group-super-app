#!/usr/bin/env node
/**
 * Retired historical production mutation helper.
 * Production ticket repair must never be authorized by a local CLI argument.
 */
console.error('[production-repair] REFUSED: local production mutation authority is retired. Use reviewed server-authoritative repair code and protected workflows.');
process.exit(1);
