# Privileged Cleanup Mobile Checklist

- Retain only `ceo@bin-groups.com` as the privileged production account.
- Confirm the canonical founder is active, email-verified and phone-MFA enrolled.
- Run the protected cleanup dry run from GitHub Actions before any irreversible Firebase account deletion.
- Review only aggregate counts; no email addresses, UIDs or phone numbers are published.
- Preserve ordinary Owner, Tenant, Technician and Broker accounts.
- Preserve `audit_logs`.
- Do not claim production readiness until the dry run reports zero obsolete privileged targets.
