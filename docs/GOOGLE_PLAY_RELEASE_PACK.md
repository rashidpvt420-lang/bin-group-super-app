# BIN GROUP Google Play Release Checklist

Last updated: 2026-05-13

This checklist keeps the Play Store submission aligned with the production app. It avoids overclaiming and gives reviewers clear access instructions.

## Current Verified Status

- Firebase production deployment: passing.
- Main Hosting deployment: passing.
- Admin Hosting deployment: passing.
- Firestore rules and indexes: passing.
- Storage rules: passing.
- Cloud Functions: passing.
- Scheduled functions: passing.
- Live public smoke tests: passing.
- Live role smoke workflow: passing.

Role-login tests must be confirmed as passed, not skipped, by checking the Live Role Smoke Tests log for Admin, Owner, Tenant, Technician, and Broker lines.

## 1. App Must Install and Load Properly

Before production submission:

- Generate a signed Android App Bundle from the latest green production commit.
- Upload it to Google Play internal testing first.
- Install from internal testing on a real Android device.
- Confirm the app opens without a blank screen.
- Confirm the login screen renders email and password fields.
- Confirm public pages open: home, login, owners, tenants, technicians, brokers, company, support, privacy, and terms.
- Confirm Privacy Policy and Terms URLs open from inside the app.
- Confirm Android back navigation does not trap users on blank pages.
- Confirm maps/location screens show either a working map or the manual location fallback.

## 2. Store Listing Must Match the Real App

Use accurate wording only.

### App name

BIN GROUP

### Short description

Property maintenance and management portal for owners, tenants, technicians, brokers, and admins.

### Full description

BIN GROUP is a UAE-focused property maintenance and property management platform for role-based service coordination. The app supports property owners, tenants, technicians, brokers, and administrators with digital workflows for property operations, maintenance requests, service coordination, documentation, and operational follow-up.

Access depends on the user's account role and permissions. Some workflows require an approved account, linked property record, or administrator setup before they are available.

BIN GROUP is designed for property maintenance, facility coordination, and property management operations in the UAE.

### Users can expect

- Role-based login.
- Public information pages.
- Owner, tenant, technician, broker, and admin portal access where authorized.
- Maintenance and property-management workflow visibility where enabled.
- Firebase-backed authentication, database, storage, hosting, and cloud functions.
- Secure access controls based on account role.

## 3. Reviewer Login Credentials

Provide reviewer credentials only inside Google Play Console under App access.

Do not publish reviewer passwords in the repository, public website, screenshots, or store listing.

Recommended reviewer declaration:

- Login required: Yes.
- Login screen: open the app and tap Login.
- Account type: Admin reviewer test account.
- Instructions: Use the provided reviewer account to inspect the Admin portal and available production workflows. Owner, Tenant, Technician, and Broker portals are role-based and may require separate test accounts.

## 4. Category Must Fit Business/Service App

Recommended Google Play category:

- Business

Acceptable alternatives if needed:

- House & Home
- Productivity

Avoid regulated categories unless formally required:

- Finance
- Government
- Medical or Health

## 5. Do Not Overclaim Features Not Currently Working

Allowed wording:

- Designed to support property maintenance and management workflows.
- Role-based portals for owners, tenants, technicians, brokers, and admins.
- Maintenance request and operational coordination features where enabled.
- Production-backed Firebase infrastructure.

Avoid wording unless live-tested, legally approved, and operational:

- Guaranteed government approval.
- Guaranteed repair coverage.
- Insurance-backed protection.
- Fully autonomous AI property management.
- Guaranteed ROI.
- Every technician is GPS tracked in real time.
- AI predicts every building failure.
- Official government partner.

## Data Safety Draft

Declare only what the production app actually collects.

Likely data categories:

- Personal info: name, email address, phone number where collected.
- User IDs: Firebase Authentication UID and role identifiers.
- Location: only where location/GPS features are active.
- Photos/files: only where users upload maintenance photos or documents.
- App activity: requests, tickets, operational actions, dashboard usage.
- Diagnostics: only if analytics or crash reporting is active.

## Reviewer Notes

Use this note in Google Play Console:

BIN GROUP is a UAE property maintenance and property management platform with role-based access for Admin, Owner, Tenant, Technician, and Broker workflows. Some functionality requires a test account and existing role assignment. Please use the reviewer login credentials entered in the App access section. The app uses Firebase Authentication, Firestore, Storage, Hosting, and Cloud Functions.

## Final Submission Gate

Submit only after:

- Production deploy is green.
- Live Role Smoke Tests are green.
- Authenticated role tests are confirmed as passed, not skipped.
- Signed Android App Bundle installs through internal testing.
- Privacy Policy opens.
- Terms opens.
- Reviewer credentials are entered in Play Console App access.
- Store listing does not claim untested future features.
- Category is Business or another accurate service category.
