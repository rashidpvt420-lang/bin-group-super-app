#!/usr/bin/env node

const message = [
  '[pass-all-gates] REFUSED — this retired script cannot mark launch gates passed.',
  'Launch evidence must come from protected, execution-generated workflows bound to the exact commit SHA.',
  'Use `npm run launch:evidence:run -- --suite <suite>` for critical evidence,',
  '`npm run launch:pass` only with a real evidence artifact, and the protected Firebase Production Deploy workflow for deployment/public clearance.',
].join('\n');

console.error(message);
process.exit(1);
