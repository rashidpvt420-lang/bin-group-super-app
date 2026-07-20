# BIN GROUP Admin Command Center

The dedicated Admin application is the protected operations surface for BIN GROUP. Privileged mutations must be performed through authenticated server callables with Admin/founder authorization, App Check, MFA-aware session controls, and immutable audit evidence.

## Operational authority

| Area | Protected capability |
|---|---|
| Users and staff | Provision through the Staff Access page backed by `adminCreateUser` |
| Owners and onboarding | Review identity, payment, contract, property, and activation evidence |
| Tenants | Review residence binding, tickets, access records, and disputes |
| Technicians | Review approval, compliance, assignment, lifecycle, and proof evidence |
| Brokers | Review KYC, attribution, commission, and payout evidence |
| Finance | Review payment, invoice, reconciliation, and payout records |
| Incidents | Suspend actors, re-dispatch work, record incident state, and preserve rollback evidence |

## Admin identity and MFA

Admin access is authoritative only when Firebase Auth claims, the Firestore profile, Admin approval state, and required MFA/session controls agree. The Admin security profile must fail closed when authoritative server data is unavailable.

Initial founder/Admin recovery must follow the protected bootstrap workflow and the runbooks under `docs/launch/`. It must not be performed by editing Firestore, setting custom claims locally, or creating passwords with workstation scripts.

## Staff provisioning

Use the dedicated Admin panel Staff Access page. It invokes the server-authoritative `adminCreateUser` callable, which validates the caller and writes the required Auth, profile, staff/technician, HR, and audit records.

The retired `scripts/grant-admin.mjs` entrypoint intentionally refuses execution. No local service-account file or Application Default Credentials workflow is an approved Admin escalation path.

## Audit and evidence

Privileged actions must produce server-authored audit evidence. Client applications must not write directly to protected audit, financial, activation, commission, payout, or access-control records.

## Deployment

Production changes are deployed only through `.github/workflows/firebase-production-deploy.yml` from the exact current `main` SHA. Local or partial Firebase deployments are prohibited, including emergency recovery attempts.

## Public-launch status

A functioning Admin panel does not by itself authorize public launch. The protected deployment, hosted App Check, Admin MFA, live five-profile evidence, SMTP, payment proof, controlled pilot, incident state, and final signed decision must all bind to the same exact SHA and workflow evidence chain.
