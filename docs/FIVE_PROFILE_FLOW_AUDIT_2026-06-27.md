# BIN GROUP Super App — Five Profile Flow Audit

Date: 2026-06-27
Branch: fix/profile-flow-audit

## Status

This audit separates verified repo state from remaining product gaps.

## Confirmed code gap

Tenant dashboard has service buttons for notices, keys, parcels, visitor parking, marketplace, staff directory, messages, and community. Current TenantApp routes do not register these service paths. Add routed pages or a shared tenant service hub page before pilot testing.

## Production blockers

- Stripe live mode is not proven by code alone.
- Firebase App Check production enforcement is not proven by code alone.
- Branded email sender verification is not proven by code alone.
- Admin secret/password rotation must be verified in live configuration.
- Five-profile live smoke test must use linked Owner, Tenant, Technician, Broker, and Admin records.

## Flow principle

Every core action must close the loop: action → proof → approval → notification → PDF/document → audit log.
