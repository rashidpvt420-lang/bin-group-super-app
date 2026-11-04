// Pure tenant unit-link selection for AI Design (no Firebase imports, unit-testable).
const INACTIVE_PROPERTY_STATUSES = new Set(["rejected", "archived", "deleted", "inactive", "disabled"]);

export function propertyOwnerId(property: any, unit: any) {
  return String(property?.ownerId || property?.ownerUid || unit?.ownerId || unit?.ownerUid || "").trim().slice(0, 160);
}

/**
 * Pick the tenant's live unit from every unit verifiably linked to them (unit.tenantId/tenantUid/
 * tenantEmail matches the caller). A tenant can carry stale links (e.g. a unit on a REJECTED
 * property with no owner) — the old limit(1) lookup picked one arbitrarily and failed with
 * "owner could not be resolved". The profile's assigned unit is preferred only when that unit is
 * itself linked to the caller, so no authority is granted from the profile alone.
 */
export function chooseTenantLink(
  links: Array<{ unit: any; property: any | null }>,
  preferredUnitId = "",
): { unit: any; property: any } | null {
  const usable = links.filter(({ unit, property }) => property
    && !INACTIVE_PROPERTY_STATUSES.has(String(property.status || "").trim().toLowerCase())
    && propertyOwnerId(property, unit));
  return (usable.find(({ unit }) => preferredUnitId && unit.id === preferredUnitId) || usable[0] || null) as any;
}

