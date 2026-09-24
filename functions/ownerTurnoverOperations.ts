import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const upper = (value: unknown) => text(value, 80).toUpperCase();

async function requireVerifiedOwner(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");
  const token = auth.token || {};
  const role = text(token.role || token.userRole || token.primaryRole, 40).toLowerCase();
  if (role !== "owner" || token.suspended === true || token.email_verified !== true) {
    throw new HttpsError("permission-denied", "A verified, active Owner account is required.");
  }
  const record = await admin.auth().getUser(auth.uid);
  if (record.disabled || !record.emailVerified) {
    throw new HttpsError("permission-denied", "The Owner account is not active and verified.");
  }
}

export const ownerDecideTurnoverQuote = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireVerifiedOwner(request.auth);
    const ownerUid = request.auth!.uid;
    const quoteId = text(request.data?.quoteId, 180);
    const decision = upper(request.data?.decision);
    if (!quoteId || !["APPROVED", "REJECTED"].includes(decision)) {
      throw new HttpsError("invalid-argument", "A valid quoteId and APPROVED or REJECTED decision are required.");
    }

    const quoteRef = db.collection("turnover-quotes").doc(quoteId);
    const auditRef = db.collection("audit_logs").doc(
      `owner_turnover_decision_${quoteId}_${decision.toLowerCase()}`,
    );

    let idempotent = false;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(quoteRef);
      if (!snap.exists) throw new HttpsError("not-found", "Turnover quote not found.");
      const quote = snap.data() || {};
      if (text(quote.ownerId || quote.ownerUid, 180) !== ownerUid) {
        throw new HttpsError("permission-denied", "This turnover quote belongs to another Owner.");
      }

      const currentStatus = upper(quote.status);
      if (currentStatus === decision) {
        idempotent = true;
        return;
      }
      if (!["PENDING", "PENDING_APPROVAL"].includes(currentStatus)) {
        throw new HttpsError(
          "failed-precondition",
          `Turnover quote cannot move from ${currentStatus || "UNKNOWN"} to ${decision}.`,
        );
      }

      const now = FieldValue.serverTimestamp();
      transaction.update(quoteRef, {
        status: decision,
        ownerDecision: decision,
        ownerDecisionAt: now,
        ownerDecisionBy: ownerUid,
        updatedAt: now,
      });
      transaction.set(auditRef, {
        action: decision === "APPROVED" ? "OWNER_TURNOVER_QUOTE_APPROVED" : "OWNER_TURNOVER_QUOTE_REJECTED",
        actorId: ownerUid,
        actorRole: "owner",
        quoteId,
        propertyId: text(quote.propertyId, 180) || null,
        unitId: text(quote.unitId, 180) || null,
        previousStatus: currentStatus,
        decision,
        source: "OWNER_PORTAL_CALLABLE",
        createdAt: now,
      }, { merge: false });
    });

    return { ok: true, quoteId, decision, idempotent };
  },
);
