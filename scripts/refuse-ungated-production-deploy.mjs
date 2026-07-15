#!/usr/bin/env node

console.error(
  '[production-deploy] Refused: local and parallel production deploy helpers are retired. ' +
  'Use the protected Firebase Production Deploy workflow with the exact current origin/main SHA.',
);
process.exit(1);
