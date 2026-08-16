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

patch(
  'propertyPassports security rules',
  `    match /properties/{propertyId} {`,
  `    match /staff_shifts/{shiftId} {
      allow read: if isNotSuspended() && (canManageProperties() || staffCanRead(resource.data) || resource.data.get('staffId', '') == request.auth.uid || resource.data.get('userId', '') == request.auth.uid);
      allow create, update: if isNotSuspended() && (canManageProperties() || resource.data.get('staffId', '') == request.auth.uid || request.resource.data.get('staffId', '') == request.auth.uid);
      allow delete: if isNotSuspended() && isAdmin();
    }

    match /staff_daily_summaries/{summaryId} {
      allow read: if isNotSuspended() && (canManageProperties() || staffCanRead(resource.data) || resource.data.get('staffId', '') == request.auth.uid || resource.data.get('userId', '') == request.auth.uid);
      allow create, update: if isNotSuspended() && (canManageProperties() || resource.data.get('staffId', '') == request.auth.uid || request.resource.data.get('staffId', '') == request.auth.uid);
      allow delete: if isNotSuspended() && isAdmin();
    }

    match /staff_quick_actions/{actionId} {
      allow read: if isNotSuspended() && (canManageProperties() || staffCanRead(resource.data) || resource.data.get('staffId', '') == request.auth.uid || resource.data.get('userId', '') == request.auth.uid);
      allow create, update: if isNotSuspended() && (canManageProperties() || resource.data.get('staffId', '') == request.auth.uid || request.resource.data.get('staffId', '') == request.auth.uid);
      allow delete: if isNotSuspended() && isAdmin();
    }

    match /staff_request_trackers/{trackerId} {
      allow read: if isNotSuspended() && (canManageProperties() || staffCanRead(resource.data) || resource.data.get('staffId', '') == request.auth.uid || resource.data.get('userId', '') == request.auth.uid);
      allow create, update: if isNotSuspended() && (canManageProperties() || resource.data.get('staffId', '') == request.auth.uid || request.resource.data.get('staffId', '') == request.auth.uid);
      allow delete: if isNotSuspended() && isAdmin();
    }

    match /staff_exceptions/{exceptionId} {
      allow read: if isNotSuspended() && (canManageProperties() || staffCanRead(resource.data) || resource.data.get('staffId', '') == request.auth.uid || resource.data.get('userId', '') == request.auth.uid);
      allow create, update: if isNotSuspended() && (canManageProperties() || resource.data.get('staffId', '') == request.auth.uid || request.resource.data.get('staffId', '') == request.auth.uid);
      allow delete: if isNotSuspended() && isAdmin();
    }

    match /propertyPassports/{passportId} {
      allow get, list, read: if isNotSuspended() && (canManageProperties() || isPropertyOwner(resource.data.get('propertyId', '')) || ownerCanRead(resource.data) || emailOwns(resource.data));
      allow create, update, delete: if isNotSuspended() && canManageProperties();
    }

    match /property_passports/{passportId} {
      allow get, list, read: if isNotSuspended() && (canManageProperties() || isPropertyOwner(resource.data.get('propertyId', '')) || ownerCanRead(resource.data) || emailOwns(resource.data));
      allow create, update, delete: if isNotSuspended() && canManageProperties();
    }

    match /properties/{propertyId} {`,
  'match /propertyPassports/{passportId}'
);

if (changes > 0) {
  writeFileSync(path, rules);
  console.log(`Owner trust Firestore hardening complete. Changes applied: ${changes}.`);
} else {
  console.log('Owner trust Firestore rules already hardened.');
}
