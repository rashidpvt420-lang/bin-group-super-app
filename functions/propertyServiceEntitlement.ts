import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Revenue gate: owner/tenant maintenance tickets (and the automatic technician dispatch they
 * trigger) are only accepted for a property covered by an ACTIVE owner service contract whose
 * mobilization payment was verified by a finance admin (adminApprovePayment). Admin and staff
 * paths (inspections, manual dispatch) are intentionally not gated here.
 */
type Reader = (ref: admin.firestore.DocumentReference) => Promise<admin.firestore.DocumentSnapshot>;

const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();
const id = (value: unknown) => String(value ?? "").trim().slice(0, 220);
const CLOSED = new Set(["CLOSED", "CANCELLED", "CANCELED", "TERMINATED", "EXPIRED", "PAYMENT_REJECTED", "REJECTED", "SUSPENDED", "VOID"]);
const PAID = new Set(["APPROVED", "VERIFIED", "RECONCILED", "PAID"]);

export function contractGrantsService(contract: Record<string, any> | undefined, ownerUid: string): boolean {
  if (!contract) return false;
  const status = upper(contract.status);
  const contractStatus = upper(contract.contractStatus);
  if (CLOSED.has(status) || CLOSED.has(contractStatus)) return false;
  if (status !== "ACTIVE" && contractStatus !== "ACTIVE") return false;
  if (contract.paymentVerified !== true) return false;
  const paymentStatus = upper(contract.paymentStatus);
  if (paymentStatus && !PAID.has(paymentStatus)) return false;
  const contractOwner = id(contract.ownerUid || contract.ownerId);
  if (ownerUid && contractOwner && contractOwner !== ownerUid) return false;
  return true;
}

function coversProperty(contract: Record<string, any>, propertyId: string) {
  const ids = [contract.propertyId, ...(Array.isArray(contract.propertyIds) ? contract.propertyIds : []),
    ...(Array.isArray(contract.activePropertyIds) ? contract.activePropertyIds : [])].map(id).filter(Boolean);
  return ids.includes(propertyId);
}

export async function assertPropertyServiceEntitlement(
  db: admin.firestore.Firestore,
  read: Reader,
  propertyId: string,
  property: Record<string, any>,
): Promise<string> {
  const ownerUid = id(property.ownerUid || property.ownerId);
  const direct = [property.activeContractId, property.contractId].map(id).filter(Boolean);
  for (const contractId of [...new Set(direct)]) {
    const snap = await read(db.collection("contracts").doc(contractId));
    if (snap.exists && contractGrantsService(snap.data(), ownerUid)) return contractId;
  }
  if (ownerUid) {
    const ownerSnap = await read(db.collection("users").doc(ownerUid));
    const owner = ownerSnap.data() || {};
    const viaOwner = [owner.activeContractId, owner.latestActivationContractId].map(id).filter((value) => value && !direct.includes(value));
    for (const contractId of [...new Set(viaOwner)]) {
      const snap = await read(db.collection("contracts").doc(contractId));
      const contract = snap.data();
      if (snap.exists && contract && coversProperty(contract, propertyId) && contractGrantsService(contract, ownerUid)) return contractId;
    }
  }
  throw new HttpsError(
    "failed-precondition",
    "This property does not have an active, payment-verified BIN GROUP service contract. Please contact BIN GROUP Admin to activate service.",
    { reason: "SERVICE_CONTRACT_INACTIVE" },
  );
}
