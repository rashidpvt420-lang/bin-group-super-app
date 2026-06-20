# Public Launch Admin Route

After this PR is merged and build hooks run, the admin launch command center is available at:

`/ops/public-launch-command`

Purpose:

- Record proof for every required launch gate.
- Keep launch status honest.
- Prevent fake public-launch readiness.
- Give admin a single place to record tester/device/role/proof references.

The page saves evidence into Firestore collection:

`launch_evidence`
