import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isValidReraFormat } from "./brokerCommissions";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "ceo",
  "manager",
  "operations_admin",
  "finance_admin",
]);
const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();

function roleOf(token: any) {
  return lower(token?.role || token?.userRole || token?.primaryRole);
}

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const authorized =
    token.admin === true ||
    token.isAdmin === true ||
    token.superAdmin === true ||
    token.super_admin === true ||
    token.ceo === true ||
    ADMIN_ROLES.has(roleOf(token));
  if (!authorized || token.suspended === true) {
    throw new HttpsError("permission-denied", "Approved Admin authority is required.");
  }
  const record = await admin.auth().getUser(auth.uid);
  if (record.disabled) throw new HttpsError("permission-denied", "Disabled Admin account.");
}

function validUaeIban(value: unknown) {
  return /^AE\d{21}$/.test(text(value).replace(/\s+/g, "").toUpperCase());
}

function requiredDocumentTypes() {
  return ["rera_license", "bank_details", "broker_agreement"];
}

type VerifiedDocument = {
  ref: FirebaseFirestore.DocumentReference;
  id: string;
  data: FirebaseFirestore.DocumentData;
};

async function verifyBrokerDocuments(brokerId: string): Promise<VerifiedDocument[]> {
  const documentsSnap = await db.collection("brokerDocuments")
    .where("brokerId", "==", brokerId)
    .limit(30)
    .get();
  const documents = documentsSnap.docs.map((snapshot) => ({
    ref: snapshot.ref,
    id: snapshot.id,
    data: snapshot.data(),
  }));
  const selected = requiredDocumentTypes().map((documentType) =>
    documents.find((document) => text(document.data.docType || document.data.documentType) === documentType),
  );
  const identityDocument = documents.find((document) =>
    ["emirates_id", "passport", "trade_license"].includes(text(document.data.docType || document.data.documentType)),
  );
  if (selected.some((document) => !document) || !identityDocument) {
    throw new HttpsError(
      "failed-precondition",
      "RERA, identity, bank, and signed Broker agreement documents are required for KYC approval.",
    );
  }

  const verified = [...selected, identityDocument].filter(Boolean) as VerifiedDocument[];
  for (const document of verified) {
    const documentType = text(document.data.docType || document.data.documentType);
    const storagePath = text(document.data.storagePath);
    if (
      !storagePath.startsWith(`brokerDocuments/${brokerId}/${documentType}/`) ||
      lower(document.data.status) !== "pending_review"
    ) {
      throw new HttpsError("failed-precondition", "Broker document ownership or review state is invalid.");
    }
    try {
      const [metadata] = await admin.storage().bucket().file(storagePath).getMetadata();
      const contentType = lower(metadata.contentType);
      const size = Number(metadata.size || 0);
      const custom = metadata.metadata || {};
      if (
        custom.brokerId !== brokerId ||
        custom.documentType !== documentType ||
        !["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"].includes(contentType) ||
        size <= 0 ||
        size > 15 * 1024 * 1024
      ) {
        throw new Error("metadata mismatch");
      }
    } catch {
      throw new HttpsError(
        "failed-precondition",
        `Stored ${documentType} evidence is missing or its immutable metadata does not match.`,
      );
    }
  }
  return verified;
}

export const adminReviewBrokerKyc = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireAdmin(request.auth);
    const brokerId = text(request.data?.brokerId);
    const decision = text(request.data?.decision || request.data?.status).toUpperCase();
    const reason = text(request.data?.reason || request.data?.notes);
    if (!brokerId) throw new HttpsError("invalid-argument", "brokerId is required.");
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      throw new HttpsError("invalid-argument", "decision must be APPROVE or REJECT.");
    }
    if (brokerId === request.auth?.uid) {
      throw new HttpsError("permission-denied", "Brokers cannot approve or reject their own KYC.");
    }
    if (decision === "REJECT" && !reason) {
      throw new HttpsError("invalid-argument", "A rejection reason is required.");
    }

    const publicRef = db.collection("users").doc(brokerId);
    const privateRef = db.collection("broker_kyc_profiles").doc(brokerId);
    const [publicSnap, privateSnap] = await Promise.all([publicRef.get(), privateRef.get()]);
    if (!publicSnap.exists) throw new HttpsError("not-found", "Broker profile not found.");
    if (!privateSnap.exists) throw new HttpsError("failed-precondition", "Private Broker KYC submission not found.");
    const publicProfile = publicSnap.data() || {};
    const privateProfile = privateSnap.data() || {};
    if (lower(publicProfile.role || publicProfile.userRole || publicProfile.primaryRole) !== "broker") {
      throw new HttpsError("failed-precondition", "Selected user is not a Broker profile.");
    }

    const approved = decision === "APPROVE";
    const submissionHash = text(privateProfile.submissionHash);
    if (!submissionHash || !/^[a-f0-9]{64}$/i.test(submissionHash)) {
      throw new HttpsError("failed-precondition", "Broker KYC submission hash is missing or invalid.");
    }

    let verifiedDocuments: VerifiedDocument[] = [];
    if (approved) {
      if (Number(privateProfile.profileCompletionScore || 0) !== 100) {
        throw new HttpsError("failed-precondition", "Broker KYC profile must be complete before approval.");
      }
      if (!isValidReraFormat(text(privateProfile.reraLicense))) {
        throw new HttpsError("failed-precondition", "Broker RERA license number is missing or invalid.");
      }
      if (!text(privateProfile.tradeLicenseNumber || privateProfile.emiratesIdNumber || privateProfile.passportNumber)) {
        throw new HttpsError("failed-precondition", "Broker identity evidence is missing.");
      }
      if (
        !text(privateProfile.bankName) ||
        !text(privateProfile.bankAccountHolder) ||
        !validUaeIban(privateProfile.bankIban)
      ) {
        throw new HttpsError("failed-precondition", "A complete UAE Broker bank account is required.");
      }
      if (privateProfile.commissionAgreementAccepted !== true) {
        throw new HttpsError("failed-precondition", "Current Broker commission terms must be accepted.");
      }
      verifiedDocuments = await verifyBrokerDocuments(brokerId);
    }

    const now = FieldValue.serverTimestamp();
    const actorId = request.auth!.uid;
    const actorEmail = request.auth?.token?.email || null;

    await db.runTransaction(async (transaction) => {
      const [freshPublic, freshPrivate, ...freshDocuments] = await Promise.all([
        transaction.get(publicRef),
        transaction.get(privateRef),
        ...verifiedDocuments.map((document) => transaction.get(document.ref)),
      ]);
      if (!freshPublic.exists || !freshPrivate.exists) {
        throw new HttpsError("not-found", "Broker KYC profile changed during review.");
      }
      const freshPrivateData = freshPrivate.data() || {};
      if (text(freshPrivateData.submissionHash) !== submissionHash) {
        throw new HttpsError("failed-precondition", "Broker KYC submission changed during review.");
      }
      if (
        approved &&
        freshDocuments.some((document) =>
          !document.exists ||
          document.data()?.brokerId !== brokerId ||
          lower(document.data()?.status) !== "pending_review"
        )
      ) {
        throw new HttpsError("failed-precondition", "Broker documents changed during KYC review.");
      }

      transaction.set(publicRef, {
        status: approved ? "APPROVED" : "REJECTED",
        approvalStatus: approved ? "APPROVED" : "REJECTED",
        kycStatus: approved ? "VERIFIED" : "REJECTED",
        brokerKycStatus: approved ? "VERIFIED" : "REJECTED",
        reraStatus: approved ? "VERIFIED" : "REJECTED",
        reraVerified: approved,
        ibanVerified: approved,
        approvedSubmissionHash: approved ? submissionHash : FieldValue.delete(),
        brokerKycReviewedBy: actorId,
        brokerKycReviewedByEmail: actorEmail,
        brokerKycReviewedAt: now,
        brokerKycReviewReason: reason || null,
        approvedAt: approved ? now : freshPublic.data()?.approvedAt || null,
        approvedBy: approved ? actorId : freshPublic.data()?.approvedBy || null,
        rejectedAt: approved ? freshPublic.data()?.rejectedAt || null : now,
        rejectedBy: approved ? freshPublic.data()?.rejectedBy || null : actorId,
        rejectionReason: approved ? null : reason,
        updatedAt: now,
      }, { merge: true });

      transaction.set(privateRef, {
        brokerKycStatus: approved ? "VERIFIED" : "REJECTED",
        reraStatus: approved ? "VERIFIED" : "REJECTED",
        reraVerified: approved,
        ibanVerified: approved,
        approvedSubmissionHash: approved ? submissionHash : FieldValue.delete(),
        reviewedAt: now,
        reviewedBy: actorId,
        reviewReason: reason || null,
        updatedAt: now,
      }, { merge: true });

      freshDocuments.forEach((document) => {
        transaction.set(document.ref, {
          status: approved ? "verified" : "rejected",
          reviewedAt: now,
          reviewedBy: actorId,
          updatedAt: now,
        }, { merge: true });
      });

      transaction.set(db.collection("audit_logs").doc(), {
        action: approved ? "ADMIN_APPROVE_BROKER_KYC_PRIVATE_VAULT" : "ADMIN_REJECT_BROKER_KYC_PRIVATE_VAULT",
        actorId,
        actorEmail,
        actorRole: roleOf(request.auth?.token),
        targetType: "broker_kyc_profiles",
        targetId: brokerId,
        submissionHash,
        decision,
        reason: reason || null,
        sensitiveValuesExcluded: true,
        createdAt: now,
      });
    });

    let releasedCommissions = 0;
    if (approved) {
      const holdSnap = await db.collection("broker_commissions")
        .where("brokerId", "==", brokerId)
        .where("status", "==", "HOLD")
        .get();
      if (!holdSnap.empty) {
        const batch = db.batch();
        holdSnap.docs.forEach((commission) => {
          batch.set(commission.ref, {
            status: "PENDING",
            complianceHold: false,
            holdReason: null,
            releasedAt: now,
            updatedAt: now,
          }, { merge: true });
          releasedCommissions += 1;
        });
        await batch.commit();
      }
    }

    return {
      status: "SUCCESS",
      brokerId,
      decision,
      submissionHash,
      releasedCommissions,
    };
  },
);
