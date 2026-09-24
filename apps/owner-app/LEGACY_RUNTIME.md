# Legacy Owner Package — Non-Authoritative

The production BIN GROUP web and mobile runtime is the root application built to `dist/`.

This `apps/owner-app` package is retained only as historical/reference compatibility code. It is **not** a Firebase Hosting target, is **not** the Capacitor `webDir`, and must not become an independent production authority.

Canonical Owner runtime: `src/owner/OwnerApp.tsx` through the root `src/App.tsx` router.

Any future reuse of code from this directory must be migrated into the canonical root runtime and pass the protected repository/launch checks before deployment.
