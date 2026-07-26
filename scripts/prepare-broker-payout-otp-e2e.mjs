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
const brokerEmail = String(process.env.E2E_BROKER_EMAIL || '').trim().toLowerCase();
if (!brokerEmail) throw new Error('E2E_BROKER_EMAIL is required for Broker commercial lifecycle evidence.');

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
  throw new Error('Refusing Broker lifecycle reset for an account that is not the dedicated E2E Broker.');
}

const submissionHash = crypto.createHash('sha256').update(`broker-e2e-private-kyc:${projectId}:${brokerUid}`).digest('hex');
const now = admin.firestore.FieldValue.serverTimestamp();

async function deleteQuery(query) {
  while (true) {
    const snapshot = await query.limit(200).get();
    if (snapshot.empty) return 0;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    if (snapshot.size < 200) return snapshot.size;
  }
}

await Promise.all([
  deleteQuery(db.collection('broker_payout_otps').where('uid', '==', brokerUid)),
  deleteQuery(db.collection('broker_payout_requests').where('brokerId', '==', brokerUid)),
  deleteQuery(db.collection('broker_commissions').where('brokerId', '==', brokerUid)),
  deleteQuery(db.collection('brokerLeads').where('brokerId', '==', brokerUid)),
  deleteQuery(db.collection('broker_attributed_onboardings').where('brokerId', '==', brokerUid)),
]);

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
  approvedBy: 'protected-e2e-fixture',
  e2eLaunchSeed: true,
  updatedAt: now,
  createdAt: profile.createdAt || now,
}, { merge: true });

batch.delete(db.collection('broker_payout_otp_rate_limits').doc(brokerUid));
await batch.commit();
console.log(`Prepared dedicated Broker KYC and cleared prior commercial evidence for ${brokerEmail}; no commission was seeded.`);
