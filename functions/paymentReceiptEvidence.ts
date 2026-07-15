import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

function text(value: unknown) {
  return String(value || "").trim();
}

export type OwnerPaymentReceiptEvidence = {
  bucket: string;
  storagePath: string;
  generation: string;
  size: number;
  contentType: string;
  receiptHash: string;
};

export async function assertStoredOwnerPaymentReceipt(args: {
  ownerUid: string;
  paymentId: string;
  storagePath: string;
  expectedHash?: string;
}): Promise<OwnerPaymentReceiptEvidence> {
  const ownerUid = text(args.ownerUid);
  const paymentId = text(args.paymentId);
  const storagePath = text(args.storagePath);
  const expectedPrefix = `payment-references/owners/${ownerUid}/${paymentId}/`;
  if (!ownerUid || !paymentId || !storagePath.startsWith(expectedPrefix)) {
    throw new HttpsError("failed-precondition", "Owner payment receipt path is not bound to this payment.");
  }

  try {
    const bucket = admin.storage().bucket();
    const [metadata] = await bucket.file(storagePath).getMetadata();
    const contentType = text(metadata.contentType).toLowerCase();
    const size = Number(metadata.size || 0);
    const generation = text(metadata.generation);
    const customMetadata = metadata.metadata || {};
    const receiptHash = text(customMetadata.receiptHash).toLowerCase();
    if (
      !ALLOWED_RECEIPT_TYPES.has(contentType) ||
      size <= 0 ||
      size > MAX_RECEIPT_BYTES ||
      !generation ||
      customMetadata.ownerUid !== ownerUid ||
      customMetadata.paymentId !== paymentId ||
      customMetadata.evidenceType !== "owner_payment_receipt" ||
      !/^[a-f0-9]{64}$/.test(receiptHash) ||
      (args.expectedHash && receiptHash !== text(args.expectedHash).toLowerCase())
    ) {
      throw new Error("receipt metadata mismatch");
    }
    return {
      bucket: bucket.name,
      storagePath,
      generation,
      size,
      contentType,
      receiptHash,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "failed-precondition",
      "Stored owner payment receipt is missing or its immutable metadata does not match.",
    );
  }
}
