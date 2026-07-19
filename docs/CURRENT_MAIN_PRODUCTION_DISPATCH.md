# Current-main Firebase production dispatch

Use the **Start Firebase Production Deploy** workflow for manual production deployments.

The wrapper resolves the current `main` commit inside GitHub immediately before dispatching the protected `Firebase Production Deploy` workflow. It forwards that exact commit as `expected_commit_sha`, preventing stale copy-and-paste SHA failures while preserving the canonical workflow's exact-SHA comparison, founder confirmations, protected `production` environment, Workload Identity authentication, Admin MFA/recovery preflight, and post-deployment gates.

The wrapper never deploys Firebase directly and does not receive Google Cloud credentials. All deployment authority remains in `firebase-production-deploy.yml`.
