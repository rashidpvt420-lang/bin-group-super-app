'use strict';

const { beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

// Emulator-only suite. It must never run against a real project: getAdminReports re-reads the caller
// from Firebase Auth, so without the Auth emulator the old suite called production Auth for
// bin-group-57c60 (and failed for lack of credentials).
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
if (!projectId.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('admin-reports tests run only on a demo- project with the Firestore and Auth emulators (npm run test:admin-reports).');
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
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

async function upsertAuthUser(uid, claims) {
  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
  await admin.auth().createUser({ uid, email: `${uid}@example.test`, emailVerified: true });
  await admin.auth().setCustomUserClaims(uid, claims);
}

async function seedAdmin(uid = 'admin_user') {
  await upsertAuthUser(uid, { admin: true, role: 'admin' });
  await db.collection('users').doc(uid).set({
    email: `${uid}@example.test`,
    role: 'admin',
    status: 'active',
    isAdmin: true,
  });
  return { uid, token: { admin: true, role: 'admin' } };
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
    await upsertAuthUser('tenant_user', { role: 'tenant' });
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

  it('counts only verified canonical payments and excludes legacy, pending and credit rows', async () => {
    const auth = await seedAdmin();
    const reportDay = admin.firestore.Timestamp.fromDate(new Date('2026-07-02T12:00:00.000Z'));
    await Promise.all([
      db.collection('payments').doc('legacy_paid').set({
        amount: 9000,
        status: 'PAID',
        createdAt: reportDay,
      }),
      db.collection('invoices').doc('invoice_paid').set({
        amount: 8000,
        status: 'PAID',
        createdAt: reportDay,
      }),
      db.collection('payment_transactions').doc('pending').set({
        amount: 7000,
        status: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
        createdAt: reportDay,
      }),
      db.collection('payment_transactions').doc('credit').set({
        amount: 500,
        status: 'APPROVED',
        recordType: 'SLA_CREDIT',
        paymentVerified: true,
        createdAt: reportDay,
      }),
      db.collection('payment_transactions').doc('verified').set({
        amount: 1250,
        status: 'PENDING_ADMIN_APPROVAL',
        paymentVerified: true,
        createdAt: reportDay,
      }),
    ]);

    const report = await runGetAdminReports(
      { reportType: 'financial', startDate: '2026-07-01', endDate: '2026-07-03' },
      auth,
    );
    assert.equal(report.summary.totalRevenue, 1250);
  });

  it('sums report money in integer fils so totals are exact to the fils', async () => {
    const auth = await seedAdmin();
    const day1 = admin.firestore.Timestamp.fromDate(new Date('2026-07-02T09:00:00.000Z'));
    const day2 = admin.firestore.Timestamp.fromDate(new Date('2026-07-03T09:00:00.000Z'));
    // Summed as floats these three drift: 6982.14 * 3 => 20946.420000000002.
    await Promise.all([
      ...['a', 'b', 'c'].map((id) => db.collection('payment_transactions').doc(`rent_${id}`).set({
        amount: 6982.14, status: 'APPROVED', paymentVerified: true, createdAt: day1,
      })),
      db.collection('payment_transactions').doc('rent_d').set({ amount: 0.1, status: 'APPROVED', paymentVerified: true, createdAt: day2 }),
      db.collection('payment_transactions').doc('rent_e').set({ amount: 0.2, status: 'APPROVED', paymentVerified: true, createdAt: day2 }),
      db.collection('maintenanceTickets').doc('t1').set({ status: 'COMPLETED', actualCost: 0.1, createdAt: day2 }),
      db.collection('maintenanceTickets').doc('t2').set({ status: 'COMPLETED', actualCost: 0.2, createdAt: day2 }),
      db.collection('sla_breaches').doc('b1').set({ ticketId: 't1', penaltyAmount: 0.1, createdAt: day2 }),
      db.collection('sla_breaches').doc('b2').set({ ticketId: 't2', penaltyAmount: 0.2, createdAt: day2 }),
    ]);

    const report = await runGetAdminReports(
      { reportType: 'financial', startDate: '2026-07-01', endDate: '2026-07-03' },
      auth,
    );
    assert.deepEqual(report.data.map((row) => [row.date, row.revenue, row.costs]), [
      ['2026-07-02', 20946.42, 0],
      ['2026-07-03', 0.3, 0.3],
    ]);
    assert.equal(report.summary.totalRevenue, 20946.72);
    assert.equal(report.summary.totalCosts, 0.3);
    assert.equal(report.summary.profit, 20946.42);

    const sla = await runGetAdminReports(
      { reportType: 'sla_breaches', startDate: '2026-07-01', endDate: '2026-07-03' },
      auth,
    );
    assert.equal(sla.summary.totalPenaltyAmount, 0.3);
  });
});
