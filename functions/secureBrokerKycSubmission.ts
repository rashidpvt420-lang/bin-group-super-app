import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { submitBrokerKycProfileHandler } from "./brokerKycProfile";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();

async function requireBroker(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Broker login required.");
  if (auth.token?.suspended === true) throw new HttpsError("permission-denied", "Suspended Broker account.");
  const [record, publicSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  if (record.disabled) throw new HttpsError("permission-denied", "Disabled Broker account.");
  const role = lower(auth.token?.role || auth.token?.userRole || auth.token?.primaryRole || publicSnap.data()?.role);
  if (role !== "broker") throw new HttpsError("permission-denied", "Broker role required.");
  return { record, publicSnap };
}

export const getBrokerKycProfileSummary = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const { record, publicSnap } = await requireBroker(request.auth);
    const uid = request.auth!.uid;
    const privateSnap = await db.collection("broker_kyc_profiles").doc(uid).get();
    const publicData = publicSnap.data() || {};
    const privateData = privateSnap.data() || {};
    const submissionHash = text(privateData.submissionHash);
    const approvedSubmissionHash = text(privateData.approvedSubmissionHash || publicData.approvedSubmissionHash);
    const brokerKycStatus = text(publicData.brokerKycStatus || publicData.kycStatus || privateData.brokerKycStatus || "NOT_SUBMITTED");
    const reraVerified = publicData.reraVerified === true && privateData.reraVerified === true;
    const ibanVerified = publicData.ibanVerified === true && privateData.ibanVerified === true;
    const agreementAccepted = publicData.commissionAgreementAccepted === true && privateData.commissionAgreementAccepted === true;
    const approvalBound = Boolean(submissionHash && approvedSubmissionHash && submissionHash === approvedSubmissionHash);
    const payoutHold = publicData.payoutHold === true || privateData.payoutHold === true;
    const payoutBlockReasons = [
      !reraVerified ? "RERA_NOT_VERIFIED" : null,
      !ibanVerified ? "IBAN_NOT_VERIFIED" : null,
      !agreementAccepted ? "COMMISSION_TERMS_NOT_ACCEPTED" : null,
      !approvalBound ? "KYC_APPROVAL_NOT_BOUND_TO_CURRENT_SUBMISSION" : null,
      !["APPROVED", "VERIFIED"].includes(brokerKycStatus.toUpperCase()) ? "KYC_NOT_APPROVED" : null,
      payoutHold ? "PAYOUT_HOLD" : null,
    ].filter(Boolean);

    return {
      status: "SUCCESS",
      profile: {
        uid,
        displayName: publicData.displayName || record.displayName || "",
        email: publicData.email || record.email || "",
        phone: publicData.phoneNumber || publicData.phone || record.phoneNumber || "",
        companyName: publicData.companyName || "",
        primaryRegion: publicData.primaryRegion || publicData.region || "Dubai, UAE",
        brokerTerritory: publicData.brokerTerritory || publicData.primaryRegion || publicData.region || "Dubai",
        language: publicData.language || "en",
      },
      kyc: {
        submitted: privateSnap.exists,
        brokerKycStatus,
        reraStatus: publicData.reraStatus || privateData.reraStatus || "NOT_SUBMITTED",
        reraVerified,
        ibanVerified,
        profileCompletionScore: Number(publicData.profileCompletionScore || privateData.profileCompletionScore || 0),
        reraLicenseMasked: publicData.reraLicenseMasked || privateData.reraLicenseMasked || "",
        tradeLicenseMasked: privateData.tradeLicenseMasked || "",
        emiratesIdMasked: privateData.emiratesIdMasked || "",
        passportMasked: privateData.passportMasked || "",
        bankIbanMasked: publicData.bankIbanMasked || privateData.bankIbanMasked || "",
        bankNameMasked: publicData.bankNameMasked || "",
        commissionAgreementAccepted: agreementAccepted,
        commissionTermsVersion: publicData.commissionTermsVersion || privateData.commissionTermsVersion || "",
        submissionHashPresent: /^[a-f0-9]{64}$/i.test(submissionHash),
        approvalBound,
        reviewedAtMs: publicData.brokerKycReviewedAt?.toMillis?.() || privateData.reviewedAt?.toMillis?.() || 0,
        reviewReason: publicData.brokerKycReviewReason || privateData.reviewReason || "",
      },
      payout: {
        eligible: payoutBlockReasons.length === 0,
        blockReasons: payoutBlockReasons,
        hold: payoutHold,
      },
    };
  },
);

export const submitBrokerKycProfile = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireBroker(request.auth);
    const result = await submitBrokerKycProfileHandler(request);
    const uid = request.auth!.uid;
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
      if (!privateSnap.exists) throw new HttpsError("failed-precondition", "Private Broker KYC submission was not persisted.");
      const privateData = privateSnap.data() || {};
      const submissionHash = text(privateData.submissionHash);
      if (!submissionHash || !/^[a-f0-9]{64}$/i.test(submissionHash)) throw new HttpsError("failed-precondition", "Broker KYC submission hash is invalid.");

      const previousApprovedHash = text(privateData.approvedSubmissionHash || publicSnap.data()?.approvedSubmissionHash);
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
        authDisplayNameChangeDeferredUntilApproval: true,
        sensitiveValuesExcluded: true,
        createdAt: now,
      });
    });

    return { ...result, approvalInvalidated: true, publicIdentityChangePendingApproval: true };
  },
);
