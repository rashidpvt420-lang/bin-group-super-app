# PR 728 rollback CI scope

Required exact-head checks before merge:

- PR Validation
- BIN GROUP CI
- Five Profile and Onboarding Audit
- Current Main Firestore Verification
- Current Main Expression Budget Repair
- Firebase Extension Manifest Guard
- iOS arm64

The rollback must remain a draft until every applicable protected check is successful. No failed, cancelled, skipped-required or `action_required` result is acceptable merge evidence.

`hardLaunchClaim=false`
