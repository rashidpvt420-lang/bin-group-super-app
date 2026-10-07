import * as admin from "firebase-admin";

// Unit scoping for maintenance tickets.
//
// Owners may file a complaint without picking a unit (the owner complaint form
// offers "Common Area / Whole Property"), and the owner callable stored such
// tickets with unitId/unitNumber null. Manual dispatch then hard-failed with
// "Ticket must be linked to a property and unit before dispatch." even for a
// single-unit villa whose property declares units: 1 but has no units record,
// so those tickets could never be assigned. These helpers decide, from the
// server-side property record and its units records, when a ticket is
// unambiguously scoped to the whole of a single-unit property.

type Data = FirebaseFirestore.DocumentData;
const text = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);

export const UNIT_SCOPE = {
  UNIT: "UNIT",
  WHOLE_PROPERTY: "WHOLE_PROPERTY",
  COMMON_AREA: "COMMON_AREA",
} as const;

/** Units the property declares (units / numberOfUnits / unitCount / totalUnits); null when unknown. */
export function declaredUnitCount(property: Data | undefined | null): number | null {
  if (!property) return null;
  for (const value of [property.units, property.numberOfUnits, property.unitCount, property.totalUnits]) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  }
  return null;
}

/**
 * A property is single-unit when it declares at most one unit and has at most
 * one units record. A property that declares nothing is not treated as
 * single-unit (it may be a building).
 */
export function isSingleUnitProperty(property: Data | undefined | null, unitRecordCount: number): boolean {
  const declared = declaredUnitCount(property);
  return declared !== null && declared <= 1 && unitRecordCount <= 1;
}

export function unitRecordsQuery(db: admin.firestore.Firestore, propertyId: string, limit = 3) {
  return db.collection("units").where("propertyId", "==", propertyId).limit(limit);
}

export type DispatchUnitScope =
  | { ok: true; unitScope: "WHOLE_PROPERTY"; unitId: string | null; unitNumber: string | null }
  | { ok: false; reason: "PROPERTY_NOT_FOUND" | "PROPERTY_OWNER_MISMATCH" | "MULTI_UNIT_PROPERTY_REQUIRES_UNIT" };

/**
 * For a ticket that carries no unit: may it be dispatched as a whole-property
 * job? Only when the ticket's property exists, is bound to the same owner and
 * is single-unit. When exactly one units record exists it is returned so the
 * ticket can be linked to it.
 */
export function resolveUnitlessDispatchScope(params: {
  ticket: Data;
  propertySnap: FirebaseFirestore.DocumentSnapshot;
  unitDocs: FirebaseFirestore.QueryDocumentSnapshot[];
}): DispatchUnitScope {
  const { ticket, propertySnap, unitDocs } = params;
  if (!propertySnap.exists) return { ok: false, reason: "PROPERTY_NOT_FOUND" };
  const property = propertySnap.data() || {};
  const ticketOwner = text(ticket.ownerId || ticket.ownerUid, 160);
  const propertyOwner = text(property.ownerId || property.ownerUid, 160);
  if (ticketOwner && propertyOwner && ticketOwner !== propertyOwner) return { ok: false, reason: "PROPERTY_OWNER_MISMATCH" };
  const ownUnits = unitDocs.filter((doc) => text(doc.data()?.propertyId, 160) === propertySnap.id);
  if (!isSingleUnitProperty(property, ownUnits.length)) return { ok: false, reason: "MULTI_UNIT_PROPERTY_REQUIRES_UNIT" };
  const only = ownUnits[0];
  return {
    ok: true,
    unitScope: UNIT_SCOPE.WHOLE_PROPERTY,
    unitId: only ? only.id : null,
    unitNumber: only ? text(only.data()?.unitNumber || only.data()?.name, 80) || null : null,
  };
}

export function ticketHasUnit(ticket: Data): boolean {
  return Boolean(text(ticket.unitId || ticket.unitNumber || ticket.unit));
}

export const UNIT_REQUIRED_MESSAGE = "Ticket must be linked to a property and unit before dispatch.";

import type * as FirebaseFirestore from "firebase-admin/firestore";
