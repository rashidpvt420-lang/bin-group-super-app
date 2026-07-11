/**
 * Gate 12 — Verify owner intake activation created canonical property records.
 * Usage: node scripts/gate12-verify-intake-activation.mjs --intakeId <id> [--ownerId <uid>]
 */
import admin from 'firebase-admin';
import { existsSync } from 'node:fs';

const PROJECT = 'bin-group-57c60';

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

const intakeId = argValue('intakeId');
const ownerIdArg = argValue('ownerId');

if (!intakeId) {
  console.error('Usage: node scripts/gate12-verify-intake-activation.mjs --intakeId <id> [--ownerId <uid>]');
  process.exit(1);
}

if (!admin.apps.length) {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath && existsSync(keyPath)) admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
  else admin.initializeApp({ projectId: PROJECT });
}

const db = admin.firestore();

async function docExists(path) {
  const snap = await db.doc(path).get();
  return snap.exists ? snap.data() : null;
}

async function main() {
  console.log(`\n=== Gate 12 Intake Activation Proof — ${intakeId} ===\n`);

  const intake = await docExists(`intake_submissions/${intakeId}`);
  if (!intake) {
    console.error('[FAIL] intake_submissions doc missing');
    process.exit(1);
  }

  const ownerId = ownerIdArg || intake.ownerUid || intake.ownerId || intake.activeOwnerId;
  const propertyIds = Array.isArray(intake.activePropertyIds) && intake.activePropertyIds.length
    ? intake.activePropertyIds
    : (Array.isArray(intake.properties) ? intake.properties.map((p) => p.propertyId || p.id).filter(Boolean) : []);

  const contractId = intake.activeContractId || intake.contractId || intakeId;
  const paymentId = intake.payment?.paymentId || `${intakeId}_mobilization`;

  const checks = [
    { label: 'intake_submissions status converted', pass: ['CONVERTED_TO_OWNER', 'ACTIVE', 'APPROVED'].some((s) => String(intake.status || '').includes(s)) || intake.adminApproved === true, detail: intake.status },
    { label: 'users/{ownerId}', pass: Boolean(ownerId && await docExists(`users/${ownerId}`)), detail: ownerId },
    { label: 'owners/{ownerId}', pass: Boolean(ownerId && await docExists(`owners/${ownerId}`)), detail: ownerId },
    { label: 'contracts/{contractId}', pass: Boolean(await docExists(`contracts/${contractId}`)), detail: contractId },
    { label: 'payment_transactions', pass: Boolean(await docExists(`payment_transactions/${paymentId}`) || await docExists(`payment_transactions/${intakeId}`)), detail: paymentId },
  ];

  for (const propertyId of propertyIds.slice(0, 5)) {
    checks.push({ label: `properties/${propertyId}`, pass: Boolean(await docExists(`properties/${propertyId}`)), detail: propertyId });
    checks.push({ label: `propertyPassports/${propertyId}`, pass: Boolean(await docExists(`propertyPassports/${propertyId}`)), detail: propertyId });
  }

  if (!propertyIds.length) {
    checks.push({ label: 'properties/* from intake', pass: false, detail: 'no propertyIds on intake — approveOwnerSubmissionOperationalFlow may not have run' });
  }

  let failed = 0;
  for (const row of checks) {
    if (row.pass) console.log(`[PASS] ${row.label}${row.detail ? ` — ${row.detail}` : ''}`);
    else {
      console.log(`[FAIL] ${row.label}${row.detail ? ` — ${row.detail}` : ''}`);
      failed += 1;
    }
  }

  if (failed) {
    console.log('\nActivation proof: FAIL — run approveOwnerSubmissionOperationalFlow from admin UI or callable.');
    process.exit(1);
  }

  console.log('\nActivation proof: PASS — canonical property pipeline verified.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[FAIL]', err.message || err);
  process.exit(1);
});
