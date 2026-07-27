import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;

const ticket = {
  requesterRole: 'tenant',
  tenantId: 'tenant_server_authority',
  tenantUid: 'tenant_server_authority',
  unitId: 'unit_server_authority',
  propertyId: 'property_server_authority',
  status: 'OPEN',
  source: 'TENANT_PORTAL',
  evidenceStatus: 'PENDING_TENANT_UPLOAD',
  assignedTechnicianId: null,
  technicianId: null,
};

describe('Server-authoritative Tenant ticket creation', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => testEnv.clearFirestore());
  after(async () => testEnv.cleanup());

  it('denies direct Tenant creates in both ticket collections, including forged coordinates', async () => {
    const adminDb = testEnv.authenticatedContext('admin_server_authority', { admin: true, role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'units/unit_server_authority'), {
      tenantId: 'tenant_server_authority',
      tenantUid: 'tenant_server_authority',
      propertyId: 'property_server_authority',
    }));

    const tenantDb = testEnv.authenticatedContext('tenant_server_authority', { role: 'tenant' }).firestore();
    await assertFails(setDoc(doc(tenantDb, 'maintenanceTickets/direct-maintenance'), ticket));
    await assertFails(setDoc(doc(tenantDb, 'tickets/direct-legacy'), ticket));
    await assertFails(setDoc(doc(tenantDb, 'maintenanceTickets/forged-location'), {
      ...ticket,
      jobLocation: {
        lat: 24.999,
        lng: 55.999,
        latitude: 24.999,
        longitude: 55.999,
        source: 'browser_forged',
      },
    }));
  });
});
