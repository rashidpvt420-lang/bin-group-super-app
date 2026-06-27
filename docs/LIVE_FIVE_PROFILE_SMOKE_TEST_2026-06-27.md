# LIVE FIVE-PROFILE SMOKE TEST (2026-06-27)

This document serves as the final sign-off validation for the BIN GROUP Super App production environment. No simulated or emulator data should be used to check off these items. Real live credentials and real live Firestore transactions must be verified.

## 1. Admin Login & Core Verification
- [ ] Admin login with real credential
- [ ] Dashboard system_health/admin_summaries validates LIVE proof
- [ ] Confirm no React errors or infinite loops trigger on initial load

## 2. Owner Profile Verification
- [ ] Owner login with linked property/contract/payment
- [ ] Confirm contract loads successfully
- [ ] Validate Renewal Card displays the accurate timeline logic

## 3. Tenant Profile Verification
- [ ] Tenant login linked to unit
- [ ] Navigate to "Report Issue" and create a maintenance request with a photo upload
- [ ] Verify "More Services" grid loads

## 4. Technician Profile Verification
- [ ] Technician login linked to ticket
- [ ] Upload before-and-after photographic proof
- [ ] Confirm Snackbar/error handling works if job already taken

## 5. Owner Visibility (Post-Ticket)
- [ ] See ticket update
- [ ] Review approval / payment / maintenance record

## 6. Broker Profile Verification
- [ ] Broker login linked to referral
- [ ] Add lead
- [ ] Check /broker/leads/new opens lead form
- [ ] Check referral/commission attribution proof

## 7. Global Integrity Checks
- [ ] Confirm live Stripe integration successfully processes an onboarding 15% upfront or 5% management fee payment without errors
- [ ] Check Stripe/App Check/Email/Admin Secret/Five-Profile Smoke rows
- [ ] Confirm Admin Secret Rotation can be executed safely from the Security Ops terminal

**APPROVAL:**
All items must be verified against LIVE `bin-group-57c60` environment before public App Store / Play Store rollout begins.
