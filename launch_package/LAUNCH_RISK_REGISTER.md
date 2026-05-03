# LAUNCH RISK REGISTER: STAGE 5 COMMERCIALIZATION

| Risk ID | Risk Description | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **R01** | Wrong Tenant Email in CSV | Low | Admin Manual Override: Emails can be corrected in Tenant Registry. |
| **R02** | Duplicate Unit Number in Batch | Medium | **Hard Validation:** Bulk Import Tool rejects duplicates at the validation stage. |
| **R03** | Owner Document Mismatch | Medium | **Human-in-the-loop:** All property submissions require manual Admin approval. |
| **R04** | Unpaid Rent Dispute | High | **Ledger Proof:** Provide tenant with a clear, timestamped statement of account from the app. |
| **R05** | Failed Invitation Email | Medium | **Monitoring:** Sovereign Control Center flags all SendGrid failures for immediate resend. |
| **R06** | SMTP Provider (SendGrid) Issue | Low | **Redundancy:** Maintain a backup SMTP key or switch to Firebase Email trigger secondary. |
| **R07** | Firestore Permission Leak | High | **Security Audit:** Maintain strict "owner-only" and "tenant-only" Firestore rules. |
| **R08** | Wrong Property Linkage | Medium | **Pre-Import Check:** All imports require selecting the target property explicitly. |
| **R09** | Tenant Support Overload | High | **Maintenance Tiering:** Onboard maintenance teams *before* tenants to handle the initial SOS surge. |
| **R10** | UAE VAT Compliance Error | Medium | **Tax Logic:** All pricing models include a standard 5% VAT calculation field. |

## Response Team
- **Technical Risk:** Lead Engineer (Backend)
- **Operational Risk:** Operations Manager
- **Commercial Risk:** CEO / Business Development
