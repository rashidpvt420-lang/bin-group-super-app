/**
 * Owner Trust Centre — owners' committee records (gap audit 2026-11-01, item 9).
 * RECORDS ONLY: budgets, service-charge statements, reserve-fund reports and meeting minutes that an owner
 * files for their own reference. The platform never holds, collects or pools committee funds, and
 * this feature needs legal review before any wider (shared or building-wide) use.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const OPTS = { cors: true, region: "europe-west3", enforceAppCheck: true } as const;
export const RECORD_KINDS = ["BUDGET", "SERVICE_CHARGE_STATEMENT", "RESERVE_FUND_REPORT", "MEETING_MINUTES"] as const;
export const LEGAL_NOTICE = {
  en: "Records only. BIN does not hold, collect or pool committee funds. This feature needs legal review.",
  ar: "سجلات فقط. لا تحتفظ BIN بأموال اللجنة ولا تجمعها. هذه الميزة تحتاج إلى مراجعة قانونية.",
};
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

async function ownerGate(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner" || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Owner access only. / للمالك فقط.");
  if ((await admin.firestore().doc(`users/${auth.uid}`).get()).data()?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  return auth.uid;
}

export const ownerAddCommitteeRecord = onCall(OPTS, async (request) => {
  const ownerId = await ownerGate(request.auth as never);
  const db = admin.firestore();
  const d = request.data || {};
  const kind = text(d.kind, 40).toUpperCase();
  const title = text(d.title, 160);
  const buildingName = text(d.buildingName, 160);
  const period = text(d.period, 40);
  const documentUrl = text(d.documentUrl, 600);
  const amountRaw = d.amountAedAsStated;
  const amount = amountRaw === undefined || amountRaw === null || amountRaw === "" ? null : Number(amountRaw);
  if (!(RECORD_KINDS as readonly string[]).includes(kind)) throw new HttpsError("invalid-argument", "Unsupported record type. / نوع سجل غير مدعوم.");
  if (title.length < 3 || !buildingName) throw new HttpsError("invalid-argument", "Title and building are required. / العنوان والمبنى مطلوبان.");
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new HttpsError("invalid-argument", "Amount must be a number from the document. / يجب أن يكون المبلغ رقماً من المستند.");
  if (!/^https:\/\/firebasestorage\.googleapis\.com\//.test(documentUrl)) throw new HttpsError("invalid-argument", "Attach the uploaded document. / أرفق المستند المرفوع.");
  const ref = db.collection("committee_records").doc();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.create(ref, { ownerId, kind, title, buildingName, period, amountAedAsStated: amount, documentUrl, recordsOnly: true, legalReviewRequired: true, createdAt: now });
  batch.create(db.collection("audit_logs").doc(), { action: "OWNER_ADDED_COMMITTEE_RECORD", actorId: ownerId, actorRole: "owner", targetOwnerId: ownerId, targetType: "committee_records", targetId: ref.id, createdAt: now });
  await batch.commit();
  return { status: "SUCCESS", recordId: ref.id };
});

export const getOwnerCommitteeRecords = onCall(OPTS, async (request) => {
  const ownerId = await ownerGate(request.auth as never);
  const s = await admin.firestore().collection("committee_records").where("ownerId", "==", ownerId).limit(200).get();
  return {
    notice: LEGAL_NOTICE,
    records: s.docs.map((d) => {
      const x = d.data();
      return { id: d.id, kind: x.kind, title: x.title, buildingName: x.buildingName, period: x.period, amountAedAsStated: x.amountAedAsStated ?? null, documentUrl: x.documentUrl, createdAtMs: x.createdAt?.toMillis?.() ?? null };
    }).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)),
  };
});
