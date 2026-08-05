# BIN GROUP production security registration

This runbook is for the live Firebase project and the dedicated Admin portal. It must not be used with a different Firebase project, web-app ID, reCAPTCHA key, or hostname.

## Canonical production identity

- Firebase project ID: `bin-group-57c60`
- Firebase project number / messaging sender ID: `123413252227`
- Dedicated Admin Firebase web-app ID: `1:123413252227:web:285cb53bc26626d699f3b6`
- Public app host: `bin-group-57c60.web.app`
- Admin portal host: `bin-group-admin-panel.web.app`
- Firebase Auth domain: `bin-group-57c60.firebaseapp.com`
- Admin App Check provider: reCAPTCHA Enterprise
- Canonical Admin authorization profile: `users/{uid}`

Do not use a Google Workspace Admin Console 2-step-verification setting for this task. Workspace 2SV protects the Google account; it does not register the BIN GROUP Firebase web app with App Check or enroll Firebase Authentication MFA.

## 1. Repair the Admin App Check registration

1. Open Firebase Console and select **bin-group-57c60**.
2. Open **Security → App Check → Apps**.
3. Find the web app whose app ID ends with `285cb53bc26626d699f3b6`.
4. Register or manage that exact app with **reCAPTCHA Enterprise**.
5. In Google Cloud reCAPTCHA Enterprise, confirm that the matching website key allows the required hosts:
   - `bin-group-admin-panel.web.app`
   - `bin-group-57c60.web.app`
   - approved temporary Founder recovery hosts only while the controlled recovery is active.
6. Confirm that Firebase App Check returns the matching public Enterprise site key for the canonical Admin app. The protected production job resolves this read-only config after Workload Identity authentication. `FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY` remains an optional protected-environment override.
7. Confirm that the protected App Check debug UUID used by CI is registered for this exact Firebase web app.
8. Do not paste a secret key into source code. Do not commit a debug token. Do not reuse a key or debug registration belonging to another Firebase project or web app.

The Admin build initializes `ReCaptchaEnterpriseProvider` with `REACT_APP_APP_CHECK_SITE_KEY`. The protected production workflow obtains that public site key from the canonical Firebase App Check Enterprise config, or from the validated `FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY` override. Firebase App Check must register the dedicated Admin web app with the matching Enterprise provider configuration before a token exchange can succeed.

## 2. Repair Firebase Authentication access

In Firebase Console for **bin-group-57c60**:

1. Open **Security → Authentication → Sign-in method** and confirm **Email/Password** is enabled.
2. Open **Security → Authentication → Settings → Authorized domains**.
3. Confirm these domains are present:
   - `bin-group-admin-panel.web.app`
   - `bin-group-57c60.web.app`
   - `bin-group-57c60.firebaseapp.com`
   - the approved temporary Founder recovery hostname while the controlled recovery is active.
4. Open **Users** and confirm `ceo@bin-groups.com` exists, is enabled, and has a verified email.
5. Do not create a second Founder account to work around a broken account.

## 3. Complete Founder Firebase MFA

1. Sign in to the BIN GROUP Admin portal as `ceo@bin-groups.com` after the App Check handshake and primary authentication work.
2. Open the Admin security profile.
3. Enroll an authenticator-app TOTP factor.
4. Save the Base32 setup key in the approved password manager before confirming enrollment.
5. Store the same Base32 setup key directly as the protected GitHub production-environment secret `E2E_FOUNDER_TOTP_SECRET`.
6. Sign out and complete a fresh password-plus-TOTP login before running the Founder preflight.

Never put the changing six-digit authenticator code in `E2E_FOUNDER_TOTP_SECRET`. Never paste the password, setup key, current code, debug UUID, or site secret into chat, an issue, a pull request, a log, or source code.

## 4. Verify Founder authorization data

The primary credential and MFA are not sufficient by themselves. The authorized Founder session must also have the canonical Founder claims and matching Admin profile.

Verify through the approved Admin recovery tooling that:

- the authenticated UID belongs to `ceo@bin-groups.com`;
- the Firebase custom claims identify the account as Founder or privileged Admin;
- `users/{uid}` exists and is active;
- the profile email matches the Firebase Authentication email;
- the account is not suspended or disabled;
- no unexpected privileged account remains.

Both the Admin AuthContext and the protected Admin security Functions read `users/{uid}`. Do not create a parallel `admin_users/{uid}` document as a workaround. Do not weaken Firestore rules, bypass App Check, remove MFA, or grant broad Admin claims from the browser.

## 5. Exact-SHA proof order

Run the verification-only Founder preflight only after all console registrations, protected secrets, and manual MFA enrollment are complete. The required evidence order is:

1. exact checked-out SHA;
2. Admin App Check token exchange;
3. Firebase password sign-in;
4. Founder TOTP MFA challenge;
5. Founder claims;
6. active matching `users/{uid}` authorization;
7. Admin dashboard access;
8. exact-SHA evidence artifact.

Do not dispatch the Firebase production deployment workflow as part of recovery verification. A static bundle check, a successful Hosting preview upload, or a correct password alone is not production login proof. Public release, marketing, Stripe, and Bank Transfer remain disabled until the exact-SHA protected evidence gates pass.
