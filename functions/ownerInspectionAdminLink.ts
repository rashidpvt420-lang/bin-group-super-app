import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const text = (value: unknown) => String(value || "").trim();
const roleOf = (token: any) => text(token?.role || token?.userRole || token?.primaryRole).toLowerCase();

async function requireAdmin(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = request.auth.token || {};
  if (
    token.suspended === true ||
    !(ADMIN_ROLES.has(roleOf(token)) || token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true)
  ) throw new HttpsError("permission-denied", "Admin permission required.");
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled) throw new HttpsError("permission-denied", "Disabled Admin account.");
  return { uid: request.auth.uid, email: text(token.email || user.email).toLowerCase() };
}

export const adminLinkOwnerPropertyInspection = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const actor = await requireAdmin(request);
  const intakeId = text(request.data?.intakeId);
  const inspectionId = text(request.data?.inspectionId);
  if (!intakeId || !inspectionId) throw new HttpsError("invalid-argument", "intakeId and inspectionId are required.");

  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const inspectionRef = db.collection("property_inspections").doc(inspectionId);
  const [intakeSnap, inspectionSnap] = await Promise.all([intakeRef.get(), inspectionRef.get()]);
  if (!intakeSnap.exists) throw new HttpsError("not-found", "Owner application not found.");
  if (!inspectionSnap.exists) throw new HttpsError("not-found", "Property inspection not found.");
  const inspection = inspectionSnap.data() || {};
  if (text(inspection.intakeId) !== intakeId) throw new HttpsError("failed-precondition", "Inspection does not belong to this Owner application.");

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(intakeRef, {
    inspectionId,
    inspectionStatus: "READY_FOR_SITE_VISIT",
    adminReviewState: "SITE_VISIT_CREATED_PENDING_COMPLETION",
    activationState: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("payment_transactions").doc(intakeId), {
    inspectionId,
    inspectionStatus: "READY_FOR_SITE_VISIT",
    inspectionVerified: false,
    status: "AWAITING_SITE_INSPECTION",
    paymentStatus: "AWAITING_SITE_INSPECTION",
    verificationState: "INSPECTION_REQUIRED_BEFORE_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("contracts").doc(intakeId), {
    inspectionId,
    inspectionStatus: "READY_FOR_SITE_VISIT",
    activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    actorId: actor.uid,
    actorEmail: actor.email,
    actorRole: "admin",
    action: "LINK_OWNER_PROPERTY_INSPECTION_TO_APPLICATION",
    targetType: "intake_submissions",
    targetId: intakeId,
    metadata: { inspectionId },
    createdAt: now,
  });
  await batch.commit();
  return { status: "LINKED", intakeId, inspectionId };
});
