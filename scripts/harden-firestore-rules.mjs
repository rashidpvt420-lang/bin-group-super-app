import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let rules = readFileSync(path, 'utf8');
let changes = 0;

function patchIfNeeded(label, before, after, alreadyMarkers = []) {
  if (rules.includes(before)) {
    rules = rules.replace(before, after);
    changes += 1;
    console.log(`Patched: ${label}`);
    return;
  }

  const alreadyHardened = alreadyMarkers.length > 0 && alreadyMarkers.every((marker) => rules.includes(marker));
  if (alreadyHardened) {
    console.log(`Already hardened: ${label}`);
    return;
  }

  throw new Error(`Firestore hardening failed: pattern not found for ${label}`);
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

patchIfNeeded(
  'notification creation must be recipient scoped',
  `    match /notifications/{notifId} {
      allow read: if isAdmin() || (signedIn() && resource.data.recipientId == request.auth.uid);
      allow create: if isAdmin() || signedIn();
      allow update: if isAdmin() || (signedIn() && resource.data.recipientId == request.auth.uid && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']));
      allow delete: if isAdmin();
    }`,
  `    match /notifications/{notifId} {
      allow read: if isAdmin() || (signedIn() && resource.data.recipientId == request.auth.uid);
      allow create: if isAdmin() || (signedIn() && request.resource.data.recipientId == request.auth.uid);
      allow update: if isAdmin() || (signedIn() && resource.data.recipientId == request.auth.uid && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']));
      allow delete: if isAdmin();
    }`,
  ["match /notifications/{notifId}", "allow create: if isAdmin() || (signedIn() && request.resource.data.recipientId == request.auth.uid);"]
);

patchIfNeeded(
  'auditLogs creation must be actor scoped',
  `    match /auditLogs/{auditId} {
      allow read: if isAdmin() || hasPermission('canViewAuditLogs') || (signedIn() && resource.data.actorId == request.auth.uid);
      allow create: if signedIn();
      allow update, delete: if isAdmin();
    }`,
  `    match /auditLogs/{auditId} {
      allow read: if isAdmin() || hasPermission('canViewAuditLogs') || (signedIn() && resource.data.actorId == request.auth.uid);
      allow create: if signedIn() && request.resource.data.actorId == request.auth.uid;
      allow update, delete: if isAdmin();
    }`,
  ["match /auditLogs/{auditId}", "allow create: if signedIn() && request.resource.data.actorId == request.auth.uid;"]
);

patchIfNeeded(
  'audit_logs creation must be actor scoped',
  `    match /audit_logs/{auditId} {
      allow read: if isAdmin() || hasPermission('canViewAuditLogs') || (signedIn() && resource.data.actorId == request.auth.uid);
      allow create: if signedIn();
      allow update, delete: if isAdmin();
    }`,
  `    match /audit_logs/{auditId} {
      allow read: if isAdmin() || hasPermission('canViewAuditLogs') || (signedIn() && resource.data.actorId == request.auth.uid);
      allow create: if signedIn() && request.resource.data.actorId == request.auth.uid;
      allow update, delete: if isAdmin();
    }`,
  ["match /audit_logs/{auditId}", "allow create: if signedIn() && request.resource.data.actorId == request.auth.uid;"]
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

writeFileSync(path, rules);
console.log(`Firestore rules hardening preflight complete. Changes applied: ${changes}.`);
