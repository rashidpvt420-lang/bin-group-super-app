const admin = require('firebase-admin');

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'bin-group-57c60' });
const db = admin.firestore();

const DRY_RUN = process.env.DRY_RUN !== 'false';
const HARD_DELETE = process.env.HARD_DELETE === 'true';

const COLLECTIONS = [
  'users',
  'owners',
  'properties',
  'propertyPassports',
  'contracts',
  'maintenanceTickets',
  'payroll',
  'vault',
  'audit_logs',
  'sensorNodes',
  'iotSensors',
  'telemetry',
  'ownerInvites',
  'intake_submissions'
];

const MARKERS = [
  'e2e-',
  'e2e_',
  'e2e ',
  'e2e@',
  'demo',
  'dummy',
  'sample',
  'mosque-',
  'frontend crash',
  'frontend_crash',
  'test owner',
  'test tenant',
  'test technician'
];

function stringBag(id, data) {
  const keys = [
    'email', 'ownerEmail', 'tenantEmail', 'techEmail', 'displayName', 'fullName', 'name',
    'ownerName', 'tenantName', 'techName', 'propertyName', 'assetName', 'description',
    'category', 'action', 'eventType', 'type', 'status', 'source', 'contractName'
  ];
  return [id, ...keys.map((key) => data?.[key])]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase())
    .join(' ');
}

function isCandidate(id, data) {
  const bag = stringBag(id, data);
  const status = String(data?.status || data?.activationStatus || '').toUpperCase();
  return MARKERS.some((marker) => bag.includes(marker)) || ['TEST', 'DEMO'].includes(status);
}

async function commitBatch(batch, count) {
  if (count === 0) return;
  if (!DRY_RUN) await batch.commit();
}

(async () => {
  let totalCandidates = 0;
  for (const collectionName of COLLECTIONS) {
    const snap = await db.collection(collectionName).get();
    const candidates = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (isCandidate(docSnap.id, data)) {
        candidates.push({ id: docSnap.id, ref: docSnap.ref, data });
      }
    });

    totalCandidates += candidates.length;
    console.log(`\n${collectionName}: ${candidates.length} test/demo records found`);
    candidates.slice(0, 15).forEach((item, index) => {
      console.log(`${index + 1}. ${item.id} | ${item.data.email || item.data.ownerEmail || item.data.name || item.data.propertyName || item.data.action || 'no label'} | ${item.data.status || 'NO_STATUS'}`);
    });

    let batch = db.batch();
    let batchCount = 0;

    for (const item of candidates) {
      if (HARD_DELETE) {
        batch.delete(item.ref);
      } else {
        batch.set(item.ref, {
          archivedByLaunchCleanup: true,
          status: 'ARCHIVED_BY_LAUNCH_CLEANUP',
          hiddenFromLaunch: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      batchCount += 1;

      if (batchCount === 450) {
        await commitBatch(batch, batchCount);
        batch = db.batch();
        batchCount = 0;
      }
    }

    await commitBatch(batch, batchCount);
  }

  console.log(`\nTotal candidates: ${totalCandidates}`);
  if (DRY_RUN) {
    console.log('DRY RUN ONLY. Nothing changed. Run with DRY_RUN=false to archive candidates.');
    console.log('Use HARD_DELETE=true only if you are 100% sure you want permanent deletes.');
  } else {
    console.log(HARD_DELETE ? 'Hard delete complete.' : 'Archive cleanup complete.');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
