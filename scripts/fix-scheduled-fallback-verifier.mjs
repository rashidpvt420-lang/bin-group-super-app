import fs from 'node:fs';

const file = 'scripts/verify-scheduled-services-completeness.mjs';
let source = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

const overBroad = `  {
    path: 'scripts/harden-system-secrets-rules.mjs',
    required: [
      'match /system_secrets/{secretId}',
      'allow read, write: if false;',
      'match /{document=**}',
      'fallbackDenied',
      'noAdminCatchAll',
    ],
    forbidden: [
      'match /{collection}/{document=**}',
    ],
  },`;

const outcomeBased = `  {
    path: 'scripts/harden-system-secrets-rules.mjs',
    required: [
      'match /system_secrets/{secretId}',
      'allow read, write: if false;',
      'match /{document=**}',
      'fallbackDenied',
      'noAdminCatchAll',
      'fallbackCount !== 1',
    ],
  },`;

if (source.includes(overBroad)) {
  source = source.replace(overBroad, outcomeBased);
  console.log('[patched] scheduled-services fallback verifier now checks fail-closed outcomes');
} else if (source.includes(outcomeBased)) {
  console.log('[already applied] scheduled-services fallback verifier');
} else {
  throw new Error('Scheduled-services fallback verifier block was not found.');
}

fs.writeFileSync(file, source, 'utf8');
