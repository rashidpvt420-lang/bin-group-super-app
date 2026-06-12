import fs from 'fs';
import path from 'path';

const rulesPath = path.resolve('firestore.rules');
const source = fs.readFileSync(rulesPath, 'utf8');

const helperMarker = 'function safeInitialRoleSelectionCreate';

const selfUpdateBlock = `    function safeUserSelfUpdate(userId) {
      return signedIn() && request.auth.uid == userId &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'displayName',
          'photoURL',
          'phone',
          'phoneNumber',
          'mobile',
          'preferredLanguage',
          'language',
          'lang',
          'legalAcceptedAt',
          'legalAcceptedAtClient',
          'pdplCompliance',
          'gpsConsent',
          'legalAcceptedVersion',
          'termsAcceptedAt',
          'termsVersion',
          'privacyAcceptedAt',
          'notificationPreferences',
          'fcmTokens',
          'platform',
          'isStandalone',
          'userAgent',
          'lastLoginAt',
          'lastSeenAt',
          'pushEnabled',
          'pushPermission',
          'deviceInfo',
          'onboardingLastSeenAt',
          'dutyStatus',
          'onDuty',
          'updatedAt'
        ]) &&
        (!('role' in request.resource.data) || request.resource.data.role == resource.data.role) &&
        (!('userRole' in request.resource.data) || request.resource.data.userRole == resource.data.userRole) &&
        (!('primaryRole' in request.resource.data) || request.resource.data.primaryRole == resource.data.primaryRole) &&
        (!('isAdmin' in request.resource.data) || request.resource.data.isAdmin == resource.data.isAdmin) &&
        (!('admin' in request.resource.data) || request.resource.data.admin == resource.data.admin) &&
        (!('superAdmin' in request.resource.data) || request.resource.data.superAdmin == resource.data.superAdmin) &&
        (!('super_admin' in request.resource.data) || request.resource.data.super_admin == resource.data.super_admin) &&
        (!('permissions' in request.resource.data) || request.resource.data.permissions == resource.data.permissions) &&
        (!('status' in request.resource.data) || request.resource.data.status == resource.data.status) &&
        (!('onboardingComplete' in request.resource.data) || request.resource.data.onboardingComplete == resource.data.onboardingComplete) &&
        (!('propertyId' in request.resource.data) || request.resource.data.propertyId == resource.data.propertyId) &&
        (!('unitId' in request.resource.data) || request.resource.data.unitId == resource.data.unitId);
    }
`;

const roleSelectionHelpers = `    function safeUserSelfUpdate(userId) {
      return signedIn() && request.auth.uid == userId &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'displayName',
          'photoURL',
          'phone',
          'phoneNumber',
          'mobile',
          'preferredLanguage',
          'language',
          'lang',
          'legalAcceptedAt',
          'legalAcceptedAtClient',
          'pdplCompliance',
          'gpsConsent',
          'legalAcceptedVersion',
          'termsAcceptedAt',
          'termsVersion',
          'privacyAcceptedAt',
          'notificationPreferences',
          'fcmTokens',
          'platform',
          'isStandalone',
          'userAgent',
          'lastLoginAt',
          'lastSeenAt',
          'pushEnabled',
          'pushPermission',
          'deviceInfo',
          'onboardingLastSeenAt',
          'dutyStatus',
          'onDuty',
          'updatedAt'
        ]) &&
        (!('role' in request.resource.data) || request.resource.data.role == resource.data.role) &&
        (!('userRole' in request.resource.data) || request.resource.data.userRole == resource.data.userRole) &&
        (!('primaryRole' in request.resource.data) || request.resource.data.primaryRole == resource.data.primaryRole) &&
        (!('isAdmin' in request.resource.data) || request.resource.data.isAdmin == resource.data.isAdmin) &&
        (!('admin' in request.resource.data) || request.resource.data.admin == resource.data.admin) &&
        (!('superAdmin' in request.resource.data) || request.resource.data.superAdmin == resource.data.superAdmin) &&
        (!('super_admin' in request.resource.data) || request.resource.data.super_admin == resource.data.super_admin) &&
        (!('permissions' in request.resource.data) || request.resource.data.permissions == resource.data.permissions) &&
        (!('status' in request.resource.data) || request.resource.data.status == resource.data.status) &&
        (!('onboardingComplete' in request.resource.data) || request.resource.data.onboardingComplete == resource.data.onboardingComplete) &&
        (!('propertyId' in request.resource.data) || request.resource.data.propertyId == resource.data.propertyId) &&
        (!('unitId' in request.resource.data) || request.resource.data.unitId == resource.data.unitId);
    }

    function publicSelfAssignedRole(role) {
      return role in ['owner', 'tenant', 'technician', 'broker'];
    }

    function validSelfAssignedRoleState(data) {
      return (data.role == 'owner' && data.status == 'onboarding' && data.onboardingComplete == false) ||
        (data.role in ['tenant', 'technician', 'broker'] && data.status == 'active' && data.onboardingComplete == true);
    }

    function safeInitialRoleSelectionCreate(data, userId) {
      return signedIn() && request.auth.uid == userId &&
        request.resource.data.keys().hasOnly([
          'uid',
          'email',
          'displayName',
          'photoURL',
          'role',
          'status',
          'isAdmin',
          'onboardingComplete',
          'roleSelectedAt',
          'createdAt',
          'updatedAt'
        ]) &&
        data.uid == request.auth.uid &&
        data.email == request.auth.token.email &&
        publicSelfAssignedRole(data.role) &&
        data.isAdmin == false &&
        validSelfAssignedRoleState(data);
    }

    function safeInitialRoleSelectionUpdate(userId) {
      return signedIn() && request.auth.uid == userId &&
        (!('role' in resource.data)) &&
        (!('isAdmin' in resource.data) || resource.data.isAdmin == false) &&
        (!('status' in resource.data) || resource.data.status == 'role_required') &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'uid',
          'email',
          'displayName',
          'photoURL',
          'role',
          'status',
          'isAdmin',
          'onboardingComplete',
          'roleSelectedAt',
          'updatedAt'
        ]) &&
        request.resource.data.uid == request.auth.uid &&
        request.resource.data.email == request.auth.token.email &&
        publicSelfAssignedRole(request.resource.data.role) &&
        request.resource.data.isAdmin == false &&
        validSelfAssignedRoleState(request.resource.data);
    }
`;

let output = source;

if (!output.includes(helperMarker)) {
  if (!output.includes(selfUpdateBlock)) {
    throw new Error('Could not locate safeUserSelfUpdate block. firestore.rules changed; inspect manually before patching.');
  }
  output = output.replace(selfUpdateBlock, roleSelectionHelpers);
}

output = output.replace(
  '      allow create: if isAdmin() || safeUserBootstrapCreate(request.resource.data, userId);',
  '      allow create: if isAdmin() || safeUserBootstrapCreate(request.resource.data, userId) || safeInitialRoleSelectionCreate(request.resource.data, userId);'
);
output = output.replace(
  '      allow update: if isAdmin() || safeUserSelfUpdate(userId);',
  '      allow update: if isAdmin() || safeUserSelfUpdate(userId) || safeInitialRoleSelectionUpdate(userId);'
);

for (const required of [
  'safeInitialRoleSelectionCreate',
  'safeInitialRoleSelectionUpdate',
  'safeInitialRoleSelectionCreate(request.resource.data, userId)',
  'safeInitialRoleSelectionUpdate(userId)',
]) {
  if (!output.includes(required)) {
    throw new Error(`Patch verification failed. Missing: ${required}`);
  }
}

fs.writeFileSync(rulesPath, output);
console.log('✅ Patched firestore.rules to allow first-time public role selection while blocking admin self-assignment.');
console.log('Next: firebase deploy --only firestore:rules --project bin-group-57c60');
