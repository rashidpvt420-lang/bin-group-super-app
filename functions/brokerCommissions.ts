import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();

const MIN_COMMISSION_RATE = 0.05;
const MAX_COMMISSION_RATE = 0.08;
const DEFAULT_COMMISSION_RATE = MIN_COMMISSION_RATE;

const roleOf = (value: unknown) => String(value || "").trim().toLowerCase();
const ADMIN_ROLES = new Set(["admin", "ceo", "super_admin", "manager", "operations_admin", "finance_admin"]);

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const claims = auth.token || {};
  if (claims.admin === true || claims.isAdmin === true || ADMIN_ROLES.has(roleOf(claims.role))) return;
  throw new HttpsError("permission-denied", "Admin permission required.");
}

/**
 * Light-touch RERA/BRN format check: alphanumeric (separators allowed), 3-24
 * chars, must contain at least one digit. This is intentionally permissive —
 * it guards against blank/garbage values, not a full registry lookup.
 */
export function isValidReraFormat(license: string): boolean {
  const cleaned = String(license || "").replace(/[\s\-/]/g, "");
  return /^[A-Za-z0-9]{3,24}$/.test(cleaned) && /\d/.test(cleaned);
}

/**
 * Resolve the broker attached to a contract (directly, or via the linked
 * intake submission) and write an initial broker_commissions record. The
 * commission is created in a PENDING state when the broker is RERA-verified,
 * or a HOLD state otherwise (released later by setBrokerReraVerification).
 *
 * A deterministic commission ID and Firestore transaction enforce idempotency.
 * Returns null when the deal has no associated broker.
 */
export async function createBrokerCommissionForContract(
  contractId: string,
  contract: FirebaseFirestore.DocumentData,
  opts: { amountReceived?: number; annualContractValue?: number } = {},
): Promise<{ commissionId: string; brokerId: string; amount: number; status: string } | null> {
  let brokerId = String(contract.brokerId || contract.brokerUid || "").trim();
  let brokerName = String(contract.brokerName || "").trim();
  let brokerCode = String(contract.brokerCode || "").trim();

  if (!brokerId && contract.intakeId) {
    const intakeSnap = await db.collection("intake_submissions").doc(String(contract.intakeId)).get();
    const intake = intakeSnap.data() || {};
    brokerId = String(intake.brokerId || intake.brokerUid || "").trim();
    brokerName = brokerName || String(intake.brokerName || "").trim();
    brokerCode = brokerCode || String(intake.brokerCode || "").trim();
  }

  if (!brokerId) return null;

  const brokerSnap = await db.collection("users").doc(brokerId).get();
  const broker = brokerSnap.data() || {};
  const reraVerified = broker.reraVerified === true;
  brokerName = brokerName || String(broker.displayName || broker.name || "Broker").trim();
  brokerCode = brokerCode || `BIN-${brokerId.slice(0, 6).toUpperCase()}`;

  const base = Number(
    opts.annualContractValue ||
    contract.quoteSnapshot?.annualContractValue ||
    contract.annualContractValue ||
    0,
  );
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error("Broker commission requires a positive locked annual contract value.");
  }
  const requestedCommissionRate = Number(
    contract.brokerCommissionRate ||
    contract.commissionRate ||
    broker.brokerCommissionRate ||
    broker.commissionRate ||
    DEFAULT_COMMISSION_RATE,
  );
  const commissionRateApproved =
    Number.isFinite(requestedCommissionRate) &&
    requestedCommissionRate >= MIN_COMMISSION_RATE &&
    requestedCommissionRate <= MAX_COMMISSION_RATE;
  const commissionRate = commissionRateApproved ? requestedCommissionRate : DEFAULT_COMMISSION_RATE;
  const amount = commissionRateApproved ? Math.round(base * commissionRate * 100) / 100 : 0;
  const complianceHold = !reraVerified || !commissionRateApproved;
  const holdReason = !commissionRateApproved
    ? "COMMISSION_RATE_REQUIRES_ADMIN_REVIEW"
    : reraVerified
      ? null
      : "BROKER_RERA_UNVERIFIED";
  const now = ts();

  const commissionRef = db.collection("broker_commissions").doc(`commission_${contractId}`);
  return db.runTransaction(async (transaction) => {
    const existingCommission = await transaction.get(commissionRef);
    if (existingCommission.exists) {
      const existing = existingCommission.data() || {};
      return {
        commissionId: commissionRef.id,
        brokerId: String(existing.brokerId || brokerId),
        amount: Number(existing.amount || 0),
        status: String(existing.status || "PENDING"),
      };
    }
    transaction.create(commissionRef, {
      brokerId,
      brokerUid: brokerId,
      brokerName,
      brokerCode,
      contractId,
      propertyName: contract.propertyName || contract.propertyTitle || "",
      linkedProperty: contract.propertyName || contract.propertyTitle || "",
      amount,
      percentage: commissionRate * 100,
      commissionBase: base,
      currency: String(contract.currency || "AED").trim().toUpperCase(),
      status: complianceHold ? "HOLD" : "PENDING",
      complianceHold,
      holdReason,
      requestedPercentage: Number.isFinite(requestedCommissionRate) ? requestedCommissionRate * 100 : null,
      reraVerifiedAtCreation: reraVerified,
      source: "CONTRACT_ACTIVATION",
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(db.collection("contracts").doc(contractId), {
      commissionGenerated: true,
      commissionId: commissionRef.id,
      updatedAt: now,
    }, { merge: true });
    transaction.create(db.collection("auditLogs").doc(`broker_commission_${contractId}`), {
      action: "BROKER_COMMISSION_CREATED",
      commissionId: commissionRef.id,
      brokerId,
      contractId,
      amount,
      heldForRera: !reraVerified,
      heldForCommissionRate: !commissionRateApproved,
      createdAt: now,
    });
    return { commissionId: commissionRef.id, brokerId, amount, status: complianceHold ? "HOLD" : "PENDING" };
  });
}

export const reconcileBrokerCommissionOnContractActivation = onDocumentUpdated(
  { document: "contracts/{contractId}", region: "europe-west3" },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const becameActive = roleOf(after.status) === "active" && roleOf(before.status) !== "active";
    const needsRepair = roleOf(after.status) === "active" && after.commissionGenerated !== true;
    if (!becameActive && !needsRepair) return;
    await createBrokerCommissionForContract(String(event.params.contractId), after, {
      annualContractValue: Number(after.quoteSnapshot?.annualContractValue || after.annualContractValue || 0),
    });
  },
);

/**
 * Admin-only: set (or clear) a broker's RERA verification flag. Verifying a
 * broker also releases any commissions that were held because the broker was
 * not yet verified, moving them into the normal PENDING approval queue.
 */
export const setBrokerReraVerification = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  await requireAdmin(request.auth);

  const brokerId = String(request.data?.brokerId || "").trim();
  const verified = request.data?.verified === true;
  const reason = String(request.data?.reason || "").trim();
  if (!brokerId) throw new HttpsError("invalid-argument", "brokerId is required.");

  const userRef = db.collection("users").doc(brokerId);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Broker not found.");

  const broker = snap.data() || {};
  const license = String(broker.reraLicense || "").trim();
  if (verified && !isValidReraFormat(license)) {
    throw new HttpsError("failed-precondition", "Broker RERA license number is missing or invalid; cannot verify.");
  }

  const now = ts();
  await userRef.set({
    reraVerified: verified,
    reraStatus: verified ? "VERIFIED" : "REJECTED",
    reraReviewedBy: request.auth?.uid || "admin",
    reraReviewedAt: now,
    reraReviewNote: reason || null,
    updatedAt: now,
  }, { merge: true });

  let released = 0;
  if (verified) {
    const holds = await db.collection("broker_commissions")
      .where("brokerId", "==", brokerId)
      .where("status", "==", "HOLD")
      .get();
    if (!holds.empty) {
      const batch = db.batch();
      holds.forEach((d) => {
        if (String(d.data().holdReason || "") !== "BROKER_RERA_UNVERIFIED") return;
        batch.set(d.ref, {
          status: "PENDING",
          complianceHold: false,
          holdReason: null,
          releasedAt: now,
          updatedAt: now,
        }, { merge: true });
        released += 1;
      });
      await batch.commit();
    }
  }

  await db.collection("auditLogs").add({
    action: verified ? "ADMIN_VERIFY_BROKER_RERA" : "ADMIN_REJECT_BROKER_RERA",
    actorId: request.auth?.uid || "admin",
    brokerId,
    reason: reason || null,
    releasedCommissions: released,
    createdAt: now,
  });

  return { status: "SUCCESS", brokerId, verified, releasedCommissions: released };
});

export const adminReviewBrokerCommission = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireAdmin(request.auth);
    const commissionId = String(request.data?.commissionId || "").trim();
    const action = String(request.data?.action || "").trim().toUpperCase();
    const reason = String(request.data?.reason || "").trim().slice(0, 1000);
    const paymentReference = String(request.data?.paymentReference || "").trim().slice(0, 180);
    if (!commissionId || !["APPROVE", "REJECT", "MARK_PAID"].includes(action)) {
      throw new HttpsError("invalid-argument", "commissionId and a valid action are required.");
    }
    if (action === "REJECT" && reason.length < 8) {
      throw new HttpsError("invalid-argument", "A clear rejection reason is required.");
    }

    const commissionRef = db.collection("broker_commissions").doc(commissionId);
    const auditRef = db.collection("auditLogs").doc(`commission_review_${commissionId}_${action}`);
    const now = ts();
    let idempotent = false;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(commissionRef);
      if (!snap.exists) throw new HttpsError("not-found", "Commission not found.");
      const commission = snap.data() || {};
      if (commission.complianceHold === true || Number(commission.amount || 0) <= 0) {
        throw new HttpsError("failed-precondition", "Held or zero-value commissions cannot be approved or paid.");
      }
      const currentStatus = String(commission.status || "").toUpperCase();
      const targetStatus = action === "MARK_PAID" ? "PAID" : action === "APPROVE" ? "APPROVED" : "REJECTED";
      if (currentStatus === targetStatus) {
        idempotent = true;
        return;
      }
      if (action === "MARK_PAID" && currentStatus !== "APPROVED") {
        throw new HttpsError("failed-precondition", "Only an approved commission can be marked paid.");
      }
      if (action === "MARK_PAID") {
        const brokerId = String(commission.brokerId || "").trim();
        const brokerSnap = await transaction.get(db.collection("users").doc(brokerId));
        const broker = brokerSnap.data() || {};
        const payoutVerified = broker.ibanVerified === true ||
          broker.payoutVerified === true ||
          broker.bankDetails?.verified === true;
        if (
          !brokerSnap.exists ||
          !payoutVerified ||
          String(commission.payoutStatus || "").toUpperCase() !== "APPROVED" ||
          paymentReference.length < 4
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Paid status requires an approved payout request, verified broker IBAN, and payment reference.",
          );
        }
      }
      if (action === "APPROVE" && !["PENDING", "REJECTED"].includes(currentStatus)) {
        throw new HttpsError("failed-precondition", "Commission is not awaiting approval.");
      }
      transaction.set(commissionRef, {
        status: targetStatus,
        ...(action === "APPROVE" ? { approvedAt: now, approvedBy: request.auth!.uid } : {}),
        ...(action === "REJECT" ? { rejectionReason: reason, rejectedAt: now, rejectedBy: request.auth!.uid } : {}),
        ...(action === "MARK_PAID" ? {
          paidAt: now,
          paidBy: request.auth!.uid,
          payoutStatus: "PAID",
          paymentReference,
        } : {}),
        updatedAt: now,
      }, { merge: true });
      transaction.set(auditRef, {
        action: `ADMIN_${action}_BROKER_COMMISSION`,
        actorId: request.auth!.uid,
        commissionId,
        brokerId: commission.brokerId || null,
        contractId: commission.contractId || null,
        amount: Number(commission.amount || 0),
        currency: String(commission.currency || "AED"),
        reason: reason || null,
        createdAt: now,
      });
    });
    return { status: "SUCCESS", commissionId, action, idempotent };
  },
);

export const adminMatchBrokerAttribution = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireAdmin(request.auth);
    const leadId = String(request.data?.leadId || "").trim();
    const contractId = String(request.data?.contractId || "").trim();
    const intakeId = String(request.data?.intakeId || "").trim();
    const ownerId = String(request.data?.ownerId || "").trim();
    const propertyId = String(request.data?.propertyId || "").trim();
    if (!leadId || !contractId) {
      throw new HttpsError("invalid-argument", "A broker lead and active contract are required.");
    }
    const [leadSnap, contractSnap] = await Promise.all([
      db.collection("brokerLeads").doc(leadId).get(),
      db.collection("contracts").doc(contractId).get(),
    ]);
    if (!leadSnap.exists || !contractSnap.exists) {
      throw new HttpsError("not-found", "Broker lead or contract was not found.");
    }
    const lead = leadSnap.data() || {};
    const contract = contractSnap.data() || {};
    const brokerId = String(lead.brokerId || lead.brokerUid || "").trim();
    if (!brokerId || String(contract.status || "").toUpperCase() !== "ACTIVE") {
      throw new HttpsError("failed-precondition", "Commission attribution requires a broker-owned lead and active contract.");
    }
    const leadStatus = String(lead.status || "").trim().toLowerCase();
    if (leadStatus === "converted") {
      if (String(lead.matchedContractId || "") !== contractId) {
        throw new HttpsError("already-exists", "Lead is already attributed to another contract.");
      }
      return {
        status: "SUCCESS",
        leadId,
        contractId,
        commissionId: String(lead.commissionId || `commission_${contractId}`),
        brokerId,
        amount: Number(lead.commissionAmount || 0),
        idempotent: true,
      };
    }
    if (leadStatus !== "negotiation") {
      throw new HttpsError(
        "failed-precondition",
        "Lead must be in negotiation before it can be matched to an active contract.",
      );
    }
    const existingContractBroker = String(contract.brokerId || contract.brokerUid || "").trim();
    if (existingContractBroker && existingContractBroker !== brokerId) {
      throw new HttpsError("already-exists", "Contract is already attributed to another broker.");
    }
    const contractOwnerId = String(contract.ownerUid || contract.ownerId || "").trim();
    const contractPropertyId = String(contract.propertyId || "").trim();
    const contractIntakeId = String(contract.intakeId || "").trim();
    if (
      (ownerId && ownerId !== contractOwnerId) ||
      (propertyId && contractPropertyId && propertyId !== contractPropertyId) ||
      (intakeId && contractIntakeId && intakeId !== contractIntakeId)
    ) {
      throw new HttpsError("failed-precondition", "Attribution targets do not match the active contract.");
    }

    const attributionId = String(lead.attributionId || `broker_lead_${brokerId}_${leadId}`);
    const commission = await createBrokerCommissionForContract(contractId, {
      ...contract,
      brokerId,
      brokerUid: brokerId,
      brokerName: lead.brokerName || lead.brokerDisplayName || lead.brokerEmail || "",
      brokerCode: lead.brokerCode || "",
      intakeId: contractIntakeId || intakeId,
    });
    if (!commission) throw new HttpsError("internal", "Commission could not be created.");

    const now = ts();
    const batch = db.batch();
    batch.set(db.collection("brokerLeads").doc(leadId), {
      status: "converted",
      commissionStatus: "MATCHED_TO_CONTRACT",
      commissionCreationStatus: "COMMISSION_CREATED_SERVER_SIDE",
      commissionId: commission.commissionId,
      commissionAmount: commission.amount,
      matchedOwnerId: contractOwnerId || ownerId || null,
      matchedPropertyId: contractPropertyId || propertyId || null,
      matchedContractId: contractId,
      matchedIntakeId: contractIntakeId || intakeId || null,
      matchedAt: now,
      matchedBy: request.auth!.uid,
      updatedAt: now,
    }, { merge: true });
    batch.set(db.collection("contracts").doc(contractId), {
      brokerId,
      brokerUid: brokerId,
      brokerLeadId: leadId,
      brokerAttributionId: attributionId,
      updatedAt: now,
    }, { merge: true });
    batch.set(db.collection("auditLogs").doc(`broker_attribution_${leadId}_${contractId}`), {
      action: "ADMIN_MATCH_BROKER_ATTRIBUTION",
      actorId: request.auth!.uid,
      brokerId,
      leadId,
      contractId,
      commissionId: commission.commissionId,
      attributionId,
      createdAt: now,
    });
    await batch.commit();
    return { ...commission, status: "SUCCESS", leadId, contractId, idempotent: false };
  },
);
