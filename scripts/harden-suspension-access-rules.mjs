import { readFileSync, writeFileSync } from 'node:fs';

const file = 'firestore.rules';
let text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
let changed = false;

function replaceCanonical(label, legacy, canonical) {
  const canonicalCount = text.split(canonical).length - 1;
  const legacyCount = text.split(legacy).length - 1;

  if (canonicalCount === 1 && legacyCount === 0) return;
  if (canonicalCount !== 0 || legacyCount !== 1) {
    throw new Error(
      `[suspension-access] ${label}: expected one legacy or one canonical fragment; ` +
      `found legacy=${legacyCount}, canonical=${canonicalCount}`,
    );
  }

  text = text.replace(legacy, canonical);
  changed = true;
}

const legacySuspensionHelper = `    function isNotSuspended() {
      return signedIn() && (
        !exists(/databases/$(database)/documents/users/$(request.auth.uid)) ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true
      );
    }`;

const canonicalSuspensionHelper = `    function profileAllowsAccess(data) {
      return data.get('suspended', false) != true &&
        !(data.get('status', '') in [
          'suspended',
          'SUSPENDED',
          'disabled',
          'DISABLED',
          'rejected',
          'REJECTED'
        ]);
    }

    function isNotSuspended() {
      return signedIn() && (
        !exists(/databases/$(database)/documents/users/$(request.auth.uid)) ||
        profileAllowsAccess(get(/databases/$(database)/documents/users/$(request.auth.uid)).data)
      );
    }`;

replaceCanonical('production suspension helper', legacySuspensionHelper, canonicalSuspensionHelper);

replaceCanonical(
  'self-profile suspension check',
  `(request.auth.uid == userId && (resource == null || resource.data.get('suspended', false) != true))`,
  `(request.auth.uid == userId && (resource == null || profileAllowsAccess(resource.data)))`,
);

replaceCanonical(
  'cross-profile stale-token suspension check',
  `request.auth.uid != userId &&
                      request.auth.token.get('suspended', false) != true &&`,
  `request.auth.uid != userId &&
                      isNotSuspended() &&`,
);

replaceCanonical(
  'directory-list stale-token suspension check',
  `allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && (`,
  `allow list: if isNotSuspended() && (`,
);

const required = [
  `function profileAllowsAccess(data) {`,
  `data.get('status', '') in [`,
  `(request.auth.uid == userId && (resource == null || profileAllowsAccess(resource.data)))`,
  `allow list: if isNotSuspended() && (`,
  `match /{subcollection}/{document=**} {`,
  `allow read: if isNotSuspended() && ((signedIn() && request.auth.uid == userId) || isAdmin() || isHr());`,
];

for (const fragment of required) {
  if (!text.includes(fragment)) {
    throw new Error(`[suspension-access] required fragment missing after hardening: ${fragment}`);
  }
}

const forbidden = [
  `get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true`,
  `(request.auth.uid == userId && (resource == null || resource.data.get('suspended', false) != true))`,
  `allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && (`,
  `allow read: if (signedIn() && request.auth.uid == userId) || canReadUserDirectory();`,
];

for (const fragment of forbidden) {
  if (text.includes(fragment)) {
    throw new Error(`[suspension-access] forbidden legacy fragment remains: ${fragment}`);
  }
}

if (changed) writeFileSync(file, text);
console.log(changed
  ? '[suspension-access] hardened status/boolean suspension checks and user subcollection isolation'
  : '[suspension-access] rules already canonical');
