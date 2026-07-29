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
  const suppliedIds = Array.isArray(request.data?.inspectionIds)
    ? request.data.inspectionIds
    : [request.data?.inspectionId];
  const inspectionIds = Array.from(new Set(suppliedIds.map(text).filter(Boolean))).slice(0, 100);
  if (!intakeId || !inspectionIds.length) throw new HttpsError("invalid-argument", "intakeId and at least one inspection ID are required.");

  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const inspectionRefs = inspectionIds.map((inspectionId) => db.collection("property_inspections").doc(inspectionId));
  const [intakeSnap, ...inspectionSnaps] = await Promise.all([intakeRef.get(), ...inspectionRefs.map((ref) => ref.get())]);
  if (!intakeSnap.exists) throw new HttpsError("not-found", "Owner application not found.");
  inspectionSnaps.forEach((inspectionSnap, index) => {
    if (!inspectionSnap.exists) throw new HttpsError("not-found", `Property inspection ${inspectionIds[index]} was not found.`);
    if (text(inspectionSnap.data()?.intakeId) !== intakeId) throw new HttpsError("failed-precondition", "An inspection does not belong to this Owner application.");
  });

  const propertyCount = Array.isArray(intakeSnap.data()?.properties) ? intakeSnap.data()?.properties.length : 0;
  if (propertyCount > 0 && inspectionIds.length !== propertyCount) {
    throw new HttpsError("failed-precondition", `Create one site inspection for every property. Expected ${propertyCount}, received ${inspectionIds.length}.`);
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(intakeRef, {
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionCount: inspectionIds.length,
    inspectionStatus: "READY_FOR_SITE_VISITS",
    adminReviewState: "SITE_VISITS_CREATED_PENDING_COMPLETION",
    activationState: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("payment_transactions").doc(intakeId), {
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionCount: inspectionIds.length,
    inspectionStatus: "READY_FOR_SITE_VISITS",
    inspectionVerified: false,
    status: "AWAITING_SITE_INSPECTION",
    paymentStatus: "AWAITING_SITE_INSPECTION",
    verificationState: "INSPECTION_REQUIRED_BEFORE_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("contracts").doc(intakeId), {
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionCount: inspectionIds.length,
    inspectionStatus: "READY_FOR_SITE_VISITS",
    activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    actorId: actor.uid,
    actorEmail: actor.email,
    actorRole: "admin",
    action: "LINK_OWNER_PROPERTY_INSPECTIONS_TO_APPLICATION",
    targetType: "intake_submissions",
    targetId: intakeId,
    metadata: { inspectionIds, inspectionCount: inspectionIds.length },
    createdAt: now,
  });
  await batch.commit();
  return { status: "LINKED", intakeId, inspectionId: inspectionIds[0], inspectionIds };
});
