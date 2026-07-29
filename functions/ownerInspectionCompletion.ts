import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const text = (value: unknown) => String(value || "").trim();
const roleOf = (token: any) => text(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

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

export const adminCompleteOwnerPortfolioInspections = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const actor = await requireAdmin(request);
  const intakeId = text(request.data?.intakeId);
  const notes = text(request.data?.notes || request.data?.inspectionNotes);
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  if (notes.length < 8) throw new HttpsError("invalid-argument", "Record clear portfolio inspection notes.");

  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const paymentRef = db.collection("payment_transactions").doc(intakeId);
  const contractRef = db.collection("contracts").doc(intakeId);
  const [intakeSnap, paymentSnap, contractSnap] = await Promise.all([intakeRef.get(), paymentRef.get(), contractRef.get()]);
  if (!intakeSnap.exists || !paymentSnap.exists || !contractSnap.exists) throw new HttpsError("failed-precondition", "The inspection-first onboarding package is incomplete.");
  const intake = intakeSnap.data() || {};
  if (text(intake.workflowVersion) !== WORKFLOW_VERSION) throw new HttpsError("failed-precondition", "This action is only for the five-page inspection-first workflow.");

  const properties = Array.isArray(intake.properties) ? intake.properties : [];
  const inspectionIds = Array.isArray(intake.inspectionIds)
    ? Array.from(new Set(intake.inspectionIds.map(text).filter(Boolean)))
    : [text(intake.inspectionId)].filter(Boolean);
  if (!properties.length || inspectionIds.length !== properties.length) {
    throw new HttpsError("failed-precondition", `Every property requires a linked site inspection. Expected ${properties.length}, found ${inspectionIds.length}.`);
  }
  const inspectionRefs = inspectionIds.map((inspectionId) => db.collection("property_inspections").doc(inspectionId));
  const inspectionSnaps = await Promise.all(inspectionRefs.map((ref) => ref.get()));
  inspectionSnaps.forEach((snapshot, index) => {
    if (!snapshot.exists) throw new HttpsError("failed-precondition", `Inspection ${inspectionIds[index]} is missing.`);
    const value = snapshot.data() || {};
    if (text(value.intakeId) !== intakeId || text(value.status).toUpperCase() === "CANCELLED") {
      throw new HttpsError("failed-precondition", "A linked inspection is invalid or cancelled.");
    }
  });

  const ownerUid = text(intake.ownerUid || intake.ownerId);
  const amount = money(paymentSnap.data()?.activationDeposit || paymentSnap.data()?.amount);
  if (!ownerUid || amount <= 0) throw new HttpsError("failed-precondition", "Owner binding or 15% mobilisation amount is missing.");
  const propertyQuery = await db.collection("properties").where("intakeId", "==", intakeId).limit(100).get();
  if (propertyQuery.size !== properties.length) throw new HttpsError("failed-precondition", "Canonical property records do not match the submitted portfolio.");

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  inspectionRefs.forEach((inspectionRef, index) => {
    batch.set(inspectionRef, {
      status: "COMPLETED",
      inspectionStatus: "COMPLETED",
      portfolioInspectionIndex: index,
      notes,
      completedBy: actor.uid,
      completedByEmail: actor.email,
      completedAt: now,
      updatedAt: now,
    }, { merge: true });
  });
  batch.set(intakeRef, {
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionStatus: "COMPLETED",
    inspectionCompletedCount: inspectionIds.length,
    adminReviewState: "ALL_INSPECTIONS_COMPLETE_AWAITING_15_PERCENT_PAYMENT",
    activationState: "LOCKED_PENDING_15_PERCENT_PAYMENT",
    paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    paymentCollectionStage: "15_PERCENT_DUE_AFTER_COMPLETED_VISITS",
    inspectionNotes: notes,
    inspectionCompletedAt: now,
    inspectionCompletedBy: actor.uid,
    updatedAt: now,
  }, { merge: true });
  batch.set(paymentRef, {
    status: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    verificationState: "ADMIN_PAYMENT_EVIDENCE_REQUIRED",
    adminApprovalRequired: true,
    unlocksDashboard: false,
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionVerified: true,
    paymentDueAfterInspection: true,
    updatedAt: now,
  }, { merge: true });
  batch.set(contractRef, {
    status: "SIGNED_AWAITING_15_PERCENT_PAYMENT",
    contractStatus: "signed_awaiting_payment",
    activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT",
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionVerified: true,
    paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    updatedAt: now,
  }, { merge: true });
  propertyQuery.docs.forEach((document) => {
    const property = document.data() || {};
    batch.set(document.ref, {
      status: "AWAITING_15_PERCENT_PAYMENT",
      activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT",
      inspectionStatus: "COMPLETED",
      adminSiteVisitVerified: true,
      locationVerified: true,
      geo: {
        ...(property.geo || {}),
        verified: true,
        requiresGeoReview: false,
        dispatchReady: true,
        verifiedBy: actor.uid,
      },
      updatedAt: now,
    }, { merge: true });
  });
  batch.set(db.collection("users").doc(ownerUid), {
    status: "awaiting_activation_payment",
    onboardingStatus: "ALL_INSPECTIONS_COMPLETE_AWAITING_15_PERCENT_PAYMENT",
    dashboardLocked: true,
    dashboardUnlocked: false,
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("owners").doc(ownerUid), {
    status: "AWAITING_ACTIVATION_PAYMENT",
    onboardingStatus: "ALL_INSPECTIONS_COMPLETE_AWAITING_15_PERCENT_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("notifications").doc(), {
    userId: ownerUid,
    toRole: "owner",
    type: "OWNER_INSPECTIONS_COMPLETE_PAYMENT_DUE",
    title: "Property visits completed",
    body: `All property visits are complete. The 15% mobilisation payment of AED ${amount.toLocaleString("en-AE")} is now due for Admin verification.`,
    read: false,
    createdAt: now,
  });
  batch.set(db.collection("audit_logs").doc(), {
    actorId: actor.uid,
    actorEmail: actor.email,
    actorRole: "admin",
    action: "COMPLETE_OWNER_PORTFOLIO_INSPECTIONS",
    targetType: "intake_submissions",
    targetId: intakeId,
    metadata: { inspectionIds, inspectionCount: inspectionIds.length, paymentId: intakeId, amount },
    createdAt: now,
  });
  await batch.commit();

  return {
    status: "COMPLETED",
    intakeId,
    inspectionIds,
    paymentId: intakeId,
    activationDeposit: amount,
    nextState: "AWAITING_15_PERCENT_PAYMENT",
  };
});
