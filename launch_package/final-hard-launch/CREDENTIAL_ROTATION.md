# E2E Credential Rotation (Gate 12)

Production E2E smoke accounts use five dedicated Firebase Auth users (ADMIN, OWNER, TENANT, TECHNICIAN, BROKER). Launch gates require **unique passwords per role** — `npm run test:e2e:env` correctly rejects shared passwords across roles.

## When to rotate

- After any password may have been exposed (chat, logs, accidental commit attempt)
- When `test:e2e:env` reports `shared password across roles`
- As part of `adminSecretRotation` hard-launch evidence (manual attestation)

## Commands

From repo root, with Firebase Admin credentials (`gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS`):

```powershell
# Rotate all five roles to unique passwords (preferred)
npm run gate12:rotate-e2e

# Or admin only (legacy)
npm run gate12:rotate-admin
```

The rotation scripts:

1. Generate unique passwords per role via Firebase Admin SDK
2. Verify old passwords stop working and new passwords work (REST API)
3. Update **local** `.env.e2e` only — passwords are never printed or committed

## After rotation

```powershell
npm run seed:e2e:auth
npm run test:e2e:env
npm run test:e2e:auth-rest
npm run test:e2e:gate11:production
```

## GitHub Actions / CI

If CI runs production E2E, update the matching repository secrets (`E2E_ADMIN_PASSWORD`, `E2E_OWNER_PASSWORD`, etc.) to the new values from your local `.env.e2e`. Never commit `.env.e2e`.

## Stripe secrets (separate)

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in GCP Secret Manager are **not** E2E passwords. They must be `sk_live_…` and `whsec_…` from the Stripe Dashboard. Pasting account passwords or emails into Secret Manager will fail `npm run test:gate12:stripe`.

For bank-transfer pilot (`LAUNCH_BANK_ONLY=1`), Stripe format checks are advisory; public launch still requires live Stripe proof.

## Files

| File | Purpose |
|------|---------|
| `scripts/rotate-e2e-role-passwords.mjs` | Rotate all five role passwords |
| `scripts/gate12-rotate-admin-password.mjs` | Rotate admin only |
| `scripts/verify-e2e-env.mjs` | Enforces unique passwords (do not weaken) |
| `.env.e2e` | Local credentials — **gitignored, never commit** |
