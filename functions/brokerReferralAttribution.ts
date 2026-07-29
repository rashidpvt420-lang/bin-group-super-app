import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

const BLOCKED_STATUSES = new Set([
  "blocked",
  "disabled",
  "inactive",
  "rejected",
  "revoked",
  "suspended",
  "terminated",
]);

const text = (value: unknown, max = 160) => String(value || "").trim().slice(0, max);
const normalized = (value: unknown) => text(value).toLowerCase();

function requireOwner(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Owner login is required.");
  const role = normalized(auth.token?.role || auth.token?.userRole || auth.token?.primaryRole);
  if (role !== "owner") throw new HttpsError("permission-denied", "Only an Owner account can capture a Broker referral.");
  if (auth.token?.email_verified !== true || auth.token?.suspended === true || auth.token?.disabled === true) {
    throw new HttpsError("permission-denied", "This Owner account is not verified and active.");
  }
  return auth.uid as string;
}

function validBrokerUid(value: unknown) {
  const uid = text(value, 128);
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
    throw new HttpsError("invalid-argument", "A valid Broker referral identifier is required.");
  }
  return uid;
}

function referralLeadId(brokerUid: string, ownerUid: string) {
  return crypto.createHash("sha256").update(`${brokerUid}:${ownerUid}`).digest("hex");
}

// Referral capture is available to a verified Firebase Owner even when a public
// browser cannot obtain an App Check token. Authorization remains bound to the
// verified Owner token and every write is server-side.
export const captureBrokerReferralAttribution = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: false },
  async (request) => {
    const ownerUid = requireOwner(request.auth);
    const brokerUid = validBrokerUid(request.data?.brokerUid || request.data?.broker);
    if (brokerUid === ownerUid) {
      throw new HttpsError("invalid-argument", "An Owner cannot refer their own account.");
    }

    const intakeId = text(request.data?.intakeId || request.data?.onboardingSubmissionId, 160) || null;
    const ownerEmail = normalized(request.auth?.token?.email);
    const ownerName = text(request.auth?.token?.name || request.data?.ownerName, 160) || "BIN GROUP Owner";
    const brokerRef = db.collection("users").doc(brokerUid);
    const brokerKycRef = db.collection("broker_kyc_profiles").doc(brokerUid);
    const attributionRef = db.collection("broker_attributions").doc(ownerUid);
    const leadId = referralLeadId(brokerUid, ownerUid);
    const leadRef = db.collection("brokerLeads").doc(leadId);
    const auditRef = db.collection("audit_logs").doc();

    const result = await db.runTransaction(async (tx) => {
      const [brokerSnap, brokerKycSnap, existingAttributionSnap, existingLeadSnap] = await Promise.all([
        tx.get(brokerRef),
        tx.get(brokerKycRef),
        tx.get(attributionRef),
        tx.get(leadRef),
      ]);

      if (!brokerSnap.exists) throw new HttpsError("not-found", "The Broker referral account was not found.");
      const broker = brokerSnap.data() || {};
      const brokerRole = normalized(broker.role || broker.userRole || broker.primaryRole);
      const brokerStatus = normalized(broker.status || broker.accountStatus || broker.profileStatus);
      if (brokerRole !== "broker" || broker.suspended === true || broker.disabled === true || BLOCKED_STATUSES.has(brokerStatus)) {
        throw new HttpsError("failed-precondition", "The Broker referral account is not active.");
      }

      const existing = existingAttributionSnap.data() || {};
      const existingLead = existingLeadSnap.data() || {};
      const existingBrokerUid = text(existing.brokerUid || existing.brokerId, 128);
      if (existingBrokerUid && existingBrokerUid !== brokerUid) {
        throw new HttpsError("already-exists", "This Owner is already locked to another Broker referral.");
      }

      const referralCode = text(existing.referralCode || existingLead.referralCode, 160) || `BIN-${brokerUid}`;
      if (existingBrokerUid === brokerUid) {
        return {
          attributionId: text(existing.attributionId, 160) || leadId,
          leadId,
          referralCode,
          kycStatus: normalized(existing.kycStatusAtCapture || "already_captured"),
          idempotent: true,
          preservedLifecycleStatus: text(existingLead.lifecycleStatus || existingLead.status, 160) || null,
        };
      }

      const kyc = brokerKycSnap.data() || {};
      const kycStatus = normalized(kyc.status || kyc.verificationStatus || kyc.kycStatus || "not_submitted");
      const kycApproved = ["approved", "verified", "active"].includes(kycStatus);
      const now = serverTimestamp();
      const attributionId = leadId;

      tx.set(attributionRef, {
        attributionId,
        brokerId: brokerUid,
        brokerUid,
        brokerEmail: normalized(broker.email) || null,
        brokerName: text(broker.displayName || broker.fullName || broker.name, 160) || "BIN Broker",
        ownerId: ownerUid,
        ownerUid,
        ownerEmail: ownerEmail || null,
        ownerName,
        intakeId,
        sourceLeadId: leadId,
        referralCode,
        attributionLocked: true,
        attributionStatus: "LOCKED",
        commissionEligibilityStatus: kycApproved ? "BROKER_KYC_APPROVED" : "BROKER_KYC_REVIEW_REQUIRED",
        kycStatusAtCapture: kycStatus,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      tx.set(leadRef, {
        leadId,
        attributionId,
        sourceLeadId: leadId,
        brokerId: brokerUid,
        brokerUid,
        brokerEmail: normalized(broker.email) || null,
        brokerName: text(broker.displayName || broker.fullName || broker.name, 160) || "BIN Broker",
        ownerId: ownerUid,
        ownerUid,
        ownerEmail: ownerEmail || null,
        ownerName,
        intakeId,
        referralCode,
        status: text(existingLead.status, 80) || "SUBMITTED",
        lifecycleStatus: text(existingLead.lifecycleStatus, 80) || "OWNER_REGISTERED",
        source: text(existingLead.source, 120) || "BROKER_REFERRAL_LINK",
        attributionLocked: true,
        requiresAdminAttribution: existingLead.requiresAdminAttribution === true,
        commissionEligible: existingLead.commissionEligible === true,
        commissionStatus: text(existingLead.commissionStatus, 120) || (kycApproved ? "PENDING_CONTRACT_ACTIVATION" : "HOLD_BROKER_KYC"),
        createdAt: existingLead.createdAt || now,
        updatedAt: now,
      }, { merge: true });

      tx.set(auditRef, {
        actorId: ownerUid,
        actorRole: "owner",
        action: "BROKER_REFERRAL_ATTRIBUTION_CAPTURED",
        targetType: "broker_attributions",
        targetId: ownerUid,
        metadata: {
          brokerUid,
          sourceLeadId: leadId,
          intakeId,
          kycStatusAtCapture: kycStatus,
          attributionLocked: true,
        },
        createdAt: now,
      });

      return { attributionId, leadId, referralCode, kycStatus, idempotent: false };
    });

    return {
      status: "SUCCESS",
      ownerUid,
      brokerUid,
      ...result,
    };
  },
);
