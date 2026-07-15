#!/usr/bin/env node
/**
 * Retired production hosting helper.
 * Production deployment is only authorized through the protected workflow.
 */
console.error(
  '[launch-deploy-hosting] Refused: use Firebase Production Deploy with the exact current origin/main SHA.',
);
process.exit(1);
