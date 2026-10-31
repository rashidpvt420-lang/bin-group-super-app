import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createHash } from "crypto";
import { requireMfaFinanceAdminActor } from "./financeAdminMfa";

if (!admin.apps.length) admin.initializeApp();

export const COLLECTION_METHODS = ["cash", "cheque"] as const;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const PAYER_FIELDS = ["payerUid", "payerId", "ownerUid", "ownerId", "tenantUid", "tenantId", "userId", "clientUid", "uid"];
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

/** Exact AED to the fils; rejects sub-fils, zero, negative and absurd amounts. */
export function parseAedAmount(value: unknown): number {
  const raw = typeof value === "number" ? String(value) : text(value, 20);
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(raw)) throw new HttpsError("invalid-argument", "Amount must be AED with at most 2 decimals.");
  const amount = Number(raw);
  if (!(amount > 0)) throw new HttpsError("invalid-argument", "Amount must be greater than zero.");
  return amount;
}

export function parseCollectedOn(value: unknown, now = new Date()): string {
  const d = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
    throw new HttpsError("invalid-argument", "Collection date must be YYYY-MM-DD.");
  }
  const dubaiToday = new Date(now.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
  if (d > dubaiToday) throw new HttpsError("invalid-argument", "Collection date cannot be in the future.");
  if (d < "2020-01-01") throw new HttpsError("invalid-argument", "Collection date is too old.");
  return d;
}

/** Normalised cheque number used for duplicate detection (spaces/dashes/leading zeros ignored). */
export function normaliseChequeNumber(value: unknown): string {
  return text(value, 40).toUpperCase().replace(/[\s-]+/g, "").replace(/^0+(?=.)/, "");
}

/**
 * Duplicate-payment claims. One claim per (payer, cheque number) and one per proof file hash.
 * A second record reusing either is refused and raises a finance fraud alert, so the same
 * cheque or the same proof image can never be counted twice. A void releases the claims.
 */
export function duplicateClaimIds(payerUid: string, method: string, chequeNumber: string, proofHash: string): string[] {
  const ids = [createHash("sha256").update(`proof|${proofHash}`).digest("hex").slice(0, 40)];
  const cheque = method === "cheque" ? normaliseChequeNumber(chequeNumber) : "";
  if (cheque) ids.push(createHash("sha256").update(`cheque|${payerUid}|${cheque}`).digest("hex").slice(0, 40));
  return ids;
}

const DUPLICATE_MESSAGE =
  "Possible duplicate: this cheque or proof is already recorded. Finance has been alerted. / " +
  "احتمال تكرار: هذا الشيك أو الإثبات مسجل مسبقاً. تم تنبيه قسم المالية.";

async function raiseDuplicateAlert(details: Record<string, unknown>) {
  await admin.firestore().collection("finance_fraud_alerts").add({
    type: "DUPLICATE_PAYMENT_COLLECTION",
    severity: "high",
    status: "open",
    ...details,
    at: FieldValue.serverTimestamp(),
  });
}

async function loadTarget(targetType: string, targetId: string, payerUid: string) {
  const db = admin.firestore();
  const collections = targetType === "invoice" ? ["invoices"] : ["contracts", "active_contracts"];
  for (const name of collections) {
    const snap = await db.collection(name).doc(targetId).get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    const bound = PAYER_FIELDS.some((f) => text(data[f]) === payerUid);
    if (!bound) throw new HttpsError("failed-precondition", "This payer is not linked to that contract or invoice.");
    return { path: snap.ref.path };
  }
  throw new HttpsError("not-found", "Contract or invoice not found.");
}

export const financeRecordPaymentCollection = onCall({ cors: true, enforceAppCheck: true, timeoutSeconds: 60 }, async (request) => {
  const actor = await requireMfaFinanceAdminActor(request);
  const d = request.data || {};
  const payerUid = text(d.payerUid, 128);
  const targetType = text(d.targetType, 10);
  const targetId = text(d.targetId, 128);
  const method = text(d.method, 10).toLowerCase();
  const chequeNumber = text(d.chequeNumber, 40);
  const collectedBy = text(d.collectedBy, 120);
  const idempotencyKey = text(d.idempotencyKey, 64);
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(payerUid)) throw new HttpsError("invalid-argument", "Payer is required.");
  if (!["contract", "invoice"].includes(targetType)) throw new HttpsError("invalid-argument", "Choose a contract or invoice.");
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(targetId)) throw new HttpsError("invalid-argument", "Contract or invoice ID is required.");
  if (!(COLLECTION_METHODS as readonly string[]).includes(method)) {
    throw new HttpsError("invalid-argument", "Only cash or cheque collections can be recorded. Card payments are off.");
  }
  if (chequeNumber && !/^[A-Za-z0-9 -]{1,40}$/.test(chequeNumber)) throw new HttpsError("invalid-argument", "Invalid cheque number.");
  if (collectedBy.length < 2) throw new HttpsError("invalid-argument", "Collected-by is required.");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "Missing idempotency key.");
  const amount = parseAedAmount(d.amount);
  const collectedOn = parseCollectedOn(d.collectedOn);

  const contentType = text(d.proof?.contentType, 40).toLowerCase();
  const ext = PROOF_TYPES[contentType];
  if (!ext) throw new HttpsError("invalid-argument", "Proof must be a PDF, JPEG or PNG.");
  const b64 = typeof d.proof?.base64 === "string" ? d.proof.base64 : "";
  const body = Buffer.from(b64, "base64");
  if (body.length < 100 || body.length > MAX_PROOF_BYTES) throw new HttpsError("invalid-argument", "Proof upload is required (max 5 MB).");

  const target = await loadTarget(targetType, targetId, payerUid);
  const db = admin.firestore();
  const recordId = createHash("sha256").update(`${actor.uid}|${idempotencyKey}`).digest("hex").slice(0, 32);
  const recordRef = db.collection("payment_collection_records").doc(recordId);
  const existing = await recordRef.get();
  if (existing.exists) return { recordId, duplicate: true };

  const proofHash = createHash("sha256").update(body).digest("hex");
  const claimRefs = duplicateClaimIds(payerUid, method, chequeNumber, proofHash)
    .map((id) => db.collection("payment_collection_claims").doc(id));
  const alertBase = { payerUid, targetType, targetId, amount, method, actorUid: actor.uid, actorEmail: actor.email };
  for (const snap of await db.getAll(...claimRefs)) {
    if (snap.exists && snap.data()?.recordId !== recordId) {
      await raiseDuplicateAlert({ ...alertBase, existingRecordId: snap.data()?.recordId || null, claimKind: snap.data()?.kind || null });
      throw new HttpsError("already-exists", DUPLICATE_MESSAGE);
    }
  }
  const proofPath = `payment-collections/${payerUid}/${recordId}/proof.${ext}`;
  await admin.storage().bucket().file(proofPath).save(body, {
    resumable: false,
    metadata: { contentType, metadata: { payerUid, recordId, proofHash, uploadedBy: actor.uid } },
  });

  const record = {
    payerUid,
    targetType,
    targetId,
    targetPath: target.path,
    amount,
    currency: "AED",
    method,
    chequeNumber: method === "cheque" ? chequeNumber || null : null,
    collectedOn,
    collectedBy,
    proofPath,
    proofHash,
    proofContentType: contentType,
    status: "collected",
    displayStatus: "Paid – collected by finance",
    recordedByUid: actor.uid,
    recordedByEmail: actor.email,
    createdAt: FieldValue.serverTimestamp(),
  };
  try {
    await db.runTransaction(async (tx) => {
      const claims = await Promise.all(claimRefs.map((ref) => tx.get(ref)));
      const taken = claims.find((c) => c.exists && c.data()?.recordId !== recordId);
      if (taken) throw new HttpsError("already-exists", DUPLICATE_MESSAGE);
      claimRefs.forEach((ref, i) => tx.create(ref, { recordId, payerUid, kind: i === 0 ? "proof" : "cheque", createdAt: FieldValue.serverTimestamp() }));
      tx.create(recordRef, record);
      tx.create(db.collection("payment_collection_audit").doc(), {
        event: "recorded", recordId, payerUid, targetType, targetId, amount, method, actorUid: actor.uid, actorEmail: actor.email,
        at: FieldValue.serverTimestamp(),
      });
    });
  } catch (error: any) {
    if (error instanceof HttpsError && error.code === "already-exists") {
      await raiseDuplicateAlert({ ...alertBase, existingRecordId: null, claimKind: "race" });
      throw error;
    }
    if (String(error?.code) === "6" || /already exists/i.test(String(error?.message))) return { recordId, duplicate: true };
    throw error;
  }
  // Records the collection only. It does not change the contract or invoice status.
  return { recordId, duplicate: false };
});

export const financeVoidPaymentCollection = onCall({ cors: true, enforceAppCheck: true, timeoutSeconds: 30 }, async (request) => {
  const actor = await requireMfaFinanceAdminActor(request);
  const recordId = text(request.data?.recordId, 64);
  const reason = text(request.data?.reason, 500);
  if (!/^[a-f0-9]{32}$/.test(recordId)) throw new HttpsError("invalid-argument", "Invalid record.");
  if (reason.length < 10) throw new HttpsError("invalid-argument", "A void reason of at least 10 characters is required.");
  const db = admin.firestore();
  const recordRef = db.collection("payment_collection_records").doc(recordId);
  const voidRef = db.collection("payment_collection_voids").doc(recordId);
  await db.runTransaction(async (tx) => {
    const rec = await tx.get(recordRef);
    if (!rec.exists) throw new HttpsError("not-found", "Record not found.");
    const v = await tx.get(voidRef);
    if (v.exists) throw new HttpsError("already-exists", "This record is already voided.");
    const payerUid = rec.data()?.payerUid;
    const r = rec.data() || {};
    const claimRefs = duplicateClaimIds(text(r.payerUid, 128), text(r.method, 10), text(r.chequeNumber, 40), text(r.proofHash, 64))
      .map((id) => db.collection("payment_collection_claims").doc(id));
    const claims = await Promise.all(claimRefs.map((ref) => tx.get(ref)));
    // Release only this record's claims so a corrected entry can be recorded again.
    claims.forEach((c) => { if (c.exists && c.data()?.recordId === recordId) tx.delete(c.ref); });
    tx.create(voidRef, { recordId, payerUid, reason, voidedByUid: actor.uid, voidedByEmail: actor.email, voidedAt: FieldValue.serverTimestamp() });
    tx.create(db.collection("payment_collection_audit").doc(), {
      event: "voided", recordId, payerUid, reason, actorUid: actor.uid, actorEmail: actor.email, at: FieldValue.serverTimestamp(),
    });
  });
  return { recordId, voided: true };
});
