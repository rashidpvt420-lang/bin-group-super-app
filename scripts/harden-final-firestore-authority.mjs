import { readFileSync, writeFileSync } from 'node:fs';

const file = 'firestore.rules';
let text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
let changed = false;

function replaceCanonical(label, legacy, canonical) {
  const legacyCount = text.split(legacy).length - 1;
  const canonicalCount = text.split(canonical).length - 1;
  if (legacyCount === 0 && canonicalCount === 1) return;
  if (legacyCount !== 1 || canonicalCount !== 0) {
    throw new Error(`[final-firestore-authority] ${label}: legacy=${legacyCount}, canonical=${canonicalCount}`);
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
  'cross-profile suspension check',
  `request.auth.uid != userId &&
                      request.auth.token.get('suspended', false) != true &&`,
  `request.auth.uid != userId &&
                      isNotSuspended() &&`,
);
replaceCanonical(
  'directory-list suspension check',
  `allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && (`,
  `allow list: if isNotSuspended() && (`,
);

const legacyDispatch = `    function canDispatchJobs() {
      return hasAdminClaim() ||
        hasPermission('canDispatchJobs') ||
        (signedIn() && (
          request.auth.token.get('role', '') in ['operations_manager', 'dispatcher'] ||
          request.auth.token.get('userRole', '') in ['operations_manager', 'dispatcher'] ||
          request.auth.token.get('primaryRole', '') in ['operations_manager', 'dispatcher']
        ));
    }`;
const canonicalDispatch = `    function hasDispatchAuthorityClaimOnly() {
      return signedIn() && (
        hasAdminClaim() ||
        hasPermission('canDispatchJobs') ||
        claimedRole() in ['operations_admin', 'operations_manager', 'dispatcher']
      );
    }

    function canDispatchJobs() {
      return hasDispatchAuthorityClaimOnly() && isNotSuspended();
    }`;
replaceCanonical('dispatch authority short-circuit', legacyDispatch, canonicalDispatch);

const legacyTenantEvidence = `    function safeTenantEvidenceUpdate() {
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
    }`;
const canonicalTenantEvidence = `    function safeTenantEvidenceUpdate() {
      return signedIn() &&
        tenantOwns(resource.data) &&
        isNotSuspended() &&
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
    }`;
replaceCanonical('tenant evidence suspension and early rejection', legacyTenantEvidence, canonicalTenantEvidence);

replaceCanonical(
  'tenant ticket create suspension',
  `        tenantOwns(data) &&
        data.keys().hasAll(['unitId', 'propertyId']) &&`,
  `        tenantOwns(data) &&
        isNotSuspended() &&
        data.keys().hasAll(['unitId', 'propertyId']) &&`,
);
replaceCanonical(
  'dispatcher update short-circuit',
  `    function safeDispatcherTicketUpdate() {
      return canDispatchJobs() &&`,
  `    function safeDispatcherTicketUpdate() {
      return hasDispatchAuthorityClaimOnly() &&
        isNotSuspended() &&`,
);
replaceCanonical(
  'technician update short-circuit',
  `    function safeTechnicianTicketUpdate() {
      return isApprovedTechnician() && techOwns(resource.data) &&`,
  `    function safeTechnicianTicketUpdate() {
      return hasTechnicianClaim() &&
        techOwns(resource.data) &&
        isNotSuspended() &&
        isApprovedTechnician() &&`,
);

const legacyUserSubcollections = `      match /{subcollection}/{document=**} {
        allow read: if isNotSuspended() && ((signedIn() && request.auth.uid == userId) || isAdmin() || isHr());
        allow create: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));
        allow update: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));
        allow delete: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));
      }`;
const canonicalUserSubcollections = `      match /fcmTokens/{tokenId} {
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

      match /{subcollection}/{document=**} {
        allow read, write: if false;
      }`;
replaceCanonical('explicit user subcollection allowlist', legacyUserSubcollections, canonicalUserSubcollections);

replaceCanonical(
  'exclude users from global admin read catch-all',
  `      allow read: if collection != 'system_secrets' && hasAdminClaim();`,
  `      allow read: if !(collection in ['system_secrets', 'users']) && hasAdminClaim();`,
);

const catchAllLegacy = `          'system_secrets',
          'audit_logs',`;
const catchAllCanonical = `          'system_secrets',
          'users',
          'audit_logs',`;
const catchAllLegacyCount = text.split(catchAllLegacy).length - 1;
const catchAllCanonicalCount = text.split(catchAllCanonical).length - 1;
if (catchAllLegacyCount === 2 && catchAllCanonicalCount === 0) {
  text = text.split(catchAllLegacy).join(catchAllCanonical);
  changed = true;
} else if (!(catchAllLegacyCount === 0 && catchAllCanonicalCount === 2)) {
  throw new Error(`[final-firestore-authority] global write catch-all: legacy=${catchAllLegacyCount}, canonical=${catchAllCanonicalCount}`);
}

const required = [
  `function profileAllowsAccess(data) {`,
  `data.get('status', '') in [`,
  `function hasDispatchAuthorityClaimOnly() {`,
  `return hasDispatchAuthorityClaimOnly() && isNotSuspended();`,
  `match /fcmTokens/{tokenId} {`,
  `match /deviceReadiness/{readinessId} {`,
  `match /{subcollection}/{document=**} {\n        allow read, write: if false;`,
  `allow list: if isNotSuspended() && (`,
];
for (const fragment of required) {
  if (!text.includes(fragment)) throw new Error(`[final-firestore-authority] missing required fragment: ${fragment}`);
}

const forbidden = [
  `get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true`,
  `allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && (`,
  `allow read: if (signedIn() && request.auth.uid == userId) || canReadUserDirectory();`,
  `allow create: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));`,
];
for (const fragment of forbidden) {
  if (text.includes(fragment)) throw new Error(`[final-firestore-authority] forbidden fragment remains: ${fragment}`);
}

if (changed) writeFileSync(file, text);
console.log(changed ? '[final-firestore-authority] rules hardened' : '[final-firestore-authority] rules already canonical');
