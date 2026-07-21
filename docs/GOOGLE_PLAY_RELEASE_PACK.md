# BIN GROUP Google Play Release Checklist

Last updated: 2026-07-21

This checklist keeps the Google Play submission aligned with the exact production build. It is operator guidance, not launch evidence. Static “passing” statements in this document must never be treated as proof.

## Evidence policy

Before any store release, record the exact current `main` SHA and the successful workflow run IDs that produced the deployed app and mobile bundle.

Required evidence must come from protected workflows and real devices:

- latest `main` CI and PR Validation are green;
- a new `START HERE - Firebase Production Deploy` run succeeds in `bank-pilot` or `public` mode for the exact release SHA;
- the protected production run dispatched by it succeeds;
- `Live Role Smoke Tests` succeeds in `live-evidence` mode for that same SHA;
- authenticated Admin, Owner, Tenant, Technician, and Broker checks are passed, not skipped;
- Firebase Phone Auth production preflight reports zero static test phone numbers;
- App Check, SMTP, Firestore, Storage, Functions, and route evidence are current and same-SHA;
- the signed Android App Bundle is generated from that exact commit.

For unrestricted public release, the protected hard-clearance chain, verified 24-hour pilot, public postdeploy gate, real Stripe live proof, and final signed `hardLaunchClaim=true` decision must also pass.

## 1. Production deployment entrypoint

Do not run the protected `Firebase Production Deploy` workflow directly.

Start a **new** run of:

`START HERE - Firebase Production Deploy`

The dispatcher stabilizes current `main`, binds the exact SHA, derives incident/failure recovery, and starts the protected deployment. Never re-run an old failed dispatcher form after its workflow schema has changed.

## 2. App must install and load properly

Before production submission:

- Generate a signed Android App Bundle from the exact green release commit.
- Use a unique, incremented Android version code.
- Upload the bundle to Google Play internal testing first.
- Install it from internal testing on a real Android device.
- Confirm the installed build matches the expected package and release version.
- Confirm the app opens without a blank screen.
- Confirm the login screen renders correctly.
- Confirm public pages open: home, login, owners, tenants, technicians, brokers, company, support, privacy, and terms.
- Confirm Privacy Policy and Terms open from inside the app.
- Confirm Android back navigation does not trap users on blank pages.
- Confirm maps/location screens show either a working map or the manual location fallback.
- Confirm the launcher icon, adaptive icon, round icon, and splash screen render correctly.

## 3. Store listing must match the real app

Use accurate wording only.

### App name

BIN GROUP

### Short description

Property maintenance and management portal for owners, tenants, technicians, brokers, and administrators.

### Full description

BIN GROUP is a UAE-focused property maintenance and property management platform for role-based service coordination. The app supports property owners, tenants, technicians, brokers, and administrators with digital workflows for property operations, maintenance requests, service coordination, documentation, and operational follow-up.

Access depends on the user’s assigned role and permissions. Some workflows require an approved account, linked property record, or administrator setup before they become available.

BIN GROUP is designed for property maintenance, facility coordination, and property-management operations in the UAE.

### Users can expect

- Role-based login.
- Public information and verification pages.
- Owner, Tenant, Technician, Broker, and Admin portal access where authorized.
- Maintenance and property-management workflow visibility where enabled.
- Firebase-backed authentication, database, storage, hosting, and cloud functions.
- Secure access controls based on account role.

## 4. Reviewer access must use least privilege

Provide reviewer credentials only inside Google Play Console under App access.

Do not publish reviewer passwords in the repository, public website, screenshots, support documents, or store listing.

Use dedicated reviewer accounts created specifically for store review:

- Never provide the founder, CEO, Super Admin, or production operator account.
- Use the minimum role and permissions necessary to review each workflow.
- Provide separate role-specific reviewer accounts when one account cannot legitimately access all portals.
- Keep reviewer accounts isolated from real customer, payment, property, and staff data.
- Rotate or disable reviewer credentials after the review window when operationally appropriate.

Recommended reviewer declaration:

- Login required: Yes.
- Login screen: open the app and tap Login.
- Account type: dedicated Google Play reviewer account.
- Instructions: use the role-specific credentials supplied in the App access section. Some Owner, Tenant, Technician, Broker, and Admin workflows require separate reviewer accounts and prepared test data.

## 5. Category must fit the real service

Recommended category:

- Business

Potential alternatives only when they accurately match the submitted app:

- House & Home
- Productivity

Do not select regulated categories merely for marketing positioning.

## 6. Do not overclaim unverified features

Allowed wording:

- Designed to support property maintenance and management workflows.
- Role-based portals for owners, tenants, technicians, brokers, and administrators.
- Maintenance request and operational coordination features where enabled.
- Production-backed Firebase infrastructure.

Avoid wording unless it is live-tested, legally approved, and operational:

- Guaranteed government approval.
- Guaranteed repair coverage.
- Insurance-backed protection.
- Fully autonomous AI property management.
- Guaranteed ROI.
- Every technician is GPS tracked in real time.
- AI predicts every building failure.
- Official government partner.

## 7. Data Safety must reflect actual production behavior

Declare only data that the submitted production build actually collects, transmits, stores, or shares.

Review the production implementation and completed Data Safety form together. Potential categories requiring verification include:

- Personal information such as name, email address, and phone number.
- User IDs such as Firebase Authentication UID and role identifiers.
- Location when GPS or location features are active.
- Photos and files uploaded for maintenance evidence or documents.
- App activity such as requests, tickets, operational actions, and dashboard usage.
- Diagnostics only when analytics, logging, or crash reporting collects them.

Do not copy assumptions from this document into Play Console. Verify every declaration against the exact release build and configured services.

## 8. Reviewer notes

Use a concise note such as:

> BIN GROUP is a UAE property maintenance and property management platform with role-based access for Admin, Owner, Tenant, Technician, and Broker workflows. Some functionality requires a prepared reviewer account, role assignment, and linked test data. Please use the role-specific credentials and instructions entered in the App access section. The app uses Firebase Authentication, Firestore, Storage, Hosting, and Cloud Functions.

## Final submission gate

Submit only when all applicable items are true:

- Google Play developer verification and account standing permit submission.
- The release commit SHA is recorded.
- Latest CI, PR Validation, and mobile readiness are green for that SHA.
- A new exact-main production dispatch has succeeded.
- Same-SHA live role tests are passed, not skipped.
- Production Firebase Phone Auth contains zero static test numbers.
- The signed Android App Bundle installs through internal testing on a real device.
- Package name, version code, launcher assets, and app behavior match the intended release.
- Privacy Policy, Terms, support, and account-access instructions open correctly.
- Dedicated least-privilege reviewer credentials are entered in Play Console App access.
- Store listing and Data Safety declarations match the exact production build.
- No unresolved P0/P1 release blocker remains.
- For unrestricted public launch, the final protected signed decision has `hardLaunchClaim=true`.
