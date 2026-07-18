# Active Admin Email Verification — Production Gate

Every active Firebase Authentication account that can enter the BIN GROUP Admin portal must have both:

- a verified Firebase Auth email; and
- an enrolled Firebase phone MFA factor.

This requirement applies to all active privileged roles, including Admin, CEO, Super Admin, management, Operations, Finance, HR, Support, Dispatch, and account-management roles. It is not limited to the two CEO/Super Admin recovery approvers.

The protected production deployment calls `verifyAdminMfaProduction()` before the first Firebase deploy command. Deployment fails when any active privileged account has `emailVerified !== true`, even when that account already has phone MFA.

Disabled accounts and Firestore profiles marked suspended, disabled, rejected, or inactive are excluded from active coverage but remain counted in aggregate operational evidence.

The deployment artifact records only:

- the number of active privileged accounts;
- the number with unverified email;
- whether all active privileged emails are verified;
- aggregate MFA and recovery-quorum counts.

It never records UIDs, email addresses, phone numbers, factor identifiers, display names, or SMS codes.

Before production dispatch:

1. Review Firebase Authentication users with privileged claims.
2. Verify the email address for every active privileged account.
3. Disable or remove privileged claims from obsolete accounts.
4. Confirm every active privileged account has enrolled phone MFA.
5. Preserve at least two distinct verified CEO/Super Admin recovery approvers.
6. Run the protected Firebase Production Deploy workflow; do not bypass the Admin MFA preflight.
