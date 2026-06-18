# BIN GROUP Hard Public Launch Evidence Pack

Status: evidence framework only. Do not mark launch gates as passed until each item includes real production proof.

## 1. Production Firebase Auth Proof

Required proof for each role: Admin, Owner, Tenant, Technician, Broker.

Record:
- Date and UAE time
- Tester name
- Role
- Production URL
- Device and browser
- Login email used
- Screenshot or screen recording reference
- Firebase Auth UID
- Firestore `/users/{uid}` role value
- Logout proof
- Negative route-access proof

Pass condition:
- Each role can login, reach only its allowed dashboard, logout, and cannot access restricted dashboards.

## 2. Firestore and Storage Rules Proof

Required proof:
- Firestore emulator compile success after latest rule changes
- Owner approval update accepts decision-only mutations
- Owner approval update rejects unrelated field mutation
- Owner cannot create `maintenance_ledger` directly
- Admin/server workflow creates ledger through backend path
- Tenant photo upload/read works only for allowed participants
- Technician before/after proof upload/read works only for assigned technician/admin/auditor/owner/tenant participants
- Contract and invoice PDF read access is scoped to owner/admin/auditor/recipient

Pass condition:
- No client role can write outside its bounded workflow.

## 3. Callable Functions Live Smoke

Required live function tests:
- `submitOwnerApprovalDecision`
- `onOwnerApprovalDecision`
- `requestContractSignatureOtp`
- `verifyContractSignatureOtp`
- Owner payment/manual bank approval flow
- Ticket dispatch trigger
- SLA checks
- Notification delivery
- `runSovereignAI`
- WhatsApp webhook processing

Record:
- Function name
- Region
- Caller UID and role
- Input test reference
- Output summary
- Firestore side effects
- Cloud Logging reference
- Error-path test

## 4. Contract Signature Verification Proof

Required proof:
- OTP/code requested from signed-in owner
- Code delivered through configured provider
- Hash only stored server-side
- Wrong code increments attempt count
- Expired code is rejected
- Max attempts are enforced
- Correct code verifies
- Contract artifact includes backend verification ID
- No client-only `otpVerified: true` path remains active

## 5. Payment Activation Proof

Required production flow:
- Owner property intake
- Quote generation
- Contract selection
- 15% mobilization/manual bank or gateway payment
- Admin approval
- Rejection path
- Dashboard unlock only after verified payment
- Invoice/PDF/report generated
- Audit log written

## 6. GPS and Maps Proof

Required proof:
- Technician grants GPS permission on Android PWA
- Technician grants GPS permission on iOS/Safari PWA
- Location denied fallback works
- Live map renders
- Technician check-in writes location
- Admin live map sees technician status
- Tenant/owner tracking view shows permitted job location only

## 7. Push Notification Proof

Required proof:
- Token registration works
- Foreground notification works
- Background notification works
- Permission denied fallback works
- Notification preferences are respected
- Token revocation/logout behavior is safe

## 8. WhatsApp Business Proof

Required proof:
- Meta Business verification status
- Phone number ID
- Webhook verify challenge success
- Approved message templates
- Opt-in wording
- Inbound tenant/owner message becomes `communication_intake`
- Admin WhatsApp triage page shows intake
- Ticket draft or RFQ flow generated from reviewed intake
- Outbound acknowledgement delivered
- Send/receive logs captured

## 9. AI Signed-In Production Proof

Required proof:
- Signed-in owner call
- Signed-in tenant call
- Signed-in technician call
- Signed-in broker call
- Signed-in admin call
- Public unauthenticated call returns only public guidance
- Server-side provider works
- Fallback works when provider fails
- No client-side AI secret exposed

## 10. Mobile PDF and RTL Proof

Required proof:
- Arabic/English contract PDF opens/downloads on Android
- Arabic/English contract PDF opens/downloads on iPhone
- Invoice PDF opens/downloads
- Lease/report PDF opens/downloads
- Arabic RTL sweep across owner, tenant, technician, broker, admin
- Modals, toasts, empty states, and PDFs reviewed

## 11. UAE Data Residency and Retention Position

Required proof document must include:
- Data categories
- Data subjects
- Subprocessors
- Firebase regions and products used
- Retention rules
- Deletion/export process
- Incident response contact
- Owner/tenant/staff privacy wording
- WhatsApp and AI data handling position

## Evidence Sign-Off

No gate should be changed from `pending` to `passed` unless it includes:
- Real production proof
- Date/time
- Tester
- Role
- Device
- Production URL
- Screenshot, log, or artifact reference
- CEO/admin sign-off when required
