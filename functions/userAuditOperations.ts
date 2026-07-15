import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;
const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "ceo",
  "manager",
  "operations_admin",
  "finance_admin",
  "hr_admin",
]);
const PRIVILEGED_ACTION = /(^ADMIN_|APPROV|ACTIVAT|VERIFY|VERIFIED|PAYOUT|COMMISSION|MARK_PAID|ROLE_|CLAIM_|SUSPEND|DELETE|TERMINAT)/;

function text(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    const safeKey = text(key, 60).replace(/[^A-Za-z0-9_.-]/g, "_");
    if (!safeKey) continue;
    if (typeof entry === "number" && Number.isFinite(entry)) output[safeKey] = entry;
    else if (typeof entry === "boolean" || entry === null) output[safeKey] = entry;
    else output[safeKey] = text(entry, 500);
  }
  return output;
}

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
  const token = request.auth.token || {};
  const role = text(token.role || token.userRole || token.primaryRole || "user", 80).toLowerCase();
  const isAdmin = token.admin === true || token.isAdmin === true || token.ceo === true || ADMIN_ROLES.has(role);
  const canonicalAction = normalizedAction.toUpperCase();
  if (!isAdmin && PRIVILEGED_ACTION.test(canonicalAction)) {
    throw new HttpsError(
      "permission-denied",
      "Privileged operational outcomes are recorded only by their authoritative server workflow.",
    );
  }

  await db.collection("audit_logs").add({
    actorId,
    actorRole: role,
    actorEmail: request.auth.token?.email || null,
    action: canonicalAction,
    targetType: normalizedTargetType,
    targetId: normalizedTargetId,
    metadata: safeMetadata(metadata),
    trustLevel: isAdmin ? "ADMIN_ASSERTED" : "USER_ASSERTED",
    source: "CALLABLE_LOG_USER_AUDIT_ACTION",
    createdAt: ts(),
  });

  return { success: true };
});
