import fs from 'node:fs';

const scheduledPath = 'scripts/verify-scheduled-services-completeness.mjs';
const launchPath = 'scripts/verify-firestore-launch-hardening.mjs';

let scheduled = fs.readFileSync(scheduledPath, 'utf8').replace(/\r\n?/g, '\n');
let launch = fs.readFileSync(launchPath, 'utf8').replace(/\r\n?/g, '\n');

const oldScheduled = `    path: 'scripts/harden-system-secrets-rules.mjs',
    required: [
      'match /system_secrets/{secretId}',
      'allow read, write: if false;',
      'match /{collection}/{document=**}',
      "collection != 'system_secrets' && hasAdminClaim()",
      'source.includes(legacyCatchAll)',
    ],`;
const newScheduled = `    path: 'scripts/harden-system-secrets-rules.mjs',
    required: [
      'match /system_secrets/{secretId}',
      'allow read, write: if false;',
      'match /{document=**}',
      'fallbackDenied',
      'noAdminCatchAll',
    ],
    forbidden: [
      'match /{collection}/{document=**}',
    ],`;

if (scheduled.includes(oldScheduled)) {
  scheduled = scheduled.replace(oldScheduled, newScheduled);
  console.log('[patched] scheduled-services fail-closed fallback contract');
} else if (!scheduled.includes(newScheduled)) {
  throw new Error('Scheduled-services fallback contract source block was not found.');
}

const forbiddenMarker = `  {
    label: 'shared actor-router helper remains',
    text: 'function safeTicketUpdateByActor() {',
  },
];`;
const forbiddenReplacement = `  {
    label: 'shared actor-router helper remains',
    text: 'function safeTicketUpdateByActor() {',
  },
  {
    label: 'global admin catch-all remains',
    text: 'match /{collection}/{document=**}',
  },
];`;

if (launch.includes(forbiddenMarker)) {
  launch = launch.replace(forbiddenMarker, forbiddenReplacement);
  console.log('[patched] launch verifier forbids global admin catch-all');
} else if (!launch.includes("label: 'global admin catch-all remains'")) {
  throw new Error('Launch verifier forbidden-fragment insertion point was not found.');
}

const requiredMarker = `  {
    label: 'safe client notification helper',
    text: 'function safeClientNotificationCreate(data) {',
  },`;
const requiredReplacement = `  {
    label: 'safe client notification helper',
    text: 'function safeClientNotificationCreate(data) {',
  },
  {
    label: 'fail-closed recursive fallback',
    text: 'match /{document=**} {\\n      allow read, write: if false;',
  },`;

if (launch.includes(requiredMarker) && !launch.includes("label: 'fail-closed recursive fallback'")) {
  launch = launch.replace(requiredMarker, requiredReplacement);
  console.log('[patched] launch verifier requires fail-closed fallback');
} else if (!launch.includes("label: 'fail-closed recursive fallback'")) {
  throw new Error('Launch verifier required-fragment insertion point was not found.');
}

fs.writeFileSync(scheduledPath, scheduled, 'utf8');
fs.writeFileSync(launchPath, launch, 'utf8');
console.log('[install-fail-closed-verifier-contracts] verifier contracts aligned');
