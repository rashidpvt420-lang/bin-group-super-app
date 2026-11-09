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

/**
 * Owner "services suspended" state (audit D-03, clause 9F). The owner keeps their login, balances and
 * payment screens; only NEW service requests are refused, except emergency works. Tenants' emergency
 * requests on that owner's units still go through. A full account lock (status "suspended") is
 * treated the same way for service requests: emergencies are never refused here.
 */
export function ownerServicesSuspended(owner: Record<string, any> | undefined): boolean {
  if (!owner) return false;
  const status = String(owner.status ?? "").trim().toLowerCase();
  return owner.serviceSuspended === true || status === "suspended" || status === "services_suspended";
}

export const OWNER_SERVICES_SUSPENDED_MESSAGE =
  "Services for this property are suspended for non-payment. Only emergency requests are accepted until the overdue amount is paid and verified. / الخدمات لهذا العقار معلقة لعدم السداد. تُقبل طلبات الطوارئ فقط حتى يتم سداد المبلغ المتأخر والتحقق منه.";

export function assertOwnerServiceRequestAllowed(owner: Record<string, any> | undefined, emergency: boolean): void {
  if (!emergency && ownerServicesSuspended(owner)) {
    throw new HttpsError("failed-precondition", OWNER_SERVICES_SUSPENDED_MESSAGE, { reason: "OWNER_SERVICES_SUSPENDED" });
  }
}

export type ServiceEntitlementOptions = { emergency?: boolean };

export function contractGrantsService(input: Record<string, any> | undefined, ownerUid: string, options: ServiceEntitlementOptions = {}): boolean {
  if (!input) return false;
  // A contract suspended for non-payment (clause 9F) still covers emergency works.
  const suspendedForNonPayment = upper(input.status) === "SUSPENDED" && input.serviceSuspended === true;
  const contract = suspendedForNonPayment && options.emergency === true
    ? { ...input, status: upper(input.serviceSuspension?.previousStatus) || "ACTIVE" }
    : input;
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
  options: ServiceEntitlementOptions = {},
): Promise<string> {
  const ownerUid = id(property.ownerUid || property.ownerId);
  const emergency = options.emergency === true;
  // Read the owner first (all reads before writes inside transactions) and refuse non-emergency
  // requests while the owner's services are suspended.
  const owner = ownerUid ? ((await read(db.collection("users").doc(ownerUid))).data() || {}) : {};
  assertOwnerServiceRequestAllowed(owner, emergency);
  const direct = [property.activeContractId, property.contractId].map(id).filter(Boolean);
  for (const contractId of [...new Set(direct)]) {
    const snap = await read(db.collection("contracts").doc(contractId));
    if (snap.exists && contractGrantsService(snap.data(), ownerUid, { emergency })) return contractId;
  }
  if (ownerUid) {
    const viaOwner = [owner.activeContractId, owner.latestActivationContractId].map(id).filter((value) => value && !direct.includes(value));
    for (const contractId of [...new Set(viaOwner)]) {
      const snap = await read(db.collection("contracts").doc(contractId));
      const contract = snap.data();
      if (snap.exists && contract && coversProperty(contract, propertyId) && contractGrantsService(contract, ownerUid, { emergency })) return contractId;
    }
  }
  throw new HttpsError(
    "failed-precondition",
    "This property does not have an active, payment-verified BIN GROUP service contract. Please contact BIN GROUP Admin to activate service.",
    { reason: "SERVICE_CONTRACT_INACTIVE" },
  );
}
