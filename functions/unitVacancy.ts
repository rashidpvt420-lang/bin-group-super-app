/**
 * Automatic vacancy and one-tap listing (feature 5, owner/tenant deep audit 2026-10-21 §9).
 *
 * - A declined renewal or a submitted move-out inspection marks the unit VACATING (with the lease end date).
 * - A daily job marks the unit VACANT once its lease end date has passed without a renewal.
 * - The owner is prompted to list the unit; ownerPrepareUnitListing pre-fills the listing from the
 *   unit/property records and the unit's REAL completed maintenance tickets (no free-text history).
 *
 * SAFETY: every occupancy write is gated by system_config/vacancy.autoVacateEnabled (default false),
 * so deploying this changes no production unit until Rashid turns it on. Owner prompts are sent either way.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import type * as FirebaseFirestore from "firebase-admin/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin", "account_manager"]);
const DONE = new Set(["COMPLETED", "CLOSED", "RESOLVED", "DONE", "VERIFIED_COMPLETE"]);

export function dubaiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function autoVacateEnabled() {
  const cfg = (await db.collection("system_config").doc("vacancy").get()).data();
  return cfg?.autoVacateEnabled === true;
}

const leaseEnd = (lease: any) => text(lease?.leaseEndDate || lease?.endDate, 10);
const leaseTenant = (lease: any) => text(lease?.tenantId || lease?.tenantUid, 160);
const unitTenant = (unit: any) => text(unit?.tenantUid || unit?.tenantId || unit?.currentTenantId, 160);

/** Pure decision for the daily job. */
export function shouldMarkVacant(lease: any, unit: any, today: string) {
  const end = leaseEnd(lease);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end >= today) return false;
  if (text(lease?.renewalStatus, 40).toUpperCase() === "RENEWED" || text(lease?.renewalStatus, 40).toUpperCase() === "RENEWAL_OFFERED") return false;
  if (["ended", "terminated", "archived"].includes(text(lease?.leaseStatus, 40).toLowerCase())) return false;
  const tenant = leaseTenant(lease);
  if (!unit || (unitTenant(unit) && tenant && unitTenant(unit) !== tenant)) return false; // a new tenant already moved in
  return text(unit?.occupancyStatus, 40).toUpperCase() !== "VACANT";
}

async function promptOwnerToList(ownerId: string, unitId: string, reason: string, when: string) {
  if (!ownerId || !unitId) return;
  await db.collection("notifications").doc(`vacancy_prompt_${unitId}_${when || "now"}`).set({
    userId: ownerId, role: "owner", type: "UNIT_VACANCY_LIST_PROMPT",
    title: "List your unit before it goes empty",
    body: `${reason} Tap to publish a listing pre-filled from the unit record and its maintenance history.`,
    link: `/owner/find-room-rent?unitId=${encodeURIComponent(unitId)}`, unitId,
    read: false, status: "PENDING", createdAt: FieldValue.serverTimestamp(), source: "UNIT_VACANCY",
  }, { merge: true });
}

async function markVacating(unitId: string, from: string, reason: string, sourceId: string) {
  if (!unitId || !(await autoVacateEnabled())) return false;
  await db.collection("units").doc(unitId).set({ occupancyStatus: "VACATING", vacatingFrom: from || null, vacancyReason: reason, vacancySourceId: sourceId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

export const onLeaseRenewalDeclinedMarkVacating = onDocumentUpdated({ document: "leases/{leaseId}", region: "europe-west3" }, async (event) => {
  const before = event.data?.before.data(); const after = event.data?.after.data();
  if (!before || !after) return;
  if (text(after.renewalStatus, 40) !== "NOT_RENEWING" || text(before.renewalStatus, 40) === "NOT_RENEWING") return;
  const unitId = text(after.unitId, 160);
  await markVacating(unitId, leaseEnd(after), "RENEWAL_DECLINED", event.params.leaseId);
  await promptOwnerToList(text(after.ownerId || after.ownerUid, 160), unitId, `The tenant declined renewal; the lease ends ${leaseEnd(after) || "soon"}.`, leaseEnd(after));
});

export const onMoveOutInspectionMarkVacating = onDocumentCreated({ document: "propertyInspections/{inspectionId}", region: "europe-west3" }, async (event) => {
  const data = event.data?.data();
  if (!data || text(data.inspectionType || data.type, 20).toUpperCase() !== "MOVE_OUT") return;
  const unitId = text(data.unitId, 160);
  await markVacating(unitId, text(data.moveOutDate || data.inspectionDate, 10), "MOVE_OUT_INSPECTION", event.params.inspectionId);
  await promptOwnerToList(text(data.ownerId || data.ownerUid, 160), unitId, "Your tenant submitted the move-out inspection.", dubaiToday());
});

export async function runEndedLeaseVacancySweep(now = new Date()) {
  const today = dubaiToday(now);
  const enabled = await autoVacateEnabled();
  let checked = 0; let marked = 0; let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db.collection("leases").orderBy("__name__").limit(300);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      checked += 1;
      const lease = doc.data(); const unitId = text(lease.unitId, 160);
      if (!unitId) continue;
      const unit = (await db.collection("units").doc(unitId).get()).data();
      if (!shouldMarkVacant(lease, unit, today)) continue;
      marked += 1;
      if (enabled) {
        await db.collection("units").doc(unitId).set({ occupancyStatus: "VACANT", vacantSince: leaseEnd(lease), vacancyReason: "LEASE_ENDED", vacancySourceId: doc.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await doc.ref.set({ leaseStatus: "ended", endedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      await promptOwnerToList(text(lease.ownerId || lease.ownerUid, 160), unitId, `The lease ended on ${leaseEnd(lease)}.`, leaseEnd(lease));
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 300) break;
  }
  await db.collection("system_health").doc("unitVacancy").set({ checked, eligible: marked, applied: enabled ? marked : 0, autoVacateEnabled: enabled, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
  return { checked, eligible: marked, applied: enabled ? marked : 0, autoVacateEnabled: enabled };
}

export const markEndedLeasesVacant = onSchedule({ schedule: "30 1 * * *", timeZone: "Asia/Dubai", region: "europe-west3" }, async () => { await runEndedLeaseVacancySweep(); });

function ago(ms: number) {
  const days = Math.max(0, Math.round(ms / 86_400_000));
  if (days < 1) return "today"; if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`; return `${Math.round(days / 30)} months ago`;
}
const toMs = (v: any) => (v?.toMillis ? v.toMillis() : v ? Date.parse(String(v)) : NaN);

/** Real history from the unit's completed tickets, newest first. */
export function summarizeMaintenance(tickets: any[], now = Date.now()) {
  const done = tickets
    .filter((t) => DONE.has(text(t.status, 40).toUpperCase()))
    .map((t) => ({ category: text(t.category || t.serviceType || t.issueType || "Maintenance", 60), completedAtMs: toMs(t.completedAt || t.closedAt || t.resolvedAt || t.updatedAt) }))
    .filter((t) => Number.isFinite(t.completedAtMs))
    .sort((a, b) => b.completedAtMs - a.completedAtMs)
    .slice(0, 10);
  return {
    items: done.map((t) => ({ category: t.category, completedAt: new Date(t.completedAtMs).toISOString().slice(0, 10), label: `${t.category} completed ${ago(now - t.completedAtMs)}` })),
    summary: done.length ? done.slice(0, 3).map((t) => `${t.category} completed ${ago(now - t.completedAtMs)}`).join("; ") : "",
  };
}

export const ownerPrepareUnitListing = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const role = text(request.auth.token?.role || request.auth.token?.userRole, 40).toLowerCase();
  const isAdmin = ADMIN_ROLES.has(role);
  if (!isAdmin && role !== "owner") throw new HttpsError("permission-denied", "Owner access required.");
  const unitId = text(request.data?.unitId, 160);
  if (!unitId) throw new HttpsError("invalid-argument", "unitId is required.");
  const unit = (await db.collection("units").doc(unitId).get()).data();
  if (!unit) throw new HttpsError("not-found", "Unit not found.");
  const property = unit.propertyId ? (await db.collection("properties").doc(text(unit.propertyId, 160)).get()).data() || {} : {};
  const ownerId = text(property.ownerId || property.ownerUid || unit.ownerId || unit.ownerUid, 160);
  if (!isAdmin && ownerId !== request.auth.uid) throw new HttpsError("permission-denied", "This unit is not on your property.");
  const tickets = await db.collection("maintenanceTickets").where("unitId", "==", unitId).limit(200).get();
  const maintenance = summarizeMaintenance(tickets.docs.map((d) => d.data()));
  const lease = (await db.collection("leases").where("unitId", "==", unitId).limit(5).get()).docs.map((d) => d.data())
    .sort((a, b) => leaseEnd(b).localeCompare(leaseEnd(a)))[0];
  const amenities = Array.isArray(property.amenities) ? property.amenities.map((a: any) => text(a, 80)).filter(Boolean).slice(0, 30) : [];
  return {
    status: "SUCCESS",
    prefill: {
      unitTitle: [text(property.propertyName || property.name, 100), unit.unitNumber ? `Unit ${text(unit.unitNumber, 30)}` : ""].filter(Boolean).join(" · "),
      propertyType: text(unit.unitType || property.propertyType, 40).toUpperCase() || "APARTMENT",
      propertyAddress: text(property.address || property.propertyAddress, 300),
      area: text(property.area || property.community || property.city, 120),
      emirate: text(property.emirate, 40).toUpperCase().replace(/\s+/g, "_"),
      annualRent: Number(lease?.annualRent || unit.annualRent || unit.rentAmount || 0) || "",
      bedrooms: unit.bedrooms ?? "", bathrooms: unit.bathrooms ?? "", areaSqFt: unit.areaSqFt || unit.sizeSqFt || "",
      availableFrom: text(unit.vacatingFrom || unit.vacantSince || leaseEnd(lease), 10),
      amenitiesText: amenities.join(", "),
    },
    maintenanceHistory: maintenance.items,
    maintenanceSummary: maintenance.summary,
  };
});
