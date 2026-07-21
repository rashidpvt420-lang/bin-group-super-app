# Firebase Phone Auth Production Gate

Public and controlled-pilot deployments must use real Firebase Authentication SMS verification. Static Firebase test phone numbers are permitted only in isolated emulator or staging projects and must not exist in the production Identity Toolkit configuration.

The protected deployment runs `verifyFirebasePhoneAuthProduction()` before the first Firebase deploy command. The gate requires:

- project `bin-group-57c60` and project number `123413252227`;
- Phone Authentication enabled;
- Identity Platform MFA state `ENABLED` or `MANDATORY`;
- required production domains authorized;
- SMS region policy set to allowlist-only with `AE` allowed;
- exactly zero configured `signIn.phoneNumber.testPhoneNumbers` entries.

A non-zero production test-number count fails before Hosting, Functions, Firestore, or Storage is changed. Generated deployment evidence stores only the aggregate count (`0`) and never includes phone numbers, verification codes, or other authentication secrets.

## Operator procedure

Do not run the protected `Firebase Production Deploy` workflow directly.

1. Open Firebase Console → Authentication → Sign-in method → Phone.
2. Remove every static test phone number and code from the production project.
3. Confirm the UAE SMS allowlist and authorized production domains.
4. Start a **new** run of `START HERE - Firebase Production Deploy`.
5. Use truthful bank-pilot or public inputs. The dispatcher binds the exact stable `main` SHA and derives incident/failure recovery before starting the protected workflow.
6. Do not re-run an older failed dispatcher form; start a new run so the current workflow schema is used.
7. After deployment, complete one real Owner SMS verification on a physical device.
8. Retain only non-sensitive audit evidence such as `OWNER_PHONE_VERIFIED_SYNCED`; never store the SMS code or full authentication transcript.

The exact-main dispatcher is the only operator entrypoint. The protected deployment remains the enforcement boundary and refuses to deploy when the production phone-auth configuration is unsafe.
