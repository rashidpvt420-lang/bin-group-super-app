#!/usr/bin/env node
/**
 * Retired local Admin/founder claim repair helper.
 * It must not mutate privileged production identity from local ADC.
 */
console.error('[repair-admin-claims] REFUSED: local privileged-claim repair is retired. Use protected Admin MFA/access recovery workflows.');
process.exit(1);
