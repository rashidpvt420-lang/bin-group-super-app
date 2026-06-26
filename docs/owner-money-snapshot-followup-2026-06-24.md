# Owner Money Snapshot Follow-up — 2026-06-24

## Status

Follow-up required after PR #198.

## Component

`src/owner/components/OwnerMoneySnapshotSection.tsx`

## Issue found

The rent-record form initializes its selected property from `properties[0]` during the first render. If owner properties load asynchronously after the component mounts, the form can remain with an empty `propertyId` / `propertyName`, even after properties appear in the UI.

## Required code fix

1. Import `useEffect`.
2. Add small helpers:
   - `propertyIdentifier(property)`
   - `propertyDisplayName(property)`
   - `createEmptyRentRecord(properties)`
3. Initialize form with a lazy state initializer.
4. Add an effect that syncs the form property only when:
   - properties exist, and
   - the current form does not already have a property selected.
5. Tighten save validation so the form requires:
   - non-empty tenant name
   - selected property
   - rent paid greater than zero
6. Trim text fields before `onRecordRentPayment` writes the payload.

## Reason

This prevents owner-facing payment recording from getting stuck after async property loading and prevents zero-value rent records from being saved accidentally.

## Current blocker

The attempted connector write was blocked before commit. Apply this fix from local IDE or retry via GitHub once mutation access allows it.
