# Admin MFA Recovery Production Quorum

Public launch must not depend on one privileged administrator being available. The two-approver recovery lifecycle requires a real production quorum before Firebase deployment begins.

## Required production state

At least two distinct Firebase Authentication accounts must satisfy all of the following:

- Custom claims resolve to `ceo` or `super_admin`.
- The Auth account is enabled.
- The Auth email is verified.
- At least one Firebase phone MFA factor is enrolled.
- A matching `users/{uid}` Firestore profile exists.
- The profile is not suspended, disabled, rejected, or inactive.

Every other active Admin/staff account with Admin portal claims must also have an enrolled phone MFA factor. Test accounts must not be promoted merely to satisfy the quorum.

## Automated deployment enforcement

`scripts/verify-admin-mfa-production.mjs` runs from the protected exact-SHA production deployment workflow before the first Firebase deployment attempt. It reads Firebase Auth and the matching Firestore Admin profiles using the deployment identity.

Deployment fails when:

- fewer than two active recovery approver candidates exist;
- fewer than two candidates have verified email and phone MFA;
- a recovery approver lacks phone MFA or has an unverified email;
- an Admin/staff Auth account has no matching Firestore profile;
- an active Admin/staff account lacks phone MFA; or
- the project is not `bin-group-57c60`.

The resulting `production-deployment.json` evidence contains only aggregate counts. It never records UIDs, email addresses, phone numbers, factor identifiers, display names, or SMS codes.

## Operator verification

Before approving the protected production environment:

1. Confirm the two recovery approvers are different people with separate accounts.
2. Confirm both can complete a fresh second-factor sign-in.
3. Confirm neither account is the ordinary `E2E_ADMIN_EMAIL` test account.
4. Confirm both Firestore profiles have active `ceo` or `super_admin` authority matching their Auth claims.
5. Confirm the deployment service account can list Firebase Auth users and read `users/{uid}` profile documents.
6. Review only aggregate deployment evidence: `recoveryApproverCandidateCount`, `recoveryApproverMfaReadyCount`, and `recoveryQuorumReady`.

A passing configuration preflight proves recovery prerequisites exist. It does not authorize a recovery request, remove a factor, or replace the required production incident and two-person approval process.
