import * as crypto from "crypto";

export type MobilizationInvoiceSnapshot = Readonly<{
  invoiceId: string;
  paymentId: string;
  contractId: string;
  intakeId: string;
  ownerUid: string;
  amount: number;
  currency: "AED";
  feeType: "MOBILIZATION_DEPOSIT";
  quoteHash: string;
  proofHash: string;
}>;

const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();

export function mobilizationInvoiceId(paymentId: string): string {
  const normalizedPaymentId = text(paymentId);
  if (!normalizedPaymentId) throw new Error("paymentId is required for the mobilisation invoice.");
  return `MOB-${crypto.createHash("sha256").update(normalizedPaymentId).digest("hex").slice(0, 20).toUpperCase()}`;
}

export function buildMobilizationInvoiceSnapshot(input: {
  paymentId: string;
  contractId: string;
  intakeId: string;
  ownerUid: string;
  amount: number;
  quoteHash: string;
}): MobilizationInvoiceSnapshot {
  const paymentId = text(input.paymentId);
  const contractId = text(input.contractId);
  const intakeId = text(input.intakeId);
  const ownerUid = text(input.ownerUid);
  const quoteHash = text(input.quoteHash);
  const amount = Number(input.amount);
  if (!paymentId || !contractId || !intakeId || !ownerUid) {
    throw new Error("Mobilisation invoice identity is incomplete.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Mobilisation invoice amount must be a positive AED value.");
  }
  const invoiceId = mobilizationInvoiceId(paymentId);
  const canonical = JSON.stringify({
    invoiceId,
    paymentId,
    contractId,
    intakeId,
    amount,
    currency: "AED",
    feeType: "MOBILIZATION_DEPOSIT",
    quoteHash,
  });
  return Object.freeze({
    invoiceId,
    paymentId,
    contractId,
    intakeId,
    ownerUid,
    amount,
    currency: "AED",
    feeType: "MOBILIZATION_DEPOSIT",
    quoteHash,
    proofHash: crypto.createHash("sha256").update(canonical).digest("hex"),
  });
}

export function assertMobilizationInvoiceImmutable(
  stored: Record<string, any>,
  expected: MobilizationInvoiceSnapshot,
): void {
  const mismatches = [
    text(stored.invoiceId) !== expected.invoiceId && "invoiceId",
    text(stored.paymentId) !== expected.paymentId && "paymentId",
    text(stored.contractId) !== expected.contractId && "contractId",
    text(stored.intakeId) !== expected.intakeId && "intakeId",
    text(stored.ownerUid || stored.ownerId) !== expected.ownerUid && "ownerUid",
    Number(stored.amount) !== expected.amount && "amount",
    upper(stored.currency) !== expected.currency && "currency",
    upper(stored.feeType) !== expected.feeType && "feeType",
    text(stored.quoteHash) !== expected.quoteHash && "quoteHash",
    text(stored.proofHash) !== expected.proofHash && "proofHash",
  ].filter(Boolean);
  if (mismatches.length) {
    throw new Error(`Existing mobilisation invoice immutable fields changed: ${mismatches.join(", ")}.`);
  }
}
