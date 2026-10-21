/**
 * Owner KPI aggregates (feature 9, owner/tenant deep audit 2026-10-21 §2).
 * Computed on the server over ALL of the owner's records (no client limit(150)); each KPI is
 * returned with its own error so the dashboard can show "could not load" instead of a silent 0.
 */
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const upper = (v: unknown) => text(v, 60).toUpperCase();
const CLOSED_TICKET = new Set(["COMPLETED", "CLOSED", "RESOLVED", "CANCELLED", "DONE", "REJECTED", "VERIFIED_COMPLETE"]);
const URGENT = new Set(["URGENT", "EMERGENCY", "HIGH", "CRITICAL", "P1"]);
const PENDING_APPROVAL = new Set(["PENDING", "REQUESTED", "OPEN"]);

type Kpi<T> = { value: T | null; error: string | null };
async function kpi<T>(fn: () => Promise<T>): Promise<Kpi<T>> {
  try { return { value: await fn(), error: null }; } catch (e: any) { console.warn("[ownerKpis]", e?.message || e); return { value: null, error: "UNAVAILABLE" }; }
}
export function dubaiYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function rentForMonth(rows: any[], month: string) {
  let due = 0; let collected = 0; let overdue = 0;
  for (const r of rows) {
    const amount = Number(r.amount || 0);
    if (upper(r.status) === "OVERDUE") overdue += 1;
    if (!String(r.dueDate || "").startsWith(month)) continue;
    due += amount;
    if (upper(r.status) === "PAID") collected += amount;
  }
  return { due, collected, overdueInstallments: overdue };
}
export function occupancy(units: any[]) {
  const occupied = units.filter((u) => text(u.tenantId || u.tenantUid || u.currentTenantId) || upper(u.occupancyStatus) === "OCCUPIED").length;
  return { occupied, total: units.length };
}
export function jobs(tickets: any[]) {
  const open = tickets.filter((t) => !CLOSED_TICKET.has(upper(t.status)));
  return { open: open.length, urgent: open.filter((t) => URGENT.has(upper(t.priority || t.urgency || t.severity))).length };
}
export function expiringLeases(leases: any[], today: string, horizon: string) {
  return leases.filter((l) => { const e = text(l.leaseEndDate || l.endDate, 10); return e >= today && e <= horizon && upper(l.renewalStatus) !== "RENEWED"; }).length;
}

async function unitsForOwner(uid: string) {
  const props = await db.collection("properties").where("ownerId", "==", uid).select().get();
  const ids = props.docs.map((d) => d.id);
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db.collection("units").where("propertyId", "in", ids.slice(i, i + 30)).select("tenantId", "tenantUid", "currentTenantId", "occupancyStatus").get();
    snap.docs.forEach((d) => out.push(d.data()));
  }
  return out;
}

export async function computeOwnerKpis(uid: string, now = new Date()) {
  const today = dubaiYmd(now);
  const month = today.slice(0, 7);
  const horizon = dubaiYmd(new Date(now.getTime() + 90 * 86_400_000));
  const [rent, occ, open, leases, approvals] = await Promise.all([
    kpi(async () => rentForMonth((await db.collection("rent_installments").where("ownerId", "==", uid).select("amount", "status", "dueDate").get()).docs.map((d) => d.data()), month)),
    kpi(async () => occupancy(await unitsForOwner(uid))),
    kpi(async () => jobs((await db.collection("maintenanceTickets").where("ownerId", "==", uid).select("status", "priority", "urgency", "severity").get()).docs.map((d) => d.data()))),
    kpi(async () => expiringLeases((await db.collection("leases").where("ownerId", "==", uid).select("leaseEndDate", "endDate", "renewalStatus").get()).docs.map((d) => d.data()), today, horizon)),
    kpi(async () => (await db.collection("owner_approval_requests").where("ownerId", "==", uid).select("status").get()).docs.filter((d) => PENDING_APPROVAL.has(upper(d.data().status || "PENDING"))).length),
  ]);
  return { asOf: today, month, rent, occupancy: occ, jobs: open, leasesExpiring90d: leases, approvalsWaiting: approvals };
}

export const getOwnerKpis = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const role = text(request.auth.token?.role || request.auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner") throw new HttpsError("permission-denied", "Owner access required.");
  return computeOwnerKpis(request.auth.uid);
});
