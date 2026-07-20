# Firebase Extensions decommission

Firebase notified BIN GROUP that project `bin-group-57c60` has installed Firebase Extension instances. Firebase Extensions management is scheduled to end on March 31, 2027.

## Production inventory

The protected audit identified three active instances:

| Instance ID | Extension | Version | Current production binding |
| --- | --- | --- | --- |
| `firestore-multimodal-genai` | `googlecloud/firestore-multimodal-genai` | `1.0.5` | Firestore `generate` collection, Gemini 2.5 Flash |
| `firestore-bigquery-export` | `firebase/firestore-bigquery-export` | `0.2.10` | Firestore `posts` to `firestore_export.posts_raw_changelog` |
| `firestore-bundle-builder` | `firebase/firestore-bundle-builder` | `0.1.4` | Firestore `bundles` specifications and the production Storage bucket |

These generic `generate`, `posts`, and `bundles` bindings must not be assumed unused merely because the current application has newer features.

## Controls added

- CI rejects a Firebase Extensions manifest, an `extensions/` configuration directory, and install/update commands.
- The protected production workflow inventories installed instances without exporting configuration values or secrets.
- Live readiness checks count the three bound Firestore collections, inspect the BigQuery table metadata and row count, scan runtime source for legacy Extension coupling, and verify the App Check-protected repository-owned AI Design Studio callable.
- Removal is refused unless the exact requested instance is marked `SAFE_TO_RETIRE` by the same protected workflow run.
- Raw Firestore documents, BigQuery rows, Extension parameters, credentials, and secrets are never uploaded as evidence.

## Audit and readiness

Run **FIREBASE - Extensions Decommission** in `audit` mode.

Use confirmation `AUDIT_FIREBASE_EXTENSIONS_BIN_GROUP` and founder email `ceo@bin-groups.com`.

The uploaded evidence contains:

- the sanitized installed-instance inventory;
- per-instance `SAFE_TO_RETIRE` or `BLOCKED` status;
- aggregate Firestore document counts;
- aggregate BigQuery dataset/table existence and row count;
- repository coupling file/rule identifiers; and
- proof that the self-managed AI replacement is exported and App Check-protected.

A blocked result is expected while live source data or historical BigQuery rows remain. Resolve each named blocker before removal.

## Instance migration rules

### Multimodal GenAI

The repository-owned replacement is `generateDesignConceptCompat` in `functions/aiDesignStudioCompat.ts`, exported by `functions/runtime.ts`. It performs authenticated, App Check-protected image editing and records governed design-request metadata.

The Extension is removable only when:

- the replacement contract is present;
- the `generate` collection is empty; and
- no runtime source references the Extension callable, package, or legacy collection.

### Firestore to BigQuery

The installed instance mirrors the generic `posts` collection into `firestore_export.posts_raw_changelog`.

The Extension is removable only when:

- the `posts` collection is empty;
- the BigQuery table is absent or has zero rows; and
- no runtime source writes to the legacy `posts` collection or references the Extension.

When the table contains rows, preserve or migrate that historical data before the workflow will authorize removal.

### Firestore Bundle Builder

The Extension is removable only when:

- the `bundles` specification collection is empty; and
- no runtime source uses the Extension endpoint, `loadBundle`, `namedQuery`, or the legacy bundle-specification collection.

## Removal

After the live readiness artifact marks an instance `SAFE_TO_RETIRE`, run the same workflow in `uninstall` mode with only those exact instance IDs, confirmation `UNINSTALL_MIGRATED_FIREBASE_EXTENSIONS_BIN_GROUP`, and replacement confirmation `CONFIRM_SELF_MANAGED_REPLACEMENTS_VERIFIED`.

The workflow recomputes readiness before removal, inventories the project after removal, and fails when a requested instance remains. Manual confirmation alone cannot bypass the live readiness result.

## Completion

Migration is complete only when the protected audit report contains:

```text
status: CLEAR
activeExtensionCount: 0
```

Firebase stated that additional migration guidance would be provided in September 2026. Review that official guidance when released, but do not delay inventory, data preservation, replacement verification, or controlled retirement.
