# Phase 2 — Every-Control Matrix

Generated from the checked-out source tree. This is an executable source inventory paired with Playwright runtime checks; it is not a manual checklist.

- Interactive controls discovered: **2726**
- Source files containing controls: **342**
- Controls with a static label/test identity signal: **2454 / 2726 (90.0%)**
- Mutation-like controls detected: **140**
- Mutation-like controls with a disabled/loading signal in the JSX opening element: **140 / 140 (100.0%)**
- Runtime route coverage: **tests/e2e/hard-launch-routes.spec.ts**
- Cross-platform public shell coverage: **tests/e2e/phase3-platform-shell.spec.ts**
- Protected live evidence binding: **launchAuditLive**

The CSV artifact contains every discovered control with source line, role/label/test identity signals, handler expression, disabled signal, and action/loading classification. The Phase 2 source gate fails on mutation-like action controls without a disabled/loading guard. Runtime Playwright assertions cover visible labels, disabled/busy semantics, direct URL, refresh, mobile layout, Arabic/RTL, Back controls and authenticated authorization. Domain regressions cover server mutation, error and permission-denial behavior for protected workflows.

