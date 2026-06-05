# BIN GROUP HR Production Checklist

## Live HR modules

- Admin HR Command: `/admin/hr`
- Staff / technician HR self-service: `/technician/hr`
- Firestore collections: `staffRequests`, `staffDocuments`, `staffPayslips`, `hrProfiles`, `attendanceLogs`, `overtimeRequests`, `staffAssets`, `staffLetters`, `staffTraining`, `staffAgreements`, `salaryHistory`, `staffMoodCheckins`, `hrAiConversations`, `staffComplianceAlerts`
- Storage paths: `staffDocuments/{staffId}/...`, `hrDocuments/{staffId}/...`
- Functions: `onStaffRequestCreated`, `onStaffRequestReviewed`, `dailyHrComplianceSweep`

## Manual role test matrix

Use one test account per role and confirm access boundaries:

| Role | Expected access |
| --- | --- |
| technician | Can create own HR cases, upload own documents, read own cases/documents/mood check-ins. |
| hr_staff | Can read and process HR cases/documents except finance-sensitive workflows where product policy says finance only. |
| hr_manager | Can approve/reject HR cases and view HR command. |
| finance_staff | Can view payroll/payslip/overtime records and finance review cases. |
| admin | Can view and manage all HR command screens. |

## Smoke test

Run only with a Firebase Admin service-account JSON on a trusted local machine:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
npm run test:hr-smoke
```

The script creates a safe test staff request and checks whether notification/audit records are produced.

## Legacy functions not deleted yet

Firebase reported these cloud functions exist in production but no current source reference was found in the repo during code search:

- `adminApprovePayment`
- `adminRejectPayment`
- `rejectOwnerPaymentTransaction`
- `verifyOwnerPaymentTransaction`

Do not delete them until production logs and frontend behavior confirm no live client still calls them. Once confirmed, delete with explicit Firebase function deletion, not during a large deploy.

## Remaining external integrations

These are intentionally roadmap items until official credentials/legal approval exist:

- UAE Pass OIDC
- MoHRE/WPS direct sync
- Aani/Jaywan payments
- biometric wellness / encrypted health telemetry
- ADGM/DLT benefit governance
