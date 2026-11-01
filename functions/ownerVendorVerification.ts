/**
 * Owner Trust Centre — contractor verification (gap audit 2026-11-01, item 3).
 *
 * Scope: BIN's OWN vendors only (the `vendors` register maintained by MFA Admins). This is not a
 * marketplace: owners cannot browse, rank or hire vendors here; they see only vendors that quoted
 * on their own properties' jobs.
 *
 * - Licence / insurance expiry status from Admin-recorded dates (UNKNOWN when not recorded).
 * - Per-vendor numbers from the owner's own records only: quotes, average quoted AED, rework
 *   (ticket_reopen_events on those tickets) and RFQ response hours. Fewer than MIN_JOBS records
 *   => INSUFFICIENT_DATA, never an estimate.
 * - Commission disclosure: shown exactly as recorded by Admin, or "not recorded".
 * - Badges only when earned on >= MIN_JOBS records. No paid or default badges.
 * - Daily credential alerts for Admin at 30/7/0 days before expiry (idempotent ids).
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
export const MIN_JOBS = 5;
export const EXPIRING_DAYS = 30;
export const ALERT_OFFSETS = [30, 7, 0];
const DAY = 86_400_000;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const ymdOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
export const dubaiToday = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const millis = (v: any): number | null => {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  const n = typeof v === "number" ? v : Date.parse(String(v));
  return Number.isFinite(n) ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export type CredentialState = "VALID" | "EXPIRING" | "EXPIRED" | "UNKNOWN";
export function credentialState(expiry: unknown, today: string): { state: CredentialState; expiry: string | null; daysLeft: number | null } {
  const e = text(expiry, 10);
  if (!ymdOk(e)) return { state: "UNKNOWN", expiry: null, daysLeft: null };
  const d = daysBetween(today, e);
  return { state: d < 0 ? "EXPIRED" : d <= EXPIRING_DAYS ? "EXPIRING" : "VALID", expiry: e, daysLeft: d };
}

export type VendorStats = { jobs: number; reworked: number; quotedTotalAed: number; responseHours: number[] };
export function scorecard(stats: VendorStats) {
  const enough = stats.jobs >= MIN_JOBS;
  const reworkRatePct = enough ? round1((stats.reworked / stats.jobs) * 100) : null;
  const avgQuoteAed = enough ? Math.round((stats.quotedTotalAed / stats.jobs) * 100) / 100 : null;
  const hrs = [...stats.responseHours].sort((a, b) => a - b);
  const medianResponseHours = enough && hrs.length >= MIN_JOBS ? round1(hrs[Math.floor(hrs.length / 2)]) : null;
  const badges: string[] = [];
  if (enough && reworkRatePct !== null && reworkRatePct <= 5) badges.push("LOW_REWORK");
  if (medianResponseHours !== null && medianResponseHours <= 24) badges.push("FAST_RESPONSE");
  return { state: enough ? "OK" : "INSUFFICIENT_DATA", jobs: stats.jobs, minJobs: MIN_JOBS, reworkRatePct, avgQuoteAed, medianResponseHours, badges };
}

function commissionOf(v: any) {
  const pct = Number(v?.commissionPct);
  const note = text(v?.commissionDisclosure, 300);
  if (!Number.isFinite(pct) && !note) return { recorded: false, pct: null, note: null };
  return { recorded: true, pct: Number.isFinite(pct) ? pct : null, note: note || null };
}

function requireOwner(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner" || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Owner access only. / للمالك فقط.");
  return auth.uid as string;
}

export const getOwnerVendorScorecards = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = requireOwner(request.auth);
  const db = admin.firestore();
  const prof = await db.doc(`users/${uid}`).get();
  if (prof.data()?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  const today = dubaiToday();
  const quotes = await db.collection("vendor_quotes").where("ownerId", "==", uid).limit(500).get();
  const byVendor = new Map<string, { stats: VendorStats; tickets: Set<string>; rfqs: Map<string, number | null> }>();
  for (const q of quotes.docs) {
    const d = q.data();
    const vid = text(d.vendorId, 180);
    if (!vid) continue;
    const e = byVendor.get(vid) || { stats: { jobs: 0, reworked: 0, quotedTotalAed: 0, responseHours: [] }, tickets: new Set<string>(), rfqs: new Map() };
    e.stats.jobs += 1;
    const amt = Number(d.amountAed);
    if (Number.isFinite(amt)) e.stats.quotedTotalAed += amt;
    if (d.ticketId) e.tickets.add(text(d.ticketId, 180));
    if (d.rfqId) e.rfqs.set(text(d.rfqId, 180), millis(d.createdAt));
    byVendor.set(vid, e);
  }
  const vendors = [];
  for (const [vid, e] of byVendor) {
    const vs = await db.doc(`vendors/${vid}`).get();
    if (!vs.exists) continue; // only BIN's own registered vendors
    const v = vs.data() || {};
    for (const t of e.tickets) {
      const reopen = await db.collection("ticket_reopen_events").where("ticketId", "==", t).limit(1).get();
      if (!reopen.empty) e.stats.reworked += 1;
    }
    for (const [rfqId, quotedAt] of e.rfqs) {
      const rfq = await db.doc(`vendor_rfqs/${rfqId}`).get();
      const asked = millis(rfq.data()?.createdAt);
      if (asked !== null && quotedAt !== null && quotedAt >= asked) e.stats.responseHours.push((quotedAt - asked) / 3_600_000);
    }
    vendors.push({
      vendorId: vid, name: text(v.name, 180), trade: text(v.trade, 120), status: text(v.status, 40),
      licence: credentialState(v.licenseExpiry, today), insurance: credentialState(v.insuranceExpiry, today),
      commission: commissionOf(v), ...scorecard(e.stats),
    });
  }
  return { generatedFor: today, scope: "BIN_REGISTERED_VENDORS_ON_YOUR_JOBS", vendors };
});

/** Daily Admin alerts for licence / insurance expiry. Deterministic ids; reruns never double-alert. */
export async function runVendorCredentialAlerts(today = dubaiToday()) {
  const db = admin.firestore();
  const snap = await db.collection("vendors").where("status", "in", ["verified", "pending_verification"]).limit(1000).get();
  let sent = 0;
  for (const doc of snap.docs) {
    const v = doc.data();
    for (const [kind, field] of [["LICENCE", "licenseExpiry"], ["INSURANCE", "insuranceExpiry"]] as const) {
      const c = credentialState(v[field], today);
      if (c.daysLeft === null || !ALERT_OFFSETS.includes(c.daysLeft)) continue;
      const ref = db.doc(`vendor_credential_alerts/${doc.id}_${kind}_${c.expiry}_${c.daysLeft}`);
      const created = await db.runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) return false;
        tx.create(ref, {
          vendorId: doc.id, vendorName: text(v.name, 180), kind, expiry: c.expiry, daysLeft: c.daysLeft, status: "OPEN",
          titleEn: `${kind === "LICENCE" ? "Trade licence" : "Insurance"} expires in ${c.daysLeft} days`,
          titleAr: `${kind === "LICENCE" ? "الرخصة التجارية" : "التأمين"} ينتهي خلال ${c.daysLeft} يوماً`,
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (created) sent += 1;
    }
  }
  return { sent };
}

export const sendVendorCredentialAlerts = onSchedule({ schedule: "30 8 * * *", timeZone: "Asia/Dubai", region: "europe-west3" }, async () => {
  await runVendorCredentialAlerts();
});
