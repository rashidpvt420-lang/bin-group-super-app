# BIN GROUP Operations-Only Launch Checklist

**Source branch:** `main`  
**Source binding:** Every production claim must resolve the exact 40-character `main` commit from the protected workflow run.  
**Status claim:** This checklist does not assert production deployment, pilot eligibility, hard clearance, or public launch.  
**Deployment authority:** Only the protected GitHub production workflows may deploy or publish launch evidence.

This file covers provider, hosted-runtime, account, physical-device, and pilot evidence that source code cannot prove.

## Bank-pilot prerequisites

- [ ] Firebase Secret Manager has an enabled version for `SMTP_USER`.
- [ ] Firebase Secret Manager has an enabled version for `SMTP_PASS`.
- [ ] Firebase Secret Manager has an enabled version for `OPENAI_API_KEY`.
- [ ] Firebase Secret Manager has an enabled version for `IMAGE_GENERATION_API_KEY`.
- [ ] Firebase Secret Manager has an enabled version for `GEMINI_API_KEY`.
- [ ] Identity Platform Phone Authentication and SMS MFA are enabled.
- [ ] UAE (`AE`) is present in the SMS allowlist-only policy.
- [ ] Production test phone numbers are removed.
- [ ] Main and Admin Hosting domains are authorized for Firebase Authentication.
- [ ] Every active Admin/staff account required by the pilot has verified email and enrolled phone MFA.
- [ ] Every active CEO/Super Admin recovery approver has verified email and enrolled phone MFA.
- [ ] Obsolete or duplicate privileged accounts are disabled or marked inactive through approved administration controls.

## Protected bank-pilot sequence

1. Run the protected production-readiness preflight on the exact current `main` SHA.
2. Run `START HERE - Firebase Production Deploy` in `bank-pilot` mode.
3. Use `ADMIN_MFA_BOOTSTRAP_HOSTING` only when the canonical Admin MFA bootstrap is required.
4. After bootstrap, verify the dedicated Admin profile reads authoritative Firebase MFA, email, session, and permission state.
5. Complete the remaining real Admin MFA/email coverage.
6. Start a new protected bank-pilot deployment without the bootstrap marker.
7. Verify same-run deployment metadata, artifact digest, App Check, SMTP, and five-profile evidence.

No local Firebase deployment command is an approved substitute for this sequence.

## Hosted and provider evidence

- [ ] Main Hosting App Check verification passes against the deployed bundle.
- [ ] Admin Hosting App Check verification passes against the deployed bundle.
- [ ] Strict credentialed Owner, Tenant, Technician, Broker, and Admin walkthroughs pass on the same deployed SHA.
- [ ] BIN GROUP branded SMTP proof contains provider `SUCCESS`, provider message ID, intended accepted recipient, zero rejected recipients, and approved sender/reply-to identities.
- [ ] Technician physical GPS and before/after evidence is captured from a real device under the protected evidence workflow.
- [ ] Owner payment activation, Tenant delivery, Broker commission, Admin least-privilege provisioning, and renewal-scheduler evidence is published by protected workflows.

## Controlled pilot

- [ ] The pilot start timestamp is bound to the deployed SHA.
- [ ] At least 24 continuous hours elapse before completion.
- [ ] No open P0 or P1 incident exists at completion.
- [ ] Monitoring references are non-empty and valid.
- [ ] Rollback references are non-empty and valid.
- [ ] Any failed deployment, rollback hold, or production incident is recorded immediately.
- [ ] The completed pilot report passes the protected pilot-clearance validator.

## Additional public-launch requirements

- [ ] Firebase Secret Manager has enabled versions for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- [ ] A recent successful live AED Stripe Checkout session is verified.
- [ ] The matching `checkout.session.completed` event is verified and exactly-once replay evidence passes.
- [ ] Exact-SHA Live Role Smoke Tests hard-clearance evidence passes.
- [ ] The postdeploy public-release gate passes in the same protected workflow chain.
- [ ] The signed final hard-launch decision has `hardLaunchClaim=true` and binds all required evidence to the same repository, SHA, workflow chain, and artifact digest.

## Secret handling

- Never paste API keys, passwords, verification codes, service-account files, or recovery secrets into issues, pull requests, screenshots, chat, source files, or workflow logs.
- Evidence may include secret names, enabled-version state, provider message IDs, hashes, masked identities, and workflow references; it must exclude secret values.
- Any credential exposed in a screenshot, message, commit, or log must be revoked and replaced before launch.
