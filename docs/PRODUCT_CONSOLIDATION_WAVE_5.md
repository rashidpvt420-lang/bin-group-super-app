# Product Consolidation Wave 5 — Canonical Workforce Lifecycle

Base protected main: `3de1d0172ef0481468723f34bfa11d0f15c8f61f`

## Scope

Wave 5 removes competing employee-management authority from the Admin experience and establishes **HR Command** as the single employee lifecycle workspace.

Canonical employee journey:

`Staff Registry → protected staff profile → invitation/onboarding → attendance/leave → HR documents → payroll evidence → offboarding/audit`

This wave does **not** merge the stale Admin/HR PRs #1064 or #1069. Useful concepts were reimplemented on a fresh branch from the verified Wave 4 main.

## Authority model

### Founder / full Admin

- can provision staff identities through **HR Command → Staff Access**,
- can change role/module access through the protected provisioning callables,
- can manage HR profile/onboarding/offboarding.

### HR Admin / HR Manager

- can read the protected staff lifecycle,
- can edit public employment/private HR profile fields,
- can update onboarding prerequisites and activation approval,
- can manage attendance, leave and HR document metadata,
- can resend invitations and offboard staff,
- cannot create arbitrary new staff/access roles through Staff Access.

### HR Staff

- protected read-only lifecycle access,
- private identity/salary fields remain server-redacted,
- no activation/profile/offboarding authority.

### Operations / Dispatcher technician access

- `/technicians` is now an **operational roster** only,
- reads duty, availability, workload, geography and specialization through `adminGetTechnicianOperationsDirectory`,
- does not create Auth identities,
- does not update HR/private-HR fields,
- does not offboard staff.

Authorized lifecycle managers deep-link from Technician Corps to `HR Command` using `/hr?staff=<uid>`.

## Protected lifecycle backend

`functions/adminStaffLifecycle.ts` now provides:

- `adminGetStaffLifecycle` — HR-reader protected registry,
- `adminGetStaffDetails` — exact-staff details with manager-only private fields/payroll evidence,
- `adminGetTechnicianOperationsDirectory` — redacted operational Technician directory,
- `adminUpdateStaffProfile` — manager-only canonical profile update,
- `adminUpdateStaffOnboarding` — staged activation authority,
- `adminResendStaffInvitation` — manager-only invitation replay,
- `adminOffboardStaff` — fail-closed Auth disable, refresh-token revocation and preserved history.

All callables remain App Check-enforced in `europe-west3`.

## Partial-update integrity repair

The previous shared staff-profile updater could reset omitted private-HR fields when a narrow Technician edit supplied only operational fields. Wave 5 changes the updater to preserve omitted values:

- employee ID,
- Emirates ID,
- passport/visa fields,
- contract/employment fields,
- salary and allowances,
- emergency contact,
- Technician geography/capacity settings.

An omitted field is preserved; an explicitly supplied empty value can still clear a nullable field when HR intends to do so.

## Onboarding state

The protected onboarding state is now explicit:

`INVITED → EMAIL_VERIFIED → PROFILE_COMPLETE → DOCUMENTS_COMPLETE → CONTRACT_COMPLETE → DEVICE_READY (Technician) → ACTIVE`

`ACTIVE` requires all prerequisites plus HR activation approval. Suspended/offboarded identities cannot be reactivated through onboarding.

## Offboarding

Canonical offboarding:

- forbids self-offboarding,
- sets custom claims `suspended` and `offboarded`,
- disables Firebase Auth,
- revokes refresh tokens,
- archives Staff Access/HR/Technician active state,
- preserves work, payroll and audit history,
- records `OFFBOARDED` rather than pretending deletion occurred.

## Property Contacts remain separate

`/ops/staff-directory` remains the **Property Contacts Directory**. It is building-facing contact data only and explicitly does not create Firebase Auth users, HR profiles, payroll identities or Technician accounts. It is not an employee lifecycle authority and is intentionally not merged into HR Command.

## Regression coverage

`tests/launch/product-consolidation-wave-5.test.mjs` locks:

- HR reader/manager authority parity,
- Founder/Admin-only Staff Access visibility,
- manager-only private fields and lifecycle writes,
- preservation of omitted HR/private-HR fields,
- staged onboarding,
- fail-closed offboarding,
- operational-only Technician Corps,
- separation of Property Contacts from employees.

## Explicit non-goals

- No production deployment.
- No hard-public-launch claim.
- No Auth, App Check, Firestore or Storage security weakening.
- No merge of stale #1064 / #1069.
- No automatic creation of staff from the Technician operational roster.
- No claim that CI replaces physical-device or production role evidence.

## Required verification before merge

The exact Wave 5 PR head must complete the full protected PR chain successfully, including PR Validation, BIN GROUP CI, Play Integrity validation, Firestore verification, Five Profile / Onboarding audit and every automatically triggered protected check. Any new exact head invalidates prior-head results.
