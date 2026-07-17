import admin from 'firebase-admin';
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
const brokerEmail = String(process.env.E2E_BROKER_EMAIL || '').trim().toLowerCase();
if (!brokerEmail) throw new Error('E2E_BROKER_EMAIL is required for Broker payout OTP evidence.');

initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();
const brokerUser = await admin.auth().getUserByEmail(brokerEmail);
if (!brokerUser.emailVerified) {
  throw new Error(`The E2E Broker email must be verified in Firebase Auth: ${brokerEmail}`);
}

const brokerUid = brokerUser.uid;
const profileRef = db.collection('users').doc(brokerUid);
const profileSnap = await profileRef.get();
const profile = profileSnap.data() || {};
if (profile.e2eLaunchSeed !== true || String(profile.role || profile.userRole || '').toLowerCase() !== 'broker') {
  throw new Error('Refusing Broker payout fixture reset for an account that is not the dedicated E2E Broker.');
}

const safeId = String(brokerUid).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const commissionId = `e2e-live-broker-commission-${safeId}`;
const now = admin.firestore.FieldValue.serverTimestamp();

const challengeSnapshot = await db.collection('broker_payout_otps')
  .where('uid', '==', brokerUid)
  .limit(100)
  .get();

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
  payoutOtpE2eReady: true,
  updatedAt: now,
}, { merge: true });

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
console.log(`Prepared Broker payout OTP E2E fixture for ${brokerEmail}; cleared ${challengeSnapshot.size} challenge candidate(s).`);
