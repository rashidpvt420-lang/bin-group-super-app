/**
 * Owner Trust Centre — Proof of Spend (gap audit 2026-11-01, item 6).
 *
 * One linked chain per expense (owner approval request): APPROVAL -> QUOTES -> WORK_EVIDENCE ->
 * INVOICE -> PAYMENT. Each link is PRESENT or MISSING from stored records; nothing is inferred.
 * Invoice-vs-quote check compares the invoice total with the lowest submitted quote on the RFQ.
 * Labour / materials split is shown only when the invoice records both values; otherwise
 * NOT_ITEMISED. Results are paginated (PAGE_SIZE) and report `complete:false` when more exist,
 * so a page is never presented as a full ledger.
 */
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
export const PAGE_SIZE = 25;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };

export function invoiceVsQuote(invoiceAed: number | null, quoteAed: number | null) {
  if (invoiceAed === null || quoteAed === null || quoteAed <= 0) return { state: "NOT_COMPARABLE", varianceAed: null, variancePct: null };
  const varianceAed = Math.round((invoiceAed - quoteAed) * 100) / 100;
  const variancePct = Math.round((varianceAed / quoteAed) * 1000) / 10;
  return { state: varianceAed > 0 ? "OVER_QUOTE" : "WITHIN_QUOTE", varianceAed, variancePct };
}

export function labourMaterials(inv: any) {
  const labour = num(inv?.labourAed ?? inv?.laborAed);
  const materials = num(inv?.materialsAed);
  if (labour === null || materials === null) return { state: "NOT_ITEMISED", labourAed: null, materialsAed: null, otherAed: null };
  const total = num(inv?.totalAed ?? inv?.amount);
  return { state: "ITEMISED", labourAed: labour, materialsAed: materials, otherAed: total === null ? null : Math.round((total - labour - materials) * 100) / 100 };
}

async function requireOwner(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner" || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Owner access only. / للمالك فقط.");
  const prof = await admin.firestore().doc(`users/${auth.uid}`).get();
  if (prof.data()?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  return auth.uid as string;
}

export const getOwnerProofOfSpend = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = await requireOwner(request.auth);
  const db = admin.firestore();
  const snap = await db.collection("owner_approval_requests").where("ownerId", "==", uid).limit(PAGE_SIZE + 1).get();
  const docs = snap.docs.slice(0, PAGE_SIZE);
  const chains = [];
  for (const a of docs) {
    const x = a.data();
    const rfqId = text(x.rfqId, 180);
    const ticketId = text(x.ticketId, 180);
    const quotes = rfqId ? (await db.collection("vendor_quotes").where("rfqId", "==", rfqId).limit(20).get()).docs.map((d) => d.data()).filter((q) => q.ownerId === uid) : [];
    const lowestQuote = quotes.length ? Math.min(...quotes.map((q) => Number(q.amountAed)).filter(Number.isFinite)) : null;
    const ticket = ticketId ? (await db.doc(`maintenanceTickets/${ticketId}`).get()).data() : undefined;
    const ownTicket = ticket && (ticket.ownerId === uid || ticket.ownerUid === uid) ? ticket : undefined;
    const photos = ownTicket ? (Array.isArray(ownTicket.technicianAfterPhotos) ? ownTicket.technicianAfterPhotos.length : 0) + (ownTicket.technicianAfterPhotoUrl ? 1 : 0) : 0;
    const invSnap = await db.collection("invoices").where("approvalRequestId", "==", a.id).limit(5).get();
    const inv = invSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any)).find((i) => i.ownerId === uid || i.ownerUid === uid);
    const invoiceAed = inv ? num(inv.totalAed ?? inv.amount) : null;
    const paid = inv ? ["PAID", "VERIFIED"].includes(text(inv.paymentStatus || inv.status, 30).toUpperCase()) : false;
    chains.push({
      approvalRequestId: a.id, trade: text(x.trade, 120), status: text(x.status, 60), decision: text(x.decision, 40) || null,
      links: {
        APPROVAL: x.decision ? "PRESENT" : "MISSING",
        QUOTES: quotes.length ? "PRESENT" : "MISSING",
        WORK_EVIDENCE: photos > 0 ? "PRESENT" : "MISSING",
        INVOICE: inv ? "PRESENT" : "MISSING",
        PAYMENT: paid ? "PRESENT" : "MISSING",
      },
      quotesCount: quotes.length, lowestQuoteAed: lowestQuote, afterPhotos: photos, invoiceId: inv?.id ?? null, invoiceAed,
      check: invoiceVsQuote(invoiceAed, lowestQuote), split: inv ? labourMaterials(inv) : null,
    });
  }
  return { chains, complete: snap.size <= PAGE_SIZE, pageSize: PAGE_SIZE };
});
