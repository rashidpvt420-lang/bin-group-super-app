# Hosted Client Configuration Production Evidence

The protected production workflow validates client configuration twice:

1. **Prebuild named-value validation** checks that Firebase, Maps, Web Push, App Check, GCP identity, and exact production URL values are present, well formed, and not placeholders.
2. **Postdeploy hosted-bundle validation** proves that the exact expected client values were embedded into the live main and Admin JavaScript bundles for the deployed SHA.

## Live bundle scan

`scripts/verify-production-deployment.mjs` fetches the production main and Admin entrypoints, follows same-origin JavaScript assets recursively, and scans lazy route chunks as well as initial bundles. The crawl is capped at 250 assets per site and never follows another origin.

The main application must contain exact matches for:

- Firebase project, Auth domain, and Storage bucket
- Firebase web API key and App ID
- Firebase messaging sender ID
- App Check reCAPTCHA site key
- Google Maps browser API key
- Firebase Web Push VAPID public key

The Admin application must contain the Firebase project, Auth domain, Storage bucket, web API key, App ID, messaging sender ID, and App Check site key. Maps and VAPID are not required in the Admin bundle because those capabilities are not initialized there.

## Evidence privacy

`production-deployment.json.clientRuntimeConfig` records only:

- exact workflow/SHA binding metadata;
- per-site JavaScript asset counts;
- boolean match results for each required configuration field;
- `sensitiveValuesExcluded: true`; and
- `hardLaunchClaim: false`.

The evidence never stores or prints Firebase API keys, Maps keys, VAPID keys, App Check site keys, access tokens, or debug tokens. Failure output identifies only the missing boolean field.

## Fail-closed behavior

Deployment verification fails when any required value is absent from the hosted bundle, the asset crawl finds no readable JavaScript, evidence is stale or bound to another run/SHA, or the aggregate evidence contains a forbidden secret field. The downloaded same-run artifact verifier independently validates the nested `clientRuntimeConfig` object before release gates continue.
