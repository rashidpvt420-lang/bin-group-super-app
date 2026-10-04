/**
 * One tenant-unit link check shared by ticket creation and automatic dispatch.
 *
 * createTenantServiceTicket accepted a unit linked through tenantId / tenantUid /
 * currentTenantId or through the tenant's verified email (unit.tenantEmail), but
 * attemptAutoAssignment only looked at the first non-empty of tenantId / tenantUid /
 * userId / authUid. A ticket the callable had already authorised could therefore stop
 * silently at dispatch. Both paths now use this module.
 *
 * The rules are not loosened: a uid link needs an exact uid match, and an email link
 * needs the tenant's email to be verified, read from the Auth token at creation and
 * from the live Auth record at dispatch (a disabled Auth account never links).
 */
import type * as admin from "firebase-admin";
import type * as FirebaseFirestore from "firebase-admin/firestore";

const text = (value: unknown, max = 320) => String(value ?? "").trim().slice(0, max);

/** Unit fields that bind a unit to a tenant uid at ticket creation. */
export const TENANT_UNIT_UID_FIELDS = ["tenantId", "tenantUid", "currentTenantId"] as const;
/** Legacy uid fields attemptAutoAssignment already accepted on main; kept so dispatch is not narrowed. */
export const LEGACY_DISPATCH_UNIT_UID_FIELDS = ["userId", "authUid"] as const;

export type TenantIdentity = { uid: string; verifiedEmail: string };

export function tenantUnitLinkMatches(
  unit: FirebaseFirestore.DocumentData | undefined,
  identity: TenantIdentity,
  options: { includeLegacyUidFields?: boolean } = {},
): boolean {
  if (!unit) return false;
  const uid = text(identity.uid, 160);
  if (!uid) return false;
  const uidFields: readonly string[] = options.includeLegacyUidFields
    ? [...TENANT_UNIT_UID_FIELDS, ...LEGACY_DISPATCH_UNIT_UID_FIELDS]
    : TENANT_UNIT_UID_FIELDS;
  if (uidFields.some((field) => text(unit[field], 160) === uid)) return true;
  const verifiedEmail = text(identity.verifiedEmail).toLowerCase();
  return Boolean(verifiedEmail) && text(unit.tenantEmail).toLowerCase() === verifiedEmail;
}

export type TenantTicketLinkResult =
  | { linked: true; via: "uid" | "verified_email" }
  | { linked: false; details: Record<string, unknown> };

/** Re-verifies, at dispatch time, the tenant-unit link a tenant ticket was created with. */
export async function verifyTenantTicketUnitLink(params: {
  db: FirebaseFirestore.Firestore;
  auth: Pick<admin.auth.Auth, "getUser">;
  ticket: FirebaseFirestore.DocumentData;
}): Promise<TenantTicketLinkResult> {
  const { db, auth, ticket } = params;
  const tenantId = text(ticket.tenantId || ticket.tenantUid, 160);
  const unitId = text(ticket.unitId, 160);
  const propertyId = text(ticket.propertyId, 160);
  if (!tenantId || !unitId || !propertyId) {
    return {
      linked: false,
      details: { missingLink: true, hasTenant: Boolean(tenantId), hasUnit: Boolean(unitId), hasProperty: Boolean(propertyId) },
    };
  }
  const unitSnap = await db.collection("units").doc(unitId).get();
  const unit = unitSnap.data();
  if (!unitSnap.exists || !unit) return { linked: false, details: { unitExists: false } };
  if (text(unit.propertyId, 160) !== propertyId) {
    return { linked: false, details: { unitExists: true, unitPropertyMatches: false } };
  }
  if (tenantUnitLinkMatches(unit, { uid: tenantId, verifiedEmail: "" }, { includeLegacyUidFields: true })) {
    return { linked: true, via: "uid" };
  }
  if (text(unit.tenantEmail)) {
    let verifiedEmail = "";
    try {
      const user = await auth.getUser(tenantId);
      if (user.emailVerified === true && user.disabled !== true) verifiedEmail = text(user.email).toLowerCase();
    } catch {
      verifiedEmail = "";
    }
    if (tenantUnitLinkMatches(unit, { uid: tenantId, verifiedEmail })) return { linked: true, via: "verified_email" };
  }
  return { linked: false, details: { unitExists: true, unitPropertyMatches: true, tenantMatches: false } };
}
