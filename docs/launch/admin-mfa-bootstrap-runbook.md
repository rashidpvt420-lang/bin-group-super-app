# Admin MFA bootstrap rerun sequence

1. Merge the bootstrap-callable correction into `main` after all required PR checks pass.
2. Run `START HERE - Firebase Production Deploy` in `bank-pilot` mode with public launch disabled and incident evidence reference `ADMIN_MFA_BOOTSTRAP_HOSTING`.
3. Confirm Firebase lists the five bootstrap functions and that `/profile` loads server-authoritative MFA, email, session and permission data.
4. Complete the required real Admin MFA/email recovery quorum.
5. Rerun the protected production workflow without the bootstrap marker.

Never use a local full Functions deployment to bypass these gates.
