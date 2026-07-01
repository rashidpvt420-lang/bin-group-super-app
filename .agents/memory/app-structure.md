---
name: App structure & routing quirks
description: BIN Group Super App — router layout, live vs dead components, and how to find genuine broken links per profile.
---

# Router layout
- Main app router: `src/App.tsx`. It mounts role sub-apps under prefixes: `/tenant/*`, `/technician/*`, `/broker/*`, `/owner/*` (owner allows roles `owner`,`ceo`). Also `/auditor/*` (role `auditor`).
- Sub-app routers: `src/{tenant,owner,technician,broker}/*App.tsx`. Routes inside them are RELATIVE (no role prefix) — e.g. owner `/statements` is reached at `/owner/statements`.
- Admin is a SEPARATE app: `apps/admin-panel/src/App.tsx`.

# Live vs dead components (important — don't get fooled)
- Admin LIVE nav = `apps/admin-panel/src/components/Navigation.tsx`; LIVE layout wrapper = `Layout` (used in App.tsx). 
- Admin DEAD/unused: `layout/AdminLayout.tsx` (uses `/admin/*` paths that don't match routes) and `components/AdminPremiumCommandPanel.tsx` (references e.g. `/ops/visitor-parking` with no route). Links in these are NOT real broken links because the components aren't rendered.
- `apps/owner-app/` is a LEGACY DUPLICATE of the owner app. The live owner app is `src/owner/`. Don't edit `apps/owner-app`.

# Finding genuine broken links (the real "missing" signal)
- A genuine broken link = a `navigate('/x')` or nav menu `path:'/x'` in a RENDERED component that has no matching `<Route>`. 
- Many page files exist but are unrouted ("orphans"); an orphan is only a real gap if a live nav element points to it. Admin has ~12 built-but-shelved ops pages (parcel desk, visitor parking, amenities, announcements, key register, etc.) that are intentionally not wired to the live Navigation.
- Owner property "view" buttons target `/owner/property-passport/:id`; the detail page `OwnerPropertyPassportContractDetailPage` resolves its `:passportId` param against id OR propertyId OR passportId (see its matcher), so passing a property id works.
- Per-ticket chat pattern: `maintenanceTickets/{ticketId}/messages` subcollection, one chat page per role (`Tenant/Technician/OwnerChatPage`), routed at `/chat/:ticketId`. Auth check per role: tenant `tenantId==uid`; owner `ownerId||ownerUid==uid || ownerEmail==email`.
