# BIN GROUP: Institutional Launch Monitoring Checklist (v1.0)

This checklist defines the critical surveillance parameters for the first live rollout of the BIN GROUP Super App.

## 🟢 1. System Vital Signs (Real-Time)
- [ ] **Cloud Functions Health**: Monitor Firebase Console for execution errors in `evaluateSLACron` and `autoRouteTicket`.
- [ ] **Database Connectivity**: Verify Firestore and Realtime Database latency for UAE regions.
- [ ] **Authentication Flow**: Monitor successful Phone OTP and Email logins (zero bypass allowed).

## 🏢 2. Property Onboarding Surveillance
- [ ] **15% Payment Gating**: Verify that no property is activated without a confirmed mobilization deposit.
- [ ] **Asset Provisioning**: Check that `units` are correctly generated with appropriate prefixes (Villa/Office/etc.).
- [ ] **Relational Integrity**: Run `scripts/migration-repair.js` daily to detect any orphaned records.

## 🛠️ 3. Mission Operations (Technician & Tenant)
- [ ] **SLA Clocking**: Verify that the 4-hour emergency response timer starts immediately upon "OPEN" status.
- [ ] **Auto-Routing Accuracy**: Ensure tickets are assigned to technicians in the correct Emirate/Zone.
- [ ] **Evidence Vault**: Confirm that "No-Photo, No-Pay" logic is enforced on all closed missions.

## 🔔 4. Notification & Communication
- [ ] **Push Delivery Rate**: Monitor FCM success/failure logs in Firebase.
- [ ] **Email Redundancy**: Ensure luxury-templated emails are sent as a fallback for high-priority events.
- [ ] **Deep-Link Verification**: Randomly test notification links to ensure they land on the correct detail screens.

## 📊 5. Financial Waterfall
- [ ] **Transaction Accuracy**: Audit `transactions` collection for exact matches between quote approvals and ledger entries.
- [ ] **Commission Triggering**: Verify that Broker commissions are calculated correctly upon Owner verification.

## 🛡️ 6. Security & Compliance
- [ ] **PDPL Compliance**: Ensure no sensitive tenant data is logged in plain text.
- [ ] **Admin War Room**: Review and link any orphans within 2 hours of detection.
- [ ] **CEO Escalation Path**: Test the high-priority escalation button in the Owner dashboard.

---
## ⚠️ KNOWN OPERATIONAL LIMITS (V1.0)
1. **iPhone Push Connectivity**: Background wake-up and real-time delivery on iOS strictly depend on the user installing the app as a **PWA / Home Screen Standalone** node. Standard mobile browser push is restricted by Apple.
2. **Summary Data Lag**: Asynchronous summary documents (Owner/Admin dashboards) are precomputed and may experience a brief propagation lag (2-5 seconds) under peak operational load.
3. **SMS Fallback Protocols**: Automated SMS/Voice fallbacks for emergency missions require active carrier white-listing and institutional account funding if activated.

---
**LAUNCH COMMAND STATUS:** [ AWAITING GREEN LIGHT ]
**VERSION:** 7.1 (Sovereign Infrastructure)
**TARGET REGION:** UAE
