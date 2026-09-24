import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminReviewOwnerProperty as legacyAdminReviewOwnerProperty } from "./adminPropertyReview";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const CANONICAL_FOUNDER_EMAIL = "ceo@bin-groups.com";
const OWNER_WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const FOUNDER_ROLES = new Set(["ceo", "super_admin"]);
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();
const normalizedStatus = (value: unknown) => lower(value, 80).replace(/[\s-]+/g, "_");

function roleOf(token: Record<string, unknown> = {}) {
  const role = lower(token.role || token.userRole || token.primaryRole, 80);
  if (role) return role;
  if (token.ceo === true) return "ceo";
  if (token.super_admin === true || token.superAdmin === true) return "super_admin";
  return "";
}

async function requireVerifiedFounderSession(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Founder authentication is required.");
  const token = auth.token || {};
  if (lower(token.email, 320) !== CANONICAL_FOUNDER_EMAIL || !FOUNDER_ROLES.has(roleOf(token))) {
    throw new HttpsError("permission-denied", "The canonical BIN GROUP founder account is required.");
  }
  if (token.email_verified !== true || !token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified founder MFA session is required.");
  }
  const user = await admin.auth().getUser(auth.uid);
  if (user.disabled || !user.emailVerified || lower(user.email, 320) !== CANONICAL_FOUNDER_EMAIL) {
    throw new HttpsError("permission-denied", "The canonical founder account is not active and verified.");
  }
}

async function usesInspectionFirstWorkflow(property: Record<string, any>) {
  if (text(property.workflowVersion) === OWNER_WORKFLOW_VERSION) return true;
  const intakeId = text(property.intakeId, 240);
  if (!intakeId) return normalizedStatus(property.status) === "pending_property_inspection";
  const intakeSnap = await db.collection("intake_submissions").doc(intakeId).get();
  return intakeSnap.exists && text(intakeSnap.data()?.workflowVersion) === OWNER_WORKFLOW_VERSION;
}

export const adminReviewOwnerProperty = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireVerifiedFounderSession(request.auth);
    const propertyId = text(request.data?.propertyId, 240);
    if (!propertyId) throw new HttpsError("invalid-argument", "propertyId is required.");

    const propertySnap = await db.collection("properties").doc(propertyId).get();
    if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
    const property = propertySnap.data() || {};
    if (await usesInspectionFirstWorkflow(property)) {
      throw new HttpsError(
        "failed-precondition",
        "Inspection-first properties cannot be approved or made dispatch-ready from the legacy property-review action. Complete the linked physical site-visit workflow instead.",
      );
    }
    if (normalizedStatus(property.status || property.approvalStatus || property.onboardingStatus) === "draft") {
      throw new HttpsError(
        "failed-precondition",
        "Draft properties are not eligible for an approval or geo-verification decision.",
      );
    }

    const runner = (legacyAdminReviewOwnerProperty as any).run;
    if (typeof runner !== "function") {
      throw new HttpsError("internal", "The protected legacy property-review handler is unavailable.");
    }
    return runner(request);
  },
);
