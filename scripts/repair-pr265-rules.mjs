#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, 'utf8');
  if (source.includes(after)) return false;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one source block, found ${count}`);
  }
  writeFileSync(path, source.replace(before, after));
  return true;
}

const changed = [];
const replace = (path, before, after, label) => {
  if (replaceOnce(path, before, after, label)) changed.push(`${path}: ${label}`);
};

replace(
  'firestore.rules',
  `    function signedIn() {
      return request.auth != null &&
        request.auth.token.get('suspended', false) != true &&
        (
          !exists(/databases/$(database)/documents/users/$(request.auth.uid)) ||
          !(
            get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('status', '') in
              ['suspended', 'SUSPENDED', 'disabled', 'DISABLED', 'rejected', 'REJECTED']
          )
        );
    }`,
  `    function signedIn() {
      // Suspension is enforced through Auth disablement, token revocation and
      // the signed custom claim. Re-reading users/{uid} in every helper made
      // valid requests exceed Firestore's 1,000-expression evaluation limit.
      return request.auth != null &&
        request.auth.token.get('suspended', false) != true;
    }`,
  'reduce signed-in evaluation cost',
);

replace(
  'firestore.rules',
  `    function isApprovedTechnician() {
      return hasTechnicianClaim() && (
        (
          exists(/databases/$(database)/documents/technicians/$(request.auth.uid)) &&
          approvedTechnicianProfile(get(/databases/$(database)/documents/technicians/$(request.auth.uid)).data)
        ) ||
        (
          exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
          approvedTechnicianProfile(get(/databases/$(database)/documents/users/$(request.auth.uid)).data)
        )
      );
    }`,
  `    function isApprovedTechnician() {
      // Technician approval has one canonical profile source. Avoid evaluating
      // a second user-document fallback on every ticket read and update.
      return hasTechnicianClaim() &&
        exists(/databases/$(database)/documents/technicians/$(request.auth.uid)) &&
        approvedTechnicianProfile(
          get(/databases/$(database)/documents/technicians/$(request.auth.uid)).data
        );
    }`,
  'use canonical technician profile',
);

replace(
  'firestore.rules',
  `    function participantCanRead(data) { return isAdmin() || ownerCanRead(data) || tenantOwns(data) || (isApprovedTechnician() && techOwns(data)) || brokerOwns(data); }`,
  `    function participantCanRead(data) {
      // Resolve cheap identifier ownership before email/profile lookups so
      // legitimate participant requests remain below the rules expression cap.
      return isAdmin() ||
        owns(data) ||
        tenantOwns(data) ||
        brokerOwns(data) ||
        (hasTechnicianClaim() && techOwns(data) && isApprovedTechnician()) ||
        emailOwns(data);
    }`,
  'short-circuit participant ownership',
);

replace(
  'firestore.rules',
  `      allow get: if signedIn() && request.auth.uid == userId;
      allow get: if isAdmin() || isHr() || isFinance() || isOps() || emailOwns(resource.data) ||
                  (signedIn() && request.auth.uid != userId && resource.data.get('role', '') == 'tenant' &&
                   ((resource.data.get('ownerId', '') != '' && resource.data.get('ownerId', '') == request.auth.uid) ||
                    emailMatches(resource.data.get('ownerEmail', null))));`,
  `      allow get: if signedIn() && request.auth.uid == userId;
      allow get: if signedIn() &&
        request.auth.uid != userId &&
        resource.data.get('role', '') == 'tenant' &&
        (
          resource.data.get('ownerId', null) == request.auth.uid ||
          emailMatches(resource.data.get('ownerEmail', null))
        );
      allow get: if isAdmin() || isHr() || isFinance() || isOps();`,
  'short-circuit owner tenant-profile access',
);

replace(
  'firestore.rules',
  `      allow read: if isAdmin() || (signedIn() && (resource.data.get('ownerId', null) == request.auth.uid || emailMatches(resource.data.get('ownerEmail', null))));`,
  `      allow read: if (signedIn() && (
        resource.data.get('ownerId', null) == request.auth.uid ||
        emailMatches(resource.data.get('ownerEmail', null))
      )) || isAdmin();`,
  'short-circuit property-passport ownership',
);

replace(
  'storage.rules',
  `    function isAuth() {
      return request.auth != null &&
        request.auth.token.suspended != true;
    }`,
  `    function isAuth() {
      return request.auth != null &&
        request.auth.token.get('suspended', false) != true;
    }`,
  'make suspended claim null-safe',
);

replace(
  'storage.rules',
  `    function hasAnyRole(roles) {
      return isAuth() && (
        request.auth.token.role in roles ||
        request.auth.token.userRole in roles ||
        request.auth.token.primaryRole in roles
      );
    }`,
  `    function hasAnyRole(roles) {
      return isAuth() && (
        request.auth.token.get('role', '') in roles ||
        request.auth.token.get('userRole', '') in roles ||
        request.auth.token.get('primaryRole', '') in roles
      );
    }`,
  'make role claims null-safe',
);

replace(
  'storage.rules',
  `    function claimedRole() {
      return isAuth()
        ? request.auth.token.role != null
          ? request.auth.token.role
          : request.auth.token.userRole != null
            ? request.auth.token.userRole
            : request.auth.token.primaryRole
        : null;
    }`,
  `    function claimedRole() {
      return isAuth()
        ? request.auth.token.get(
            'role',
            request.auth.token.get('userRole', request.auth.token.get('primaryRole', ''))
          )
        : '';
    }`,
  'make claimed role null-safe',
);

replace(
  'storage.rules',
  `    function isAdmin() {
      return isAuth() && (
        (
          claimedRole() == null &&
          (request.auth.token.admin == true || request.auth.token.isAdmin == true)
        ) ||
        request.auth.token.ceo == true ||
        hasAnyRole(['admin', 'super_admin', 'ceo', 'ADMIN', 'SUPER_ADMIN', 'CEO'])
      );
    }`,
  `    function isAdmin() {
      return isAuth() && (
        (
          claimedRole() == '' &&
          (
            request.auth.token.get('admin', false) == true ||
            request.auth.token.get('isAdmin', false) == true
          )
        ) ||
        request.auth.token.get('ceo', false) == true ||
        hasAnyRole(['admin', 'super_admin', 'ceo', 'ADMIN', 'SUPER_ADMIN', 'CEO'])
      );
    }`,
  'make admin claims null-safe',
);

replace(
  'storage.rules',
  `    function hasVerifiedEmail() {
      return isAuth() &&
        request.auth.token.email_verified == true &&
        request.auth.token.email != null;
    }`,
  `    function hasVerifiedEmail() {
      return isAuth() &&
        request.auth.token.get('email_verified', false) == true &&
        request.auth.token.get('email', null) != null;
    }`,
  'make verified-email claims null-safe',
);

{
  const path = 'storage.rules';
  const source = readFileSync(path, 'utf8');
  const repaired = source.replaceAll(
    'request.auth.token.email ==',
    "request.auth.token.get('email', null) ==",
  );
  if (repaired !== source) {
    writeFileSync(path, repaired);
    changed.push(`${path}: make email comparisons null-safe`);
  }
}

replace(
  'test/security-rules.test.js',
  `    await setDoc(doc(adminDb, 'broker_payout_requests/request_seed'), {
      brokerId: 'broker_a',
      brokerUid: 'broker_a',
      amount: 2500,
      status: 'PENDING_ADMIN_REVIEW',
      approvalStatus: 'PENDING',
      paymentStatus: 'REQUESTED',
      commissionIds: ['commission_1'],
    });`,
  `    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'broker_payout_requests/request_seed'), {
        brokerId: 'broker_a',
        brokerUid: 'broker_a',
        amount: 2500,
        status: 'PENDING_ADMIN_REVIEW',
        approvalStatus: 'PENDING',
        paymentStatus: 'REQUESTED',
        commissionIds: ['commission_1'],
      });
    });`,
  'seed server-only broker payout fixture with rules disabled',
);

replace(
  'test/storage-rules.test.js',
  `    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'contracts/contract_email'), {
      ownerId: 'different_owner',
      ownerEmail: 'owner@example.com',
    });
    await setDoc(doc(adminDb, 'invoices/invoice_email'), {
      ownerId: 'different_owner',
      recipientEmail: 'owner@example.com',
    });`,
  `    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'contracts/contract_email'), {
        ownerId: 'different_owner',
        ownerEmail: 'owner@example.com',
      });
      await setDoc(doc(db, 'invoices/invoice_email'), {
        ownerId: 'different_owner',
        recipientEmail: 'owner@example.com',
      });
    });`,
  'seed server-only Storage fixtures with rules disabled',
);

console.log('[repair-pr265-rules] deterministic repair complete');
for (const item of changed) console.log(`- ${item}`);
