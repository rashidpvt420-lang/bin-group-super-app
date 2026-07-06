'use strict';

const { beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'bin-group-57c60' });
}

const db = admin.firestore();
const { runGetAdminReports } = require('../lib/adminReports');

async function clearCollection(collectionName) {
  const snap = await db.collection(collectionName).limit(500).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  if (snap.size === 500) await clearCollection(collectionName);
}

async function seedAdmin(uid = 'admin_user') {
  await db.collection('users').doc(uid).set({
    email: `${uid}@example.test`,
    role: 'admin',
    status: 'active',
    isAdmin: true,
  });
  return { uid, token: {} };
}

describe('getAdminReports callable core', () => {
  beforeEach(async () => {
    await Promise.all([
      clearCollection('users'),
      clearCollection('payments'),
      clearCollection('payment_transactions'),
      clearCollection('invoices'),
      clearCollection('maintenanceTickets'),
      clearCollection('sla_breaches'),
    ]);
  });

  it('rejects unauthenticated callers', async () => {
    await assert.rejects(
      () => runGetAdminReports({ reportType: 'financial' }, null),
      (err) => {
        assert.equal(err.code, 'unauthenticated');
        return true;
      }
    );
  });

  it('rejects non-admin callers', async () => {
    await db.collection('users').doc('tenant_user').set({
      email: 'tenant@example.test',
      role: 'tenant',
      status: 'active',
    });

    await assert.rejects(
      () => runGetAdminReports(
        { reportType: 'financial', startDate: '2026-07-01', endDate: '2026-07-31' },
        { uid: 'tenant_user', token: { role: 'tenant' } }
      ),
      (err) => {
        assert.equal(err.code, 'permission-denied');
        return true;
      }
    );
  });

  it('allows admin callers and returns a safe empty report', async () => {
    const auth = await seedAdmin();
    const result = await runGetAdminReports(
      { reportType: 'financial', startDate: '2026-07-01', endDate: '2026-07-31' },
      auth
    );

    assert.equal(result.reportType, 'financial');
    assert.deepEqual(result.data, []);
    assert.equal(result.summary.totalRevenue, 0);
    assert.equal(result.summary.totalCosts, 0);
    assert.equal(result.summary.totalTickets, 0);
    assert.equal(result.summary.totalCompleted, 0);
  });

  it('returns expected financial and operational report shapes from sample data', async () => {
    const auth = await seedAdmin();
    const reportDay = admin.firestore.Timestamp.fromDate(new Date('2026-07-02T12:00:00.000Z'));

    await db.collection('payment_transactions').doc('pay_1').set({
      amount: 1250,
      status: 'VERIFIED',
      ownerId: 'owner_1',
      propertyId: 'property_1',
      createdAt: reportDay,
    });
    await db.collection('maintenanceTickets').doc('ticket_1').set({
      status: 'COMPLETED',
      ownerId: 'owner_1',
      propertyId: 'property_1',
      actualCost: 250,
      createdAt: reportDay,
      completedAt: reportDay,
    });

    const financial = await runGetAdminReports(
      { reportType: 'financial', startDate: '2026-07-01', endDate: '2026-07-03' },
      auth
    );
    assert.equal(financial.data.length, 1);
    assert.equal(financial.data[0].date, '2026-07-02');
    assert.equal(financial.data[0].revenue, 1250);
    assert.equal(financial.data[0].costs, 250);
    assert.equal(financial.data[0].tickets, 1);
    assert.equal(financial.data[0].completedJobs, 1);
    assert.equal(financial.summary.profit, 1000);

    const operational = await runGetAdminReports(
      { reportType: 'operational', startDate: '2026-07-01', endDate: '2026-07-03' },
      auth
    );
    assert.equal(operational.reportType, 'operational');
    assert.equal(operational.data[0].date, '2026-07-02');
    assert.equal(typeof operational.data[0].tickets, 'number');
    assert.equal(typeof operational.data[0].completedJobs, 'number');
  });
});
