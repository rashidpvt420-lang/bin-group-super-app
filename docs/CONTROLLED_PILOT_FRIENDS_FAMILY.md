# BIN GROUP Controlled Pilot — Friends & Family Launch Pack

This document is the operator pack for sharing the live app with a small friends-and-family group **before** unrestricted public launch.

It does **not** set `hardLaunchClaim=true`. Public hard launch remains locked behind the protected evidence workflow, postdeploy checks, and live Stripe proof.

## Current release discipline

Use two separate phases:

1. **Controlled pilot** — invite a small group to test the real production app and report issues.
2. **Public hard launch** — only after the 24-hour pilot evidence, operational readiness, postdeploy checks, and Stripe live proof pass.

## Shareable pilot links

Use these production URLs only after the `Firebase Production Deploy` workflow succeeds in `bank-pilot` mode and the `Live Role Smoke Tests` workflow succeeds in `live-evidence` mode for the exact same main SHA.

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

Copy/paste this after the bank-pilot deploy and live-evidence workflow are green:

```text
Hi, I’m doing a controlled pilot test for BIN GROUP before public launch.

Please open this link on your phone and test it like a real property app:
https://bin-group-57c60.web.app

Please check:
1. Page loading speed
2. Login/sign-up flow
3. Owner, tenant, technician, or broker journey
4. Language switch / Arabic readability
5. Maintenance request flow
6. Documents / verifier pages
7. Any broken button, white screen, or confusing wording

Please send me screenshots or screen recordings of anything that does not work.
This is a controlled pilot, not the full public launch yet.
```

## Controlled pilot checklist

Before sharing:

- Latest `main` CI is green.
- `Firebase Production Deploy` has succeeded in `bank-pilot` mode for the exact latest main SHA.
- `Live Role Smoke Tests` has succeeded in `live-evidence` mode for that same SHA.
- No open P0/P1 issue is known.
- App Check is not blocking normal mobile browser sessions.
- Admin login works for the founder account.
- AI callable sessions no longer report `Unauthenticated` for signed-in Admin users.
- Owner, Tenant, Technician, Broker, and Admin entrypoints load on mobile.

During the 24-hour pilot:

- Keep a simple issue log with screenshots.
- Classify blockers as P0, P1, P2, or copy/UI feedback.
- Do not run public hard launch while any P0/P1 remains open.
- Do not change the release SHA during the evidence window unless restarting the pilot window.

After the 24-hour pilot:

- Run `Live Role Smoke Tests` in `hard-clearance` mode.
- Let the workflow derive the pilot window from the verified `live-evidence` run.
- Use `open_p0=0` and `open_p1=0` only when true.
- Use the successful live-evidence run URL as the incident reference.
- Use the successful bank-pilot deploy run URL as the rollback reference.
- Use the successful hard-clearance run URL as the monitoring reference.

## Public hard launch checklist

Only after hard-clearance succeeds, run `Firebase Production Deploy` in public mode with:

- `launch_mode=public`
- `run_public_release_gate=true`
- `hard_clearance_run_id=<successful hard-clearance run id>`
- `stripe_live_checkout_session_id=cs_live_...`
- `stripe_live_webhook_event_id=evt_...`

The final public workflow must verify:

- same-SHA production deploy
- same-SHA hard-clearance artifact
- 24-hour controlled pilot proof
- all 11 operational readiness gates
- postdeploy routes
- SMTP live delivery
- App Check enforcement
- authenticated smoke tests
- business workflow evidence
- audit evidence
- live Stripe checkout and webhook proof

Only then may the final signed decision set `hardLaunchClaim=true`.

## Stop rules

Stop the pilot and do not progress to public launch if any of these occur:

- Admin login cannot be verified.
- Any core role entrypoint produces a white screen.
- App Check or auth blocks normal signed-in users.
- Payment unlock or property approval can repeat incorrectly.
- AI / callable flows show stale sessions after a fresh sign-in.
- P0/P1 issues remain open.
- Stripe live proof cannot be verified.
