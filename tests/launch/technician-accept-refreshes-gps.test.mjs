import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');

test('accepting a mission refreshes the availability GPS fix before the server readiness check', () => {
  assert.match(source, /import \{ reportTechnicianAvailabilityLocation \} from '\.\.\/utils\/availabilityLocation';/);
  const accept = source.slice(source.indexOf('const acceptJob = async'), source.indexOf('const updateLifecycle = async'));
  const refreshAt = accept.indexOf('await reportTechnicianAvailabilityLocation()');
  const acceptAt = accept.indexOf("await acceptTechnicianTicket({ ticketId: id })");
  assert.ok(refreshAt > 0 && acceptAt > refreshAt, 'GPS refresh must run before acceptTechnicianTicket');
  // A refresh failure must not block acceptance; the server stays the authority.
  assert.match(accept, /catch \(refreshError\)/);
});

test('offline accept still queues without attempting a GPS refresh', () => {
  const accept = source.slice(source.indexOf('const acceptJob = async'), source.indexOf('const updateLifecycle = async'));
  assert.ok(accept.indexOf("queueAction('ACCEPTED'") < accept.indexOf('reportTechnicianAvailabilityLocation'));
});
