# Canonical Single-Founder Admin Authority

BIN GROUP production uses exactly one privileged Firebase Authentication account:

- `ceo@bin-groups.com`

That account may resolve to `ceo` or `super_admin`. No second CEO, Super Admin, Admin, manager, finance, HR, support, dispatch, account-management, or operations account may retain Admin-portal authority in production.

## Required production state

The canonical founder account must satisfy all of the following:

- The Firebase Auth email is exactly `ceo@bin-groups.com`, compared case-insensitively.
- Custom claims resolve to `ceo` or `super_admin`.
- The Auth account is enabled.
- The Auth email is verified.
- At least one Firebase phone MFA factor is enrolled.
- A matching `users/{uid}` Firestore profile exists.
- The profile is not suspended, disabled, rejected, or inactive.
- It is the only Firebase Auth account with any Admin/staff portal authority.

All other privileged accounts must be deleted. Disabling or marking them inactive is not sufficient for the production gate because stale privileged identities would remain recoverable or accidentally re-enabled.

Owner, Tenant, Technician, and Broker accounts without privileged Admin/staff claims are outside this cleanup policy and must remain untouched.

## Automated deployment enforcement

`scripts/verify-admin-mfa-production.mjs` runs from the protected exact-SHA production deployment workflow before the first Firebase deployment attempt. It reads Firebase Auth and matching Firestore profiles using the protected deployment identity.

Deployment fails when:

- the canonical founder account is missing or duplicated;
- any other privileged Firebase account exists;
- the canonical account is disabled or its profile is inactive;
- the canonical email is unverified;
- the canonical account has no enrolled phone MFA factor;
- the canonical account has no matching Firestore profile; or
- the project is not `bin-group-57c60`.

The resulting `production-deployment.json` evidence contains only aggregate counts. It never records UIDs, email addresses, phone numbers, factor identifiers, display names, or SMS codes.

## Recovery model

A two-person in-app recovery quorum is not asserted because the company currently has one authorized founder account. Recovery therefore depends on:

1. the verified canonical email;
2. the enrolled founder-controlled phone MFA factor;
3. Firebase/Google account-recovery and project-owner controls; and
4. protected GitHub and Google Cloud production access.

The application must not create a fake second approver or promote a test account to simulate redundancy.

## Operator verification

Before approving production:

1. Confirm `ceo@bin-groups.com` can complete a fresh password-and-phone-MFA sign-in.
2. Delete every other Firebase Auth user that still has privileged Admin/staff claims.
3. Remove the deleted identities' `users`, `staffAccess`, `hrProfiles`, staff, technician, session, and notification records while preserving audit logs.
4. Confirm the protected readiness check reports one claimed privileged account, one active privileged account, one MFA-ready canonical founder, and zero unexpected privileged accounts.
5. Run the protected production deployment on the exact current `main` SHA.

A passing preflight proves the canonical founder identity is configured. It does not itself claim that production deployment, pilot clearance, or public launch has passed.
