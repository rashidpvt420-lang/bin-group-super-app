#!/usr/bin/env node
/**
 * REMOVED — the monolithic hard-launch-approval-gate was fail-open and insecure.
 * Use:
 *   node scripts/predeploy-approval-gate.mjs
 *   node scripts/postdeploy-release-gate.mjs
 */
console.error(
  '[hard-launch-approval-gate] REMOVED. Use scripts/predeploy-approval-gate.mjs and scripts/postdeploy-release-gate.mjs.',
);
console.error('hardLaunchClaim=false');
process.exit(1);
