/**
 * Owner service suspension after a returned 15% cheque (clause 9F, approved 15 Oct 2026).
 *
 * NOTICE_ISSUED  written in-app notice recorded on bounce; deadline = notice + 15 days
 * RESOLVED       every listed invoice paid before the deadline (never suspended)
 * SUSPENDED      deadline passed with an invoice still unpaid (scheduled job)
 * LIFTED         suspended, then every listed invoice verified as paid
 *
 * Pure decisions only; Firestore wiring lives in ownerPaymentLedgerCallables.ts.
 */
import { OWNER_SUSPENSION_NOTICE_DAYS } from "./ownerPaymentLedger";

export type SuspensionStatus = "NOTICE_ISSUED" | "RESOLVED" | "SUSPENDED" | "LIFTED";
const DAY_MS = 24 * 60 * 60 * 1000;
const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();

export function ownerSuspensionNoticeId(contractId: string, paymentId: string): string {
  const safe = (value: string) => text(value).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
  if (!safe(contractId) || !safe(paymentId)) throw new Error("contractId and paymentId are required for a suspension notice.");
  return `SUSP-${safe(contractId)}-${safe(paymentId)}`;
}

export function buildOwnerSuspensionNotice(input: {
  contractId: string;
  ownerUid: string;
  paymentId: string;
  invoiceIds: string[];
  amountsAed: number[];
  issuedAtMs: number;
  issuedBy: string;
  bankReason: string;
}) {
  const invoiceIds = Array.from(new Set(input.invoiceIds.map(text).filter(Boolean)));
  if (!text(input.ownerUid) || !invoiceIds.length) throw new Error("Suspension notice needs an owner and at least one invoice.");
  const deadlineMs = input.issuedAtMs + OWNER_SUSPENSION_NOTICE_DAYS * DAY_MS;
  const totalAed = Math.round(input.amountsAed.reduce((sum, value) => sum + Number(value || 0) * 100, 0)) / 100;
  return {
    noticeId: ownerSuspensionNoticeId(input.contractId, input.paymentId),
    contractId: text(input.contractId),
    ownerUid: text(input.ownerUid),
    paymentId: text(input.paymentId),
    invoiceIds,
    totalAed,
    noticeDays: OWNER_SUSPENSION_NOTICE_DAYS,
    issuedAt: new Date(input.issuedAtMs).toISOString(),
    deadlineAt: new Date(deadlineMs).toISOString(),
    status: "NOTICE_ISSUED" as SuspensionStatus,
    issuedBy: text(input.issuedBy),
    bankReason: text(input.bankReason),
    textEn: `Written notice (clause 9F): your 15% mobilisation cheque was returned by the bank. AED ${totalAed.toLocaleString("en-US")} (the mobilisation amount plus the AED 500 returned-cheque fee) is due. If it is not paid and verified by ${new Date(deadlineMs).toISOString().slice(0, 10)} (${OWNER_SUSPENSION_NOTICE_DAYS} days), services will be suspended. Emergency works are not suspended without separate notice.`,
    textAr: `إشعار كتابي (البند 9و): أُعيد شيك دفعة التفعيل 15% من البنك. المبلغ المستحق ${totalAed.toLocaleString("en-US")} درهم (مبلغ التفعيل مع رسم الشيك المرتجع 500 درهم). إذا لم يتم السداد والتحقق منه بحلول ${new Date(deadlineMs).toISOString().slice(0, 10)} (${OWNER_SUSPENSION_NOTICE_DAYS} يوماً) سيتم تعليق الخدمات. ولا تُعلق الأعمال الطارئة دون إشعار مستقل.`,
  };
}

/** An invoice counts as settled only when verified as PAID (a reversed receipt is not settled). */
export function invoiceSettled(invoice: Record<string, any> | null | undefined): boolean {
  if (!invoice) return false;
  if (invoice.replacementPayment && !invoice.replacementPayment.verifiedAt) return false;
  if (invoice.replacementPayment?.verifiedAt) return true;
  if (upper(invoice.receiptState) === "REVERSED") return false;
  return upper(invoice.status) === "PAID" || upper(invoice.paymentStatus) === "PAID";
}

export type SuspensionDecision = "WAIT" | "SUSPEND" | "RESOLVE" | "LIFT" | "NOOP";

/** Scheduled job: suspend only after the deadline and only if something is still unpaid. */
export function decideSuspension(notice: Record<string, any>, invoices: Array<Record<string, any> | null>, nowMs: number): SuspensionDecision {
  const status = upper(notice?.status);
  const allPaid = invoices.length > 0 && invoices.every(invoiceSettled);
  if (status === "NOTICE_ISSUED") {
    if (allPaid) return "RESOLVE";
    const deadline = Date.parse(text(notice.deadlineAt));
    if (!Number.isFinite(deadline)) return "NOOP";
    return nowMs >= deadline ? "SUSPEND" : "WAIT";
  }
  if (status === "SUSPENDED") return allPaid ? "LIFT" : "NOOP";
  return "NOOP";
}
