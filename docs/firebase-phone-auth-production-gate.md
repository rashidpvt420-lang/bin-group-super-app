# Firebase Phone Auth Production Gate

Public deployment must use real Firebase Authentication SMS verification. Static Firebase test phone numbers are permitted only in isolated emulator or staging projects and must not exist in the production Identity Toolkit configuration.

The protected deployment entrypoint calls `verifyFirebasePhoneAuthProduction()` before the first Firebase deploy command. The gate requires:

- project `bin-group-57c60` and project number `123413252227`;
- Phone Authentication enabled;
- Identity Platform MFA state `ENABLED` or `MANDATORY`;
- required production domains authorized;
- SMS region policy set to allowlist-only with `AE` allowed;
- exactly zero configured `signIn.phoneNumber.testPhoneNumbers` entries.

A non-zero test-number count fails deployment before Hosting, Functions, Firestore, or Storage are changed. The generated deployment evidence stores only the aggregate count (`0`) and never includes phone numbers or verification codes.

Before dispatching the production workflow:

1. Open Firebase Console → Authentication → Sign-in method → Phone.
2. Remove every test phone number and static code from the production project.
3. Confirm the UAE SMS allowlist and authorized production domains.
4. Run the protected Firebase Production Deploy workflow; do not bypass the preflight.
5. Complete one real Owner SMS verification after deployment and retain only non-sensitive audit evidence (`OWNER_PHONE_VERIFIED_SYNCED`).
