import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const lower = (value: unknown) => String(value || "").trim().toLowerCase();

async function ownedDocuments(collectionName: string, uid: string) {
  const collection = db.collection(collectionName);
  const snapshots = await Promise.all([
    collection.where("ownerId", "==", uid).limit(50).get(),
    collection.where("ownerUid", "==", uid).limit(50).get(),
  ]);
  const deduplicated = new Map<string, FirebaseFirestore.DocumentData>();
  for (const snapshot of snapshots) for (const item of snapshot.docs) deduplicated.set(item.id, { id: item.id, ...item.data() });
  return [...deduplicated.values()];
}

const approvedStatus = (value: unknown) => ["approved", "verified", "active", "completed"].includes(lower(value));
const signedStatus = (value: unknown) => ["signed", "active", "approved", "executed"].includes(lower(value));
const paymentApproved = (record: FirebaseFirestore.DocumentData) => (
  record.paymentVerified === true ||
  record.approved === true ||
  ["approved", "verified", "paid", "completed", "succeeded"].includes(lower(record.paymentStatus || record.status || record.verificationState))
);
const intakeProperties = (record: FirebaseFirestore.DocumentData) => Array.isArray(record.properties)
  ? record.properties
  : record.property ? [record.property] : [];

export const getOwnerProfileReadiness = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner login required.");
    const uid = request.auth.uid;
    const authRecord = await admin.auth().getUser(uid);
    if (authRecord.disabled || authRecord.customClaims?.suspended === true) throw new HttpsError("permission-denied", "Owner account is disabled or suspended.");

    const [userSnap, properties, contracts, payments, intakes] = await Promise.all([
      db.collection("users").doc(uid).get(),
      ownedDocuments("properties", uid),
      ownedDocuments("contracts", uid),
      ownedDocuments("payment_transactions", uid),
      ownedDocuments("intake_submissions", uid),
    ]);
    const profile = userSnap.data() || {};
    const identityStatus = profile.kycStatus || profile.identityStatus || profile.verificationStatus || profile.ownerKycStatus;
    const identityVerified = profile.kycVerified === true || profile.identityVerified === true || profile.ownerVerified === true || approvedStatus(identityStatus) || intakes.some((item) => approvedStatus(item.kycStatus || item.identityStatus || item.documentStatus));
    const phoneVerified = Boolean(authRecord.phoneNumber) && (profile.phoneVerified === true || profile.phoneAuthority === "FIREBASE_AUTH_PHONE");
    const propertyProofApproved = properties.some((item) => approvedStatus(item.titleDeedStatus || item.propertyProofStatus || item.verificationStatus)) || intakes.some((item) => approvedStatus(item.documentStatus || item.kycStatus || item.verificationStatus) || Boolean(item.documentUrls?.propertyProof));
    const locationApproved = properties.some((item) => item.geo?.verified === true && item.geo?.dispatchReady === true) || intakes.some((item) => intakeProperties(item).length > 0 && intakeProperties(item).every((property: any) => property?.geo?.verified === true && property?.geo?.dispatchReady === true));
    const contractSigned = contracts.some((item) => item.signedAt || signedStatus(item.status || item.contractStatus)) || intakes.some((item) => Boolean(item.signatureName && (item.otpVerificationId || item.contractOtpVerificationId)));
    const depositReceived = payments.some(paymentApproved) || intakes.some(paymentApproved) || profile.paymentVerified === true;
    const adminApproved = profile.adminApproved === true || profile.ownerApproved === true || approvedStatus(profile.approvalStatus || profile.activationStatus) || intakes.some((item) => item.adminApproved === true || approvedStatus(item.status || item.approvalStatus));
    const dashboardUnlocked = profile.dashboardUnlocked === true || profile.dashboardUnlockApproved === true || profile.unlocksDashboard === true || lower(profile.activationStatus) === "active";

    const checks = { identityVerified, phoneVerified, propertyProofApproved, locationApproved, contractSigned, depositReceived, adminApproved, dashboardUnlocked };
    const blockers = Object.entries(checks).filter(([, ready]) => !ready).map(([key]) => key);
    return {
      status: "SUCCESS",
      checks,
      blockers,
      complete: blockers.length === 0,
      progress: Math.round(((Object.keys(checks).length - blockers.length) / Object.keys(checks).length) * 100),
      counts: { properties: properties.length, contracts: contracts.length, payments: payments.length, intakes: intakes.length },
      checkedAtMs: Date.now(),
    };
  },
);
