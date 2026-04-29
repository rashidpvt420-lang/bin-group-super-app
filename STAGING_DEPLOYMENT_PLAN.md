# STAGING DEPLOYMENT PLAN - BIN GROUP Super App

## 1. Environment Infrastructure
- **Staging Project ID:** `studio-5724711541-8a962`
- **Region:** `europe-west3` (Functions) / `eur3` (Firestore)
- **Status:** **STAGING-ONLY** (Production `bin-group-57c60` must remain untouched)

## 2. Pre-Deployment Configuration & Secrets Audit
### Firebase Aliases
```bash
# Add staging alias if not present
firebase use --add studio-5724711541-8a962 staging
```

### Critical Secrets Architecture
The BIN GROUP app follows a **Strict Sovereign Isolation** policy for secrets:
- **Client-Side (Frontend)**: Only `VITE_GOOGLE_MAPS_API_KEY` is allowed. It MUST be restricted via the Google Cloud Console to authorized domains (`*.web.app`, `*.firebaseapp.com`) and specific APIs.
- **Server-Side (Functions)**: All institutional secrets (`OPENAI_API_KEY`, `STRIPE_SECRET`, `SMTP_PASS`) are managed via **Firebase Secret Manager**.
- **Admin Credentials**: Service account keys (`serviceAccountKey.json`) are prohibited from the repository and are only injected via `GOOGLE_APPLICATION_CREDENTIALS` in restricted CI/CD or controlled terminal environments.

### Staging Environment Variables
| Variable | Handling | Purpose |
|----------|----------|---------|
| `VITE_GOOGLE_MAPS_API_KEY` | Restricted Frontend Key | Maps & Geocoding |
| `OPENAI_API_KEY` | Firebase Secret | AI Mission Concierge |
| `STRIPE_SECRET` | Firebase Secret | Payment processing |
| `SMTP_PASS` | Firebase Secret | Notification delivery |

## 3. Deployment Sequence (Surgical Staging)
Deploy in this exact order to prevent dependency failures:

```bash
# 1. Switch to staging
firebase use staging

# 2. Deploy Firestore Rules (Security Gate)
firebase deploy --only firestore:rules

# 3. Deploy Firestore Indexes
firebase deploy --only firestore:indexes

# 4. Deploy Cloud Functions (Logic Layer)
firebase deploy --only functions

# 5. Build and Deploy Hosting (UI Layer)
npm run build
firebase deploy --only hosting
```

## 4. Smoke Test Checklist (Staging)
- [ ] **Auth**: Create a test owner account; verify success.
- [ ] **Onboarding**: Complete a 3-property portfolio intake; verify `intake_submissions` and `properties_pending` records.
- [ ] **Pricing**: Confirm ACV is non-zero in the UI summary.
- [ ] **Maps**: Force a failing API key (or simulate) and verify "Manual Mode" fallback.
- [ ] **Admin**: Upload a test CSV with `UNIT` and `TENANT` types; verify data persistence.
- [ ] **Security**: Attempt to read Owner B's property with Owner A's token; verify `permission-denied`.

## 5. Rollback Commands (Staging)
```bash
# Revert hosting
firebase hosting:rollback --project staging

# Revert functions (requires git checkout previous commit)
git checkout [previous-stable-tag]
firebase deploy --only functions --project staging
```

## 6. Known Risks
- **Emulator Divergence**: Minor differences between local emulator behavior and live Staging Firestore rules.
- **API Quotas**: Staging usage shares OpenAI/Google quotas unless separate keys are used.

## 7. Production Promotion Checklist
- [ ] Staging Smoke Test: **100% PASS**
- [ ] Peer Review of `REPAIR_CHANGELOG.md`
- [ ] Sign-off from Project Lead
- [ ] Final check of `.firebaserc` to ensure `default` points to `bin-group-57c60`
- [ ] **Manual Approval Triggered**

---
*Created by Antigravity AI @ 2026-04-29*
