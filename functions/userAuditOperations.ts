import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;

export const logUserAuditAction = onCall({ region: "europe-west3", cors: true, enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { action, targetType, targetId, metadata } = request.data || {};
  const normalizedAction = String(action || "").trim();
  const normalizedTargetType = String(targetType || "").trim();
  const normalizedTargetId = String(targetId || "").trim();

  if (!normalizedAction || !normalizedTargetType || !normalizedTargetId) {
    throw new HttpsError("invalid-argument", "Missing required fields: action, targetType, targetId");
  }
  if (normalizedAction.length > 160 || normalizedTargetType.length > 160 || normalizedTargetId.length > 240) {
    throw new HttpsError("invalid-argument", "Audit identifiers exceed the allowed length.");
  }

  const actorId = request.auth.uid;
  const userDoc = await db.collection("users").doc(actorId).get();
  const role = String(userDoc.data()?.role || request.auth.token?.role || "user").trim().toLowerCase();

  const safeMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {};

  await db.collection("audit_logs").add({
    actorId,
    actorRole: role,
    actorEmail: request.auth.token?.email || null,
    action: normalizedAction,
    targetType: normalizedTargetType,
    targetId: normalizedTargetId,
    metadata: safeMetadata,
    createdAt: ts(),
  });

  return { success: true };
});
