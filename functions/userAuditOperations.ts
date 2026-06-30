import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;

export const logUserAuditAction = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { action, targetType, targetId, metadata } = request.data;
  
  if (!action || !targetType || !targetId) {
    throw new HttpsError("invalid-argument", "Missing required fields: action, targetType, targetId");
  }

  const actorId = request.auth.uid;
  
  const userDoc = await db.collection("users").doc(actorId).get();
  const role = userDoc.data()?.role || "user";

  const auditEntry = {
    actorId,
    actorRole: role,
    action,
    targetType,
    targetId,
    metadata: metadata || {},
    createdAt: ts()
  };

  await db.collection("audit_logs").add(auditEntry);
  return { success: true };
});
