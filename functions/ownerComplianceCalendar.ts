/**
 * Owner Trust Centre — compliance calendar (gap audit 2026-11-01, item 6).
 *
 * Turns the owner's own lease records into dated reminders: lease end, a suggested renewal-notice
 * date (90 days before end) and tenancy registration follow-up while a lease is still pending
 * registration (Ejari / Tawtheeq / municipal, per the lease record). Dates come only from the
 * lease records; nothing is invented. Notice periods and registration deadlines vary by emirate
 * and contract, so every item is labelled "suggested — confirm for your emirate"; this is not
 * legal advice and not an official government calendar.
 *
 * Reminders: a daily job writes ONE notification per item per offset (30, 7, 0 days) into
 * `compliance_reminders` with a deterministic id, so reruns never double-send.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
export const NOTICE_DAYS = 90;
export const REGISTRATION_FOLLOW_UP_DAYS = 30;
export const REMINDER_OFFSETS = [30, 7, 0];
const DAY = 86_400_000;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const upper = (v: unknown) => text(v, 60).toUpperCase();
const ymdOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const dubaiToday = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export type ComplianceItem = {
  id: string; type: "LEASE_END" | "RENEWAL_NOTICE" | "REGISTRATION_FOLLOW_UP"; dueDate: string; daysLeft: number;
  leaseId: string; propertyId: string | null; unitId: string | null; source: "leases";
  titleEn: string; titleAr: string; noteEn: string; noteAr: string;
};
const NOTE_EN = "Suggested date from your lease record. Confirm the rules for your emirate and contract; this is not legal advice.";
const NOTE_AR = "تاريخ مقترح من سجل عقد الإيجار. تأكد من القواعد الخاصة بإمارتك وعقدك؛ هذه ليست استشارة قانونية.";

/** Pure: dated compliance items for one lease. Ended/renewed/cancelled leases produce nothing. */
export function itemsForLease(leaseId: string, lease: any, today: string): ComplianceItem[] {
  const status = upper(lease?.leaseStatus || lease?.status);
  if (["ENDED", "TERMINATED", "CANCELLED", "VACATED"].includes(status)) return [];
  const end = text(lease?.leaseEndDate || lease?.endDate, 10);
  const start = text(lease?.leaseStartDate || lease?.startDate, 10);
  const base = { leaseId, propertyId: text(lease?.propertyId, 160) || null, unitId: text(lease?.unitId, 160) || null, source: "leases" as const, noteEn: NOTE_EN, noteAr: NOTE_AR };
  const out: ComplianceItem[] = [];
  const push = (type: ComplianceItem["type"], dueDate: string, titleEn: string, titleAr: string) =>
    out.push({ id: `${leaseId}_${type}`, type, dueDate, daysLeft: daysBetween(today, dueDate), titleEn, titleAr, ...base });
  if (ymdOk(end) && end >= today) {
    push("LEASE_END", end, "Lease ends", "انتهاء عقد الإيجار");
    if (upper(lease?.renewalStatus) !== "RENEWED") {
      const notice = addDays(end, -NOTICE_DAYS);
      if (notice >= today) push("RENEWAL_NOTICE", notice, "Suggested date to send renewal or change notice", "التاريخ المقترح لإرسال إشعار التجديد أو التعديل");
    }
  }
  if (upper(lease?.registrationStatus) === "PENDING_REGISTRATION" && ymdOk(start)) {
    const authority = upper(lease?.registrationAuthority) || "REGISTRY";
    push("REGISTRATION_FOLLOW_UP", addDays(start, REGISTRATION_FOLLOW_UP_DAYS), `Follow up tenancy registration (${authority})`, `متابعة تسجيل عقد الإيجار (${authority})`);
  }
  return out;
}

export async function ownerComplianceItems(ownerId: string, today = dubaiToday()) {
  const snap = await admin.firestore().collection("leases").where("ownerId", "==", ownerId).get();
  return snap.docs.flatMap((d) => itemsForLease(d.id, d.data(), today)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export const getOwnerComplianceCalendar = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  if (request.auth.token?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  if (text(request.auth.token?.role || request.auth.token?.userRole, 40).toLowerCase() !== "owner") throw new HttpsError("permission-denied", "Owner access required. / يلزم حساب مالك.");
  const today = dubaiToday();
  const items = await ownerComplianceItems(request.auth.uid, today);
  return { today, items, disclaimerEn: NOTE_EN, disclaimerAr: NOTE_AR };
});

/** Daily: one notification per item per offset; deterministic ids make reruns idempotent. */
export async function runComplianceReminders(today = dubaiToday()) {
  const db = admin.firestore();
  const leases = await db.collection("leases").where("leaseEndDate", ">=", today).get();
  const pending = await db.collection("leases").where("registrationStatus", "==", "PENDING_REGISTRATION").get();
  const seen = new Map<string, any>();
  [...leases.docs, ...pending.docs].forEach((d) => seen.set(d.id, d.data()));
  let sent = 0;
  for (const [leaseId, lease] of seen) {
    const ownerId = text(lease.ownerId, 160);
    if (!ownerId) continue;
    for (const item of itemsForLease(leaseId, lease, today)) {
      if (!REMINDER_OFFSETS.includes(item.daysLeft)) continue;
      const ref = db.collection("compliance_reminders").doc(`${item.id}_${item.daysLeft}`.replace(/[^A-Za-z0-9_-]/g, "_"));
      try {
        await db.runTransaction(async (tx) => {
          if ((await tx.get(ref)).exists) throw new Error("ALREADY_SENT");
          const now = FieldValue.serverTimestamp();
          tx.create(ref, { ownerId, itemId: item.id, type: item.type, dueDate: item.dueDate, daysLeft: item.daysLeft, leaseId, createdAt: now });
          tx.create(db.collection("notifications").doc(), {
            userId: ownerId, type: "COMPLIANCE_REMINDER", read: false, createdAt: now, link: "/owner",
            title: `${item.titleEn} — ${item.dueDate}`, titleAr: `${item.titleAr} — ${item.dueDate}`,
            body: item.daysLeft === 0 ? `Due today. ${NOTE_EN}` : `Due in ${item.daysLeft} days. ${NOTE_EN}`,
            bodyAr: item.daysLeft === 0 ? `مستحق اليوم. ${NOTE_AR}` : `مستحق خلال ${item.daysLeft} يوماً. ${NOTE_AR}`,
          });
        });
        sent += 1;
      } catch (e: any) {
        if (e?.message !== "ALREADY_SENT") console.warn("[complianceReminders]", item.id, e?.message || e);
      }
    }
  }
  return { scanned: seen.size, sent };
}

export const sendComplianceReminders = onSchedule({ schedule: "15 9 * * *", timeZone: "Asia/Dubai", region: "europe-west3" }, async () => {
  const r = await runComplianceReminders();
  console.log(`[complianceReminders] scanned=${r.scanned} sent=${r.sent}`);
});
