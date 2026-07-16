import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rulesPath = path.join(root, 'firestore.rules');
const testsPath = path.join(root, 'test', 'security-rules.test.js');

for (const filePath of [rulesPath, testsPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
}

const normalize = (value) => value.replace(/\r\n?/g, '\n');

let rules = normalize(fs.readFileSync(rulesPath, 'utf8'));
let tests = normalize(fs.readFileSync(testsPath, 'utf8'));

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    if (source.includes(after)) {
      console.log(`[already applied] ${label}`);
      return source;
    }
    throw new Error(`Cannot apply ${label}: expected source block was not found.`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Cannot apply ${label}: source block occurs more than once.`);
  }
  console.log(`[patched] ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceExpectedCount(source, before, after, expectedCount, label) {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) {
    console.log(`[already applied] ${label}`);
    return source;
  }
  if (count !== expectedCount) {
    throw new Error(`Cannot apply ${label}: expected ${expectedCount} occurrence(s), found ${count}.`);
  }
  console.log(`[patched] ${label}`);
  return source.split(before).join(after);
}

rules = replaceOnce(
  rules,
`    function canDispatchJobs() {
      return isNotSuspended() && (
        hasAdminClaim() ||
        hasPermission('canDispatchJobs') ||
        (signedIn() && (
          request.auth.token.get('role', '') in ['operations_manager', 'dispatcher'] ||
          request.auth.token.get('userRole', '') in ['operations_manager', 'dispatcher'] ||
          request.auth.token.get('primaryRole', '') in ['operations_manager', 'dispatcher']
        ))
      );
    }`,
`    function hasDispatchAuthorityClaimOnly() {
      return signedIn() && (
        hasAdminClaim() ||
        hasPermission('canDispatchJobs') ||
        claimedRole() in ['operations_admin', 'operations_manager', 'dispatcher']
      );
    }

    function canDispatchJobs() {
      // Check inexpensive signed claims first. The database-backed suspension
      // lookup runs only for callers that actually possess dispatch authority.
      return hasDispatchAuthorityClaimOnly() && isNotSuspended();
    }`,
  'dispatch authority short-circuit',
);

rules = replaceOnce(
  rules,
`    function safeTenantEvidenceUpdate() {
      return signedIn() && tenantOwns(resource.data) &&
        resource.data.get('evidenceStatus', '') != 'TENANT_EVIDENCE_UPLOADED' &&
        (!('evidenceStatus' in request.resource.data) || request.resource.data.evidenceStatus in ['PENDING_TENANT_UPLOAD', 'TENANT_EVIDENCE_UPLOADED', 'TENANT_EVIDENCE_UPLOAD_FAILED']) &&
        request.resource.data.get('photos', []).size() >= resource.data.get('photos', []).size() &&
        request.resource.data.get('photos', []).hasAll(resource.data.get('photos', [])) &&
        request.resource.data.get('tenantPhotos', []).size() >= resource.data.get('tenantPhotos', []).size() &&
        request.resource.data.get('tenantPhotos', []).hasAll(resource.data.get('tenantPhotos', [])) &&
        (
          resource.data.get('primaryPhotoUrl', '') == '' ||
          request.resource.data.get('primaryPhotoUrl', '') == resource.data.get('primaryPhotoUrl', '')
        ) &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['photos', 'primaryPhotoUrl', 'tenantPhotos', 'evidenceStatus', 'evidenceUploadedAt', 'evidenceUploadError', 'updatedAt']);
    }`,
`    function safeTenantEvidenceUpdate() {
      return signedIn() &&
        tenantOwns(resource.data) &&
        isNotSuspended() &&
        // Reject unrelated mutations before evaluating array invariants.
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'photos',
          'primaryPhotoUrl',
          'tenantPhotos',
          'evidenceStatus',
          'evidenceUploadedAt',
          'evidenceUploadError',
          'updatedAt'
        ]) &&
        resource.data.get('evidenceStatus', '') != 'TENANT_EVIDENCE_UPLOADED' &&
        (!('evidenceStatus' in request.resource.data) || request.resource.data.evidenceStatus in ['PENDING_TENANT_UPLOAD', 'TENANT_EVIDENCE_UPLOADED', 'TENANT_EVIDENCE_UPLOAD_FAILED']) &&
        request.resource.data.get('photos', []).size() >= resource.data.get('photos', []).size() &&
        request.resource.data.get('photos', []).hasAll(resource.data.get('photos', [])) &&
        request.resource.data.get('tenantPhotos', []).size() >= resource.data.get('tenantPhotos', []).size() &&
        request.resource.data.get('tenantPhotos', []).hasAll(resource.data.get('tenantPhotos', [])) &&
        (
          resource.data.get('primaryPhotoUrl', '') == '' ||
          request.resource.data.get('primaryPhotoUrl', '') == resource.data.get('primaryPhotoUrl', '')
        );
    }`,
  'tenant ticket update early rejection and suspension',
);

rules = replaceOnce(
  rules,
`    function canCreateTenantBoundTicket(data) {
      return signedIn() &&
        claimedRole() == 'tenant' &&
        tenantOwns(data) &&`,
`    function canCreateTenantBoundTicket(data) {
      return signedIn() &&
        claimedRole() == 'tenant' &&
        tenantOwns(data) &&
        isNotSuspended() &&`,
  'tenant ticket create suspension',
);

rules = replaceOnce(
  rules,
`    function safeDispatcherTicketUpdate() {
      return canDispatchJobs() &&`,
`    function safeDispatcherTicketUpdate() {
      // Non-dispatch callers fail on claims before any Firestore profile read.
      return hasDispatchAuthorityClaimOnly() &&
        isNotSuspended() &&`,
  'dispatcher ticket update short-circuit and suspension',
);

rules = replaceOnce(
  rules,
`    function safeTechnicianTicketUpdate() {
      return isApprovedTechnician() && techOwns(resource.data) &&`,
`    function safeTechnicianTicketUpdate() {
      // Non-technicians and unassigned technicians fail before profile reads.
      return hasTechnicianClaim() &&
        techOwns(resource.data) &&
        isNotSuspended() &&
        isApprovedTechnician() &&`,
  'technician ticket update short-circuit and suspension',
);

rules = replaceOnce(
  rules,
`      match /{subcollection}/{document=**} {
        allow read: if isNotSuspended() && ((signedIn() && request.auth.uid == userId) || isAdmin() || isHr());
        allow create: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));
        allow update: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));
        allow delete: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));
      }`,
`      match /fcmTokens/{tokenId} {
        allow read: if isNotSuspended() &&
          (request.auth.uid == userId || isAdmin() || isHr());
        allow create, update, delete: if isNotSuspended() &&
          (request.auth.uid == userId || isAdmin());
      }

      match /deviceReadiness/{readinessId} {
        allow read: if isNotSuspended() &&
          (request.auth.uid == userId || isAdmin() || isHr());
        allow create, update, delete: if isNotSuspended() &&
          (request.auth.uid == userId || isAdmin());
      }

      // Unknown and future user subcollections are denied until explicitly
      // reviewed and allowlisted above.
      match /{subcollection}/{document=**} {
        allow read, write: if false;
      }`,
  'explicit user subcollection allowlist',
);

rules = replaceOnce(
  rules,
`      allow read: if collection != 'system_secrets' && hasAdminClaim();`,
`      allow read: if hasAdminClaim() && !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']);`,
  'exclude explicit hierarchies and short-circuit global admin read catch-all',
);

rules = replaceExpectedCount(
  rules,
`          'system_secrets',
          'audit_logs',`,
`          'system_secrets',
          'users',
          'tickets',
          'maintenanceTickets',
          'audit_logs',`,
  2,
  'exclude explicit hierarchies from global admin write catch-all',
);

const legacyTicketUpdate = '      allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();';
const actorRoutedTicketUpdate = '      allow update: if safeTicketUpdateByActor();';
rules = replaceExpectedCount(
  rules,
  legacyTicketUpdate,
  actorRoutedTicketUpdate,
  2,
  'route ticket updates through one actor authorization path',
);

if (!rules.includes('    function safeTicketUpdateByActor() {')) {
  const insertionPoint = '    function safeTechnicianProfileUpdate(techId) {';
  const index = rules.indexOf(insertionPoint);
  if (index < 0) {
    throw new Error('Cannot add actor-routed ticket helper: insertion point not found.');
  }
  const helper = `    function safeTicketUpdateByActor() {
      // Select exactly one authorization path. Nested conditionals are lazy,
      // preventing dispatcher, tenant, and technician predicates from all
      // consuming the same Firestore Rules expression budget.
      return isAdmin()
        ? isNotSuspended()
        : hasDispatchAuthorityClaimOnly()
          ? safeDispatcherTicketUpdate()
          : claimedRole() == 'tenant'
            ? safeTenantEvidenceUpdate()
            : claimedRole() == 'technician'
              ? safeTechnicianTicketUpdate()
              : false;
    }

`;
  rules = `${rules.slice(0, index)}${helper}${rules.slice(index)}`;
  console.log('[patched] lazy actor-routed ticket update helper');
} else {
  console.log('[already applied] lazy actor-routed ticket update helper');
}

if ((rules.split(actorRoutedTicketUpdate).length - 1) !== 2) {
  throw new Error('Actor-routed ticket update rule must exist exactly twice.');
}

const testMarker = "it('explicit user subcollection allowlist blocks unknown paths and enforces role policy'";
if (!tests.includes(testMarker)) {
  const insertion = `

  it('explicit user subcollection allowlist blocks unknown paths and enforces role policy', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/user_a'), { role: 'tenant', suspended: false });
    await setDoc(doc(adminDb, 'users/user_b'), { role: 'tenant', suspended: false });

    const selfDb = testEnv.authenticatedContext('user_a', { role: 'tenant' }).firestore();
    const otherDb = testEnv.authenticatedContext('user_b', { role: 'tenant' }).firestore();
    const hrDb = testEnv.authenticatedContext('hr_user', { role: 'hr_admin' }).firestore();

    const selfToken = doc(selfDb, 'users/user_a/fcmTokens/token_self');
    await assertSucceeds(setDoc(selfToken, { token: 'token_self', platform: 'web' }));
    await assertSucceeds(getDoc(selfToken));
    await assertSucceeds(updateDoc(selfToken, { platform: 'android-web' }));

    await assertSucceeds(getDoc(doc(adminDb, 'users/user_a/fcmTokens/token_self')));
    await assertSucceeds(getDoc(doc(hrDb, 'users/user_a/fcmTokens/token_self')));
    await assertFails(updateDoc(doc(hrDb, 'users/user_a/fcmTokens/token_self'), { platform: 'forged' }));

    await assertFails(getDoc(doc(otherDb, 'users/user_a/fcmTokens/token_self')));
    await assertFails(setDoc(doc(otherDb, 'users/user_a/fcmTokens/token_other'), { token: 'token_other' }));

    await assertSucceeds(setDoc(doc(selfDb, 'users/user_a/deviceReadiness/push'), {
      platform: 'web',
      supportsMessaging: true,
    }));
    await assertSucceeds(getDoc(doc(adminDb, 'users/user_a/deviceReadiness/push')));
    await assertSucceeds(getDoc(doc(hrDb, 'users/user_a/deviceReadiness/push')));
    await assertFails(setDoc(doc(hrDb, 'users/user_a/deviceReadiness/forged'), { platform: 'forged' }));

    for (const database of [selfDb, adminDb, hrDb]) {
      await assertFails(setDoc(doc(database, 'users/user_a/permissions/escalated'), { admin: true }));
      await assertFails(setDoc(doc(database, 'users/user_a/security/session'), { bypass: true }));
    }

    await assertSucceeds(setDoc(doc(adminDb, 'users/user_a/fcmTokens/token_admin'), {
      token: 'token_admin',
      platform: 'web',
    }));
    await assertSucceeds(deleteDoc(doc(adminDb, 'users/user_a/fcmTokens/token_admin')));
    await assertSucceeds(deleteDoc(selfToken));
  });

  it('stale-token database suspension blocks all critical client write paths', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    await setDoc(doc(adminDb, 'users/suspended_tenant'), {
      role: 'tenant',
      suspended: true,
      propertyId: 'prop_suspended',
      unitId: 'unit_suspended',
    });
    await setDoc(doc(adminDb, 'units/unit_suspended'), {
      tenantId: 'suspended_tenant',
      tenantUid: 'suspended_tenant',
      propertyId: 'prop_suspended',
      ownerId: 'owner_suspended',
    });

    const existingTenantTicket = {
      tenantId: 'suspended_tenant',
      tenantUid: 'suspended_tenant',
      unitId: 'unit_suspended',
      propertyId: 'prop_suspended',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
      photos: [],
      tenantPhotos: [],
    };
    await setDoc(doc(adminDb, 'tickets/suspended_tenant_existing'), existingTenantTicket);
    await setDoc(doc(adminDb, 'maintenanceTickets/suspended_tenant_existing'), existingTenantTicket);

    const staleTenantDb = testEnv.authenticatedContext('suspended_tenant', {
      role: 'tenant',
    }).firestore();

    const newTicket = {
      tenantId: 'suspended_tenant',
      tenantUid: 'suspended_tenant',
      unitId: 'unit_suspended',
      propertyId: 'prop_suspended',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
    };
    await assertFails(setDoc(doc(staleTenantDb, 'tickets/suspended_tenant_new'), newTicket));
    await assertFails(setDoc(doc(staleTenantDb, 'maintenanceTickets/suspended_tenant_new'), newTicket));
    await assertFails(updateDoc(doc(staleTenantDb, 'tickets/suspended_tenant_existing'), {
      evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
      photos: ['https://storage.example.com/suspended.jpg'],
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(staleTenantDb, 'maintenanceTickets/suspended_tenant_existing'), {
      evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
      photos: ['https://storage.example.com/suspended.jpg'],
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(setDoc(doc(staleTenantDb, 'users/suspended_tenant/fcmTokens/blocked'), {
      token: 'blocked',
    }));

    await setDoc(doc(adminDb, 'users/suspended_owner'), { role: 'owner', suspended: true });
    await setDoc(doc(adminDb, 'properties/suspended_owner_existing'), {
      ownerId: 'suspended_owner',
      status: 'draft',
      name: 'Existing property',
    });
    const staleOwnerDb = testEnv.authenticatedContext('suspended_owner', {
      role: 'owner',
    }).firestore();
    await assertFails(setDoc(doc(staleOwnerDb, 'properties/suspended_owner_new'), {
      ownerId: 'suspended_owner',
      status: 'draft',
      name: 'Blocked property',
    }));
    await assertFails(updateDoc(doc(staleOwnerDb, 'properties/suspended_owner_existing'), {
      name: 'Blocked update',
    }));

    await setDoc(doc(adminDb, 'users/suspended_tech'), {
      role: 'technician',
      suspended: true,
      status: 'active',
      approvalStatus: 'approved',
    });
    await setDoc(doc(adminDb, 'technicians/suspended_tech'), {
      status: 'active',
      approvalStatus: 'approved',
      suspended: false,
    });
    const existingTechTicket = {
      assignedTechnicianId: 'suspended_tech',
      technicianId: 'suspended_tech',
      status: 'ASSIGNED',
      beforePhotos: [],
      afterPhotos: [],
      proofPhotos: [],
      completionPhotos: [],
      evidencePhotos: [],
    };
    await setDoc(doc(adminDb, 'tickets/suspended_tech_existing'), existingTechTicket);
    await setDoc(doc(adminDb, 'maintenanceTickets/suspended_tech_existing'), existingTechTicket);

    const staleTechDb = testEnv.authenticatedContext('suspended_tech', {
      role: 'technician',
    }).firestore();
    await assertFails(updateDoc(doc(staleTechDb, 'tickets/suspended_tech_existing'), {
      technicianNotes: 'Blocked stale-token update',
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(staleTechDb, 'maintenanceTickets/suspended_tech_existing'), {
      technicianNotes: 'Blocked stale-token update',
      updatedAt: new Date().toISOString(),
    }));
  });
`;

  const closeIndex = tests.lastIndexOf('\n});');
  if (closeIndex < 0) {
    throw new Error('Cannot append regression tests: suite closing marker was not found.');
  }
  tests = tests.slice(0, closeIndex) + insertion + tests.slice(closeIndex);
  console.log('[patched] comprehensive user-subcollection and stale-token write tests');
} else {
  console.log('[already applied] comprehensive regression tests');
}

fs.writeFileSync(rulesPath, `${rules.replace(/\n*$/, '\n')}`, 'utf8');
fs.writeFileSync(testsPath, `${tests.replace(/\n*$/, '\n')}`, 'utf8');

console.log('');
console.log('Final Firestore hardening patch applied.');
console.log('Next: npm run test:rules 2>&1 | Tee-Object rules-test-output.log');
console.log('Then verify no expression-limit overflow:');
console.log('  Select-String -Path rules-test-output.log -Pattern "maximum of 1000 expressions"');
