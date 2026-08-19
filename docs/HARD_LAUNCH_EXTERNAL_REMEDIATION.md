# Final Hard-Public-Launch External Remediation

This runbook is for the two controls that cannot be changed by the connected GitHub app itself: GitHub branch protection and Android upload-key rotation.

## Preconditions

- Work from a trusted Windows machine.
- GitHub CLI (`gh`) must be authenticated as the repository owner/admin.
- Java 21 `keytool` must be available.
- Do not generate or copy the replacement Android private key into the repository.

## One-shot remediation

From the repository checkout:

```powershell
git fetch origin
git switch agent/final-hard-launch-external-remediation
git pull --ff-only
pwsh -ExecutionPolicy Bypass -File scripts/fix-hard-launch-external-blockers.ps1
```

The script will:

1. Pin and verify the exact current `main` SHA.
2. Enable strict `main` protection, admin enforcement, PR-only changes, linear history, no force pushes/deletion, conversation resolution, and signed commits.
3. Generate a fresh RSA-4096 Android upload key under `$HOME/.bin-group/android-signing/<timestamp>`.
4. Refuse any output directory inside the Git checkout.
5. Refuse the known compromised upload-certificate SHA-256 fingerprint.
6. Rotate the four GitHub `production` Android signing environment secrets.
7. Export the new public PEM certificate for Google Play.
8. Verify that `main` did not move during remediation.

The script intentionally does **not** print the keystore passwords or private-key material.

## Google Play upload-key reset

After the script succeeds, use the generated `bin-group-upload-certificate.pem` from the private rotation directory.

In Google Play Console, as the account owner, open the app's Play App Signing / App Integrity area and request an **upload key reset**. Submit the generated PEM certificate when prompted.

The old upload certificate must not be reused. Resetting an upload key under Play App Signing does not change the Google-held app signing key used for users' installed apps.

## Evidence to preserve privately

Keep the generated private rotation directory secure. It contains:

- replacement upload keystore
- local recovery secret backup
- public PEM certificate
- `rotation-manifest.json` with the new SHA-256 fingerprint and exact-main SHA

Never commit this directory or copy it into the repository.

## Final GO sequence

Only after GitHub reports `main` protected **and** Google Play has accepted the replacement upload certificate:

1. Merge this PR only after all CI checks are green.
2. Capture the resulting verified exact `main` SHA.
3. Confirm `main` remains protected and signed-commit enforcement is enabled.
4. Run the Founder One-Shot Protected Release Orchestrator for that exact SHA.
5. Require successful Firebase production deployment, hosted App Check, five-profile live evidence, security/rules checks, and a newly signed Android AAB using the rotated upload key.
6. Do not declare `HARD PUBLIC LAUNCH: GO` if any exact-SHA production evidence is missing or if `main` moves during the release.
