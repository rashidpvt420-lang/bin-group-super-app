# Mobile Privileged Account Cleanup Review

BIN GROUP production retains exactly one privileged identity: `ceo@bin-groups.com`.

Use **Actions → Privileged Account Cleanup Dry Run → Run workflow** from a phone. Enter `REVIEW_PRIVILEGED_ACCOUNT_CLEANUP_BIN_GROUP`.

The workflow is read-only. It reports aggregate privileged-account and deletion-target counts, preserves audit logs, excludes secret values and does not modify Firebase Authentication or Firestore.

Owner, Tenant, Technician and Broker accounts without privileged Admin/staff claims are outside the cleanup scope.

After obsolete privileged identities are removed through approved Firebase administration, rerun the dry run. The expected result is one privileged account, zero deletion targets and `canonicalFounderReady=true`.

This review does not claim production deployment, controlled-pilot clearance or public launch.
