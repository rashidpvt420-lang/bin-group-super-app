# Canonical Founder Email Verification — Production Gate

BIN GROUP production permits exactly one privileged Firebase Authentication account:

- `ceo@bin-groups.com`

That account must have both:

- a verified Firebase Auth email; and
- an enrolled Firebase phone MFA factor.

The protected production deployment calls `verifyAdminMfaProduction()` before the first Firebase deploy command. Deployment fails when the canonical founder account is missing, duplicated, disabled, inactive, unverified, missing phone MFA, or when any other Firebase account still has Admin/staff portal authority.

Disabled or inactive privileged accounts are not accepted as harmless leftovers. They must be deleted because they could otherwise be re-enabled or recovered later.

The deployment artifact records only aggregate counts, including:

- the total number of privileged accounts;
- the number of active privileged accounts;
- whether exactly one canonical founder exists;
- whether the canonical founder is email-verified and phone-MFA enrolled; and
- the number of unexpected privileged accounts.

It never records UIDs, email addresses, phone numbers, factor identifiers, display names, or SMS codes.

Before production dispatch:

1. Confirm `ceo@bin-groups.com` is active and has a matching active `users/{uid}` profile.
2. Confirm its Firebase email is verified.
3. Confirm its Firebase phone MFA factor is enrolled and a fresh second-factor sign-in succeeds.
4. Delete every other Firebase Auth account with Admin/staff portal claims.
5. Preserve security audit logs while removing obsolete profiles, access records, sessions, and notifications.
6. Run the protected Firebase Production Deploy workflow; do not bypass the single-founder Admin MFA preflight.
