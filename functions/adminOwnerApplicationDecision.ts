import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { assertOwnerOnboardingTransition, ownerOnboardingStatePatch, resolveOwnerOnboardingState } from "./ownerOnboardingLifecycle";
import { assertCanonicalTransition, normalizeCanonicalState } from "./canonicalStateMachines";

/**
 * F-3: Admin "request changes" / "reject" for the full inspection-first Owner application.
 * - Admin role + server-side MFA + App Check.
 * - The move is asserted against the single F-5 lifecycle and the canonical property machine.
 * - A reason is mandatory and stored on the intake, each linked property, and the audit log.
 * - REQUEST_CHANGES leaves the application in CHANGES_REQUESTED, from which only the bound Owner
 *   can resubmit (resubmitOwnerProperty). REJECT is terminal.
 */
const WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin"]);
const text = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

export const OWNER_APPLICATION_DECISIONS = {
  REQUEST_CHANGES: { lifecycle: "CHANGES_REQUESTED", property: "CHANGES_REQUESTED", intakeStatus: "changes_requested", audit: "OWNER_APPLICATION_CHANGES_REQUESTED" },
  REJECT: { lifecycle: "REJECTED", property: "REJECTED", intakeStatus: "rejected", audit: "OWNER_APPLICATION_REJECTED" },
} as const;
export type OwnerApplicationDecision = keyof typeof OWNER_APPLICATION_DECISIONS;

export function validateDecisionInput(data: any) {
  const intakeId = text(data?.intakeId, 240);
  const decision = text(data?.decision, 40).toUpperCase() as OwnerApplicationDecision;
  const reason = text(data?.reason, 2000);
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  if (!(decision in OWNER_APPLICATION_DECISIONS)) throw new HttpsError("invalid-argument", "decision must be REQUEST_CHANGES or REJECT.");
  if (reason.length < 8) throw new HttpsError("invalid-argument", "A clear reason of at least 8 characters is required.");
  return { intakeId, decision, reason };
}

function requireAdminRole(request: any) {
  const token = request.auth?.token || {};
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const role = text(token.role || token.userRole || token.primaryRole, 80).toLowerCase();
  if (token.suspended === true || !(ADMIN_ROLES.has(role) || token.admin === true || token.superAdmin === true || token.super_admin === true)) {
    throw new HttpsError("permission-denied", "Admin permission required.");
  }
  return request.auth.uid as string;
}

export const adminDecideOwnerApplication = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const adminUid = requireAdminRole(request);
    await requirePrivilegedMfaSession(request.auth);
    const { intakeId, decision, reason } = validateDecisionInput(request.data);
    const target = OWNER_APPLICATION_DECISIONS[decision];
    const db = admin.firestore();
    const intakeRef = db.collection("intake_submissions").doc(intakeId);

    return db.runTransaction(async (tx) => {
      const intakeSnap = await tx.get(intakeRef);
      if (!intakeSnap.exists) throw new HttpsError("not-found", "Owner application not found.");
      const intake = intakeSnap.data() || {};
      if (text(intake.workflowVersion, 120) !== WORKFLOW_VERSION) {
        throw new HttpsError("failed-precondition", "Only the inspection-first Owner application can be decided here.");
      }
      const [contractSnap, paymentSnap, propsSnap] = await Promise.all([
        tx.get(db.collection("contracts").doc(intakeId)),
        tx.get(db.collection("payment_transactions").doc(intakeId)),
        tx.get(db.collection("properties").where("intakeId", "==", intakeId).limit(100)),
      ]);
      const from = resolveOwnerOnboardingState({
        intake,
        contract: contractSnap.exists ? contractSnap.data() || {} : null,
        payment: paymentSnap.exists ? paymentSnap.data() || {} : null,
      });
      assertOwnerOnboardingTransition(from, target.lifecycle, "admin");

      const propertyMoves = propsSnap.docs.map((doc) => {
        const p = doc.data() || {};
        const state = normalizeCanonicalState("property", p.lifecycleStatus || p.status || p.onboardingState);
        if (state !== target.property) {
          try {
            assertCanonicalTransition("property", state, target.property);
          } catch (error: any) {
            throw new HttpsError("failed-precondition", String(error?.message || "Illegal property transition."));
          }
        }
        return { ref: doc.ref, from: state };
      });

      const now = admin.firestore.FieldValue.serverTimestamp();
      const decisionRecord = { decision, reason, decidedBy: adminUid, decidedAt: now };
      tx.update(intakeRef, {
        lifecycleStatus: target.intakeStatus,
        onboardingState: target.intakeStatus,
        status: target.intakeStatus,
        adminDecision: decisionRecord,
        adminDecisionReason: reason,
        ...(decision === "REQUEST_CHANGES" ? { changesRequestedAt: now, ownerResubmissionAllowed: true } : { rejectedAt: now, ownerResubmissionAllowed: false }),
        updatedAt: now,
        ...ownerOnboardingStatePatch(from, target.lifecycle, "admin", adminUid, now),
      });
      for (const move of propertyMoves) {
        tx.update(move.ref, {
          lifecycleStatus: target.property,
          status: target.property,
          adminApproved: false,
          approved: false,
          adminDecision: decisionRecord,
          ...(decision === "REQUEST_CHANGES" ? { changesRequestedReason: reason } : { rejectionReason: reason }),
          updatedAt: now,
        });
      }
      tx.set(db.collection("audit_logs").doc(), {
        action: target.audit,
        actorId: adminUid,
        actorRole: "admin",
        intakeId,
        fromState: from,
        toState: target.lifecycle,
        reason,
        propertyIds: propertyMoves.map((m) => m.ref.id),
        createdAt: now,
      });
      return { intakeId, decision, ownerOnboardingState: target.lifecycle, properties: propertyMoves.length };
    });
  },
);
