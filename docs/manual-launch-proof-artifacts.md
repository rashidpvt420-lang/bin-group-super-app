# Artifact-Bound Manual Launch Proof

Manual proof is limited to provider and device checks that cannot be fully automated, such as real-device notification receipt, physical mobile layout verification, or a documented provider-console observation.

Text alone is not launch evidence. Every manual `passed` entry must be bound to:

- a non-empty artifact inside `launch_package/artifacts/`;
- the SHA-256 digest and exact byte size of that artifact;
- the current git commit SHA;
- an explicit tester name;
- an explicit ISO test timestamp no older than 30 days;
- `evidenceType: manual-artifact`;
- `executionGenerated: false` and `hardLaunchClaim: false`.

Use:

```bash
npm run launch:pass -- \
  --gate <provider-or-device-gate> \
  --proof "What was tested, where, and the observable result" \
  --artifact launch_package/artifacts/<evidence-file> \
  --tester "<tester name>" \
  --testedAt "<ISO timestamp>"
```

The recorder rejects missing files, empty files, files outside the artifact directory, future timestamps, unknown gates, waived gates, and every deployment gate.

Hosting, Functions, Firestore, Storage, App Check, live role workflows, Stripe payment/webhook evidence, and signed public clearance must come from the protected production workflows. They cannot be manually marked passed.

After recording manual proof, run:

```bash
npm run test:launch-clearance
```

Clearance recomputes the artifact hash and size, confirms the evidence belongs to the current commit, and rejects evidence older than 30 days or any modified/missing artifact.
