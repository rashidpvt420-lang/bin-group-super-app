## Change

Added a GitHub-only dispatcher that resolves `main` at execution time and forwards the resulting commit SHA into the existing protected Firebase production workflow.

## Security boundary

The wrapper cannot deploy Firebase. The canonical production workflow still performs exact-SHA validation, founder authorization, incident attestation, protected-environment approval, Workload Identity authentication, Admin MFA/recovery verification, artifact binding, and release gates.
