# Tenant correction security

Tenant correction requests are created and read through App Check-protected callables. The server captures the current value, verifies Tenant or Admin authority, restricts fields, rejects duplicate pending requests, and records append-only request events plus immutable audit entries. Admin approval revalidates the live record before applying a change, so stale requests cannot overwrite newer profile or lease data. Direct unit assignment remains in the separate Tenant unit-link review workflow.
