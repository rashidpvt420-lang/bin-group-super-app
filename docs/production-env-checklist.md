# BIN GROUP — Production Environment Checklist

> [!IMPORTANT]
> All keys below must be set as **GitHub Actions Secrets** before deploying to production.
> Navigate to: **GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret**

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

---

## 2. Firebase App Check (reCAPTCHA v3) — Required for Public Launch

> [!CAUTION]
> Without App Check, Firebase APIs are unprotected and can be abused by bots.

| Secret Name | Where to Get It |
|---|---|
| `VITE_APP_CHECK_SITE_KEY` | 1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin) <br>2. Create a new site → **reCAPTCHA v3** <br>3. Add domains: `bin-group-57c60.web.app`, `bin-group-57c60.firebaseapp.com`, and your custom domain <br>4. Copy the **Site Key** |
| `VITE_ENABLE_FIREBASE_APPCHECK` | Set to `true` in production GitHub Secrets only |

**After creating the reCAPTCHA site key**, also register it in Firebase:
1. Firebase Console → **App Check** → Apps
2. Select your web app → **reCAPTCHA v3** → paste the site key
3. Click **Save**

---

## 3. Firebase Cloud Messaging — Required for Push Notifications

> [!IMPORTANT]
> Without this key, push notifications will silently fail on all platforms.

| Secret Name | Where to Get It |
|---|---|
| `VITE_FIREBASE_VAPID_KEY` | 1. Firebase Console → **Project Settings** (gear icon) <br>2. Tab: **Cloud Messaging** <br>3. Scroll to **Web Push certificates** section <br>4. Click **Generate key pair** (if not already done) <br>5. Copy the **Key pair** value (starts with `B`) |

---

## 4. Google Maps Platform — Required for GPS/Maps Features

> [!IMPORTANT]
> Without this key, maps show an error banner and location-based dispatch is non-functional.

| Secret Name | Where to Get It |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | 1. Go to [Google Cloud Console](https://console.cloud.google.com) <br>2. APIs & Services → Credentials → **Create credentials** → API Key <br>3. Under **Application restrictions**: select **HTTP referrers** <br>4. Add: `bin-group-57c60.web.app/*`, `bin-group-57c60.firebaseapp.com/*`, and your custom domain <br>5. Under **API restrictions**: select **Restrict key** → pick: Maps JavaScript API, Maps Static API, Geocoding API |

---

## 5. Backend Function Secrets (via Firebase Secret Manager)

> [!WARNING]
> Do NOT add these to GitHub Secrets or `.env` files. Use Firebase Secret Manager exclusively.

```bash
# Set each secret using Firebase CLI
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set SMTP_PASSWORD
firebase functions:secrets:set GEMINI_API_KEY
```

---

## 6. Firebase Authorized Domains

Ensure these domains are in Firebase Console → **Authentication** → **Settings** → **Authorized domains**:
- `bin-group-57c60.web.app` ✅ (auto-added)
- `bin-group-57c60.firebaseapp.com` ✅ (auto-added)
- Your custom domain (e.g. `bin-groups.com`) — **must be added manually**

---

## 7. Verification Checklist Before Launch

- [ ] All 6 `VITE_FIREBASE_*` keys set in GitHub Secrets
- [ ] `VITE_APP_CHECK_SITE_KEY` set and registered in Firebase App Check console
- [ ] `VITE_ENABLE_FIREBASE_APPCHECK=true` set in GitHub Secrets (production only)
- [ ] `VITE_FIREBASE_VAPID_KEY` set from Firebase Cloud Messaging → Web Push certificate
- [ ] `VITE_GOOGLE_MAPS_API_KEY` set with proper domain restrictions
- [ ] Firebase Authorized Domains includes custom domain
- [ ] `npm run test:rules` passes all 9 test cases
- [ ] `npm run build` completes without errors
- [ ] Arabic text renders correctly in generated PDFs
- [ ] Push notification received on a real Android device (Chrome)
- [ ] Google Maps tiles load on the property map page

---

## Quick Status Check

Run `npm run test:runtime-audit` locally to get an automated health check of all environment variables.
