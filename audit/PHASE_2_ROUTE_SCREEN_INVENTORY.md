# Phase 2 Route and Every-Screen Inventory

Generated from canonical router sources.

## Route count

| Runtime | Entries |
| --- | ---: |
| main | 79 |
| owner | 39 |
| tenant | 34 |
| technician | 18 |
| broker | 17 |
| adminops | 72 |

Total registered route entries/aliases: **259**.

The CSV records:

`route -> role -> permission -> data source -> loading -> empty -> error -> success -> mobile -> Arabic -> back navigation -> direct URL -> refresh`

## Review queue

| Dimension | REVIEW rows |
| --- | ---: |
| Loading | 0 |
| Empty | 0 |
| Error | 0 |
| Mobile | 0 |
| Arabic | 0 |
| Back navigation | 0 |
| Direct URL | 0 |
| Refresh | 0 |

`REVIEW` is deliberately fail-honest: source inspection did not find an explicit implementation signal, so the row is not counted as a pass. Responsive/Arabic hints still require device/runtime evidence.

## Repaired Phase 2 blockers

- Auditor role home and authenticated landing redirect.
- Auditor loading/empty/error/success states and removal of unsupported trust/regulatory/integration claims.
- Dedicated Admin `/smoke-test` route and compliance-module authorization.

Direct URL and refresh coverage are fail-closed against Firebase SPA rewrites plus the protected exact-route browser audit. Mobile/Arabic rows require responsive/i18n implementation signals or the protected browser audit.
