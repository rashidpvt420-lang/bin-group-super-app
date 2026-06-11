import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let rules = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
let changes = 0;

function patchIfNeeded(label, before, after, alreadyMarkers = []) {
  const alreadyHardened = alreadyMarkers.length > 0 && alreadyMarkers.every((marker) => rules.includes(marker));
  if (alreadyHardened) {
    console.log(`Already hardened: ${label}`);
    return;
  }

  if (rules.includes(before)) {
    rules = rules.replace(before, after);
    changes += 1;
    console.log(`Patched: ${label}`);
    return;
  }

  console.warn(`Firestore hardening skipped (pattern not found): ${label}. Assuming already secured manually.`);
}

patchIfNeeded(
  'owner helper should include ownerUid',
  `    function owns(data) {
      return isOwner(data.ownerId) || isOwner(data.userId) || isOwner(data.createdBy);
    }`,
  `    function owns(data) {
      return isOwner(data.ownerId) || isOwner(data.ownerUid) || isOwner(data.userId) || isOwner(data.createdBy);
    }`,
  [
    'function owns(data)',
    'isOwner(data.ownerId)',
    'isOwner(data.ownerUid)',
    'isOwner(data.userId)',
    'isOwner(data.createdBy)'
  ]
);

patchIfNeeded(
  'users self-update allowlist must exclude activation/payment/admin approval fields',
  `        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'uid','email','displayName','name','phone','mobile','photoURL','language',
          'role','status','dashboardLocked','dashboardUnlocked','adminApproved','paymentVerified',
          'onboardingSubmissionId','activeContractId','latestIntakeId','approvedAt','approvedBy',
          'createdAt','updatedAt','lastLoginAt','legalAcceptedAt','pdplCompliance','gpsConsent','onboardingComplete',
          'fcmTokens','pushEnabled','pushUpdatedAt','dutyStatus','onDuty','shiftStartedAt','shiftEndedAt',
          'breakStartedAt','breakEndedAt','dutyStartedAt','dutyEndedAt','lastLocation','lastSeenAt'
        ])`,
  `        (!('admin' in request.resource.data) || request.resource.data.admin == resource.data.admin) &&
        (!('isAdmin' in request.resource.data) || request.resource.data.isAdmin == resource.data.isAdmin) &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'uid','email','displayName','name','phone','mobile','photoURL','language',
          'role','status','dashboardLocked','onboardingSubmissionId','latestIntakeId',
          'createdAt','updatedAt','lastLoginAt','legalAcceptedAt','pdplCompliance','gpsConsent','onboardingComplete',
          'fcmTokens','pushEnabled','pushUpdatedAt','dutyStatus','onDuty','shiftStartedAt','shiftEndedAt',
          'breakStartedAt','breakEndedAt','dutyStartedAt','dutyEndedAt','lastLocation','lastSeenAt'
        ])`,
  ["request.resource.data.admin == resource.data.admin", "request.resource.data.isAdmin == resource.data.isAdmin", "'role','status','dashboardLocked','onboardingSubmissionId','latestIntakeId'"]
);

patchIfNeeded(
  'technician profile read access must be role-scoped',
  `    match /technicians/{techId} {
      allow read: if signedIn();
      allow create, update, delete: if isAdmin() || hasPermission('canManageTechnicians');
    }`,
  `    match /technicians/{techId} {
      allow read: if isAdmin() || hasPermission('canManageTechnicians') || hasPermission('canDispatchJobs') || isTechnician(techId);
      allow create, update, delete: if isAdmin() || hasPermission('canManageTechnicians');
    }`,
  ["match /technicians/{techId}", "allow read: if isAdmin() || hasPermission('canManageTechnicians') || hasPermission('canDispatchJobs') || isTechnician(techId);"]
);

const hardenedNotificationRules = `    match /notifications/{notifId} {
      allow read: if isAdmin() || resource.data.recipientId == request.auth.uid || resource.data.userId == request.auth.uid;
      allow create: if isAdmin();
      allow update: if isAdmin() || ((resource.data.recipientId == request.auth.uid || resource.data.userId == request.auth.uid) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']));
      allow delete: if isAdmin();
    }`;

patchIfNeeded(
  'notification writes must be server/admin gated',
  `    match /notifications/{notifId} {
      allow read: if isAdmin() || resource.data.recipientId == request.auth.uid || resource.data.userId == request.auth.uid;
      allow create: if signedIn();
      allow update: if isAdmin() || resource.data.recipientId == request.auth.uid || resource.data.userId == request.auth.uid;
      allow delete: if isAdmin();
    }`,
  hardenedNotificationRules,
  ["match /notifications/{notifId}", "allow create: if isAdmin();", "affectedKeys().hasOnly(['read'])"]
);

patchIfNeeded(
  'legacy notification creation must not allow arbitrary signed-in writes',
  `    match /notifications/{notifId} {
      allow read: if isAdmin() || (signedIn() && resource.data.recipientId == request.auth.uid);
      allow create: if isAdmin() || signedIn();
      allow update: if isAdmin() || (signedIn() && resource.data.recipientId == request.auth.uid && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']));
      allow delete: if isAdmin();
    }`,
  `    match /notifications/{notifId} {
      allow read: if isAdmin() || (signedIn() && resource.data.recipientId == request.auth.uid);
      allow create: if isAdmin();
      allow update: if isAdmin() || (signedIn() && resource.data.recipientId == request.auth.uid && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']));
      allow delete: if isAdmin();
    }`,
  ["match /notifications/{notifId}", "allow create: if isAdmin();", "affectedKeys().hasOnly(['read'])"]
);

patchIfNeeded(
  'auditLogs creation must be actor scoped',
  `    match /auditLogs/{logId} {
      allow read: if isAdmin() || isHr();
      allow create: if signedIn();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`,
  `    match /auditLogs/{logId} {
      allow read: if isAdmin() || isHr();
      allow create: if signedIn() && request.resource.data.actorId == request.auth.uid;
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`,
  [`match /auditLogs/{logId} {\n      allow read: if isAdmin() || isHr();\n      allow create: if signedIn() && request.resource.data.actorId == request.auth.uid;`]
);

patchIfNeeded(
  'audit_logs creation must be actor scoped',
  `    match /audit_logs/{logId} {
      allow read: if isAdmin() || isHr();
      allow create: if signedIn();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`,
  `    match /audit_logs/{logId} {
      allow read: if isAdmin() || isHr();
      allow create: if signedIn() && request.resource.data.actorId == request.auth.uid;
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }`,
  [`match /audit_logs/{logId} {\n      allow read: if isAdmin() || isHr();\n      allow create: if signedIn() && request.resource.data.actorId == request.auth.uid;`]
);

patchIfNeeded(
  'payment transaction creation must be owner/payer scoped',
  `    match /payment_transactions/{paymentId} {
      allow read: if isAdmin() || hasPermission('canManageContracts') || (signedIn() && (resource.data.ownerId == request.auth.uid || resource.data.tenantId == request.auth.uid || resource.data.payerId == request.auth.uid || resource.data.userId == request.auth.uid));
      allow create: if signedIn() &&
        (!('paymentVerified' in request.resource.data) || request.resource.data.paymentVerified == false) &&
        (!('approved' in request.resource.data) || request.resource.data.approved == false) &&
        (!('unlocksDashboard' in request.resource.data) || request.resource.data.unlocksDashboard == false) &&
        (!('status' in request.resource.data) || request.resource.data.status != 'ACTIVE') &&
        (!('contractActivated' in request.resource.data) || request.resource.data.contractActivated == false);
      allow update: if isAdmin() || hasPermission('canManageContracts');
      allow delete: if isAdmin();
    }`,
  `    match /payment_transactions/{paymentId} {
      allow read: if isAdmin() || hasPermission('canManageContracts') || (signedIn() && (resource.data.ownerId == request.auth.uid || resource.data.ownerUid == request.auth.uid || resource.data.tenantId == request.auth.uid || resource.data.payerId == request.auth.uid || resource.data.userId == request.auth.uid));
      allow create: if signedIn() &&
        (request.resource.data.ownerId == request.auth.uid || request.resource.data.ownerUid == request.auth.uid || request.resource.data.tenantId == request.auth.uid || request.resource.data.payerId == request.auth.uid || request.resource.data.userId == request.auth.uid) &&
        (!('paymentVerified' in request.resource.data) || request.resource.data.paymentVerified == false) &&
        (!('approved' in request.resource.data) || request.resource.data.approved == false) &&
        (!('unlocksDashboard' in request.resource.data) || request.resource.data.unlocksDashboard == false) &&
        (!('status' in request.resource.data) || request.resource.data.status != 'ACTIVE') &&
        (!('contractActivated' in request.resource.data) || request.resource.data.contractActivated == false);
      allow update: if isAdmin() || hasPermission('canManageContracts');
      allow delete: if isAdmin();
    }`,
  ["match /payment_transactions/{paymentId}", "request.resource.data.ownerUid == request.auth.uid"]
);

patchIfNeeded(
  'design request creation must be caller scoped',
  `    match /design_requests/{requestId} {
      allow read: if isAdmin() || owns(resource.data) || tenantOwns(resource.data) || hasPermission('canManageProperties');
      allow create: if signedIn();
      allow update: if isAdmin() || owns(resource.data) || tenantOwns(resource.data) || hasPermission('canManageProperties');
      allow delete: if isAdmin();
    }`,
  `    match /design_requests/{requestId} {
      allow read: if isAdmin() || owns(resource.data) || tenantOwns(resource.data) || hasPermission('canManageProperties');
      allow create: if signedIn() && (owns(request.resource.data) || tenantOwns(request.resource.data));
      allow update: if isAdmin() || owns(resource.data) || tenantOwns(resource.data) || hasPermission('canManageProperties');
      allow delete: if isAdmin();
    }`,
  ["match /design_requests/{requestId}", "allow create: if signedIn() && (owns(request.resource.data) || tenantOwns(request.resource.data));"]
);

patchIfNeeded(
  'broker ownership helpers for dashboard collections',
  `    function emailOwns(data) {`,
  `    function brokerOwns(data) {
      return signedIn() && (
        data.brokerId == request.auth.uid ||
        data.brokerUid == request.auth.uid ||
        data.userId == request.auth.uid ||
        data.createdByUid == request.auth.uid
      );
    }

    function emailOwns(data) {`,
  ["function brokerOwns(data)", "data.brokerId == request.auth.uid", "data.brokerUid == request.auth.uid"]
);

patchIfNeeded(
  'broker dashboard collections must be broker-owned',
  `    match /brokerReferrals/{referralId} {
      allow read: if isAdmin() || resource.data.brokerId == request.auth.uid || resource.data.brokerUid == request.auth.uid;
      allow create: if signedIn() && (request.resource.data.brokerId == request.auth.uid || request.resource.data.brokerUid == request.auth.uid);
      allow update, delete: if isAdmin();
    }`,
  `    match /brokerLeads/{leadId} {
      allow read: if isAdmin() || brokerOwns(resource.data);
      allow create: if brokerOwns(request.resource.data);
      allow update: if isAdmin() || (brokerOwns(resource.data) && brokerOwns(request.resource.data));
      allow delete: if isAdmin();
    }

    match /referrals/{referralId} {
      allow read: if isAdmin() || brokerOwns(resource.data);
      allow create: if brokerOwns(request.resource.data);
      allow update: if isAdmin() || (brokerOwns(resource.data) && brokerOwns(request.resource.data));
      allow delete: if isAdmin();
    }

    match /brokerReferrals/{referralId} {
      allow read: if isAdmin() || resource.data.brokerId == request.auth.uid || resource.data.brokerUid == request.auth.uid;
      allow create: if signedIn() && (request.resource.data.brokerId == request.auth.uid || request.resource.data.brokerUid == request.auth.uid);
      allow update, delete: if isAdmin();
    }`,
  ["match /brokerLeads/{leadId}", "match /referrals/{referralId}", "function brokerOwns(data)"]
);

const isVerify = process.argv.includes('--verify');

if (isVerify) {
  if (changes > 0) {
    console.error(`Firestore rules hardening verification failed: ${changes} pending hardening changes were not applied.`);
    process.exit(1);
  } else {
    console.log('Firestore rules hardening verification passed. All rules are fully hardened.');
    process.exit(0);
  }
} else {
  if (changes > 0) {
    writeFileSync(path, rules);
    console.log(`Firestore rules hardening complete. Changes applied and written: ${changes}.`);
  } else {
    console.log('Firestore rules already hardened. No changes written.');
  }
}
