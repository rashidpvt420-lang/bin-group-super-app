# BIN GROUP Controlled Pilot — Friends & Family Launch Pack

This is the operator pack for sharing the live app with a small friends-and-family group **before** unrestricted public launch.

It does **not** set `hardLaunchClaim=true`. Public hard launch remains locked behind protected same-SHA evidence, a verified 24-hour pilot, postdeploy clearance, and real Stripe live proof.

## Release phases

1. **Controlled pilot** — invite a small group to test the production app and report issues.
2. **Public hard launch** — proceed only after the protected evidence chain and final signed decision pass.

## Required bank-pilot deployment

Do not run the protected `Firebase Production Deploy` workflow directly. Start a **new** run of:

`START HERE - Firebase Production Deploy`

Use:

- `confirmation=DEPLOY_PRODUCTION_BIN_GROUP_57C60`
- `hard_launch_confirmation=AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP`
- authorized founder name and email
- `launch_mode=bank-pilot`
- `run_public_release_gate=false`
- `incident_active_json=[]` only when no active incident exists
- `incident_requires_rollback=false` only when no rollback hold exists
- blank rollback reason when no hold exists
- a current approved incident-evidence reference
- blank public-only hard-clearance and Stripe fields

The dispatcher stabilizes current `main`, binds the exact SHA, derives incident attestation and failed-deployment recovery from GitHub Actions, then starts the protected deployment. Do not manually run or re-run an older failed dispatcher form.

After the protected bank-pilot deployment succeeds, run `Live Role Smoke Tests` in `live-evidence` mode for the exact deployed SHA and supply the successful production deploy run ID.

## Shareable pilot links

Share these URLs only after the bank-pilot deployment and same-SHA live-evidence workflow are green:

- Main app: `https://bin-group-57c60.web.app`
- Owner entry: `https://bin-group-57c60.web.app/owner`
- Tenant entry: `https://bin-group-57c60.web.app/tenant`
- Technician entry: `https://bin-group-57c60.web.app/technician`
- Broker entry: `https://bin-group-57c60.web.app/broker`
- Invoice verifier: `https://bin-group-57c60.web.app/verify`
- Certificate verifier: `https://bin-group-57c60.web.app/verify-cert`

Do not share Admin publicly. Admin is for founder/operator verification only:

- Admin panel: `https://bin-group-admin-panel.web.app`

## Friends-and-family message

Copy this only after both protected runs are green:

```text
Hi, I’m running a controlled pilot for BIN GROUP before public launch.

Please open this link on your phone and test it like a real property app:
https://bin-group-57c60.web.app

Please check:
1. Page loading speed
2. Login/sign-up flow
3. Owner, tenant, technician, or broker journey
4. Language switch and Arabic readability
5. Maintenance request flow
6. Documents and verifier pages
7. Any broken button, white screen, or confusing wording

Please send screenshots or screen recordings of anything that does not work.
This is a controlled pilot, not the unrestricted public launch.
```

## Controlled pilot checklist

Before sharing:

- Latest `main` CI is green.
- A new `START HERE - Firebase Production Deploy` bank-pilot dispatch succeeded.
- The protected deployment is bound to the exact latest main SHA.
- `Live Role Smoke Tests` succeeded in `live-evidence` mode for that same SHA.
- No open P0/P1 incident is known.
- App Check does not block normal mobile browser sessions.
- Founder Admin login works after hard refresh.
- Owner, Tenant, Technician, Broker, and Admin entrypoints load on mobile.
- Signed-in Admin callable sessions do not report `Unauthenticated`.

During the 24-hour pilot:

- Keep a timestamped issue log with screenshots or recordings.
- Classify issues as P0, P1, P2, or copy/UI feedback.
- Do not progress while any P0/P1 remains open.
- Do not change the release SHA during the evidence window; a new SHA restarts the pilot evidence chain.
- Keep the successful bank-pilot and live-evidence run URLs.

After at least 24 real hours:

- Run `Live Role Smoke Tests` in `hard-clearance` mode.
- Supply the exact live-evidence run ID.
- Let the workflow derive the pilot start and completion timestamps.
- Use `open_p0=0` and `open_p1=0` only when true.
- Use the successful live-evidence run URL as the incident reference.
- Use the successful bank-pilot deploy run URL as the rollback reference.
- Use the current hard-clearance run URL as the monitoring reference.

## Public hard launch

Only after hard-clearance succeeds, start a **new** run of:

`START HERE - Firebase Production Deploy`

Use:

- `confirmation=DEPLOY_PRODUCTION_BIN_GROUP_57C60`
- `hard_launch_confirmation=AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP`
- authorized founder name and email
- `launch_mode=public`
- `run_public_release_gate=true`
- truthful empty incident/rollback state
- hard-clearance run URL as the incident evidence reference
- `hard_clearance_run_id=<successful hard-clearance run ID>`
- `stripe_live_checkout_session_id=cs_live_...`
- `stripe_live_webhook_event_id=evt_...`

The final public workflow must verify:

- exact-main production deployment
- same-SHA hard-clearance artifact
- verified 24-hour controlled-pilot provenance
- all 11 operational readiness gates
- postdeploy routes
- SMTP live delivery
- App Check enforcement
- authenticated smoke tests
- business workflow evidence
- audit evidence
- live Stripe checkout and signed webhook proof
- HMAC signature and exact evidence hashes

Only then may the final signed decision set `hardLaunchClaim=true`.

## Stop rules

Stop the pilot and do not progress to public launch when any of these is true:

- Admin login cannot be verified.
- Any core role entrypoint produces a white screen.
- App Check or authentication blocks normal signed-in users.
- Payment unlock or property approval can repeat incorrectly.
- AI or callable flows retain stale sessions after a fresh sign-in.
- P0/P1 issues remain open.
- The release SHA changed during the pilot.
- Stripe live proof cannot be verified.
