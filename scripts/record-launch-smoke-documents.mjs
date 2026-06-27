import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'bin-group-57c60' });
}

const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

const roles = ['public', 'owner', 'tenant', 'technician', 'admin', 'broker'];
const checks = roles.map((role) => ({
  role,
  testName: `${role}_portal_smoke`,
  status: 'PENDING_MANUAL_RUN',
  route: role === 'public' ? '/' : `/${role}/dashboard`,
  source: 'record-launch-smoke-documents',
  createdAt: now,
  updatedAt: now,
}));

async function main() {
  const batch = db.batch();
  for (const check of checks) {
    const ref = db.collection('launch_smoke_tests').doc(check.testName);
    batch.set(ref, check, { merge: true });
  }
  batch.set(db.collection('system_health').doc('dashboard'), {
    launchSmokeTestsSeeded: true,
    launchSmokeTestCount: checks.length,
    launchSmokeStatus: 'PENDING_MANUAL_RUN',
    updatedAt: now,
  }, { merge: true });
  await batch.commit();
  console.log(`[launch-smoke] Seeded ${checks.length} smoke-test documents.`);
}

main().catch((error) => {
  console.error('[launch-smoke] failed', error);
  process.exitCode = 1;
});
