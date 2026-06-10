# BIN GROUP Hard Launch Functional Audit — 2026-06-10

## Verdict

Production deployment is live and technically stable, but this audit does **not** clear the app for unrestricted hard public launch yet. It clears the app for a controlled friend/public pilot.

## Evidence already passed

- `main` contains the merged security hardening from `launch-security-hardening`.
- `production-launch-v1.1` tag was created after the merge.
- Root `npm ci` passed.
- Functions `npm ci` passed.
- Workspace TypeScript build passed.
- OCR security guard tests passed 31/31.
- Firestore and Storage rules dry-run passed.
- `processTitleDeedOCR` is deployed as a Gen 2 callable function in `europe-west3` on Node.js 22.
- Full Firebase deployment completed for Hosting, Firestore, Storage, and Functions.

## Critical functional audit findings

### 1. Logout is not consistently available across all 5 dashboards

Status: HIGH

Findings:

- Technician portal has a visible logout button in `src/technician/TechnicianApp.tsx`.
- Admin portal has logout in `src/admin/components/Navigation.tsx` and the standalone admin panel has logout in `apps/admin-panel/src/components/Navigation.tsx`.
- Owner portal does not expose a visible logout button in `src/owner/OwnerApp.tsx`.
- Tenant portal does not expose a visible logout button in `src/tenant/TenantApp.tsx`.
- Broker portal defines `handleLogout` in `src/broker/BrokerApp.tsx`, but the function is not rendered in the UI.
- `src/components/ProtectedRoute.tsx` only provides logout on a locked-owner screen, not normal active dashboards.

Required fix:

- Add a consistent visible Secure Logout button to Owner, Tenant, Broker, Technician, and Admin top-level dashboard shells.
- Logout must call Firebase `signOut(auth)`, clear session storage, preserve only safe preferences such as language, and redirect to `/login` with the intended role where useful.

### 2. Arabic / English language toggle is not consistently available or strictly tested

Status: HIGH

Findings:

- Owner, Tenant, and Broker shells define or import language-toggle logic, but the visible toggle is missing or unused.
- Technician shell does not expose an obvious language toggle.
- Admin has `LanguageSwitcher`, but it is not clearly rendered in the admin top bar.
- Playwright route tests only click an AR button if it is visible; the test does not fail when the language button is missing.

Required fix:

- Add a visible `AR` / `EN` toggle in every dashboard shell.
- Update Playwright tests to require the language button for each authenticated role dashboard.

### 3. E2E audit is currently strong for route rendering, but not sufficient for hard-launch workflow proof

Status: HIGH

Findings:

The current Playwright tests validate route loading, login, fatal crash absence, and basic dashboard reachability. They do not fully prove all business workflows end-to-end.

Required additional E2E tests:

- Owner: quote -> contract -> payment package -> document upload -> dashboard active.
- Owner: logout button works and returns to login.
- Tenant: maintenance request -> ticket visible -> chat opens -> logout works.
- Technician: accept job -> start work -> pause/resume -> finish -> history visible.
- Admin: approve payment / contract activation -> owner dashboard unlocks.
- Broker: referral/lead creation -> commission display -> logout works.
- Cross-role negative tests: tenant cannot access owner/admin; broker cannot access tenant/admin; technician cannot access owner/admin.

### 4. Firebase App Check is code-ready but not proven enforced

Status: MEDIUM

Findings:

`src/lib/firebase.ts` initializes App Check only when `VITE_ENABLE_FIREBASE_APPCHECK=true` and `VITE_APP_CHECK_SITE_KEY` are present. This means the code is ready, but enforcement is not proven from repo code alone.

Required fix:

- Confirm Firebase Console App Check enforcement for Firestore, Storage, and callable Functions.
- Confirm production environment variables include `VITE_ENABLE_FIREBASE_APPCHECK=true` and a valid `VITE_APP_CHECK_SITE_KEY`.

### 5. Public hard launch needs operational readiness, not only code readiness

Status: MEDIUM

Required before inviting broad public users:

- Real-phone smoke test on iPhone/Android.
- Controlled 5-role pilot accounts.
- Firebase budget alerts.
- Functions error alerts.
- Legal documents: Terms, Privacy, Refund/Cancellation, Service Agreement.
- Custom domain and branded email.

## Rating

- Technical deployment readiness: 9/10
- Security hardening: 8.5/10
- Five-dashboard UI completeness: 7.5/10 until logout/language controls are added everywhere
- Hard public launch readiness: 7.8/10 now
- Controlled friend pilot readiness: 9/10

## Final decision

Send it to a small controlled friend pilot now, but do not market it as a full hard public launch until the logout, language toggle, and workflow E2E gaps are closed.
