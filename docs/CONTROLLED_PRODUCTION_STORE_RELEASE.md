# Controlled production store release

## Purpose

BIN GROUP ships one production application and one Firebase production backend. The initial store release is the real production app, distributed first to friends, family and approved operational users through controlled account activation.

This release does **not** enable unrestricted commercial acquisition, public marketing, Stripe or Bank Transfer.

## Release gates

### `PRODUCTION_DISTRIBUTION_READY`

Required before Android or iOS signing:

- `main` is frozen at one exact SHA.
- The same SHA has a successful Firebase production deployment artifact.
- Production deployment metadata has `status=passed`, project `bin-group-57c60`, and no hard-launch claim.
- Launch-honesty and mobile-store-readiness tests pass.
- Owner activation remains BIN-approved.
- Tenant access remains property/unit invitation based.
- Technician and Staff access remains Admin-invitation only.
- Broker access remains verification controlled.
- Cash and Cheque are the only enabled Phase 1 methods.
- Stripe and Bank Transfer remain disabled.
- Android and iOS signing secrets are present in the protected `production` environment.

The workflow `.github/workflows/controlled-production-store-release.yml` enforces these requirements and then dispatches the existing signed Android AAB and iOS IPA workflows.

### `COMMERCIAL_PUBLIC_ACTIVATION_READY`

This remains separate and later. It requires real-world validation, operational capacity, zero unresolved P0/P1 incidents, physical-device GPS/camera/notification evidence, rollback and monitoring verification, and any provider evidence required for features being enabled.

## Execution order

1. Complete the exact-SHA Firebase Production Deploy workflow.
2. Record the successful production deployment run ID.
3. Merge only fully green source changes and repeat the exact-SHA deployment if `main` changes.
4. Run **Controlled Production Store Release** from `main` with:
   - `expected_commit_sha`: the frozen deployed SHA;
   - `production_deployment_run_id`: the successful exact-SHA deployment run;
   - `build_android=true`;
   - `build_ios=true`;
   - a new positive `ios_build_number`;
   - `upload_ios_to_testflight=false` for artifact-only validation or `true` when App Store Connect credentials are ready;
   - confirmation `RELEASE_CONTROLLED_PRODUCTION_TO_STORES`.
5. Download and inspect the signed AAB/IPA evidence artifacts.
6. Upload the AAB to the required Google Play test or production track.
7. Upload the IPA to TestFlight/App Store Connect and provide reviewer credentials.
8. Invite friends and family through the controlled role-specific onboarding paths.
9. Hold public marketing until `COMMERCIAL_PUBLIC_ACTIVATION_READY` is approved.

## Required protected secrets

Android release:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Apple release:

- `APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64`
- `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`
- `APPLE_TEAM_ID`
- `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` only when TestFlight upload is enabled

Both platforms also require the production Firebase, App Check, Maps and notification configuration values already referenced by their store workflows.

## Fail-closed behavior

The store release workflow refuses to proceed when:

- `main` differs from the authorized SHA;
- the deployment run ID is missing or invalid;
- the deployment artifact is absent, failed, from another SHA, or from another Firebase project;
- launch-honesty or mobile-store-readiness tests fail;
- neither platform is selected;
- iOS is selected without a valid positive build number;
- signing or production environment secrets are missing.

A successful store build proves that a signed artifact was produced from the deployed production SHA. It does not claim unrestricted commercial public activation.
