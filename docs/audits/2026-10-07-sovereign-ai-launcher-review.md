# Sovereign AI launcher stabilization review — 7 October 2026

Repository: `rashidpvt420-lang/bin-group-super-app`. Authoritative repair: #1713.
Reviewed baseline head: `7aa1f0029f86564234f9a6b2a5bc3977513348ff`.
Base main: `6acb619e52293a8f446f0369fc45d16a6671fbbe` (#1708 already merged).

## Findings and repair

The original focused repair removes the second Owner AI launcher, uses native
button click activation with drag suppression, disables mobile edge-swipe opening,
and reserves the BIN Connect corner. Review identified two additional defects:

1. AI drawer mode changes at `sm`, but BIN Connect fixed offsets change at `md`.
   At 600, 768 and 899px, the old reservation leaves the AI button overlapping
   BIN Connect. AI now uses a separate `down('md')` media query for that geometry,
   including restoration, dragging, resize and initial positioning.
2. A cancelled pointer gesture leaves click suppression armed without a trailing
   pointer click. That swallows the next keyboard activation. Native zero-detail
   keyboard clicks now open the drawer and clear suppression, while the trailing
   pointer click after a drag remains suppressed.

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
launcher opening and checks keyboard recovery after pointer cancellation on every
configured project. The inherited WebKit opening/drag sequence uses synthetic
pointer dispatch; it must not be described as physical iOS or Android proof.
Local browser installation returned truncated ZIP downloads, so local Playwright
execution is not claimed. The protected PR Validation workflow already installs
Chromium/WebKit and runs these tests; its exact-head results and final merge
evidence must be retained in the PR conversation before accepting this repair.

Authenticated profile walkthrough and live AI-provider proof remain open. Public
local guidance responses do not establish live provider availability.
