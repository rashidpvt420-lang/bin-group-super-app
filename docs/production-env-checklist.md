# BIN GROUP — Production Environment Checklist

> [!IMPORTANT]
> Public launch uses both **GitHub Actions Secrets** for client build-time values and **Firebase Secret Manager** entries for backend Functions.
> Navigate to: **GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret** for `VITE_*` values.
> Use `firebase functions:secrets:set` for backend Function secrets.
>
> Firebase deploy analyzes the compiled Functions codebase as one deployment unit. Therefore a Secret Manager key bound to an exported Function can be **deployment-required even when that provider is disabled by Phase 1 product policy**. Secret presence proves only that the deployment contract can be satisfied; it does **not** activate the provider and is never live-provider evidence.
>
> **Phase 1 payment policy is authoritative:** Cash ✅ and Cheque ✅ only. Bank Transfer ❌ and Card/Stripe ❌ are disabled. Dormant future-provider code and deployment-bound secret resources do not make those providers user-facing Phase 1 capabilities.

---

## 0. Firebase Billing Plan (Blaze) — Required for outbound provider calls

> [!CAUTION]
> Firebase's free **Spark** plan blocks outbound networking from Cloud Functions. On Spark, enabled outbound providers such as SMTP, OpenAI/Gemini, Meta/WhatsApp, Twilio, or a future Stripe integration can deploy successfully and still fail at runtime. Deployment success is not live-provider proof.

1. Firebase Console → **Project Settings** (gear icon) → **Usage and billing**
2. Confirm the plan is **Blaze (Pay as you go)**, not Spark
3. If still on Spark, upgrade before relying on any enabled Cloud Function that makes outbound provider calls
4. Record confirmation in the exact-SHA launch evidence chain; do not infer provider readiness from billing-plan presence alone

---

## 1. Firebase Core Secrets

| Secret Name | Where to Get It | Notes |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project Settings → General → Web apps | Public key, restrict by HTTP referrer |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Console → Project Settings | e.g. `bin-group-57c60.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Console → Project Settings | `bin-group-57c60` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Console → Project Settings | e.g. `bin-group-57c60.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Console → Project Settings | Numeric ID |
| `VITE_FIREBASE_APP_ID` | Firebase Console → Project Settings → Web apps | e.g. `1:123...` |

The protected production build also writes the exact deployment commit into `VITE_RELEASE_COMMIT_SHA` and `REACT_APP_RELEASE_COMMIT_SHA`. Those values must come from the protected workflow's `GITHUB_SHA`/approved release SHA and are not user-entered launch claims.

---

## 2. Firebase App Check (reCAPTCHA v3) — Required for Public Launch

> [!CAUTION]
> Without App Check enforcement, Firebase APIs are exposed to automated abuse even if Firestore rules are strong.

| Secret Name | Where to Get It |
|---|---|
| `VITE_APP_CHECK_SITE_KEY` | 1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin) <br>2. Create a new site → **reCAPTCHA v3** <br>3. Add domains: `bin-group-57c60.web.app`, `bin-group-57c60.firebaseapp.com`, and your custom domain <br>4. Copy the **Site Key** |
| `VITE_ENABLE_FIREBASE_APPCHECK` | Set to `true` in production GitHub Secrets only |

**After creating the reCAPTCHA site key**, also register it in Firebase:
1. Firebase Console → **App Check** → Apps
2. Select your web app → **reCAPTCHA v3** → paste the site key
3. Click **Save**
4. Enable enforcement for Firestore, Storage, and callable/HTTP Functions after the live smoke test passes

---

## 2A. Firebase Phone Authentication — Required for Owner Mobile Changes

> [!CAUTION]
> Owner phone changes are accepted only after Firebase Authentication completes a real SMS challenge. The profile sync callable reads the verified phone from Firebase Auth and ignores browser-supplied phone values.

1. Firebase Console → **Authentication** → **Sign-in method** → enable **Phone** provider
2. Firebase Console → **Authentication** → **Settings** → **Authorized domains** → confirm:
   - `bin-group-57c60.web.app`
   - `bin-group-57c60.firebaseapp.com`
   - the production custom domain
3. Firebase Console → **Authentication** → **Settings** → **SMS region policy** → use **Allowlist only** and include United Arab Emirates (`AE`)
4. Grant the protected deployment service account `firebaseauth.configs.get` so the predeploy Identity Toolkit configuration check can run
5. Confirm the production domain can render Firebase's invisible reCAPTCHA challenge without Content Security Policy blocking Google reCAPTCHA resources
6. Confirm the project has sufficient Firebase Authentication SMS quota/billing for the UAE launch volume
7. Use Firebase test phone numbers only in emulator/staging workflows; never configure a production Owner number as a test number
8. On a real production Owner account, complete one SMS verification and confirm:
   - Firebase Authentication user record contains the verified E.164 phone
   - `users/{uid}.phoneAuthority` is `FIREBASE_AUTH_PHONE`
   - an `OWNER_PHONE_VERIFIED_SYNCED` audit record exists
9. Record the live verification evidence in the protected launch artifact; do not record the SMS code

The protected production deploy entrypoint runs `scripts/verify-firebase-phone-auth-production.mjs` after Google Cloud authentication and Secret Manager preflight. Deployment fails before the first Firebase deploy attempt when Phone Auth is disabled, a required production domain is absent, the SMS policy is not allowlist-only, or `AE` is not allowed. The script reports only aggregate configuration counts and never prints test phone numbers or codes.

---

## 3. Firebase Cloud Messaging — Required for Push Notifications

> [!IMPORTANT]
> A configured key proves configuration only. Public-launch proof still requires real-device token registration, foreground/background receipt, and denied-permission fallback.

| Secret Name | Where to Get It |
|---|---|
| `VITE_FIREBASE_VAPID_KEY` | 1. Firebase Console → **Project Settings** (gear icon) <br>2. Tab: **Cloud Messaging** <br>3. Scroll to **Web Push certificates** section <br>4. Click **Generate key pair** (if not already done)<br>5. Copy the **Key pair** value (starts with `B`) |

---

## 4. Google Maps Platform — Required for GPS/Maps Features

> [!IMPORTANT]
> A configured Maps key proves configuration only. Public-launch proof still requires a real-device GPS/map/check-in/tracking test plus the denied-location fallback.

| Secret Name | Where to Get It |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | 1. Go to [Google Cloud Console](https://console.cloud.google.com) <br>2. APIs & Services → Credentials → **Create credentials** → API Key <br>3. Under **Application restrictions**: select **HTTP referrers** <br>4. Add: `bin-group-57c60.web.app/*`, `bin-group-57c60.firebaseapp.com/*`, and your custom domain <br>5. Under **API restrictions**: select **Restrict key** → pick: Maps JavaScript API, Maps Static API, Geocoding API |

---

## 5. Backend Function Secrets — Firebase Secret Manager Only

> [!WARNING]
> Do **not** add backend provider secrets to GitHub Secrets or `.env` files. Use Firebase Secret Manager exclusively. A secret being present means the deployment/runtime can resolve its binding; it does **not** mean the provider is enabled, verified, or approved for public launch.

### Phase 1 operational providers

```bash
# Branded email delivery provider
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS

# AI providers used by Sovereign AI
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set IMAGE_GENERATION_API_KEY
firebase functions:secrets:set GEMINI_API_KEY
```

The protected deployment preflight also verifies non-provider Function secrets and peppers such as `OWNER_CONTRACT_OTP_PEPPER`, `BROKER_PAYOUT_OTP_PEPPER`, `IOT_GATEWAY_TOKEN`, and `QR_SIGNING_SECRET`. The authoritative deployment contract is `requiredFirebaseDeploymentSecrets` in `scripts/verify-firebase-production-secrets.mjs` and must remain synchronized with the exported compiled Functions runtime.

### Deployment-bound dormant providers — disabled as Phase 1 capabilities

The current Functions codebase still exports endpoints that bind WhatsApp and Stripe Secret Manager keys. Firebase analyzes those bindings during deployment, so the corresponding **Secret Manager resources with enabled versions must exist for the protected Functions deployment to succeed**, even though the providers are not Phase 1 launch capabilities.

```bash
# Deployment-bound WhatsApp resources. Presence does not enable or verify WhatsApp.
firebase functions:secrets:set WHATSAPP_TOKEN
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN
firebase functions:secrets:set WHATSAPP_APP_SECRET

# Deployment-bound future Stripe resources. Phase 1 runtime/policy remains fail-closed.
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

**Do not interpret those resources as provider activation.** Under `PHASE1_CASH_CHEQUE_V1`, Stripe/Card remains disabled and cannot satisfy the Phase 1 payment gate. WhatsApp remains optional and must not be described as live without separate provider approval and hosted delivery evidence. A future source change that removes the dormant secret bindings may also remove these keys from the deployment-required list, but the preflight and documentation must change together.

> [!NOTE]
> The production mail function reads `SMTP_USER` and `SMTP_PASS`. Do not use the old `SMTP_PASSWORD` name; it will not satisfy the deployed function.

> [!WARNING]
> If WhatsApp is later enabled, `whatsappWebhook` is the single deployed inbound endpoint and writes verified messages to `communication_intake` for the admin Triage Queue. Configure Meta to use that Function URL. Every POST must carry a valid `X-Hub-Signature-256` HMAC. Missing `WHATSAPP_APP_SECRET` or an invalid signature is rejected with HTTP 401.

Recommended non-secret runtime values:

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=465
MAIL_FROM="BIN GROUP <ceo@bin-groups.com>"
MAIL_REPLY_TO="BIN GROUP Admin <ceo@bin-groups.com>"
```

---

## 6. Firebase Authorized Domains

Ensure these domains are in Firebase Console → **Authentication** → **Settings** → **Authorized domains**:
- `bin-group-57c60.web.app` ✅ (auto-added)
- `bin-group-57c60.firebaseapp.com` ✅ (auto-added)
- Your custom domain (e.g. `bin-groups.com`) — **must be added manually**

---

## 7. Admin Credential Rotation — Required Before Public Launch

1. Firebase Console → Authentication → Users
2. Select the production admin account
3. Reset/rotate password
4. Update `E2E_ADMIN_PASSWORD` in GitHub Actions Secrets
5. Run the manual **Live Role Smoke Tests** workflow
6. Record the workflow run ID in the current exact-SHA launch evidence chain

---

## 8. Verification Checklist Before Launch

- [ ] Firebase project confirmed on **Blaze (pay-as-you-go)** plan, not Spark
- [ ] All required `VITE_FIREBASE_*` keys set in GitHub Secrets
- [ ] Protected production build contains the exact current release SHA (`VITE_RELEASE_COMMIT_SHA` / `REACT_APP_RELEASE_COMMIT_SHA`)
- [ ] `VITE_APP_CHECK_SITE_KEY` set and registered in Firebase App Check console
- [ ] `VITE_ENABLE_FIREBASE_APPCHECK=true` set in GitHub Secrets (production only)
- [ ] App Check enforcement active for Firestore, Storage, and Functions
- [ ] Firebase Authentication **Phone** provider enabled
- [ ] Production domains authorized for Firebase Phone Authentication and invisible reCAPTCHA
- [ ] Firebase Authentication SMS policy is **allowlist-only** and includes `AE`
- [ ] Deployment service account can call Identity Toolkit `projects.getConfig` (`firebaseauth.configs.get`)
- [ ] Automated Firebase Phone Auth production preflight passes before deployment
- [ ] Firebase Authentication SMS quota/billing confirmed for UAE production traffic
- [ ] Real Owner SMS verification writes `FIREBASE_AUTH_PHONE` authority and `OWNER_PHONE_VERIFIED_SYNCED` audit evidence without storing the code
- [ ] `VITE_FIREBASE_VAPID_KEY` configured; real-device push receipt/fallback proof recorded separately
- [ ] `VITE_GOOGLE_MAPS_API_KEY` configured with proper restrictions; real-device GPS/map proof recorded separately
- [ ] Firebase Authorized Domains includes custom domain
- [ ] Phase 1 server payment policy resolves **exactly** `CASH` + `CHEQUE`
- [ ] Bank Transfer remains disabled in Phase 1
- [ ] Stripe/Card remains disabled in Phase 1; any deployment-bound Stripe Secret Manager resources are treated only as dormant Function bindings, not provider activation or launch evidence
- [ ] `SMTP_USER` and `SMTP_PASS` set in Firebase Secret Manager
- [ ] All keys currently listed by `requiredFirebaseDeploymentSecrets` exist with an enabled Secret Manager version before Functions deployment
- [ ] Branded email sender test creates `mail/{id}` and reaches `delivery.state=SUCCESS`
- [ ] `OPENAI_API_KEY` and/or approved AI provider configuration exists server-side; a signed-in hosted Sovereign AI proof is recorded without exposing keys
- [ ] Optional WhatsApp is described as live only if sender/template/provider approval and hosted delivery evidence exist; deployment-bound WhatsApp secret resources alone do not count
- [ ] Admin password rotated and `E2E_ADMIN_PASSWORD` GitHub secret updated
- [ ] Manual Live Role Smoke Tests workflow passes for admin, owner, tenant, technician, and broker
- [ ] `npm run test:rules` passes all test cases
- [ ] `npm run test:runtime-audit` passes in production validation environment
- [ ] `npm run build` completes without errors
- [ ] Arabic text renders correctly in generated PDFs
- [ ] Push notification received on a real Android device
- [ ] Google Maps/GPS path works on a real mobile device, including denied-location fallback

---

## Evidence semantics

Use the canonical Wave 6 evidence layers:

1. **source** — code/CI/static policy proof. This cannot prove a provider is production-live.
2. **hosted** — proof from the exact deployed production SHA and live backend/hosted app.
3. **physical_device** — real phone/tablet evidence. This is mandatory for GPS/Maps and push-notification launch gates.

A public-launch gate counts as passed only when the evidence is `passed`, belongs to the exact release commit SHA, and meets the gate's required evidence layer. `waived` is never counted as a hard-public-launch pass.

---

## Quick Status Check

Run `npm run test:runtime-audit` locally to get an automated source/configuration health check. It does not certify hosted or physical-device provider operation.
