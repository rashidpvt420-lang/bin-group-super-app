# Canonical Property Geo Authority

## Submission boundary

Owner-facing onboarding stores location evidence in `submittedGeo`. Browser-submitted evidence is always pending review:

- `verified: false`
- `dispatchReady: false`
- `requiresGeoReview: true`
- no browser-supplied verifier identity or verification timestamp

Owner and Admin browser sessions cannot create or mutate canonical `geo`, trusted geo aliases, or verification metadata.

## Promotion boundary

Only the App Check and Founder-MFA protected `adminReviewOwnerProperty` callable may promote reviewed evidence into canonical property geography. The transaction validates coordinate ranges and required address fields, then writes:

- canonical Firestore `GeoPoint`
- normalized latitude and longitude
- Founder verifier identity
- server verification timestamp
- approved `admin_manual` source
- `verified: true`
- `dispatchReady: true`
- `requiresGeoReview: false`

The same transaction records review and audit evidence. The legacy Admin property-review page uses this callable rather than direct Firestore approval writes.

## Rules and generator boundary

The explicit `/properties/{propertyId}` rules protect canonical geo fields. The global Admin browser fallback also excludes `properties`, and the deterministic Firestore hardening scripts preserve that stronger exclusion through final-authority and private-HR normalization.

Emulator tests prove that Owners cannot forge canonical pins, Owners may revise only explicitly unverified submissions, and Admin browser writes cannot bypass the canonical server boundary.

This document describes source authority. It is not migration evidence, production-deployment evidence, physical-device evidence, or a public-launch claim.
