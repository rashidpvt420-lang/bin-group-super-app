# BIN GROUP production security registration

This runbook is for the live Firebase project and the dedicated Admin portal. It must not be used with a different Firebase project, web-app ID, reCAPTCHA key, or hostname.

## Canonical production identity

- Firebase project ID: `bin-group-57c60`
- Firebase project number / messaging sender ID: `123413252227`
- Dedicated Admin Firebase web-app ID: `1:123413252227:web:285cb53bc26626d699f3b6`
- Public app host: `bin-group-57c60.web.app`
- Admin portal host: `bin-group-admin-panel.web.app`
- Firebase Auth domain: `bin-group-57c60.firebaseapp.com`
- App Check provider currently used by the web code: reCAPTCHA v3

Do not use a Google Workspace Admin Console 2-step-verification setting for this task. Workspace 2SV protects the Google account; it does not register the BIN GROUP Firebase web app with App Check or enroll Firebase MFA.

## 1. Repair the Admin App Check registration

1. Open Firebase Console and select **bin-group-57c60**.
2. Open **Security → App Check → Apps**.
3. Find the web app whose app ID ends with `285cb53bc26626d699f3b6`.
4. Register or manage that exact app with **reCAPTCHA v3**.
5. In the reCAPTCHA v3 console, confirm that the matching site key allows both production hosts:
   - `bin-group-admin-panel.web.app`
   - `bin-group-57c60.web.app`
6. Confirm that the public site key paired with the App Check registration is stored only in the protected GitHub production environment as `VITE_APP_CHECK_SITE_KEY`.
7. Do not paste a secret key into source code. Do not commit a debug token. Do not reuse a key belonging to another Firebase project or web app.

The Admin build initializes `ReCaptchaV3Provider` with the protected site key. Firebase App Check must register the dedicated Admin web app with the matching provider configuration before a production token exchange can succeed.

## 2. Repair Firebase Authentication access

In Firebase Console for **bin-group-57c60**:

1. Open **Security → Authentication → Sign-in method** and confirm **Email/Password** is enabled.
2. Open **Security → Authentication → Settings → Authorized domains**.
3. Confirm these domains are present:
   - `bin-group-admin-panel.web.app`
   - `bin-group-57c60.web.app`
   - `bin-group-57c60.firebaseapp.com`
4. Open **Users** and confirm `ceo@bin-groups.com` exists, is enabled, and has a verified email.
5. Do not create a second Founder account to work around a broken account.

## 3. Complete Founder Firebase MFA

1. Sign in to the BIN GROUP Admin portal as `ceo@bin-groups.com` after App Check and primary authentication work.
2. Open the Admin security profile.
3. Enroll an authenticator-app TOTP factor or the approved phone factor.
4. For TOTP, save the Base32 setup key in the approved password manager before confirming enrollment.
5. Store the same Base32 setup key as the protected GitHub production-environment secret `E2E_FOUNDER_TOTP_SECRET`.

Never put the changing six-digit authenticator code in `E2E_FOUNDER_TOTP_SECRET`. Never paste the password, setup key, or current code into chat, an issue, a pull request, a log, or source code.

## 4. Verify Founder authorization data

The primary credential and MFA are not sufficient by themselves. The authorized Founder session must also have the canonical Founder claims and matching Admin profile.

Verify through the approved Admin recovery tooling that:

- the authenticated UID belongs to `ceo@bin-groups.com`;
- the Firebase custom claims identify the account as Founder / privileged Admin;
- `admin_users/{uid}` exists and is active;
- the profile email matches the Firebase Authentication email;
- the account is not suspended;
- no unexpected privileged account remains.

Do not weaken Firestore rules, bypass App Check, remove MFA, or grant broad Admin claims from the browser.

## 5. Production proof order

Run the protected production workflow only after all console registrations and protected secrets are complete. The required order is:

1. exact-current-`main` build;
2. Admin Hosting deployment;
3. live App Check token exchange;
4. Founder password sign-in;
5. Founder MFA challenge;
6. Founder claims and `admin_users/{uid}` authorization;
7. exact-SHA evidence artifacts.

A static bundle check, a successful Hosting upload, or a correct password alone is not production login proof. Public release, marketing, Stripe, and Bank Transfer remain disabled until the exact-SHA protected evidence gates pass.
