# Firestore Activation Rules Patch

This patch is required for the Owner Activation page to work securely.

## Why

The new owner activation screen writes these fields:

- contracts/{contractId}.status
- contracts/{contractId}.paymentStatus
- contracts/{contractId}.mobilizationAmount
- contracts/{contractId}.mobilizationPercent
- contracts/{contractId}.activationRequestedAt
- contracts/{contractId}.updatedAt
- users/{uid}.latestActivationContractId
- users/{uid}.dashboardLocked
- users/{uid}.activationStatus
- users/{uid}.updatedAt

The current rules already allow some owner profile update fields, but not all activation fields.

## Insert helper function near the existing helper functions

```rules
function ownerByEmailOrUid(data) {
  return signedIn() && (
    data.ownerId == request.auth.uid ||
    data.ownerUid == request.auth.uid ||
    data.ownerEmail == request.auth.token.email
  );
}
```

## Add these user profile fields to the non-technician user update allowed list

```rules
'latestActivationContractId', 'activationStatus', 'primaryPropertyPassportId'
```

Keep existing protected fields such as `paymentVerified`, `adminApproved`, `dashboardUnlocked`, and `activeContractId` admin-controlled in production unless you intentionally allow a trusted Cloud Function to set them.

## Replace the owner part of match /contracts/{contractId} update logic with this pattern

```rules
allow update: if isAdmin() || hasPermission('canManageContracts') || (
  ownerByEmailOrUid(resource.data) &&
  request.resource.data.diff(resource.data).affectedKeys().hasOnly([
    'status', 'acceptedAt', 'signedAt', 'updatedAt',
    'paymentStatus', 'mobilizationAmount', 'mobilizationPercent', 'activationRequestedAt'
  ]) &&
  request.resource.data.paymentStatus in ['PENDING_VERIFICATION', 'pending_verification', resource.data.paymentStatus]
);
```

## Production rule

The owner may request payment verification. The owner must not be allowed to set final unlock fields directly:

- paymentVerified
- dashboardUnlocked
- activeContractId
- adminApproved
- approvedAt
- approvedBy

Those should be written by Admin or a trusted Cloud Function after PSP/webhook/admin verification.
