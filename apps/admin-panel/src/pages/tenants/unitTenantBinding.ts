// Every field that binds a unit to a tenant. acceptTenantInvitation
// (functions/index.ts) writes tenantId, tenantUid, tenantName and tenantEmail;
// the admin page writes tenantId and currentTenantId. Firestore rules
// (units get / isUnitTenant), createTenantServiceTicket (tenantOwnsUnit),
// submitTenantMoveInspection and the tenant portal unit lookups accept ANY of
// these as proof of tenancy, and the server unit linker refuses a unit whose
// tenantUid/tenantId/currentTenantId is still set. Unlinking must therefore
// clear all of them, not only tenantId/currentTenantId.
export const UNIT_TENANT_BINDING_FIELDS = [
  'tenantId',
  'tenantUid',
  'currentTenantId',
  'tenantEmail',
  'tenantName',
] as const;

/** Patch that fully detaches the current tenant from a unit. */
export function vacatedUnitTenantBinding(): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const field of UNIT_TENANT_BINDING_FIELDS) patch[field] = null;
  patch.occupancyStatus = 'VACANT';
  patch.tenantStatus = 'none';
  return patch;
}

/**
 * Patch that binds a (possibly not-yet-accepted) tenant to a unit. A previous
 * occupant's auth uid / email is cleared so it cannot outlive the
 * reassignment; acceptTenantInvitation sets tenantUid/tenantEmail for the
 * new tenant once they accept.
 */
export function occupiedUnitTenantBinding(input: {
  tenantId: string;
  tenantName?: string | null;
}): Record<string, string | null> {
  return {
    tenantId: input.tenantId,
    currentTenantId: input.tenantId,
    tenantUid: null,
    tenantEmail: null,
    tenantName: input.tenantName ? String(input.tenantName) : null,
    occupancyStatus: 'OCCUPIED',
  };
}
