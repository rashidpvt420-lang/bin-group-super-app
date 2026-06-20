import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let rules = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
let changes = 0;

function patch(label, before, after, marker) {
  if (rules.includes(marker)) {
    console.log(`Already hardened: ${label}`);
    return;
  }
  if (!rules.includes(before)) {
    console.warn(`Owner-trust hardening skipped; pattern not found: ${label}`);
    return;
  }
  rules = rules.replace(before, after);
  changes += 1;
  console.log(`Patched: ${label}`);
}

patch(
  'owner approvals must be decision-field only for owners',
  `    match /owner_approval_requests/{requestId} {
      allow read: if isAdmin() || (signedIn() && resource.data.ownerId == request.auth.uid);
      allow create: if isAdmin();
      allow update: if isAdmin() || (signedIn() && resource.data.ownerId == request.auth.uid);
      allow delete: if isAdmin();
    }`,
  `    match /owner_approval_requests/{requestId} {
      allow read: if isAdmin() || (signedIn() && resource.data.ownerId == request.auth.uid);
      allow create: if isAdmin();
      allow update: if isAdmin() || (
        signedIn() &&
        resource.data.ownerId == request.auth.uid &&
        request.resource.data.ownerId == resource.data.ownerId &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'decision', 'decisionNote', 'ownerDecisionBy', 'decidedAt', 'updatedAt']) &&
        request.resource.data.ownerDecisionBy == request.auth.uid &&
        request.resource.data.decision in ['APPROVED', 'REJECTED', 'REQUEST_MORE_QUOTES', 'EMERGENCY_APPROVED'] &&
        request.resource.data.status in ['owner_approved', 'owner_approved_emergency', 'owner_rejected', 'more_quotes_requested']
      );
      allow delete: if isAdmin();
    }`,
  "affectedKeys().hasOnly(['status', 'decision', 'decisionNote', 'ownerDecisionBy', 'decidedAt', 'updatedAt'])"
);

patch(
  'maintenance ledger must be admin/server authored',
  `    match /maintenance_ledger/{ledgerId} {
      allow read: if isAdmin();
      allow create: if isAdmin() || (signedIn() && request.resource.data.ownerId == request.auth.uid);
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`,
  `    match /maintenance_ledger/{ledgerId} {
      allow read: if isAdmin();
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`,
  `match /maintenance_ledger/{ledgerId} {
      allow read: if isAdmin();
      allow create: if isAdmin();`
);

if (changes > 0) {
  writeFileSync(path, rules);
  console.log(`Owner trust Firestore hardening complete. Changes applied: ${changes}.`);
} else {
  console.log('Owner trust Firestore rules already hardened.');
}
