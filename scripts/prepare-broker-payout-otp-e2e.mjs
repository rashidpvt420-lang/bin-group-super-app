import admin from 'firebase-admin';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

for (const envPath of [
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
]) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
    break;
  }
}

const projectId = resolveFirebaseAdminProjectId();
const brokerEmail = String(process.env.E2E_BROKER_MAILBOX_EMAIL || process.env.E2E_BROKER_EMAIL || '').trim().toLowerCase();
if (!brokerEmail) throw new Error('E2E_BROKER_MAILBOX_EMAIL is required for Broker payout OTP evidence.');

initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();
const brokerUser = await admin.auth().getUserByEmail(brokerEmail);
if (!brokerUser.emailVerified) {
  throw new Error(`The E2E Broker email must be verified in Firebase Auth: ${brokerEmail}`);
}

const brokerUid = brokerUser.uid;
const profileRef = db.collection('users').doc(brokerUid);
const privateKycRef = db.collection('broker_kyc_profiles').doc(brokerUid);
const profileSnap = await profileRef.get();
const profile = profileSnap.data() || {};
if (profile.e2eLaunchSeed !== true || String(profile.role || profile.userRole || '').toLowerCase() !== 'broker') {
  throw new Error('Refusing Broker payout fixture reset for an account that is not the dedicated E2E Broker.');
}

const safeId = String(brokerUid).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const commissionId = `e2e-live-broker-commission-${safeId}`;
const submissionHash = crypto.createHash('sha256').update(`broker-e2e-private-kyc:${projectId}:${brokerUid}`).digest('hex');
const now = admin.firestore.FieldValue.serverTimestamp();
const BROKER_LIFECYCLE_EVIDENCE_TYPE = 'broker-contract-to-payout-production-proof';

const [challengeSnapshot, priorContractSnapshot] = await Promise.all([
  db.collection('broker_payout_otps')
    .where('uid', '==', brokerUid)
    .limit(100)
    .get(),
  db.collection('contracts')
    .where('brokerId', '==', brokerUid)
    .limit(500)
    .get(),
]);
const priorLifecycleContracts = priorContractSnapshot.docs.filter(
  (document) => document.data()?.e2eEvidenceType === BROKER_LIFECYCLE_EVIDENCE_TYPE,
);

const batch = db.batch();
batch.set(profileRef, {
  reraVerified: true,
  brokerKycStatus: 'verified',
  kycStatus: 'VERIFIED',
  commissionAgreementAccepted: true,
  bankName: 'BIN GROUP E2E BANK',
  bankAccountHolder: brokerUser.displayName || 'E2E Broker',
  bankIban: 'AE070331234567890123456',
  iban: 'AE070331234567890123456',
  ibanVerified: true,
  approvedSubmissionHash: submissionHash,
  payoutOtpE2eReady: true,
  updatedAt: now,
}, { merge: true });

batch.set(privateKycRef, {
  uid: brokerUid,
  brokerUid,
  brokerEmail,
  displayName: brokerUser.displayName || profile.displayName || profile.name || 'E2E Broker',
  reraVerified: true,
  brokerKycStatus: 'verified',
  kycStatus: 'VERIFIED',
  ibanVerified: true,
  commissionAgreementAccepted: true,
  bankName: 'BIN GROUP E2E BANK',
  bankAccountHolder: brokerUser.displayName || profile.displayName || profile.name || 'E2E Broker',
  bankIban: 'AE070331234567890123456',
  iban: 'AE070331234567890123456',
  submissionHash,
  approvedSubmissionHash: submissionHash,
  approvedAt: now,
  approvedBy: 'e2e-launch-fixture',
  e2eLaunchSeed: true,
  updatedAt: now,
  createdAt: profile.createdAt || now,
}, { merge: true });

for (const contract of priorLifecycleContracts) {
  batch.delete(db.collection('broker_commissions').doc(`commission_${contract.id}`));
  batch.delete(contract.ref);
}

batch.set(db.collection('broker_commissions').doc(commissionId), {
  id: commissionId,
  brokerId: brokerUid,
  brokerUid,
  brokerEmail,
  linkedLeadName: 'E2E Payout OTP Attribution Fixture',
  linkedProperty: 'E2E Live Role Tower',
  amount: 500,
  currency: 'AED',
  percentage: 10,
  status: 'APPROVED',
  payoutStatus: 'NOT_REQUESTED',
  payoutRequestId: admin.firestore.FieldValue.delete(),
  payoutRequestedAt: admin.firestore.FieldValue.delete(),
  attributionId: `e2e_attribution_${safeId}`,
  commissionLockKey: `e2e_commission_lock_${safeId}`,
  commissionLocked: true,
  e2eLaunchSeed: true,
  updatedAt: now,
  createdAt: now,
}, { merge: true });

batch.delete(db.collection('broker_payout_otp_rate_limits').doc(brokerUid));
for (const challenge of challengeSnapshot.docs) {
  const status = String(challenge.data().status || '').toUpperCase();
  if (['PENDING', 'VERIFIED', 'EXPIRED'].includes(status)) batch.delete(challenge.ref);
}

await batch.commit();
console.log(`Prepared Broker payout OTP E2E fixture for ${brokerEmail}; private KYC ready; removed ${priorLifecycleContracts.length} stale lifecycle contract(s); cleared ${challengeSnapshot.size} challenge candidate(s).`);
