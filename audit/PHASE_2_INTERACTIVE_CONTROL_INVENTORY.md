# Phase 2 — Every-Control Matrix

Generated from the checked-out source tree. This is an executable source inventory paired with Playwright runtime checks; it is not a manual checklist.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:db957f3df046620270587dc166944d9f593aedc35127390c091d5116d6423679 -->

- Interactive controls discovered: **2869**
- Source files containing controls: **353**
- Controls with a static label/test identity signal: **2506 / 2869 (87.3%)**
- Mutation-like controls detected: **153**
- Mutation-like controls with a disabled/loading signal in the JSX opening element: **153 / 153 (100.0%)**

<!-- /coderabbit-ai-generated:v1 -->
- Runtime route coverage: **tests/e2e/hard-launch-routes.spec.ts**
- Cross-platform public shell coverage: **tests/e2e/phase3-platform-shell.spec.ts**
- Protected live evidence binding: **launchAuditLive**

The CSV artifact contains every discovered control with source line, role/label/test identity signals, handler expression, disabled signal, and action/loading classification. The Phase 2 source gate fails on mutation-like action controls without a disabled/loading guard. Runtime Playwright assertions cover visible labels, disabled/busy semantics, direct URL, refresh, mobile layout, Arabic/RTL, Back controls and authenticated authorization. Domain regressions cover server mutation, error and permission-denial behavior for protected workflows.

