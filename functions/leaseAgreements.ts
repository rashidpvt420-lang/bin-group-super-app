/**
 * Tenancy agreement type and government registration tracking
 * (feature 2, owner/tenant deep audit 2026-10-21 §7).
 *
 * GOVERNMENT: a tenancy registered with the emirate's registry — Ejari (Dubai Land Department)
 * or Tawtheeq (Abu Dhabi, incl. Al Ain). Other emirates are recorded as MUNICIPAL.
 * PRIVATE: an unregistered private agreement between owner and tenant.
 * No registry API is called; the owner records the number and uploads the certificate.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { parseExactAedAmount } from "./shared/aedMoneyInput";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin", "account_manager"]);

export type AgreementType = "GOVERNMENT" | "PRIVATE";
export type RegistrationAuthority = "EJARI" | "TAWTHEEQ" | "MUNICIPAL";

export function authorityForEmirate(emirate: unknown): RegistrationAuthority {
  const e = text(emirate, 80).toLowerCase().replace(/[^a-z]/g, "");
  if (e === "dubai") return "EJARI";
  if (e === "abudhabi" || e === "alain") return "TAWTHEEQ";
  return "MUNICIPAL";
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validYmd = (v: string) => YMD.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function validateAgreement(input: any, ownerUid: string) {
  const agreementType = text(input?.agreementType, 20).toUpperCase() as AgreementType;
  if (agreementType !== "GOVERNMENT" && agreementType !== "PRIVATE") {
    throw new HttpsError("invalid-argument", "agreementType must be GOVERNMENT or PRIVATE.");
  }
  const startDate = text(input?.startDate, 10);
  const endDate = text(input?.endDate, 10);
  if (!validYmd(startDate) || !validYmd(endDate)) throw new HttpsError("invalid-argument", "Lease start and end dates (YYYY-MM-DD) are required.");
  if (endDate <= startDate) throw new HttpsError("invalid-argument", "Lease end date must be after the start date.");
  let annualRent: number | null = null;
  if (input?.annualRent !== undefined && input?.annualRent !== null && String(input.annualRent).trim() !== "") {
    try { annualRent = parseExactAedAmount(input.annualRent); } catch { throw new HttpsError("invalid-argument", "Annual rent must be AED exact to the fils."); }
    if (!(annualRent > 0)) throw new HttpsError("invalid-argument", "Annual rent must be positive.");
  }
  const registrationNumber = text(input?.registrationNumber, 40).replace(/\s+/g, "");
  const registrationDate = text(input?.registrationDate, 10);
  const certificatePath = text(input?.certificatePath, 500);
  if (registrationNumber && !/^[A-Za-z0-9/-]{4,40}$/.test(registrationNumber)) {
    throw new HttpsError("invalid-argument", "Registration number may contain letters, digits, / and - (4-40 characters).");
  }
  if (registrationDate && !validYmd(registrationDate)) throw new HttpsError("invalid-argument", "Registration date must be YYYY-MM-DD.");
  if (certificatePath && !certificatePath.startsWith(`owners/${ownerUid}/tenancy-registrations/`)) {
    throw new HttpsError("permission-denied", "The certificate must be uploaded to your own tenancy-registrations folder.");
  }
  if (agreementType === "PRIVATE" && (registrationNumber || certificatePath)) {
    throw new HttpsError("invalid-argument", "A private agreement has no government registration number or certificate.");
  }
  const registered = agreementType === "GOVERNMENT" && Boolean(registrationNumber && registrationDate && certificatePath);
  return {
    agreementType, startDate, endDate, annualRent, registrationNumber, registrationDate, certificatePath,
    registrationStatus: agreementType === "PRIVATE" ? "NOT_REGISTERED_PRIVATE" : registered ? "REGISTERED" : "PENDING_REGISTRATION",
  };
}

export const ownerRecordLeaseAgreement = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const role = text(request.auth.token?.role || request.auth.token?.userRole, 40).toLowerCase();
  const isAdmin = ADMIN_ROLES.has(role);
  if (!isAdmin && (role !== "owner" || request.auth.token?.email_verified !== true || request.auth.token?.suspended === true)) {
    throw new HttpsError("permission-denied", "A verified owner or admin is required.");
  }
  const unitId = text(request.data?.unitId, 160);
  if (!unitId) throw new HttpsError("invalid-argument", "unitId is required.");
  const unitSnap = await db.collection("units").doc(unitId).get();
  if (!unitSnap.exists) throw new HttpsError("not-found", "Unit not found.");
  const unit = unitSnap.data() || {};
  const propertyId = text(unit.propertyId, 160);
  const property = propertyId ? (await db.collection("properties").doc(propertyId).get()).data() || {} : {};
  const ownerId = text(property.ownerId || property.ownerUid || unit.ownerId || unit.ownerUid, 160);
  if (!isAdmin && ownerId !== request.auth.uid) throw new HttpsError("permission-denied", "This unit is not on your property.");
  const tenantId = text(unit.tenantUid || unit.tenantId || unit.currentTenantId, 160);
  if (!tenantId) throw new HttpsError("failed-precondition", "Link a tenant to this unit before recording the agreement.");

  const agreement = validateAgreement(request.data, ownerId || request.auth.uid);
  const emirate = property.emirate || property.geo?.emirate || unit.emirate;
  const registrationAuthority = agreement.agreementType === "GOVERNMENT" ? authorityForEmirate(emirate) : null;

  const existing = await db.collection("leases").where("unitId", "==", unitId).where("tenantId", "==", tenantId).limit(1).get();
  const leaseRef = existing.empty ? db.collection("leases").doc(`unit_${unitId}_${tenantId}`.replace(/[^A-Za-z0-9_-]/g, "_")) : existing.docs[0].ref;
  const now = FieldValue.serverTimestamp();
  await leaseRef.set({
    propertyId, unitId, tenantId, ownerId,
    agreementType: agreement.agreementType,
    registrationAuthority,
    registrationNumber: agreement.registrationNumber || null,
    registrationDate: agreement.registrationDate || null,
    registrationCertificatePath: agreement.certificatePath || null,
    registrationStatus: agreement.registrationStatus,
    leaseStartDate: agreement.startDate,
    leaseEndDate: agreement.endDate,
    endDate: agreement.endDate,
    ...(agreement.annualRent ? { annualRent: agreement.annualRent } : {}),
    leaseStatus: agreement.registrationStatus === "PENDING_REGISTRATION" ? "pending_registration" : "active",
    agreementRecordedBy: request.auth.uid,
    agreementRecordedAt: now,
    updatedAt: now,
    ...(existing.empty ? { createdAt: now, createdBy: request.auth.uid } : {}),
  }, { merge: true });
  await db.collection("audit_logs").add({
    action: "LEASE_AGREEMENT_RECORDED", actorId: request.auth.uid, actorRole: role, leaseId: leaseRef.id, unitId, propertyId,
    agreementType: agreement.agreementType, registrationAuthority, registrationStatus: agreement.registrationStatus, createdAt: now,
  });
  return { status: "SUCCESS", leaseId: leaseRef.id, agreementType: agreement.agreementType, registrationAuthority, registrationStatus: agreement.registrationStatus };
});
