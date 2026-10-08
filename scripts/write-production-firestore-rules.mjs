#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const sourcePath = 'firestore.rules';
const outputDirectory = 'launch_generated';
const outputPath = `${outputDirectory}/firestore.rules`;
const manifestPath = `${outputDirectory}/firestore-rules-manifest.json`;
let source = readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
const failures = [];

function matchBlock(header) {
  const start = source.indexOf(header);
  if (start < 0) return '';
  const open = start + header.length - 1;
  if (source[open] !== '{') return '';
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
}

// Finance Admins are allowed into the Admin payments module, but they must not
// receive the broader canManageContracts authority just to read the queue.
// Canonicalize only the payment_transactions block; /payments has the same
// historical read expression and must not be changed accidentally.
const paymentTransactionsHeader = '    match /payment_transactions/{paymentId} {';
const legacyPaymentTransactionsRead = "      allow read: if participantCanRead(resource.data) || (signedIn() && resource.data.get('payerId', null) == request.auth.uid) || canManageContracts();";
const financeAdminPaymentTransactionsRead = "      allow read: if participantCanRead(resource.data) || (signedIn() && resource.data.get('payerId', null) == request.auth.uid) || (isNotSuspended() && claimedRole() == 'finance_admin' && 'transactions' in request.auth.token.get('modules', [])) || canManageContracts();";
let paymentTransactionsBlock = matchBlock(paymentTransactionsHeader);
if (!paymentTransactionsBlock) {
  failures.push('payment_transactions rule block is missing or malformed');
} else if (paymentTransactionsBlock.includes(legacyPaymentTransactionsRead)) {
  const hardenedBlock = paymentTransactionsBlock.replace(legacyPaymentTransactionsRead, financeAdminPaymentTransactionsRead);
  source = source.replace(paymentTransactionsBlock, hardenedBlock);
  paymentTransactionsBlock = hardenedBlock;
} else if (!paymentTransactionsBlock.includes(financeAdminPaymentTransactionsRead)) {
  failures.push('payment_transactions Finance Admin read authority could not be canonicalized');
}

// Browser clients may append manual launch-history evidence, but protected
// workflow provenance is server authority. Admin SDK publishers bypass these
// client rules, while browser Admins cannot forge protected provenance or
// mutate/delete evidence after creation.
const launchEvidenceCollections = [
  ['launch_evidence', 'evidenceId'],
  ['signed_in_smoke_checks', 'checkId'],
];
for (const [collection, documentId] of launchEvidenceCollections) {
  const header = `    match /${collection}/{${documentId}} {`;
  const currentBlock = matchBlock(header);
  if (!currentBlock) {
    failures.push(`${collection} rule block is missing or malformed`);
    continue;
  }
  const hardenedBlock = `${header}\n      allow read: if isAdmin();\n      allow create: if isAdmin() &&\n        request.resource.data.get('source', '') != 'github-actions' &&\n        request.resource.data.get('executionGenerated', false) != true &&\n        request.resource.data.get('hardLaunchClaim', false) != true;\n      allow update, delete: if false;\n    }`;
  source = source.replace(currentBlock, hardenedBlock);
}

// Canonical property identity claims are server-authoritative. Browser/Admin
// clients must never enumerate or mutate the identity registry; Admin SDK
// callables claim/release identities transactionally.
const propertyIdentityHeader = '    match /property_identity_registry/{identityHash} {';
if (!matchBlock(propertyIdentityHeader)) {
  const catchAllMarker = '    match /{collection}/{document=**} {';
  const catchAllIndex = source.indexOf(catchAllMarker);
  if (catchAllIndex < 0) failures.push('global Firestore fallback is missing before property identity hardening');
  else {
    const block = `    match /property_identity_registry/{identityHash} {
      allow read, create, update, delete: if false;
    }

`;
    source = `${source.slice(0, catchAllIndex)}${block}${source.slice(catchAllIndex)}`;
  }
}


// Phase 2 profile closure: privileged Admin operational mutations are callable-only.
// Preserve Owner/Tenant scoped self-service, but remove browser Admin mutation authority.
// Admin SDK callables bypass Firestore client rules after Auth + role + App Check + MFA checks.
function replaceRuleBlock(header, nextBlock) {
  const current = matchBlock(header);
  if (!current) {
    failures.push(`${header} rule block is missing or malformed`);
    return;
  }
  source = source.replace(current, nextBlock);
}

replaceRuleBlock('    match /visitorParkingRequests/{requestId} {', `    match /visitorParkingRequests/{requestId} {
      allow read: if isAdmin() || (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) || tenantUidOwns(resource.data);
      allow create: if false;
      allow update: if (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'reviewedAt', 'reviewedBy', 'updatedAt']) &&
        request.resource.data.get('status', '') in ['approved', 'rejected'];
      allow delete: if false;
    }`);

replaceRuleBlock('    match /keyRegister/{keyId} {', `    match /keyRegister/{keyId} {
      allow read: if signedIn() && (isAdmin() || (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) || (docUnitId(resource.data) != null && isUnitTenant(docUnitId(resource.data)) && getTenantPropertyId() == docPropertyId(resource.data)));
      allow create: if docPropertyId(request.resource.data) != null && isPropertyOwner(docPropertyId(request.resource.data));
      allow update: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
      allow delete: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
    }`);

replaceRuleBlock('    match /keyMovements/{movementId} {', `    match /keyMovements/{movementId} {
      allow read: if signedIn() && (isAdmin() || (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) || (docUnitId(resource.data) != null && isUnitTenant(docUnitId(resource.data)) && getTenantPropertyId() == docPropertyId(resource.data)));
      allow create: if docPropertyId(request.resource.data) != null && isPropertyOwner(docPropertyId(request.resource.data));
      allow update: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
      allow delete: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
    }`);

replaceRuleBlock('    match /parcels/{parcelId} {', `    match /parcels/{parcelId} {
      allow read: if isAdmin() || (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) || tenantUidOwns(resource.data);
      allow create: if docPropertyId(request.resource.data) != null && isPropertyOwner(docPropertyId(request.resource.data));
      // Tenant collection confirmation is server-authoritative through
      // confirmTenantParcelCollection; browser updates remain Owner-scoped.
      allow update: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
      allow delete: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
    }`);

replaceRuleBlock('    match /amenities/{amenityId} {', `    match /amenities/{amenityId} {
      allow read: if propertyScopedRead(resource.data);
      allow create: if docPropertyId(request.resource.data) != null && isPropertyOwner(docPropertyId(request.resource.data));
      allow update: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data)) && docPropertyId(request.resource.data) == docPropertyId(resource.data);
      allow delete: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
    }`);

replaceRuleBlock('    match /amenityBookings/{bookingId} {', `    match /amenityBookings/{bookingId} {
      allow read: if isAdmin() || (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) || tenantUidOwns(resource.data);
      allow create: if signedIn() && request.resource.data.get('tenantUid', null) == request.auth.uid && getTenantPropertyId() == docPropertyId(request.resource.data) && request.resource.data.get('status', 'pending') == 'pending' && !request.resource.data.keys().hasAny(tenantSubmissionReviewKeys());
      allow update: if (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) || (signedIn() && tenantUidOwns(resource.data) && request.resource.data.get('tenantUid', null) == request.auth.uid && docPropertyId(resource.data) != null && getTenantPropertyId() == docPropertyId(resource.data) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'cancelledAt', 'updatedAt']) && request.resource.data.get('status', '') == 'cancelled');
      allow delete: if (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) || tenantUidOwns(resource.data);
    }`);

replaceRuleBlock('    match /announcements/{announcementId} {', `    match /announcements/{announcementId} {
      allow read: if propertyScopedRead(resource.data);
      allow create: if docPropertyId(request.resource.data) != null && isPropertyOwner(docPropertyId(request.resource.data));
      allow update: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data)) && docPropertyId(request.resource.data) == docPropertyId(resource.data);
      allow delete: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
    }`);

replaceRuleBlock('    match /documentLibrary/{documentId} {', `    match /documentLibrary/{documentId} {
      allow read: if propertyScopedRead(resource.data);
      allow create: if docPropertyId(request.resource.data) != null && isPropertyOwner(docPropertyId(request.resource.data));
      allow update: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data)) && docPropertyId(request.resource.data) == docPropertyId(resource.data);
      allow delete: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
    }`);

replaceRuleBlock('    match /staffDirectory/{staffId} {', `    match /staffDirectory/{staffId} {
      allow read: if propertyScopedRead(resource.data);
      allow create: if docPropertyId(request.resource.data) != null && isPropertyOwner(docPropertyId(request.resource.data));
      allow update: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data)) && docPropertyId(request.resource.data) == docPropertyId(resource.data);
      allow delete: if docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data));
    }`);

replaceRuleBlock('    match /communityPosts/{postId} {', `    match /communityPosts/{postId} {
      allow read: if signedIn() && (isAdmin() || (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) || (getTenantPropertyId() == docPropertyId(resource.data) && (resource.data.get('status', null) == 'approved' || resource.data.get('authorUid', null) == request.auth.uid)));
      allow create: if signedIn() && request.resource.data.get('authorUid', null) == request.auth.uid && getTenantPropertyId() == docPropertyId(request.resource.data) && request.resource.data.get('status', null) == 'pending';
      allow update: if ((docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) && docPropertyId(request.resource.data) == docPropertyId(resource.data)) || (signedIn() && resource.data.get('authorUid', null) == request.auth.uid && request.resource.data.get('authorUid', null) == request.auth.uid && request.resource.data.get('status', null) == resource.data.get('status', null) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title', 'body', 'updatedAt']));
      allow delete: if (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data))) || (signedIn() && resource.data.get('authorUid', null) == request.auth.uid);
    }`);

replaceRuleBlock('    match /jobPostings/{jobId} {', `    match /jobPostings/{jobId} {
      allow read: if isAdmin() || emailOwns(resource.data);
      allow create: if signedIn() && emailOwns(request.resource.data);
      allow update: if emailOwns(resource.data);
      allow delete: if false;
    }`);

replaceRuleBlock('    match /contractorProfiles/{profileId} {', `    match /contractorProfiles/{profileId} {
      allow read: if isAdmin() || emailOwns(resource.data);
      allow create, update, delete: if false;
    }`);

replaceRuleBlock('    match /data_governance_events/{eventId} {', `    match /data_governance_events/{eventId} {
      allow read: if isAdmin();
      allow create, update, delete: if false;
    }`);

replaceRuleBlock('    match /conversations/{conversationId} {', `    match /conversations/{conversationId} {
      allow read: if isAdmin() || (signedIn() && request.auth.uid in resource.data.get('participantUids', []));
      allow create: if signedIn() &&
        request.resource.data.get('participantUids', []) is list &&
        request.resource.data.get('participantUids', []).size() == 1 &&
        request.resource.data.get('participantUids', [])[0] == request.auth.uid;
      allow update: if signedIn() && request.auth.uid in resource.data.get('participantUids', []) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastMessageAt', 'status']);
      allow delete: if false;

      match /messages/{messageId} {
        allow read: if exists(/databases/$(database)/documents/conversations/$(conversationId)) && (isAdmin() || request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.get('participantUids', []));
        allow create: if exists(/databases/$(database)/documents/conversations/$(conversationId)) && request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.get('participantUids', []) && request.resource.data.get('senderUid', null) == request.auth.uid;
        allow update, delete: if false;
      }
    }`);

replaceRuleBlock('    match /users/{userId} {', `    match /users/{userId} {
      allow get: if request.auth != null && (
                    request.auth.uid == userId ||
                    (
                      signedIn() &&
                      request.auth.uid != userId &&
                      isNotSuspended() &&
                      (
                        (resource.data.get('role', '') == 'tenant' &&
                         ((resource.data.get('ownerId', '') != '' && resource.data.get('ownerId', '') == request.auth.uid) ||
                          emailMatchesCycleFree(resource.data.get('ownerEmail', null)))) ||
                        emailOwnsCycleFree(resource.data) ||
                        canReadUserDirectoryCycleFree()
                      )
                    )
                  );
      allow list: if isNotSuspended() && (
                    canReadUserDirectoryCycleFree() ||
                    (signedIn() &&
                     resource.data.get('role', '') == 'tenant' &&
                     resource.data.get('ownerId', null) == request.auth.uid)
                  );
      allow create: if isAdmin() || safeUserBootstrapCreate(request.resource.data, userId);
      allow update: if isNotSuspended() && (isAdmin() || safeUserSelfUpdate(userId));
      allow delete: if isNotSuspended() && isAdmin();
      match /fcmTokens/{tokenId} {
        allow read, write: if false;
      }

      match /deviceReadiness/{readinessId} {
        allow read, write: if false;
      }

      match /{subcollection}/{document=**} {
        allow read, write: if false;
      }
    }`);

replaceRuleBlock('    match /properties/{propertyId} {', `    match /properties/{propertyId} {
      allow get: if isNotSuspended() && getTenantPropertyId() == propertyId;
      allow read: if isNotSuspended() && (canManageProperties() || propertyOwnedByCaller(resource.data) || (isTechnicianActor() && techOwns(resource.data)));
      allow create: if isNotSuspended() &&
        propertyCreateHasNoCanonicalGeo(request.resource.data) &&
        (canManageProperties() || safeOwnerPropertyCreate(request.resource.data));
      allow update: if isNotSuspended() && (
        (canManageProperties() && safeManagedPropertyUpdate()) ||
        safeOwnerPropertyUpdate()
      );
      allow delete: if isNotSuspended() && isAdmin();
    }`);

replaceRuleBlock('    match /units/{unitId} {', `    match /units/{unitId} {
      allow get: if signedIn() && (resource.data.get('tenantId', null) == request.auth.uid || resource.data.get('tenantUid', null) == request.auth.uid || resource.data.get('currentTenantId', null) == request.auth.uid || resource.data.get('userId', null) == request.auth.uid || emailMatches(resource.data.get('tenantEmail', null)));
      allow list: if signedIn() && resource.data.tenantId == request.auth.uid;
      allow list: if signedIn() && resource.data.tenantUid == request.auth.uid;
      allow list: if signedIn() && resource.data.currentTenantId == request.auth.uid;
      allow list: if emailMatches(resource.data.get('tenantEmail', null));
      allow read: if canManageProperties() || ownerCanRead(resource.data) || tenantOwns(resource.data) || emailOwns(resource.data);
      allow create: if canManageProperties();
      allow update: if canManageProperties();
      allow delete: if canManageProperties();
    }`);

replaceRuleBlock('    match /tenant_unit_link_requests/{requestId} {', `    match /tenant_unit_link_requests/{requestId} {
      allow read: if isAdmin() || tenantOwns(resource.data) || emailOwns(resource.data) || (docPropertyId(resource.data) != null && isPropertyOwner(docPropertyId(resource.data)));
      allow create: if isAdmin() || safeTenantUnitLinkRequestCreate(request.resource.data);
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`);

replaceRuleBlock('    match /contracts/{contractId} {', `    match /contracts/{contractId} {
      allow read: if participantCanRead(resource.data) || emailOwns(resource.data) || canManageContracts();
      allow create: if canManageContracts() || ownerContractDraftCreate(request.resource.data);
      allow update: if canManageContracts() || safeOwnerContractUpdate();
      allow delete: if isAdmin();
    }`);

replaceRuleBlock('    match /leases/{leaseId} {', `    match /leases/{leaseId} {
      allow read: if participantCanRead(resource.data) || emailOwns(resource.data) || isAdmin();
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`);

replaceRuleBlock('    match /tenant_ledger/{ledgerId} {', `    match /tenant_ledger/{ledgerId} {
      allow read: if isAdmin() || ownerCanRead(resource.data) || (signedIn() && resource.data.get('tenantId', null) == request.auth.uid);
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`);

replaceRuleBlock('    match /tenants/{tenantId} {', `    match /tenants/{tenantId} {
      allow read: if (signedIn() && request.auth.uid == tenantId) || isAdmin() || participantCanRead(resource.data);
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`);

replaceRuleBlock('    match /propertyPassports/{passportId} {', `    match /propertyPassports/{passportId} {
      allow read: if isAdmin() || (signedIn() && (resource.data.get('ownerId', null) == request.auth.uid || emailMatches(resource.data.get('ownerEmail', null))));
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`);

const operationalServerOnlyBlocks = [
  ['tenant_services_requests', 'requestId', 'allow read: if isAdmin();'],
  ['assets', 'assetId', 'allow read: if propertyScopedRead(resource.data);'],
  ['binGptEngineerCommands', 'commandId', 'allow read: if isAdmin();'],
  ['tenant_invitations', 'invitationId', "allow read: if isAdmin() || ownerCanRead(resource.data) || emailOwns(resource.data);"],
  ['tenantInvitations', 'invitationId', "allow read: if isAdmin() || ownerCanRead(resource.data) || emailOwns(resource.data);"],
  ['tenant_import_batches', 'batchId', 'allow read: if isAdmin();'],
  ['tenancies', 'tenancyId', "allow read: if isAdmin() || ownerCanRead(resource.data) || tenantOwns(resource.data) || emailOwns(resource.data);"],
];
const operationalCatchAllMarker = '    match /{collection}/{document=**} {';
for (const [collection, documentId, readRule] of operationalServerOnlyBlocks) {
  const header = `    match /${collection}/{${documentId}} {`;
  if (!matchBlock(header)) {
    const at = source.indexOf(operationalCatchAllMarker);
    if (at < 0) failures.push(`global Firestore fallback is missing before ${collection} hardening`);
    else source = `${source.slice(0, at)}    match /${collection}/{${documentId}} {
      ${readRule}
      allow create, update, delete: if false;
    }

${source.slice(at)}`;
  } else {
    replaceRuleBlock(header, `    match /${collection}/{${documentId}} {
      ${readRule}
      allow create, update, delete: if false;
    }`);
  }
}

// Maintenance-ticket Admin browser mutations are retired. Dispatcher, Tenant and
// Technician actor-scoped update paths remain unchanged; Admin uses audited callables.
const maintenanceTicketHeader = '    match /maintenanceTickets/{ticketId} {';
const maintenanceTicketBlock = matchBlock(maintenanceTicketHeader);
if (!maintenanceTicketBlock) {
  failures.push('canonical maintenanceTickets rule block is missing before Admin browser-write closure');
} else {
  const hardenedMaintenanceTicketBlock = maintenanceTicketBlock
    .replace('      allow create: if safeAdminTicketCreate();', '      allow create: if false;')
    .replace('      allow create: if isAdmin();', '      allow create: if false;');
  source = source.replace(maintenanceTicketBlock, hardenedMaintenanceTicketBlock);
}
source = source.replace('        (admin && safeAdminTicketUpdate()) ||', '        false ||');

// The generic Admin fallback overlaps explicit matches, so every callable-only
// operational collection must be excluded from both browser-write fallback rules.
const adminOperationalFallbackExclusions = [
  'visitorParkingRequests',
  'keyRegister',
  'keyMovements',
  'parcels',
  'communityPosts',
  'tenant_services_requests',
  'amenities',
  'amenityBookings',
  'jobPostings',
  'contractorProfiles',
  'staffDirectory',
  'announcements',
  'data_governance_events',
  'assets',
  'documentLibrary',
  'conversations',
  'pricingAuditLogs',
  'binGptEngineerCommands',
  'tenant_invitations',
  'tenantInvitations',
  'tenant_import_batches',
  'tenancies',
];
const fallbackBlockBeforeAdminClosure = matchBlock(operationalCatchAllMarker);
if (!fallbackBlockBeforeAdminClosure) {
  failures.push('global Firestore fallback is missing before Admin operational authority hardening');
} else {
  let hardenedFallback = fallbackBlockBeforeAdminClosure;
  for (const collection of adminOperationalFallbackExclusions) {
    const marker = `          'binConnectThreads'`;
    const replacement = `          'binConnectThreads',
          '${collection}'`;
    // Both create and update/delete lists end with binConnectThreads.
    hardenedFallback = hardenedFallback.split(marker).join(replacement);
  }
  source = source.replace(fallbackBlockBeforeAdminClosure, hardenedFallback);
}



const required = [
  'match /technician_live_locations/{technicianId} {',
  'allow create, update, delete: if false;',
  'function safeTechnicianProfileUpdate(techId) {',
  'return false;',
  'match /maintenanceTickets/{ticketId} {',
  'allow create: if false;',
  'match /tickets/{ticketId} {',
  'match /payroll_entries/{entryId} {',
  "'invoice_registry', 'payroll_entries', 'property_identity_registry'",
  "'technician_live_locations',\n          'properties',\n          'property_identity_registry',\n          'users'",
  financeAdminPaymentTransactionsRead,
  "request.resource.data.get('source', '') != 'github-actions'",
  "request.resource.data.get('executionGenerated', false) != true",
  "request.resource.data.get('hardLaunchClaim', false) != true",
];
for (const token of required) {
  if (!source.includes(token)) failures.push(`required hardened rule fragment missing: ${token}`);
}

for (const [collection, documentId] of launchEvidenceCollections) {
  const block = matchBlock(`    match /${collection}/{${documentId}} {`);
  if (!block.includes('allow read: if isAdmin();')) failures.push(`${collection} Admin read authority is missing`);
  if (!block.includes("request.resource.data.get('source', '') != 'github-actions'")) failures.push(`${collection} browser create can forge github-actions provenance`);
  if (!block.includes("request.resource.data.get('executionGenerated', false) != true")) failures.push(`${collection} browser create can forge execution-generated evidence`);
  if (!block.includes("request.resource.data.get('hardLaunchClaim', false) != true")) failures.push(`${collection} browser create can claim hard-launch authority`);
  if (!block.includes('allow update, delete: if false;')) failures.push(`${collection} is not append-only for browser clients`);
  if (/allow\s+(?:update|delete|write)[^;]*:\s*if\s+isAdmin\(\)/.test(block)) failures.push(`${collection} still permits privileged browser mutation`);
}

const technicianUpdateStart = source.indexOf('    function safeTechnicianTicketUpdate() {');
const technicianUpdateEnd = source.indexOf('\n    function ', technicianUpdateStart + 10);
const technicianUpdate = technicianUpdateStart >= 0
  ? source.slice(technicianUpdateStart, technicianUpdateEnd > technicianUpdateStart ? technicianUpdateEnd : source.length)
  : '';
for (const forbidden of [
  "'arrivedLocation'",
  "'technicianLocation'",
  "'technicianLocationUpdatedAt'",
  "'currentLocation'",
  "'lastLocation'",
  "'isTracking'",
]) {
  if (technicianUpdate.includes(forbidden)) failures.push(`client-authoritative GPS field remains: ${forbidden}`);
}

const payrollBlock = matchBlock('    match /payroll_entries/{entryId} {');
if (!payrollBlock) failures.push('payroll_entries rule block is missing or malformed');
else {
  if (
    !payrollBlock.includes("resource.data.get('technicianId', null) == request.auth.uid") &&
    !payrollBlock.includes("isTechnicianId(resource.data.get('technicianId', null))")
  ) {
    failures.push('payroll_entries self-service read is not bound to the matching Technician UID');
  }
  if (!payrollBlock.includes('allow create, update, delete: if false;')) {
    failures.push('payroll_entries browser writes are not fully denied');
  }
  if (payrollBlock.includes('allow write: if isAdmin()')) {
    failures.push('payroll_entries still permits privileged browser writes');
  }
}

paymentTransactionsBlock = matchBlock(paymentTransactionsHeader);
if (!paymentTransactionsBlock) failures.push('payment_transactions rule block is missing or malformed');
else {
  if (!paymentTransactionsBlock.includes(financeAdminPaymentTransactionsRead.trim())) {
    failures.push('payment_transactions does not grant the active finance_admin the read-only Admin queue authority');
  }
  if (!paymentTransactionsBlock.includes('allow create: if false;') || !paymentTransactionsBlock.includes('allow update, delete: if false;')) {
    failures.push('payment_transactions browser writes must remain server-only');
  }
}

const payrollCatchAllOccurrences = source.match(/'payroll_entries'/g)?.length || 0;
if (payrollCatchAllOccurrences !== 3) {
  failures.push(`payroll_entries must be excluded from read, create and update/delete catch-alls; found ${payrollCatchAllOccurrences}`);
}
const propertyIdentityBlock = matchBlock(propertyIdentityHeader);
if (!propertyIdentityBlock || !propertyIdentityBlock.includes('allow read, create, update, delete: if false;')) {
  failures.push('property_identity_registry must be explicitly browser-denied');
}
const propertyIdentityFallback = matchBlock('    match /{collection}/{document=**} {');
const propertyIdentityReadRule = propertyIdentityFallback.match(/allow\s+read:\s*([^;]+);/)?.[1] || '';
if (!propertyIdentityReadRule.includes("'property_identity_registry'")) {
  failures.push('property_identity_registry is not excluded from the global Admin read fallback');
}
const propertyIdentityFallbackWrites = [...propertyIdentityFallback.matchAll(/allow\s+([^:;]+):\s*([^;]+);/g)]
  .filter(([, operations]) => /\b(create|update|delete|write)\b/.test(operations));
const phase10ServerOnlyFallbackCollections = [
  'system_health',
  'staff_shifts',
  'staff_daily_summaries',
  'staff_quick_actions',
  'staff_request_trackers',
  'staff_exceptions',
  'staff_inventory_confirmations',
  'job_costs',
  'pdf_reports',
  'vehicles',
  'launch_evidence',
  'signed_in_smoke_checks',
  'gatePasses',
  'propertyReporters',
  'broker_listing_claims',
  'active_contracts',
  'onboarding_leads',
  'systemMetrics',
];
if (
  propertyIdentityFallbackWrites.length !== 2 ||
  propertyIdentityFallbackWrites.some(([, , condition]) => !condition.includes("'property_identity_registry'"))
) {
  failures.push('property_identity_registry must be excluded from both generic browser write fallbacks');
}
if (propertyIdentityFallbackWrites.length === 2) {
  for (const collection of phase10ServerOnlyFallbackCollections) {
    if (propertyIdentityFallbackWrites.some(([, , condition]) => !condition.includes(`'${collection}'`))) {
      failures.push(`${collection} must be excluded from both generic browser write fallbacks`);
    }
  }
}


// Payment approval, payer binding and receipt uniqueness must survive every
// normalizer/hardener before producing the actual Firebase deployment artifact.
for (const [collection, key] of [
  ['design_requests', 'requestId'], ['design_quotes', 'quoteId'],
  ['design_approvals', 'approvalId'], ['design_receipt_registry', 'evidenceId'],
]) {
  const marker = `    match /${collection}/{${key}} {`;
  const block = matchBlock(marker);
  const writes = [...block.matchAll(/allow\s+([^:;]+):\s*([^;]+);/g)]
    .filter(([, operations]) => /\b(create|update|delete|write)\b/.test(operations));
  if (!block || source.split(marker).length !== 2 || writes.length === 0 ||
      writes.some(([, , condition]) => condition.trim() !== 'if false')) {
    failures.push(`${collection} must have one explicit server-only write rule`);
  }
  const fallback = matchBlock('    match /{collection}/{document=**} {');
  const fallbackWrites = [...fallback.matchAll(/allow\s+([^:;]+):\s*([^;]+);/g)]
    .filter(([, operations]) => /\b(create|update|delete|write)\b/.test(operations));
  if (fallbackWrites.length !== 2 || fallbackWrites.some(([, , condition]) =>
    !condition.includes(`'${collection}'`))) {
    failures.push(`${collection} must be excluded from both generic browser write fallbacks`);
  }
}

if (failures.length) {
  console.error('[production-firestore-rules] REFUSED');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const sha256 = crypto.createHash('sha256').update(source).digest('hex');
mkdirSync(outputDirectory, { recursive: true });
// Keep the fully hardened source and deploy artefact identical. Production,
// emulator tests and the stability guard therefore all exercise the same rule.
writeFileSync(sourcePath, source, { mode: 0o600 });
writeFileSync(outputPath, source, { mode: 0o600 });
writeFileSync(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  sourcePath,
  outputPath,
  sha256,
  generatedAt: new Date().toISOString(),
  callableOnlyTechnicianGps: true,
  canonicalMaintenanceTicketCreation: 'admin-sdk-callable-only',
  legacyTicketsMutation: 'denied',
  payrollMirrorWrites: 'admin-sdk-only',
  payrollMirrorSelfServiceRead: 'technician-uid-scoped',
  financeAdminPaymentQueueRead: 'finance_admin-transactions-module-read-only',
  launchEvidenceBrowserAuthority: 'manual-create-only-append-only-no-github-provenance',
}, null, 2)}\n`, { mode: 0o600 });
console.log(`[production-firestore-rules] wrote ${outputPath} sha256=${sha256}`);
