import { HttpsError, onCall } from "firebase-functions/v2/https";
import { tenantRequestUnitLink as legacyTenantRequestUnitLink } from "./profileP1Workflows";

const text = (value: unknown, maxLength = 500) => String(value ?? "").trim().slice(0, maxLength);

export function assertTenantUnitLinkRequest(data: any) {
  const propertyName = text(data?.propertyName, 180);
  const propertyId = text(data?.propertyId, 128);
  const unitNumber = text(data?.unitNumber, 80);
  const leaseReference = text(data?.leaseReference, 160);
  const verificationCode = text(data?.verificationCode, 160);
  const notes = text(data?.notes, 1000);

  if (!propertyName && !propertyId) {
    throw new HttpsError("invalid-argument", "Property name or property ID is required.");
  }
  if (unitNumber.length < 1) {
    throw new HttpsError("invalid-argument", "Unit number is required.");
  }
  if (propertyName.length > 0 && propertyName.length < 3) {
    throw new HttpsError("invalid-argument", "Property name must contain at least 3 characters.");
  }

  return { propertyName, propertyId, unitNumber, leaseReference, verificationCode, notes };
}

export const tenantRequestUnitLink = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Tenant login required.");
    const role = text(
      request.auth.token?.role || request.auth.token?.userRole || request.auth.token?.primaryRole,
      40,
    ).toLowerCase();
    if (role !== "tenant") throw new HttpsError("permission-denied", "Tenant role required.");

    const validated = assertTenantUnitLinkRequest(request.data || {});
    request.data = validated;
    if (typeof (legacyTenantRequestUnitLink as any)?.run !== "function") {
      throw new HttpsError("internal", "Tenant unit-link request handler is unavailable.");
    }
    return (legacyTenantRequestUnitLink as any).run(request);
  },
);
