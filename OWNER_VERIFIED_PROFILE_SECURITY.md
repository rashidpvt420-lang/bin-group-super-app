# Owner verified profile security

Sensitive Owner profile changes are accepted only through `updateVerifiedOwnerProfile`.

The callable validates the live Firebase Auth user, Owner role and suspension state, verified phone authority, verified billing email, and Owner KYC legal identity. It writes the profile and an immutable before/after audit record in one Firestore transaction.

The Owner UI no longer writes phone, company identity, or billing contact fields directly to Firestore.
