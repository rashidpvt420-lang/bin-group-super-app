/**
 * Owner Trust Centre — trust metrics (gap audit 2026-11-01, item 9).
 *
 * Read-only. Every metric is a plain ratio over the signed-in owner's OWN existing records
 * (no writes, no invented scores, no blended "trust score"). When there are fewer than
 * MIN_RECORDS qualifying records the metric reports INSUFFICIENT_DATA instead of a percentage,
 * and a source that fails to load reports UNAVAILABLE instead of a silent 0.
 */
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
export const MIN_RECORDS = 5;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const upper = (v: unknown) => text(v, 60).toUpperCase();
const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : text(v, 400).length > 0);

export type TrustMetricState = "OK" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
export type TrustMetric = {
  key: string;
  state: TrustMetricState;
  numerator: number | null;
  denominator: number | null;
  percent: number | null;
  minRecords: number;
};

export function ratio(key: string, numerator: number, denominator: number, min = MIN_RECORDS): TrustMetric {
  if (denominator < min) return { key, state: "INSUFFICIENT_DATA", numerator, denominator, percent: null, minRecords: min };
  return { key, state: "OK", numerator, denominator, percent: Math.round((numerator / denominator) * 1000) / 10, minRecords: min };
}
const unavailable = (key: string): TrustMetric => ({ key, state: "UNAVAILABLE", numerator: null, denominator: null, percent: null, minRecords: MIN_RECORDS });

const DECIDED = new Set(["APPROVED", "REJECTED", "EMERGENCY_APPROVED"]);
const COMPLETED = new Set(["COMPLETED", "CLOSED", "RESOLVED", "VERIFIED_COMPLETE", "DONE"]);
const VERIFIED_PROPERTY = new Set(["APPROVED", "VERIFIED"]);

/** Authority coverage: properties whose ownership was verified by an admin (not OCR alone). */
export function authorityCoverage(properties: any[]) {
  const verified = properties.filter((p) => p?.ownershipVerified === true || VERIFIED_PROPERTY.has(upper(p?.verificationStatus)) || VERIFIED_PROPERTY.has(upper(p?.status))).length;
  return ratio("authorityCoverage", verified, properties.length);
}
/** Approval discipline: decided owner approvals that were a normal owner decision, not an emergency override. */
export function approvalDiscipline(approvals: any[]) {
  const decided = approvals.filter((a) => DECIDED.has(upper(a?.status)));
  return ratio("approvalDiscipline", decided.filter((a) => upper(a.status) !== "EMERGENCY_APPROVED").length, decided.length);
}
/** Maintenance evidence: completed jobs that carry technician after-work evidence. */
export function maintenanceEvidence(tickets: any[]) {
  const done = tickets.filter((t) => COMPLETED.has(upper(t?.status)));
  return ratio("maintenanceEvidence", done.filter((t) => has(t.technicianAfterPhotoUrl) || has(t.technicianAfterPhotos)).length, done.length);
}
/** Financial traceability: completed jobs with a recorded cost that link to an approval AND a payment/invoice record. */
export function financialTraceability(tickets: any[]) {
  const costed = tickets.filter((t) => COMPLETED.has(upper(t?.status)) && [t.finalCost, t.actualCost, t.totalCost, t.invoiceAmount].some((c) => Number(c) > 0));
  const linked = costed.filter((t) => has(t.approvalRequestId) && (has(t.paymentId) || has(t.invoiceId) || has(t.paymentProofUrl)));
  return ratio("financialTraceability", linked.length, costed.length);
}

async function safe(key: string, fn: () => Promise<TrustMetric>) {
  try { return await fn(); } catch (e: any) { console.warn("[ownerTrustMetrics]", key, e?.message || e); return unavailable(key); }
}

export async function computeOwnerTrustMetrics(uid: string) {
  const db = admin.firestore();
  const byOwner = (name: string, fields: string[]) => db.collection(name).where("ownerId", "==", uid).select(...fields).get().then((s) => s.docs.map((d) => d.data()));
  const [authority, approvals, evidence, traceability] = await Promise.all([
    safe("authorityCoverage", async () => authorityCoverage(await byOwner("properties", ["ownershipVerified", "verificationStatus", "status"]))),
    safe("approvalDiscipline", async () => approvalDiscipline(await byOwner("owner_approval_requests", ["status"]))),
    safe("maintenanceEvidence", async () => maintenanceEvidence(await byOwner("maintenanceTickets", ["status", "technicianAfterPhotoUrl", "technicianAfterPhotos"]))),
    safe("financialTraceability", async () => financialTraceability(await byOwner("maintenanceTickets", ["status", "finalCost", "actualCost", "totalCost", "invoiceAmount", "approvalRequestId", "paymentId", "invoiceId", "paymentProofUrl"]))),
  ]);
  return { generatedAt: new Date().toISOString(), minRecords: MIN_RECORDS, metrics: [authority, approvals, evidence, traceability], readOnly: true };
}

export const getOwnerTrustMetrics = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  if (request.auth.token?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  const role = text(request.auth.token?.role || request.auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner") throw new HttpsError("permission-denied", "Owner access required. / يلزم حساب مالك.");
  return computeOwnerTrustMetrics(request.auth.uid);
});
