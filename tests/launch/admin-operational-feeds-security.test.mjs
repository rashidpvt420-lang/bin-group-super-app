import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ticketBinding = readFileSync('scripts/apply-ticket-rule-binding.mjs', 'utf8');
const liveLocationHardener = readFileSync('scripts/harden-technician-live-location-authority.mjs', 'utf8');

test('canonical maintenance ticket list authority keeps technician scope and adds dispatch authority separately', () => {
  assert.match(
    ticketBinding,
    /allow list: if canListAssignedTechnicianTicket\(resource\.data\);/,
    'Technician list access must remain assignment-bound',
  );
  assert.match(
    ticketBinding,
    /allow list: if isNotSuspended\(\) && canDispatchJobs\(\);/,
    'Admin and dispatcher list access must be explicit and suspension-aware',
  );
  assert.match(ticketBinding, /canonical \/maintenanceTickets/);
});

test('canonical live technician locations remain server-write-only and dispatch-read-only', () => {
  assert.match(liveLocationHardener, /match \/technician_live_locations\/\{technicianId\} \{/);
  assert.match(liveLocationHardener, /allow read: if canDispatchJobs\(\);/);
  assert.match(liveLocationHardener, /allow create, update, delete: if false;/);
  assert.doesNotMatch(
    liveLocationHardener,
    /match \/technician_live_locations[\s\S]{0,300}allow (?:read|write)[^;]*(?:owner|tenant|broker)/i,
  );
});
