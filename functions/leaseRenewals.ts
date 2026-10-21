/**
 * Lease renewal workflow (feature 4, owner/tenant deep audit 2026-10-21).
 * Owner proposes new terms → tenant accepts or declines → lease is extended or marked not renewing.
 * Renewal offers are server-written; clients only read their own (see firestore.rules lease_renewals).
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { parseExactAedAmount } from "./shared/aedMoneyInput";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin", "account_manager"]);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validYmd = (v: string) => YMD.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const OPTS = { cors: true, region: "europe-west3", enforceAppCheck: true } as const;

export function currentEndDate(lease: any): string {
  return text(lease?.leaseEndDate || lease?.endDate || lease?.contractEndDate, 10);
}

export function validateRenewalTerms(input: any, lease: any) {
  const oldEnd = currentEndDate(lease);
  if (!validYmd(oldEnd)) throw new HttpsError("failed-precondition", "Record the current lease end date before proposing a renewal.");
  const newEndDate = text(input?.newEndDate, 10);
  if (!validYmd(newEndDate) || newEndDate <= oldEnd) throw new HttpsError("invalid-argument", "The new end date must be a YYYY-MM-DD date after the current end date.");
  let newAnnualRent: number;
  try { newAnnualRent = parseExactAedAmount(input?.newAnnualRent); } catch { throw new HttpsError("invalid-argument", "New annual rent must be AED exact to the fils."); }
  if (!(newAnnualRent > 0)) throw new HttpsError("invalid-argument", "New annual rent must be positive.");
  const newStartDate = new Date(Date.parse(`${oldEnd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { previousEndDate: oldEnd, newStartDate, newEndDate, newAnnualRent, previousAnnualRent: Number(lease?.annualRent || 0) || null, message: text(input?.message, 1000) };
}

async function notify(userId: string, role: string, type: string, title: string, body: string, link: string, id: string) {
  if (!userId) return;
  await db.collection("notifications").doc(id).set({ userId, role, type, title, body, link, read: false, status: "PENDING", createdAt: FieldValue.serverTimestamp(), source: "LEASE_RENEWAL" }, { merge: true });
}

export const ownerProposeLeaseRenewal = onCall(OPTS, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const role = text(request.auth.token?.role || request.auth.token?.userRole, 40).toLowerCase();
  const isAdmin = ADMIN_ROLES.has(role);
  if (!isAdmin && (role !== "owner" || request.auth.token?.email_verified !== true || request.auth.token?.suspended === true)) {
    throw new HttpsError("permission-denied", "A verified owner or admin is required.");
  }
  const leaseId = text(request.data?.leaseId, 160);
  if (!leaseId) throw new HttpsError("invalid-argument", "leaseId is required.");
  const leaseRef = db.collection("leases").doc(leaseId);
  const lease = (await leaseRef.get()).data();
  if (!lease) throw new HttpsError("not-found", "Lease not found.");
  const ownerId = text(lease.ownerId || lease.ownerUid, 160);
  if (!isAdmin && ownerId !== request.auth.uid) throw new HttpsError("permission-denied", "This lease is not yours.");
  const tenantId = text(lease.tenantId || lease.tenantUid, 160);
  if (!tenantId) throw new HttpsError("failed-precondition", "This lease has no linked tenant.");
  const terms = validateRenewalTerms(request.data, lease);
  const open = await db.collection("lease_renewals").where("leaseId", "==", leaseId).where("status", "==", "PROPOSED").limit(1).get();
  if (!open.empty) throw new HttpsError("already-exists", "A renewal offer is already waiting for the tenant.");
  const ref = db.collection("lease_renewals").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({ leaseId, ownerId, tenantId, tenantUid: tenantId, unitId: text(lease.unitId, 160), propertyId: text(lease.propertyId, 160), ...terms, status: "PROPOSED", proposedBy: request.auth.uid, createdAt: now, updatedAt: now });
  await leaseRef.set({ renewalStatus: "RENEWAL_OFFERED", renewalOfferId: ref.id, updatedAt: now }, { merge: true });
  await notify(tenantId, "tenant", "LEASE_RENEWAL_OFFER", "Your owner offered a lease renewal",
    `New term ${terms.newStartDate} to ${terms.newEndDate}, annual rent AED ${terms.newAnnualRent.toLocaleString("en-AE")}. Review and respond in the app.`, "/tenant/dashboard", `lease_renewal_offer_${ref.id}`);
  await db.collection("audit_logs").add({ action: "LEASE_RENEWAL_PROPOSED", actorId: request.auth.uid, actorRole: role, leaseId, renewalId: ref.id, createdAt: now });
  return { status: "SUCCESS", renewalId: ref.id, ...terms };
});

export const tenantRespondLeaseRenewal = onCall(OPTS, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const renewalId = text(request.data?.renewalId, 160);
  const decision = text(request.data?.decision, 10).toUpperCase();
  if (!renewalId || (decision !== "ACCEPT" && decision !== "DECLINE")) throw new HttpsError("invalid-argument", "renewalId and decision ACCEPT or DECLINE are required.");
  const ref = db.collection("lease_renewals").doc(renewalId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const offer = snap.data();
    if (!offer) throw new HttpsError("not-found", "Renewal offer not found.");
    if (offer.tenantId !== request.auth!.uid) throw new HttpsError("permission-denied", "This offer is not addressed to you.");
    if (offer.status !== "PROPOSED") throw new HttpsError("failed-precondition", "This offer has already been answered.");
    const leaseRef = db.collection("leases").doc(offer.leaseId);
    const now = FieldValue.serverTimestamp();
    if (decision === "ACCEPT") {
      tx.set(leaseRef, { leaseEndDate: offer.newEndDate, endDate: offer.newEndDate, annualRent: offer.newAnnualRent, previousLeaseEndDate: offer.previousEndDate, renewalStatus: "RENEWED", renewedAt: now, renewalOfferId: renewalId, updatedAt: now }, { merge: true });
    } else {
      tx.set(leaseRef, { renewalStatus: "NOT_RENEWING", updatedAt: now }, { merge: true });
    }
    tx.update(ref, { status: decision === "ACCEPT" ? "ACCEPTED" : "DECLINED", respondedAt: now, updatedAt: now, tenantNote: text(request.data?.note, 1000) });
    return offer;
  });
  await notify(result.ownerId, "owner", "LEASE_RENEWAL_RESPONSE",
    decision === "ACCEPT" ? "Tenant accepted the renewal" : "Tenant declined the renewal",
    decision === "ACCEPT" ? `The lease now runs to ${result.newEndDate}. Set the new rent schedule from the Units page.` : "The unit will be flagged for vacancy at the lease end date.",
    "/owner/units", `lease_renewal_response_${renewalId}`);
  await db.collection("audit_logs").add({ action: decision === "ACCEPT" ? "LEASE_RENEWAL_ACCEPTED" : "LEASE_RENEWAL_DECLINED", actorId: request.auth.uid, actorRole: "tenant", leaseId: result.leaseId, renewalId, createdAt: FieldValue.serverTimestamp() });
  return { status: "SUCCESS", decision, leaseId: result.leaseId };
});
