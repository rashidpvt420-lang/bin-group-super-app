import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isTestLocation, isTestRecord, testTechnicianIds } from '../../apps/admin-panel/src/lib/testRecords.mjs';

// Regression: leftover e2e / Gate-11 QA technicians (on duty, with GPS) and e2e tickets
// appeared on the admin live dispatch map as if they were real capacity and real work.

test('classifies the production fixture shapes as test records', () => {
  assert.equal(isTestRecord({ id: 'CZcaH4PZylRo3HWlWT3u6uSPGrs1', email: 'qa_technician@bin-groups.com', gate11Smoke: true, testAccount: true }), true);
  assert.equal(isTestRecord({ id: 'QLfXKLG3ulWTeg0F40OElUhc4r73', email: 'technician@bin-group.com', isE2ETestUser: true }), true);
  assert.equal(isTestRecord({ id: 'QN3dLGrjR8Qa8aPDbFBw40QIhtm2', email: 'e2e-technician@bingroup.com' }), true);
  assert.equal(isTestRecord({ id: 'e2e-live-sos-ticket', status: 'OPEN' }), true);
  assert.equal(isTestRecord({ id: 'x', e2eLaunchSeed: true }), true);
  assert.equal(isTestRecord({ id: 'x', e2eRunId: '38436260629' }), true);
  assert.equal(isTestRecord({ id: 'x', tenantEmail: 'e2e-tenant@bingroup.com' }), true);
});

test('never classifies real records as test records', () => {
  assert.equal(isTestRecord({ id: 'koFjPljsrCQ2p8uMIwRDJ2fhKth2', email: 'technician@bin-groups.com', displayName: 'rashid' }), false);
  assert.equal(isTestRecord({ id: 'peUwBJCyzCIqT8gSvd7D', status: 'ASSIGNED', propertyName: 'Villa · Alain' }), false);
  assert.equal(isTestRecord({ id: 'abc', email: 'owner@gmail.com', testAccount: false }), false);
  assert.equal(isTestRecord(null), false);
});

test('filters GPS sessions belonging to test technicians', () => {
  const ids = testTechnicianIds([{ id: 'qa1', testAccount: true }, { id: 'real1', email: 'tech@bin-groups.com' }]);
  assert.equal(isTestLocation({ id: 'qa1' }, ids), true);
  assert.equal(isTestLocation({ id: 'loc9', technicianId: 'qa1' }, ids), true);
  assert.equal(isTestLocation({ id: 'real1' }, ids), false);
});

test('live map hides test records by default behind an explicit switch', async () => {
  const page = await readFile(new URL('../../apps/admin-panel/src/pages/map/LiveMapPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /useState\(false\);\n\s*const testTechIds/);
  assert.match(page, /allTickets\.filter\(\(ticket\) => !isTestRecord\(ticket\)\)/);
  assert.match(page, /allTechnicians\.filter\(\(technician\) => !isTestRecord\(technician\)\)/);
  assert.match(page, /isTestLocation\(location, testTechIds\)/);
  assert.match(page, /data-testid="map-show-test-records"/);
});
