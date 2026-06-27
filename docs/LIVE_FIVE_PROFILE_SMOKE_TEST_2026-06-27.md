# LIVE FIVE-PROFILE SMOKE TEST (2026-06-27)

This document serves as the final sign-off validation for the BIN GROUP Super App production environment. No simulated or emulator data should be used to check off these items. Real live credentials and real live Firestore transactions must be verified.

## Live 5-Profile Smoke Test Order
Run the live smoke test in this **exact** sequence:

1. **Admin logs in.** (Admin)
2. **Owner confirms property, contract, payment proof, renewal, documents.** (Owner)
3. **Tenant creates a maintenance request with photo.** (Tenant)
4. **Technician accepts the same ticket, uploads before/after proof, completes job.** (Technician)
5. **Owner sees ticket status/proof update.** (Owner)
6. **Tenant verifies or disputes completed work.** (Tenant)
7. **Broker adds lead or claims listing and confirms attribution status.** (Broker)
8. **Admin checks audit logs, payment queue, tickets, Launch Health, smoke-test panel.** (Admin)

## Official Audit Trail Logging

Do **not** manually turn the booleans green without evidence. Only mark each item true after **real evidence** is captured using the provided verification script.

When an item is proven on live production, run the CLI verification script to permanently log the evidence trail. The script will record `verifiedAt`, `verifiedBy`, and the `evidence` details into Firestore, which automatically flips the Admin Launch Health from `FAIL` to `PASS`.

**Usage:**
```bash
node scripts/verify-launch-gate-live.mjs <GateKey> "<VerifiedBy>" "<EvidenceDetails>"
```

### The Gates to Prove

**1. Admin Credential Login**
*Rule:* `PASS` only after real admin account logs in successfully.
```bash
node scripts/verify-launch-gate-live.mjs adminCredentialLogin "Rashid / Admin UID" "Successfully logged in with live production admin credentials. No runtime errors."
```

**2. Five-Profile Smoke**
*Rule:* `PASS` only after Admin, Owner, Tenant, Technician, Broker all pass the live test sequence above.
```bash
node scripts/verify-launch-gate-live.mjs fiveProfileSmoke "Rashid / Admin UID" "All 5 profiles completed sequence in docs/LIVE_FIVE_PROFILE_SMOKE_TEST_2026-06-27.md"
```

**3. Stripe Live Mode**
*Rule:* `PASS` only after live Stripe keys/payment mode are confirmed.
```bash
node scripts/verify-launch-gate-live.mjs stripeLiveMode "Rashid / Admin UID" "Confirmed live production Stripe keys processing real transactions."
```

**4. Firebase App Check Production**
*Rule:* `PASS` only after production enforcement is enabled and tested.
```bash
node scripts/verify-launch-gate-live.mjs appCheckProduction "Rashid / Admin UID" "App check enforced in Firebase console and requests succeed."
```

**5. Branded Email Sender**
*Rule:* `PASS` only after real email delivery works.
```bash
node scripts/verify-launch-gate-live.mjs brandedEmailSender "Rashid / Admin UID" "Received live branded email from BIN Group."
```

**6. Admin Secret Rotation**
*Rule:* `PASS` only after admin password/secrets are rotated.
```bash
node scripts/verify-launch-gate-live.mjs adminSecretRotation "Rashid / Admin UID" "Admin secrets rotated successfully post-deployment."
```

**7. Tenant Notification Delivery**
*Rule:* `PASS` only after tenant receives real in-app/email notification.
```bash
node scripts/verify-launch-gate-live.mjs tenantNotificationDelivery "Rashid / Admin UID" "Real iOS/Android push and in-app message delivered to live Tenant."
```

**8. Technician GPS/Storage Proof**
*Rule:* `PASS` only after real device GPS + before/after photo upload works.
```bash
node scripts/verify-launch-gate-live.mjs technicianGpsStorageProof "Rashid / Admin UID" "Technician uploaded before/after photo + GPS location successfully to Firebase Storage."
```

**9. Broker Commission Lock**
*Rule:* `PASS` only after broker lead/listing/contract attribution is proven.
```bash
node scripts/verify-launch-gate-live.mjs brokerCommissionLock "Rashid / Admin UID" "Broker correctly attributed and locked into contract ledger."
```

**10. Renewal Watch**
*Rule:* `PASS` only after renewal watch record + notification/PDF queue is proven.
```bash
node scripts/verify-launch-gate-live.mjs renewalWatch "Rashid / Admin UID" "Renewal timeline generated successfully and PDF queued."
```

---

### Final Launch Decision

After Blaze upgrade + Deployment + Live Smoke Test execution:

- **If all 5 profiles pass:** Share with trusted friends/team.
- **If friends test is clean:** Prepare Google Play Internal Testing / TestFlight.
- **If Stripe, App Check, Email, Admin Rotation, and Smoke Test are fully proven:** Prepare public App Store / Play Store launch.
