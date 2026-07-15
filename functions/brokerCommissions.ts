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
