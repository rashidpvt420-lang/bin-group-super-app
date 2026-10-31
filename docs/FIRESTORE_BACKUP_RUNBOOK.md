# Firestore backups and delete protection (bin-group-57c60)

Status on 2026-10-30: PITR is ON (7 days). Delete protection is **disabled**. There are **no** backup schedules.
This PR only adds the plan. Nothing is applied to production until the founder approves.

## What gets enabled
| Item | Setting |
|---|---|
| Daily backup | every day, kept 7 days |
| Weekly backup | every Sunday, kept 28 days (4 weekly) |
| Delete protection | the database cannot be deleted until this is turned off |
| PITR (existing) | point-in-time restore to any minute in the last 7 days |

## Apply (after approval)
```bash
scripts/firestore-backup-plan.sh             # dry run, prints the commands
CONFIRM_PROJECT=bin-group-57c60 scripts/firestore-backup-plan.sh --apply
```
The person running this needs `roles/datastore.owner` (or backupSchedules.create + databases.update).

## Cost estimate
- Backup storage is about US$0.03/GiB-month (nam5 multi-region is a little higher). With 7 daily + 4 weekly copies
  of a small database (well under 1 GiB), the cost should be **under US$1/month**.
- Restores are billed per GiB restored, and only when a restore is run.
- Delete protection is free.

## Restore
```bash
gcloud firestore backups list --project=bin-group-57c60 --location=nam5
gcloud firestore databases restore --project=bin-group-57c60 \
  --source-backup=projects/bin-group-57c60/locations/nam5/backups/<BACKUP_ID> \
  --destination-database=restore-<date>
```
A restore always goes to a **new** database. Production is never overwritten in place.
