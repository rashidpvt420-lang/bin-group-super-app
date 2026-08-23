import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ticketBinding = readFileSync('scripts/apply-ticket-rule-binding.mjs', 'utf8');
const liveLocationHardener = readFileSync('scripts/harden-technician-live-location-authority.mjs', 'utf8');

test('canonical maintenance ticket list authority explicitly includes dispatch authority', () => {
  assert.match(
    ticketBinding,
    /allow list: if isNotSuspended\(\) && \(canDispatchJobs\(\) \|\| canListAssignedTechnicianTicket\(resource\.data\)\);/,
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
