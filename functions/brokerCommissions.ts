import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => admin.firestore.FieldValue.serverTimestamp();

// Default brokerage commission rate, matching the 10% figure already used in the
// broker portal's inline estimate (src/pages/BrokerPortalPage.tsx).
const COMMISSION_RATE = 0.1;

const roleOf = (value: unknown) => String(value || "").trim().toLowerCase();
const ADMIN_ROLES = new Set(["admin", "ceo", "super_admin", "manager", "operations_admin", "finance_admin"]);

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const claims = auth.token || {};
  if (claims.admin === true || claims.isAdmin === true || ADMIN_ROLES.has(roleOf(claims.role))) return;

  const profile = await db.collection("users").doc(auth.uid).get();
  const data = profile.data() || {};
  if (data.isAdmin === true || data.admin === true || ADMIN_ROLES.has(roleOf(data.role))) return;

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
 * Idempotency is the caller's responsibility (guard on contract.commissionGenerated).
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
    opts.amountReceived ||
    contract.annualContractValue ||
    contract.amountReceived ||
    contract.mobilizationAmount ||
    0,
  );
  const amount = Math.round(base * COMMISSION_RATE * 100) / 100;
  const now = ts();

  const commissionRef = db.collection("broker_commissions").doc();
  await commissionRef.set({
    brokerId,
    brokerUid: brokerId,
    brokerName,
    brokerCode,
    contractId,
    propertyName: contract.propertyName || contract.propertyTitle || "",
    linkedProperty: contract.propertyName || contract.propertyTitle || "",
    amount,
    percentage: COMMISSION_RATE * 100,
    commissionBase: base,
    currency: String(contract.currency || "AED").trim().toUpperCase(),
    status: reraVerified ? "PENDING" : "HOLD",
    complianceHold: !reraVerified,
    holdReason: reraVerified ? null : "BROKER_RERA_UNVERIFIED",
    reraVerifiedAtCreation: reraVerified,
    source: "CONTRACT_ACTIVATION",
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("auditLogs").add({
    action: "BROKER_COMMISSION_CREATED",
    commissionId: commissionRef.id,
    brokerId,
    contractId,
    amount,
    heldForRera: !reraVerified,
    createdAt: now,
  });

  return { commissionId: commissionRef.id, brokerId, amount, status: reraVerified ? "PENDING" : "HOLD" };
}

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
