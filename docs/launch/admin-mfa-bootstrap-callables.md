# Admin MFA bootstrap callables

The protected bank-pilot bootstrap deploys only the Admin Hosting target and the exact callable allowlist required to complete and inspect Admin MFA enrollment:

- `registerAdminSecuritySession`
- `getAdminSecurityProfile`
- `revokeAdminSessions`
- `lockOwnAdminAccount`
- `finalizeOwnAdminMfaRecovery`

This bootstrap does not deploy the complete Firebase Functions surface and does not bypass the real Admin MFA coverage preflight. The full production stack remains behind the exact-SHA protected production workflow and the existing Admin MFA quorum checks.
