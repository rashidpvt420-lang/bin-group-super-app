import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

export const decideOwnerTurnoverQuote = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Owner authentication is required.");
    }

    const quoteId = clean(request.data?.quoteId);
    const decision = clean(request.data?.decision, 24).toUpperCase();
    if (!quoteId || quoteId.includes("/") || quoteId === "." || quoteId === "..") {
      throw new HttpsError("invalid-argument", "A valid turnover quote ID is required.");
    }
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      throw new HttpsError("invalid-argument", "Decision must be APPROVED or REJECTED.");
    }

    const quoteRef = db.collection("turnover-quotes").doc(quoteId);
    const auditRef = db.collection("audit_logs").doc();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(quoteRef);
      if (!snap.exists) throw new HttpsError("not-found", "Turnover quote not found.");

      const quote = snap.data() || {};
      if (clean(quote.ownerId) !== request.auth?.uid) {
        throw new HttpsError("permission-denied", "This turnover quote does not belong to the signed-in Owner.");
      }

      const currentStatus = clean(quote.status, 40).toUpperCase();
      if (currentStatus === decision) return;
      if (currentStatus !== "PENDING") {
        throw new HttpsError("failed-precondition", "Only pending turnover quotes can be decided.");
      }

      const now = FieldValue.serverTimestamp();
      tx.set(quoteRef, {
        status: decision,
        decidedBy: request.auth.uid,
        decidedAt: now,
        updatedAt: now,
      }, { merge: true });
      tx.create(auditRef, {
        action: decision === "APPROVED" ? "OWNER_TURNOVER_QUOTE_APPROVED" : "OWNER_TURNOVER_QUOTE_REJECTED",
        actorId: request.auth.uid,
        actorRole: "owner",
        targetType: "turnover-quotes",
        targetId: quoteId,
        propertyId: clean(quote.propertyId) || null,
        unitId: clean(quote.unitId) || null,
        serverAuthoritative: true,
        createdAt: now,
      });
    });

    return { success: true, quoteId, decision };
  },
);
