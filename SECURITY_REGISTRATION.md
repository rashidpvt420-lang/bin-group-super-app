# 🛡️ BIN-GROUP Sovereign API & Security Registration Guide

The latest console snapshot indicates that your API traffic is currently **100% UNVERIFIED**. This is expected until the final handshake between our hardened production code and the Google/Firebase registry is completed.

## 1. Firebase App Check (Production Activation)
To transition from "Unverified" to "Verified" traffic:
1. Go to the **App Check** tab in the Firebase Console (the screen in your screenshot).
2. Click **Apps** and find your Web App (`1:716065348125:web:676fa520a293b858c104f4`).
3. Click **Register** or **Manage** and select **reCAPTCHA v3**.
4. You will be prompted to enter a **Site Secret** and **Site Key**.
5. Get these from the [reCAPTCHA v3 Admin Console](https://www.google.com/recaptcha/admin/). 
   - *Ensure the domain `bin-group.web.app` and your custom domains are allow-listed.*
6. **DESTRUCTIVE ACTION**: Once you have the Site Key, update `apps/owner-app/src/lib/firebase.ts` (Line 59):
   ```typescript
   provider: new ReCaptchaV3Provider('YOUR_ACTUAL_RECAPTCHA_V3_SITE_KEY'),
   ```
7. After deployment, traffic will show as **Verified**. You can then safely click **Enforce** on Firestore and Storage.

## 2. Google Maps Platform Enforcement
The "Unenforced" status in the screenshot means anyone with your API key can call the maps service.
1. Go to **Google Cloud Console** -> **APIs & Services** -> **Credentials**.
2. Locate the key `AIzaSyCM...CpfAs`.
3. Click **Edit API Key**.
4. **Website Restrictions**: Add `https://bin-group.web.app/*` and your other domains.
5. **API Restrictions**: Limit the key specifically to:
   - Maps JavaScript API
   - Places API
   - (Optional) Firestore/Storage if used from web.

## 3. High-Security Command Center (Admin)
To manage technical staff and global state without using the console:
- Navigate to `/admin`.
- Ensure your UID has `role: 'admin'` in the `users` collection.
- This portal utilizes the **App Check protected functions** to execute mission-critical overrides.

## 4. Mobile Integrity Verify
- If using an iOS/Android wrapper, register the **iOS Bundle ID** and **Android Package Name** in the App Check console to use **DeviceCheck/App Attest** for 100% verified mobile hardware identification.
