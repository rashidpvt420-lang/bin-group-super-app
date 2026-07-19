# Atomic Firebase production dispatch

Use **START HERE - Firebase Production Deploy** for manual production deployments. Do not start or re-run the legacy `Firebase Production Deploy` workflow directly.

The wrapper waits for a stable `main` SHA, dispatches the protected production workflow, reads the created workflow run back from GitHub, and verifies that GitHub bound it to the same SHA. If `main` advanced during dispatch, the mismatched run is cancelled and the wrapper retries automatically up to five times.

The wrapper never deploys Firebase and receives no Google Cloud credentials. The canonical workflow remains responsible for exact-SHA enforcement, founder authorization, incident attestation, protected `production` environment approval, Workload Identity authentication, Admin MFA and recovery verification, artifact binding, and post-deployment gates.
