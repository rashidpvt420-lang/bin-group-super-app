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
  if (token.email_verified !== true || !token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified Admin MFA session is required for Broker KYC review.");
  }

  const record = await admin.auth().getUser(auth.uid);
  const currentClaims = record.customClaims || {};
  const currentAuthorized =
    currentClaims.admin === true ||
    currentClaims.isAdmin === true ||
    currentClaims.superAdmin === true ||
    currentClaims.super_admin === true ||
    currentClaims.ceo === true ||
    ADMIN_ROLES.has(roleOf(currentClaims));
  if (
    record.disabled ||
    !record.emailVerified ||
    currentClaims.suspended === true ||
    !currentAuthorized
  ) {
    throw new HttpsError("permission-denied", "Current Admin authority is inactive or no longer valid.");
  }
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

function masked(value: unknown, visible = 4) {
  const compact = text(value).replace(/\s+/g, "");
  if (!compact) return "";
  if (compact.length <= visible) return "•".repeat(compact.length);
  return `${"•".repeat(Math.min(12, compact.length - visible))}${compact.slice(-visible)}`;
}

export const getAdminBrokerKycReviewSummary = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireAdmin(request.auth);
    const brokerId = text(request.data?.brokerId);
    if (!brokerId) throw new HttpsError("invalid-argument", "brokerId is required.");

    const [publicSnap, privateSnap, documentsSnap] = await Promise.all([
      db.collection("users").doc(brokerId).get(),
      db.collection("broker_kyc_profiles").doc(brokerId).get(),
      db.collection("brokerDocuments").where("brokerId", "==", brokerId).limit(30).get(),
    ]);
    if (!publicSnap.exists) throw new HttpsError("not-found", "Broker profile not found.");
    const publicProfile = publicSnap.data() || {};
    if (lower(publicProfile.role || publicProfile.userRole || publicProfile.primaryRole) !== "broker") {
      throw new HttpsError("failed-precondition", "Selected user is not a Broker profile.");
    }

    const privateProfile = privateSnap.data() || {};
    const documentTypes = documentsSnap.docs.map((doc) =>
      text(doc.data().docType || doc.data().documentType),
    ).filter(Boolean);
    const identityPresent = Boolean(
      text(privateProfile.tradeLicenseNumber || privateProfile.emiratesIdNumber || privateProfile.passportNumber),
    );
    const submissionHash = text(privateProfile.submissionHash);
    const approvedSubmissionHash = text(
      privateProfile.approvedSubmissionHash || publicProfile.approvedSubmissionHash,
    );

    return {
      status: "SUCCESS",
      brokerId,
      profile: {
        displayName: text(publicProfile.displayName || publicProfile.name),
        email: lower(publicProfile.email),
        companyName: text(publicProfile.companyName),
        brokerTerritory: text(publicProfile.brokerTerritory || publicProfile.primaryRegion),
      },
      kyc: {
        exists: privateSnap.exists,
        brokerKycStatus: text(publicProfile.brokerKycStatus || privateProfile.brokerKycStatus || "NOT_SUBMITTED"),
        reraStatus: text(publicProfile.reraStatus || privateProfile.reraStatus || "NOT_SUBMITTED"),
        profileCompletionScore: Number(privateProfile.profileCompletionScore || publicProfile.profileCompletionScore || 0),
        reraLicenseMasked: text(privateProfile.reraLicenseMasked || publicProfile.reraLicenseMasked) || masked(privateProfile.reraLicense),
        identityEvidencePresent: identityPresent,
        bankName: text(privateProfile.bankName),
        bankAccountHolder: text(privateProfile.bankAccountHolder),
        bankIbanMasked: text(privateProfile.bankIbanMasked || publicProfile.bankIbanMasked) || masked(privateProfile.bankIban),
        commissionAgreementAccepted: privateProfile.commissionAgreementAccepted === true,
        commissionTermsVersion: text(privateProfile.commissionTermsVersion),
        submissionHashPresent: /^[a-f0-9]{64}$/i.test(submissionHash),
        approvalBound: Boolean(submissionHash && approvedSubmissionHash === submissionHash),
        reviewReason: text(publicProfile.brokerKycReviewReason || privateProfile.reviewReason),
      },
      documents: {
        count: documentsSnap.size,
        types: Array.from(new Set(documentTypes)).sort(),
        requiredPresent: requiredDocumentTypes().every((type) => documentTypes.includes(type)) &&
          documentTypes.some((type) => ["emirates_id", "passport", "trade_license"].includes(type)),
      },
      sensitiveValuesMasked: true,
    };
  },
);

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
    const notificationRef = db.collection("notifications").doc(
      "broker_kyc_" + brokerId + "_" + submissionHash.slice(0, 24) + "_" + decision.toLowerCase(),
    );

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
          status: approved ? "VERIFIED" : "REJECTED",
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
      transaction.set(notificationRef, {
        recipientId: brokerId,
        userId: brokerId,
        recipientRole: "broker",
        type: approved ? "BROKER_KYC_APPROVED" : "BROKER_KYC_REJECTED",
        title: approved ? "Broker KYC approved" : "Broker KYC requires attention",
        body: approved
          ? "Your Broker KYC and RERA verification are approved. Verified listing and payout features are now available."
          : "Your Broker KYC submission was rejected. Open your Broker profile to review and resubmit the required information.",
        link: "/broker/profile",
        read: false,
        createdAt: now,
      }, { merge: true });
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

import type * as FirebaseFirestore from "firebase-admin/firestore";