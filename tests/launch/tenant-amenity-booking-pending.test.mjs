// N-14: the tenant amenity booking client must create bookings as 'pending' so it matches the
// Firestore rule that forbids tenant self-confirmation (status 'booked'/'approved').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../../src/tenant/pages/TenantAmenitiesPage.tsx', import.meta.url), 'utf8');

test('tenant amenity booking is created pending, never self-confirmed', () => {
  const create = page.slice(page.indexOf("addDoc(collection(db, 'amenityBookings')"), page.indexOf('setOpenAdd(false)'));
  assert.match(create, /status: 'pending'/);
  assert.doesNotMatch(create, /status: '(booked|approved|confirmed)'/);
  assert.doesNotMatch(create, /approved(At|By)/);
});
