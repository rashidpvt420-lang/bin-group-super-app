# Product Consolidation Wave 6 — Provider & Launch Truth

Base protected main: `7429c5d833689e59ec373c9d6b060a44e4bbdbe9`

## Mission

Make provider/runtime configuration and launch evidence tell one conservative truth across the root app, Admin panel, Cloud Functions, CI evidence bridge, and committed launch ledger.

## Phase 1 payment authority

- Currency: AED
- Approved methods: CASH and CHEQUE only
- Bank Transfer: disabled
- Stripe/Card: disabled
- Dormant Stripe implementation remains in source only for a separately reviewed future migration.
- The deployed Phase 1 runtime exports fail-closed compatibility endpoints so stale clients or secret drift cannot activate Stripe.

## Provider states

Provider capability and provider proof are separate. Runtime/provider state uses:

- `UNKNOWN`
- `UNCONFIGURED`
- `CONFIGURED`
- `VERIFIED`
- `DISABLED`

No provider is described as production-live merely because source code, an API key name, or a deployment exists.

## Evidence layers

Launch evidence is classified as:

1. `source` — compile/tests/static contracts.
2. `hosted` — exact-SHA behavior against protected hosted production services.
3. `physical_device` — real device behavior for permissions, notifications, GPS/maps, Phase 1 payment journey, mobile PDF/RTL and role smoke gates.

A stronger evidence layer may satisfy a weaker requirement, never the reverse.

## Hard public launch rule

A required gate contributes to hard-public-launch readiness only when all are true:

- status is exactly `passed`;
- evidence is bound to the exact release SHA;
- evidence meets or exceeds the gate's required evidence layer.

`waived` is controlled-pilot/history metadata only and never counts as a hard-public-launch pass.

## UI authority

`/ops/public-launch-command` in the dedicated Admin panel is the release-evidence authority. The root-app Admin Terminal is operational only and must not calculate or cache `PUBLIC READY` from ad-hoc booleans.

## Legacy evidence

Pre-Wave-6 records remain historical. The old `paymentGatewayOrManualBank` gate is retired and replaced by `phase1Payments`. Historical Bank Transfer or Stripe evidence cannot certify the current Phase 1 release.

## Safety

Wave 6 changes source truth and regression coverage only. It does not deploy production, manufacture physical-device evidence, or assert hard-public-launch clearance.
