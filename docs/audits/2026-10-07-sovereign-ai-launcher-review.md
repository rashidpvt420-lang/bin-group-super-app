# Sovereign AI launcher stabilization review — 7 October 2026

Repository: `rashidpvt420-lang/bin-group-super-app`. Authoritative repair: #1713.
Reviewed baseline head: `7aa1f0029f86564234f9a6b2a5bc3977513348ff`.
Base main: `6acb619e52293a8f446f0369fc45d16a6671fbbe` (#1708 already merged).

## Findings and repair

The original focused repair removes the second Owner AI launcher, uses native
button click activation with drag suppression, disables mobile edge-swipe opening,
and reserves the BIN Connect corner. Review identified three additional defects:

1. AI drawer mode changes at `sm`, but BIN Connect fixed offsets change at `md`.
   At 600, 768 and 899px, the old reservation leaves the AI button overlapping
   BIN Connect. AI now uses a separate `down('md')` media query for that geometry,
   including restoration, dragging, resize and initial positioning.
2. A cancelled pointer gesture leaves click suppression armed without a trailing
   pointer click. That swallows the next keyboard activation. Native zero-detail
   keyboard clicks now open the drawer and clear suppression, while the trailing
   pointer click after a drag remains suppressed.
3. The globally imported `admin-mobile-hardening.css` limits every drawer paper
   to 76px below 900px and hides its Typography/Chip children. Local Android
   browser execution reproduced a narrow AI strip and an offscreen Send control.
   AI drawer papers now have an explicit class excluded from navigation-drawer
   styling, including desktop colors and mobile widths/hidden labels. Navigation
   drawer styling remains unchanged.

No changes to BIN Connect messaging, Firebase permissions, production deployment,
release-lock tests, pilot or hard clearance.

## Reproducible regression evidence

`tests/launch/sovereign-ai-launcher-geometry.test.mjs` executes the production
geometry and click handler in an isolated context. It covers seven viewport
widths (390, 599, 600, 768, 899, 900, 1280px), restoration/drag positioning,
the public unreserved corner, keyboard-after-cancel and drag click suppression.

Against the reviewed baseline, 6/10 passed and 4/10 failed: all three tablet
widths plus keyboard-after-cancel. Against this repair, 10/10 passed.
For baseline reproduction, set `UI_AUDIT_ROOT` to a checkout containing the
baseline source and run the same test file.

Node 22 local typecheck, lint and production build passed. Build verification
confirmed no App Check debug token in the production bundle.

The Playwright regression now uses native browser touch activation for Android
and iOS launcher opening, sending and closing without forced taps. It asserts
full-width mobile / 400px desktop drawer geometry, visible title, one sent message,
local-provider truth and keyboard recovery after pointer cancellation.
The mobile drag/cancel sequence still uses synthetic pointer dispatch; these
tests must not be described as physical iOS or Android proof.

The default local browser CDN returned truncated ZIPs, and full Chrome could not
start due to a workspace Unix-socket restriction. The official Chrome for Testing
148.0.7778.96 headless-shell download worked with a temporary local Playwright
config preserving Desktop Chrome / Pixel 7 device settings. Before CSS repair,
desktop passed and Android failed with `Element is outside of the viewport` on
Send. After repair, both native interaction tests passed (2/2). No application
credentials, App Check bypass or authentication changes were used.

Local final launch suite: 2,060 passes, zero failures, two expected local skips,
plus six lifecycle tests. Shared/Admin/Functions builds, repository hygiene,
stability and mobile source readiness also passed. The protected PR Validation
workflow installs Chromium/WebKit and runs these tests; its exact-head results
and final merge evidence must be retained in the PR conversation before accepting
this repair. Local authenticated/device acceptance remains separate.

Authenticated profile walkthrough and live AI-provider proof remain open. Public
local guidance responses do not establish live provider availability.
