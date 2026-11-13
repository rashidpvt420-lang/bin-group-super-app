import { createHash } from "crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import {
  SIGNED_CONTRACT_AUDIT_COLLECTION,
  SIGNED_CONTRACT_AUDIT_RETENTION_YEARS,
} from "./ownerInitialContractPolicy";

export function clientIpFromRequest(request: { rawRequest?: any } | null | undefined): string {
  const raw = request?.rawRequest;
  const forwarded = String(raw?.headers?.["x-forwarded-for"] || "").split(",")[0]?.trim();
  const ip = forwarded || String(raw?.ip || raw?.headers?.["x-real-ip"] || "").trim();
  return ip || "not_provided";
}

export function deviceIdFromRequest(request: { data?: any; rawRequest?: any } | null | undefined): string {
  const fromBody = String(request?.data?.deviceId || request?.data?.deviceID || "").trim();
  if (fromBody) return fromBody.slice(0, 180);
  return "not_provided";
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function enqueueContractAcceptanceAudit(
  transaction: Transaction,
  db: Firestore,
  args: {
    uid: string;
    contractId: string;
    termsVersion: string;
    acceptedTermsSha256: string;
    ip: string;
    deviceId: string;
    path: string;
  },
) {
  const retainedUntil = new Date();
  retainedUntil.setFullYear(retainedUntil.getFullYear() + SIGNED_CONTRACT_AUDIT_RETENTION_YEARS);
  const ref = db.collection(SIGNED_CONTRACT_AUDIT_COLLECTION).doc();
  transaction.create(ref, {
    uid: args.uid,
    contractId: args.contractId,
    termsVersion: args.termsVersion,
    acceptedTermsSha256: args.acceptedTermsSha256,
    ip: args.ip || "not_provided",
    deviceId: args.deviceId || "not_provided",
    path: args.path,
    retentionYears: SIGNED_CONTRACT_AUDIT_RETENTION_YEARS,
    retainedUntil: retainedUntil.toISOString(),
    immutable: true,
    createdAt: FieldValue.serverTimestamp(),
    serverTimestamp: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
