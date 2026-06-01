# BIN GROUP Public Launch Device QA Gates

This checklist is the required pass/fail gate before public UAE launch or Google Play release.

## Current build gates

- [ ] GitHub CI passes on latest commit.
- [ ] Firebase Production Deploy passes on latest commit.
- [ ] Live Role Smoke Tests pass on latest commit.
- [ ] No TypeScript/build errors.
- [ ] No Firebase rules deploy errors.

## 1. Real phone GPS tracking

### Test accounts
- Technician account on Android Chrome/PWA.
- Technician account on iPhone Safari/PWA if supported.
- Admin account on desktop or phone.
- Owner/Tenant account linked to the test ticket.

### Required pass criteria
- [ ] Technician accepts a maintenance ticket.
- [ ] Technician taps ON THE WAY.
- [ ] Browser/device asks for location permission.
- [ ] Permission accepted.
- [ ] Firestore writes `maintenanceTickets/{ticketId}.technicianLocation`.
- [ ] Firestore writes `maintenanceTickets/{ticketId}.trackingStatus = LIVE_TRACKING`.
- [ ] Firestore writes `technicians/{uid}.currentLocation`.
- [ ] Firestore writes `technicians/{uid}.isTracking = true`.
- [ ] Admin map/status shows live technician movement.
- [ ] Owner/Tenant status shows technician en route where applicable.
- [ ] GPS diagnostic document exists at `technicians/{uid}/deviceReadiness/gps`.
- [ ] Diagnostic status becomes `LIVE` after successful write.
- [ ] Tracking stops on ARRIVED or COMPLETED.
- [ ] Diagnostic status becomes `STOPPED`.

### Fail conditions
- Permission denied with no user-visible message.
- Location writes are missing.
- Location is stale for more than 2 minutes while tracking is active.
- Tracking continues after completion.
- Admin cannot see live status.

## 2. Real push notifications

### Required pass criteria
- [ ] Owner device registers FCM token.
- [ ] Tenant device registers FCM token.
- [ ] Technician device registers FCM token.
- [ ] Broker device registers FCM token if broker notifications are enabled.
- [ ] Admin/CEO device registers FCM token if admin push is enabled.
- [ ] `users/{uid}/deviceReadiness/push` exists.
- [ ] Push readiness shows correct platform: `android-web`, `ios-pwa`, `ios-browser`, or `web`.
- [ ] Android foreground notification works.
- [ ] Android background notification works.
- [ ] Android locked-screen notification works.
- [ ] iOS PWA notification works only after app is installed to Home Screen.
- [ ] iOS browser shows `ios_requires_installed_pwa` when not installed.
- [ ] Notification click opens the correct app route.

### Fail conditions
- FCM token is not stored.
- Notification document exists but push is not delivered.
- Foreground notification duplicates excessively.
- iOS browser failure is silent.

## 3. PDF generation and mobile download

### Required pass criteria
- [ ] Owner generates/signs bilingual contract PDF.
- [ ] PDF downloads or opens on Android Chrome.
- [ ] PDF downloads or opens on iPhone Safari/PWA.
- [ ] Arabic text is readable and not broken beyond acceptable PDFKit/jsPDF shaping limits.
- [ ] English text is readable.
- [ ] Contract hash appears.
- [ ] Digital signature section appears.
- [ ] Admin document vault can access stored agreement where backend PDF is used.
- [ ] Signed PDF link works only for authorized users.

### Fail conditions
- Download silently fails.
- Blank PDF.
- Arabic unreadable.
- Unauthorized user can read private PDF.

## 4. Arabic and RTL coverage

### Required pass criteria
Check every core screen in Arabic:

- [ ] Public landing.
- [ ] Login.
- [ ] Owner onboarding.
- [ ] Owner dashboard.
- [ ] Owner properties.
- [ ] Owner contracts.
- [ ] Owner financials.
- [ ] Tenant dashboard.
- [ ] Tenant request flow.
- [ ] Tenant tickets.
- [ ] Technician dashboard.
- [ ] Technician job detail.
- [ ] Technician map.
- [ ] Broker dashboard.
- [ ] Broker referrals/commissions.
- [ ] Admin dashboard.
- [ ] Admin tickets.
- [ ] Admin technicians.
- [ ] Admin map.
- [ ] AI Design Studio.
- [ ] Notification inbox.
- [ ] PDF output.

### Fail conditions
- Core button remains hardcoded English.
- RTL layout breaks forms or navigation.
- Arabic text overflows cards/buttons.
- Back arrow direction is wrong.

## 5. Firebase collection for every button

### Required pass criteria
For each major action, confirm Firestore/Storage writes:

- [ ] Owner onboarding save.
- [ ] Quote creation.
- [ ] Contract selection.
- [ ] Payment request.
- [ ] PDF/document generation.
- [ ] Tenant maintenance request.
- [ ] Photo upload.
- [ ] Technician accept job.
- [ ] Technician ON THE WAY.
- [ ] Technician ARRIVED.
- [ ] Technician COMPLETE with before/after proof.
- [ ] Tenant approval/rejection.
- [ ] Admin assign/re-dispatch.
- [ ] Admin payment approval.
- [ ] Broker referral creation.
- [ ] Broker commission read.
- [ ] AI Design Studio request creation.
- [ ] AI Design Studio owner approval/rejection.
- [ ] Notification read/unread update.

### Fail conditions
- Button appears successful but no Firestore write exists.
- Missing ownerId/tenantId/technicianId fields.
- Security rules block valid user actions.
- Invalid user can write another user’s data.

## 6. AI image generation engine

### Current honest state
The app can create design requests, prompts, quotes, concepts, approvals, and payment handoff records. Concept render status must remain pending until a real render engine returns a final image.

### Required pass criteria for completion
- [ ] Render provider selected and configured.
- [ ] Backend callable/function receives approved concept prompt.
- [ ] Render job status stored in Firestore.
- [ ] Final AI image saved to Firebase Storage.
- [ ] `afterImageUrl` is populated only after successful render.
- [ ] Failed render stores `AI_RENDER_FAILED` with error.
- [ ] Owner/Tenant/Admin can view completed render.
- [ ] No uploaded before photo is presented as generated after image.

## 7. Google Play Android `.aab` readiness

### Required pass criteria
- [ ] Android wrapper exists, for example Capacitor/TWA/native wrapper.
- [ ] App name, icon, splash screen, and package name finalized.
- [ ] Release keystore created and backed up securely.
- [ ] Signed release `.aab` generated.
- [ ] Android permissions declared only as needed.
- [ ] Location permission copy explains tracking starts only after technician action.
- [ ] Privacy Policy URL live.
- [ ] Terms URL live.
- [ ] Google Play Data Safety form completed.
- [ ] Closed testing release uploaded.
- [ ] Internal/closed testers verify install, login, GPS, push, PDFs, Arabic.

### Fail conditions
- No signed `.aab`.
- Privacy policy missing.
- Background location requested without policy justification.
- App rejected in closed testing.

## Launch decision rule

Public launch is allowed only when every required pass criterion is checked or formally waived by the CEO/admin owner with a known risk note.
