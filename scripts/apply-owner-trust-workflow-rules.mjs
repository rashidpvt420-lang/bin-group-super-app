import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
const source = readFileSync(path, 'utf8');
const marker = '    match /{document=**} {';
const block = `
    match /communication_intake/{intakeId} {
      allow read: if isAdmin();
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    match /vendor_rfqs/{rfqId} {
      allow read: if isAdmin() || (signedIn() && (resource.data.ownerId == request.auth.uid || resource.data.ownerEmail == request.auth.token.get('email', '')));
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    match /vendor_quotes/{quoteId} {
      allow read: if isAdmin() || (signedIn() && (resource.data.ownerId == request.auth.uid || resource.data.ownerEmail == request.auth.token.get('email', '')));
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    match /owner_approval_requests/{approvalId} {
      allow read: if isAdmin() || (signedIn() && (resource.data.ownerId == request.auth.uid || resource.data.ownerEmail == request.auth.token.get('email', '')));
      allow create: if isAdmin();
      allow update: if isAdmin() || (signedIn() && (resource.data.ownerId == request.auth.uid || resource.data.ownerEmail == request.auth.token.get('email', '')) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'decision', 'decisionNote', 'ownerDecisionBy', 'decidedAt', 'updatedAt']) && request.resource.data.decision in ['APPROVED', 'REJECTED', 'REQUEST_MORE_QUOTES', 'EMERGENCY_APPROVED']);
      allow delete: if isAdmin();
    }

    match /vendors/{vendorId} {
      allow read: if isAdmin();
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    match /maintenance_ledger/{ledgerId} {
      allow read: if isAdmin() || (signedIn() && (resource.data.ownerId == request.auth.uid || resource.data.tenantId == request.auth.uid || resource.data.technicianId == request.auth.uid));
      allow create: if isAdmin() || (signedIn() && request.resource.data.source in ['owner_approval_center']);
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    match /data_governance_events/{eventId} {
      allow read: if isAdmin();
      allow create: if isAdmin() || signedIn();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }
`;

if (source.includes('match /owner_approval_requests/{approvalId}')) {
  console.log('Owner Trust workflow Firestore rules already present.');
  process.exit(0);
}
if (!source.includes(marker)) {
  throw new Error('Could not find Firestore catch-all marker for Owner Trust workflow rules insertion.');
}
writeFileSync(path, source.replace(marker, `${block}\n${marker}`));
console.log('Owner Trust workflow Firestore rules inserted.');
