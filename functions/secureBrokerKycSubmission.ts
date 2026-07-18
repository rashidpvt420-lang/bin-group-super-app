import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { submitBrokerKycProfile as legacySubmitBrokerKycProfile } from "./brokerKycProfile";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown) => String(value ?? "").trim();

export const submitBrokerKycProfile = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (typeof (legacySubmitBrokerKycProfile as any)?.run !== "function") {
      throw new HttpsError("internal", "Broker KYC submission handler is unavailable.");
    }
    const result = await (legacySubmitBrokerKycProfile as any).run(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Broker login required.");

    const displayName = text(request.data?.displayName);
    if (displayName) {
      const record = await admin.auth().getUser(uid);
      if (record.displayName !== displayName) {
        await admin.auth().updateUser(uid, { displayName });
      }
    }

    if (result?.idempotent === true) return result;

    const publicRef = db.collection("users").doc(uid);
    const privateRef = db.collection("broker_kyc_profiles").doc(uid);
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const [publicSnap, privateSnap] = await Promise.all([
        transaction.get(publicRef),
        transaction.get(privateRef),
      ]);
      if (!privateSnap.exists) {
        throw new HttpsError("failed-precondition", "Private Broker KYC submission was not persisted.");
      }
      const privateData = privateSnap.data() || {};
      const submissionHash = text(privateData.submissionHash);
      if (!submissionHash || !/^[a-f0-9]{64}$/i.test(submissionHash)) {
        throw new HttpsError("failed-precondition", "Broker KYC submission hash is invalid.");
      }

      const previousApprovedHash = text(
        privateData.approvedSubmissionHash || publicSnap.data()?.approvedSubmissionHash,
      );
      transaction.set(publicRef, {
        reraVerified: false,
        ibanVerified: false,
        kycStatus: result?.brokerKycStatus || "PENDING_REVIEW",
        brokerKycStatus: result?.brokerKycStatus || "PENDING_REVIEW",
        approvedSubmissionHash: FieldValue.delete(),
        brokerKycReviewedAt: FieldValue.delete(),
        brokerKycReviewedBy: FieldValue.delete(),
        brokerKycReviewedByEmail: FieldValue.delete(),
        brokerKycReviewReason: null,
        updatedAt: now,
      }, { merge: true });
      transaction.set(privateRef, {
        reraVerified: false,
        ibanVerified: false,
        approvedSubmissionHash: FieldValue.delete(),
        reviewedAt: FieldValue.delete(),
        reviewedBy: FieldValue.delete(),
        reviewReason: null,
        updatedAt: now,
      }, { merge: true });
      transaction.set(auditRef, {
        action: "BROKER_KYC_APPROVAL_INVALIDATED_BY_RESUBMISSION",
        actorId: uid,
        actorRole: "broker",
        targetType: "broker_kyc_profiles",
        targetId: uid,
        submissionHash,
        previousApprovedHash: previousApprovedHash || null,
        approvalWasPreviouslyBound: Boolean(previousApprovedHash),
        sensitiveValuesExcluded: true,
        createdAt: now,
      });
    });

    return {
      ...result,
      approvalInvalidated: true,
    };
  },
);
