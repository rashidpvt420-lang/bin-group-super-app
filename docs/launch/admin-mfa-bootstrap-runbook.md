# Admin MFA bootstrap rerun sequence

1. Merge the bootstrap-callable correction into `main` after all required PR checks pass.
2. Run `START HERE - Firebase Production Deploy` in `bank-pilot` mode with public launch disabled and incident evidence reference `ADMIN_MFA_BOOTSTRAP_HOSTING`.
3. Confirm Firebase lists the six bootstrap functions and that `/profile` loads server-authoritative MFA, email, session, permission and masked readiness data.
4. Sign in as the canonical founder account `ceo@bin-groups.com`, complete Firebase email verification, and confirm at least one founder-controlled phone MFA factor is enrolled.
5. Run `Privileged Account Cleanup - Production` as a dry run. Review the masked inventory and confirm only obsolete Admin/staff identities are targeted.
6. Execute the protected cleanup only after the dry run passes. Every other privileged Firebase Auth account must be deleted; Owner, Tenant, Technician and Broker accounts without Admin/staff authority must remain untouched.
7. Run `Production Readiness Preflight` until it reports exactly one active privileged account, one MFA-ready canonical founder, and zero unexpected privileged accounts.
8. Rerun the protected production workflow without the bootstrap marker.

The canonical production authority model is single-founder. Do not create a fake second approver, preserve duplicate privileged accounts, share one account between people, or use an E2E account to manufacture recovery redundancy.

The readiness callable is read-only and exposes masked email addresses only. It cannot verify an email, enroll a phone factor, delete another account, change claims or bypass the production gate.

Never use a local full Functions deployment to bypass these gates.
