/**
 * Per-property owner ledger (gap audit 2026-11-01, item 2).
 * Joins rent, cheque maturity, outstanding invoices, maintenance spend and approved quotes for ONE
 * property the caller owns. Only verified records count as actuals:
 *   - rent received = rent_installments with status PAID (set only after finance verification)
 *   - maintenance spend = payment_transactions with paymentVerified === true and a maintenance type
 * Approved quotes are owner-approved estimate bands and are labelled as estimates, never actuals.
 * Reserves are not included here (painting reserves live in their own ledger).
 * Read-only: this callable never writes, approves or changes any record.
 */
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const upper = (v: unknown) => text(v, 60).toUpperCase();
const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "finance_admin", "operations_admin"]);
const OWNER_FIELDS = ["ownerId", "ownerUid"];
const owns = (d: Record<string, any>, uid: string) => OWNER_FIELDS.some((f) => text(d[f], 128) === uid);
export const CHEQUE_WINDOW_DAYS = 90;

export function dubaiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function addDays(ymd: string, days: number) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Pure ledger builder (unit-testable). Inputs must already be scoped to one property and owner. */
export function buildPropertyLedger(input: {
  installments: Record<string, any>[]; invoices: Record<string, any>[]; payments: Record<string, any>[]; approvals: Record<string, any>[]; today: string;
}) {
  const { installments, invoices, payments, approvals, today } = input;
  const open = installments.filter((r) => ["DUE", "OVERDUE", "PENDING_VERIFICATION"].includes(upper(r.status)));
  const paid = installments.filter((r) => upper(r.status) === "PAID");
  const horizon = addDays(today, CHEQUE_WINDOW_DAYS);
  const chequeMaturities = open
    .filter((r) => text(r.chequeNumber, 40) && text(r.dueDate, 10) <= horizon)
    .map((r) => ({
      dueDate: text(r.dueDate, 10), amount: money(r.amount), chequeNumber: text(r.chequeNumber, 40), status: upper(r.status),
      overdue: text(r.dueDate, 10) < today,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const outstanding = invoices
    .filter((i) => !["PAID", "VOID", "CANCELLED"].includes(upper(i.paymentStatus || i.status)))
    .map((i) => ({ invoiceId: text(i.invoiceId || i.id, 80), amountDue: Math.max(0, money(i.amount || i.total) - money(i.amountPaid)), status: upper(i.paymentStatus || i.status) }))
    .filter((i) => i.amountDue > 0);
  const maintenance = payments.filter((p) => p.paymentVerified === true && /MAINT|REPAIR|TICKET/.test(upper(p.paymentType || p.type || p.category)));
  const approved = approvals.filter((a) => ["APPROVED", "EMERGENCY_APPROVED"].includes(upper(a.decision)));
  const rentReceived = sum(paid.map((r) => money(r.amountReceived || r.amount)));
  const maintenanceSpend = sum(maintenance.map((p) => money(p.amountReceived || p.amount)));
  return {
    currency: "AED",
    asOf: today,
    rent: { dueOpen: sum(open.map((r) => money(r.amount))), receivedVerified: rentReceived, openCount: open.length, paidCount: paid.length },
    chequeMaturities,
    outstandingInvoices: { total: sum(outstanding.map((i) => i.amountDue)), items: outstanding.slice(0, 50) },
    maintenanceSpendVerified: maintenanceSpend,
    approvedQuotes: {
      count: approved.length,
      estimateBandTotal: sum(approved.map((a) => money(a.estimateBandAed))),
      isEstimate: true,
    },
    noiVerified: Math.round((rentReceived - maintenanceSpend) * 100) / 100,
    basis: "verified_records_only",
    excludes: ["reserves", "unverified_payments", "estimates_in_noi"],
  };
}

export const getOwnerPropertyLedger = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const role = text(request.auth?.token?.role || request.auth?.token?.userRole, 40).toLowerCase();
  const isAdmin = request.auth?.token?.admin === true || ADMIN_ROLES.has(role);
  if (role !== "owner" && !isAdmin) throw new HttpsError("permission-denied", "Owner access required.");
  const propertyId = text(request.data?.propertyId, 128);
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(propertyId)) throw new HttpsError("invalid-argument", "propertyId is required.");
  const db = admin.firestore();
  const prop = await db.collection("properties").doc(propertyId).get();
  if (!prop.exists) throw new HttpsError("not-found", "Property not found.");
  const ownerUid = text(prop.data()?.ownerId || prop.data()?.ownerUid, 128);
  if (!isAdmin && !owns(prop.data() || {}, uid)) throw new HttpsError("permission-denied", "This property is not yours.");
  const scoped = async (name: string) => (await db.collection(name).where("propertyId", "==", propertyId).get())
    .docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => owns(d, ownerUid));
  const [installments, invoices, payments, approvals] = await Promise.all([
    scoped("rent_installments"), scoped("invoices"), scoped("payment_transactions"), scoped("owner_approval_requests"),
  ]);
  return { propertyId, ...buildPropertyLedger({ installments, invoices, payments, approvals, today: dubaiToday() }) };
});
