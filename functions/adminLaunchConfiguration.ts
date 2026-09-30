import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const FULL_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
const OPTIONS = { cors: true, region: "europe-west3", enforceAppCheck: true } as const;

const clean = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => clean(value).toUpperCase();

function roleFromClaims(claims: Record<string, any>) {
  return clean(claims.role || claims.userRole || claims.primaryRole).toLowerCase();
}

function claimsGrantFullAdmin(claims: Record<string, any>) {
  const role = roleFromClaims(claims);
  return claims.suspended !== true && (
    FULL_ADMIN_ROLES.has(role) ||
    claims.admin === true ||
    claims.isAdmin === true ||
    claims.super_admin === true ||
    claims.superAdmin === true ||
    claims.ceo === true
  );
}

async function requireCurrentFullAdmin(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const actor = await admin.auth().getUser(request.auth.uid);
  if (actor.disabled) throw new HttpsError("permission-denied", "Disabled Admin accounts cannot read launch evidence.");
  const claims = actor.customClaims || {};
  if (!claimsGrantFullAdmin(claims)) {
    throw new HttpsError("permission-denied", "Current Founder/Admin custom claims are required to read launch evidence.");
  }
  return { uid: actor.uid, role: roleFromClaims(claims) || "admin" };
}

function serialize(value: any): any {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map((entry) => serialize(entry));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  }
  return value;
}

export const adminGetLaunchConfigurationSummary = onCall(OPTIONS, async (request) => {
  const actor = await requireCurrentFullAdmin(request);
  const [healthSnap, paymentSnap] = await Promise.all([
    db.doc("system_health/admin_summaries").get(),
    db.doc("system_payment_config/current").get(),
  ]);

  if (!healthSnap.exists) {
    throw new HttpsError("failed-precondition", "Canonical system_health/admin_summaries evidence has not been published.");
  }
  if (!paymentSnap.exists) {
    throw new HttpsError("failed-precondition", "Canonical system_payment_config/current policy has not been published.");
  }

  const health = healthSnap.data() || {};
  const payment = paymentSnap.data() || {};
  const operationalEvidence = health.operationalEvidence && typeof health.operationalEvidence === "object"
    ? health.operationalEvidence
    : {};
  const approvedPaymentMethods = Array.isArray(payment.approvedMethods)
    ? [...new Set(payment.approvedMethods.map((method: unknown) => upper(method)).filter(Boolean))].sort()
    : [];

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    sourceDocument: "system_health/admin_summaries",
    paymentConfigSourceDocument: "system_payment_config/current",
    paymentPolicy: clean(payment.policy).toLowerCase(),
    paymentConfigVersion: clean(payment.version),
    approvedPaymentMethods,
    bankTransferEnabled: payment.bankTransferEnabled === true,
    stripeEnabled: payment.stripeEnabled === true,
    operationalEvidence: serialize(operationalEvidence),
    reader: { uid: actor.uid, role: actor.role },
  };
});
