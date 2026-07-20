# Admin MFA bootstrap rerun sequence

1. Merge the bootstrap-callable correction into `main` after all required PR checks pass.
2. Run `START HERE - Firebase Production Deploy` in `bank-pilot` mode with public launch disabled and incident evidence reference `ADMIN_MFA_BOOTSTRAP_HOSTING`.
3. Confirm Firebase lists the six bootstrap functions and that `/profile` loads server-authoritative MFA, email, session, permission and masked readiness data.
4. A CEO or Super Admin reviews the masked readiness panel from a phone. Each listed active account must sign in to its own account, send/complete Firebase email verification when required, and enroll its own protected phone MFA factor.
5. Preserve at least two distinct active CEO/Super Admin accounts with verified email and enrolled phone MFA. Do not use one person, one shared account or an E2E account to manufacture the recovery quorum.
6. Refresh the masked readiness panel until it reports every active privileged account ready and the recovery quorum ready.
7. Rerun the protected production workflow without the bootstrap marker.

The readiness callable is read-only and exposes masked email addresses only. It cannot verify another account, enroll a phone factor, disable an account, change claims or bypass the production gate.

Never use a local full Functions deployment to bypass these gates.
