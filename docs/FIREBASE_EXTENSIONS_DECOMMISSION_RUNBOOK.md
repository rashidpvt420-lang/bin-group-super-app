# Firebase Extensions decommission

Firebase notified BIN GROUP that project `bin-group-57c60` has installed Firebase Extension instances. Firebase Extensions management is scheduled to end on March 31, 2027.

## Controls added

- CI rejects a Firebase Extensions manifest, an `extensions/` configuration directory, and install/update commands.
- A protected production workflow inventories installed instances without exporting configuration values or secrets.
- Removal is permitted only after a self-managed replacement has been verified and the exact founder confirmation is supplied.

## Audit

Run **FIREBASE - Extensions Decommission** in `audit` mode.

Use confirmation `AUDIT_FIREBASE_EXTENSIONS_BIN_GROUP` and founder email `ceo@bin-groups.com`.

The uploaded report lists only instance ID, extension reference, version, state, and migration category. It does not contain Extension parameters or secrets.

## Migration

Replace each installed instance with repository-owned Cloud Functions, Cloud Run, Eventarc, Dataflow, or another explicit Google Cloud implementation. Validate triggers, IAM, region, retries, Secret Manager use, data preservation, monitoring, rollback, and production behavior.

## Removal

After replacement verification, run the same workflow in `uninstall` mode with the installed instance IDs, confirmation `UNINSTALL_MIGRATED_FIREBASE_EXTENSIONS_BIN_GROUP`, and replacement confirmation `CONFIRM_SELF_MANAGED_REPLACEMENTS_VERIFIED`.

The workflow inventories the project before and after removal and fails when a requested instance remains.

## Completion

Migration is complete only when the protected audit report contains:

```text
status: CLEAR
activeExtensionCount: 0
```

Firebase stated that additional migration guidance would be provided in September 2026. Review that official guidance when released, but do not delay the inventory and replacement work.
