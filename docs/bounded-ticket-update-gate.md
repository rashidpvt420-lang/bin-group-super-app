# Bounded ticket update authorization

Firestore evaluates every matching `allow` expression. Four overlapping ticket update rules caused denied writes to exhaust the 1,000-expression evaluator budget even though the tests ultimately denied the mutations.

The canonical policy now exposes one `allow update: if safeTicketUpdateByActor();` rule per ticket collection. The shared router short-circuits by authenticated actor class before invoking database-backed suspension, assignment, approval, and append-only evidence checks.

This change does not broaden client authority. Admin, dispatcher, tenant, and technician constraints remain fail-closed and the global catch-all continues to exclude both ticket collections.
