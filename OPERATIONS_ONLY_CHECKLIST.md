# BIN GROUP Operations-Only Launch Checklist

**Source branch:** `main`  
**Source binding:** Every production claim must resolve the exact 40-character `main` commit from the protected workflow run.  
**Status claim:** This checklist does not assert production deployment, pilot eligibility, hard clearance, or public launch.  
**Deployment authority:** Only the protected GitHub production workflows may deploy or publish launch evidence.  
**Current payment authority:** `PHASE1_CASH_CHEQUE_V1` — AED Cash or Cheque only; Bank Transfer and Stripe/Card are disabled.

This file covers provider, hosted-runtime, account, physical-device, and pilot evidence that source code cannot prove.

> `bank-pilot` is a legacy internal deployment-mode identifier. It does **not** mean Bank Transfer is enabled and it does not change the Phase 1 Cash/Cheque-only payment policy.

## Bank-pilot prerequisites

- [ ] Firebase Secret Manager has an enabled version for `SMTP_USER`.
- [ ] Firebase Secret Manager has an enabled version for `SMTP_PASS`.
- [ ] Firebase Secret Manager has an enabled version for `OPENAI_API_KEY`.
- [ ] Firebase Secret Manager has an enabled version for `IMAGE_GENERATION_API_KEY`.
- [ ] Firebase Secret Manager has an enabled version for `GEMINI_API_KEY`.
- [ ] Stripe secrets are not required by the active Phase 1 deployed Function contract.
- [ ] The server payment configuration resolves exactly to AED `CASH` + `CHEQUE`, with Bank Transfer disabled and Stripe/Card disabled.
- [ ] Identity Platform Phone Authentication and SMS MFA are enabled.
- [ ] UAE (`AE`) is present in the SMS allowlist-only policy.
- [ ] Production test phone numbers are removed.
- [ ] Main and Admin Hosting domains are authorized for Firebase Authentication.
- [ ] The canonical privileged account is exactly `ceo@bin-groups.com` and resolves to CEO or Super Admin authority.
- [ ] The canonical founder Firebase email is verified.
- [ ] At least one founder-controlled Firebase phone MFA factor is enrolled.
- [ ] A matching active `users/{uid}` Firestore profile exists for the canonical founder.
- [ ] Every other Firebase Auth identity with Admin/staff portal authority has been deleted through `Privileged Account Cleanup - Production`.
- [ ] Owner, Tenant, Technician and Broker accounts without Admin/staff authority were excluded from privileged cleanup.

## Protected bank-pilot sequence

1. Run `START HERE - Firebase Production Deploy` with `ADMIN_MFA_BOOTSTRAP_HOSTING` only when the canonical Admin MFA remediation UI and callables are not yet deployed.
2. Sign in freshly as `ceo@bin-groups.com`, complete the password-and-phone-MFA challenge, verify the Firebase email, and refresh the authoritative security profile.
3. Run `Privileged Account Cleanup - Production` with `execute_cleanup=false` and review the dry-run inventory.
4. Execute cleanup only after the dry run passes; preserve audit logs and delete every other privileged Firebase Auth identity and related privileged profile/session records.
5. Run `Production Readiness Preflight` on the exact current `main` SHA until it reports one claimed privileged account, one active privileged account, one MFA-ready canonical founder, and zero unexpected privileged accounts.
6. Run `START HERE - Firebase Production Deploy` in `bank-pilot` mode with `payment_policy=phase1-manual` and without the bootstrap marker.
7. Verify same-run deployment metadata, artifact digest, App Check, SMTP, five-profile evidence, and the Phase 1 Cash/Cheque policy binding.

No local Firebase deployment command is an approved substitute for this sequence.

## Hosted and provider evidence

- [ ] Main Hosting App Check verification passes against the deployed bundle.
- [ ] Admin Hosting App Check verification passes against the deployed bundle.
- [ ] Strict credentialed Owner, Tenant, Technician, Broker, and Admin walkthroughs pass on the same deployed SHA.
- [ ] BIN GROUP branded SMTP proof contains provider `SUCCESS`, provider message ID, intended accepted recipient, zero rejected recipients, and approved sender/reply-to identities.
- [ ] Technician physical GPS and before/after evidence is captured from a real device under the protected evidence workflow.
- [ ] Owner payment activation, Tenant delivery, Broker commission, Admin least-privilege provisioning, and renewal-scheduler evidence is published by protected workflows.
- [ ] AI provider proof comes from signed-in hosted execution with server-side secrets and safe fallback behavior; configured keys alone do not count as live proof.
- [ ] FCM and Google Maps/GPS required physical-device behavior is proven on the exact release SHA.

## Controlled pilot

- [ ] The pilot start timestamp is bound to the deployed SHA.
- [ ] At least 24 continuous hours elapse before completion.
- [ ] No open P0 or P1 incident exists at completion.
- [ ] Monitoring references are non-empty and valid.
- [ ] Rollback references are non-empty and valid.
- [ ] Any failed deployment, rollback hold, or production incident is recorded immediately.
- [ ] The completed pilot report passes the protected pilot-clearance validator.

## Additional public-launch requirements

- [ ] Exact-SHA Live Role Smoke Tests hard-clearance evidence passes.
- [ ] The execution-generated `phase1-manual-payment-proof.json` passes and is bound to the same release SHA, workflow run, release ID, and validated artifact digest.
- [ ] The Phase 1 payment proof confirms AED Cash/Cheque only, Bank Transfer disabled, Stripe/Card disabled, and no sensitive banking values in the artifact.
- [ ] Real physical-device Owner Cash/Cheque activation, Admin approval and rejection, receipt/evidence, audit, and dashboard-unlock behavior is proven for the exact release SHA.
- [ ] All other required physical-device evidence gates pass, including GPS/maps, push delivery/fallback, mobile PDF/RTL, five-role smoke, and button/logout audits where required.
- [ ] The postdeploy public-release gate passes in the same protected workflow chain with `PAYMENT_POLICY=phase1-manual`.
- [ ] The signed final hard-launch decision has `hardLaunchClaim=true` and binds all required evidence to the same repository, SHA, workflow chain, and artifact digest.
- [ ] No Admin/manual evidence record, committed checklist, waiver, or source-only test is treated as final hard-launch authorization.

## Google Play release requirements

- [ ] Google Play Console developer identity is accepted after the reset verification attempt.
- [ ] The Play Console legal name, address, contact details and submitted documents match the active Payments profile.
- [ ] Android release artifacts, signing, store listing, privacy declarations and required testing tracks pass after the developer-account restriction is removed.
- [ ] If Android publication is in the current release scope, the installed Google Play build and required physical-device journeys are bound to the same exact release SHA.

## Secret handling

- Never paste API keys, passwords, verification codes, service-account files, recovery secrets, identity-document numbers, or unmasked bank details into issues, pull requests, screenshots, chat, source files, or workflow logs.
- Evidence may include secret names, enabled-version state, provider message IDs, hashes, masked identities, and workflow references; it must exclude secret values.
- Any credential exposed in a screenshot, message, commit, or log must be revoked and replaced before launch.
