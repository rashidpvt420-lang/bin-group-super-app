# Broker payout OTP security

Broker payout requests use a complete server-authoritative sequence:

1. The Broker requests a code for an exact sorted commission set.
2. The server validates live Auth, role, suspension, verified email, KYC, agreement and verified IBAN.
3. A six-digit code is hashed with a random salt, rate limited and delivered to the verified Broker email.
4. Verification creates short-lived evidence bound to Broker UID, commission IDs, AED currency and exact amount.
5. Submission atomically revalidates commissions, consumes the evidence once, creates the payout request and records an immutable audit entry.

The client cannot submit a payout without a verified challenge ID. SMTP secrets and production App Check must be configured before deployment.
