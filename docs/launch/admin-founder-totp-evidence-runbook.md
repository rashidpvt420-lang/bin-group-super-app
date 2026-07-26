# Canonical Founder TOTP evidence runbook

## Purpose

The Admin production evidence workflow must authenticate the canonical Founder through a real Firebase multi-factor challenge. It must not create fictional phone factors, disable app verification, use custom-token sign-in, or mutate/delete the Founder account.

## One-time Firebase configuration

1. In Google Cloud Identity Platform for project `bin-group-57c60`, enable multi-factor authentication and the TOTP provider.
2. Sign in interactively as `ceo@bin-groups.com` through the production Admin portal.
3. Re-authenticate the Founder and enrol one authenticator-app factor through Firebase Authentication.
4. Store the Base32 enrolment secret in an approved password manager before confirming enrolment. Do not put the secret in source code, Firestore, Firebase Hosting configuration, workflow logs, build artifacts, screenshots, or launch evidence.
5. Confirm the account remains active, email-verified, and has the `ceo` or `super_admin` custom claim.

## Protected GitHub environment secrets

Configure these in the protected `production` GitHub environment:

- `E2E_FOUNDER_EMAIL` = `ceo@bin-groups.com`
- `E2E_FOUNDER_PASSWORD`
- `E2E_FOUNDER_TOTP_SECRET`

`E2E_FOUNDER_REAL_MFA_CODE` is an optional manually supervised fallback for a real phone factor. It is not the default automated evidence path and must never contain a Firebase test-phone code.

The temporary `E2E_ADMIN_EMAIL` must remain a different identity. Existing seed and lifecycle scripts continue to refuse the canonical Founder and may delete only an exact `testAccount=true` E2E Admin.

## Readiness verification

Run from an authenticated production workflow:

```bash
node scripts/verify-founder-totp-readiness.mjs
```

The command passes only when:

- the Firebase project is `bin-group-57c60`;
- the account is exactly `ceo@bin-groups.com`;
- the account is active and email-verified;
- Founder claims are present; and
- exactly one real TOTP factor is enrolled.

The verifier reads factor metadata only. It never reads the TOTP secret.

## Exact-SHA evidence sequence

1. Deploy the full lowercase 40-character `main` SHA through `Firebase Production Deploy`.
2. Run `Admin Production Evidence` with that SHA and the successful deployment run ID.
3. Run `Live Role Smoke Tests` with the same SHA and deployment run ID.
4. Accept Admin evidence only when the generated artifact, hosted bundle verification and deployment document all identify that same SHA.
5. Do not claim production proof from PR validation, source inspection, preview Hosting, seeded Admin SDK mutations, or page rendering alone.

## Rotation and incident response

Rotate the Founder password or TOTP factor immediately if the secret is exposed. Delete the exposed GitHub secret version, enrol a new authenticator factor interactively, update the protected environment secret, and rerun readiness plus exact-SHA evidence. Never reuse an exposed TOTP secret.
