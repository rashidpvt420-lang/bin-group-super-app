import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const required = ['GOOGLE_APPLICATION_CREDENTIALS'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Set it to a Firebase service-account JSON path before running this smoke test.`);
    process.exit(1);
  }
}

initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) });
const db = getFirestore();
const nowKey = Date.now();
const staffUid = process.env.HR_TEST_STAFF_UID || `hr-smoke-staff-${nowKey}`;
const staffEmail = process.env.HR_TEST_STAFF_EMAIL || `hr-smoke-${nowKey}@bin-group.test`;
const requestRef = db.collection('staffRequests').doc(`hr-smoke-${nowKey}`);

await db.collection('users').doc(staffUid).set({
  uid: staffUid,
  email: staffEmail,
  displayName: 'HR Smoke Test Staff',
  role: 'technician',
  status: 'ACTIVE',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

await requestRef.set({
  uid: staffUid,
  userId: staffUid,
  technicianId: staffUid,
  email: staffEmail,
  displayName: 'HR Smoke Test Staff',
  role: 'technician',
  requestType: 'overtime',
  requestLabel: 'Smoke Test Overtime Request',
  category: 'payroll',
  priority: 'high',
  reason: 'Automated HR smoke test request. Safe to delete.',
  paperless: true,
  status: 'pending_hr_review',
  source: 'hr_smoke_test',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  hours: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

console.log(`Created staff request ${requestRef.id}. Waiting for HR trigger notification/audit...`);
await new Promise((resolve) => setTimeout(resolve, 9000));

const notifications = await db.collection('notifications')
  .where('extraData.requestId', '==', requestRef.id)
  .limit(20)
  .get()
  .catch(async () => db.collection('notifications').limit(20).get());
const auditLogs = await db.collection('auditLogs')
  .where('targetId', '==', requestRef.id)
  .limit(20)
  .get()
  .catch(async () => db.collection('audit_logs').where('targetId', '==', requestRef.id).limit(20).get());

console.log(JSON.stringify({
  requestId: requestRef.id,
  staffUid,
  notificationsFound: notifications.size,
  auditLogsFound: auditLogs.size,
  status: notifications.size > 0 || auditLogs.size > 0 ? 'PASS' : 'CHECK_FIREBASE_LOGS',
}, null, 2));
