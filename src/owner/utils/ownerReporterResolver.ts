export type ReporterAccessStatus = "INVITED" | "ACTIVE" | "SUSPENDED";
export type ReporterAccessType = "MAJLIS_RESIDENT" | "OWNER_DELEGATE" | "FACILITY_MANAGER" | "SECURITY" | "STAFF" | "OTHER";
export type ReporterPermissionScope = "COMPLAINTS_ONLY" | "VIEW_AND_COMPLAIN" | "OWNER_DELEGATE";

export interface PropertyReporter {
  id: string;
  reporterId: string;
  ownerId: string;
  propertyId: string;
  propertyName: string;
  reporterUid: string | null;
  reporterName: string;
  reporterEmail: string;
  reporterPhone: string;
  roleLabel: string;
  accessType: ReporterAccessType;
  permissionScope: ReporterPermissionScope;
  occupiedArea: string;
  unitId: string;
  notes: string;
  inviteCode: string;
  portalRoute: string;
  accessStatus: ReporterAccessStatus;
  canCreateComplaints: boolean;
  canViewOwnComplaints: boolean;
  canViewPropertyComplaints: boolean;
  canActOnOwnerBehalf: boolean;
  canViewOwnerFinancials: boolean;
  canApproveWork: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  invitedByOwnerUid: string;
}

const safeDate = (val: any) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  if (val._seconds) return new Date(val._seconds * 1000);
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeAccessType = (value: any): ReporterAccessType => {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (["MAJLIS_RESIDENT", "OWNER_DELEGATE", "FACILITY_MANAGER", "SECURITY", "STAFF", "OTHER"].includes(normalized)) {
    return normalized as ReporterAccessType;
  }
  return 'OTHER';
};

const normalizePermissionScope = (value: any, canActOnOwnerBehalf: boolean, canViewPropertyComplaints: boolean): ReporterPermissionScope => {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (["COMPLAINTS_ONLY", "VIEW_AND_COMPLAIN", "OWNER_DELEGATE"].includes(normalized)) {
    return normalized as ReporterPermissionScope;
  }
  if (canActOnOwnerBehalf) return 'OWNER_DELEGATE';
  if (canViewPropertyComplaints) return 'VIEW_AND_COMPLAIN';
  return 'COMPLAINTS_ONLY';
};

export function resolvePropertyReporter(raw: any): PropertyReporter {
  const accessType = normalizeAccessType(raw.accessType || raw.reporterType || raw.roleLabel || raw.role);
  const canActOnOwnerBehalf = raw.canActOnOwnerBehalf === true || accessType === 'OWNER_DELEGATE';
  const canViewOwnerFinancials = raw.canViewOwnerFinancials === true && canActOnOwnerBehalf;
  const canViewPropertyComplaints = raw.canViewPropertyComplaints === true || canActOnOwnerBehalf;
  const permissionScope = normalizePermissionScope(raw.permissionScope, canActOnOwnerBehalf, canViewPropertyComplaints);

  return {
    id: String(raw.id || raw.reporterId || ''),
    reporterId: String(raw.reporterId || raw.id || ''),
    ownerId: String(raw.ownerId || raw.ownerUid || ''),
    propertyId: String(raw.propertyId || ''),
    propertyName: String(raw.propertyName || 'Property'),
    reporterUid: raw.reporterUid ? String(raw.reporterUid) : null,
    reporterName: String(raw.reporterName || raw.name || ''),
    reporterEmail: String(raw.reporterEmail || raw.email || '').toLowerCase(),
    reporterPhone: String(raw.reporterPhone || raw.phone || ''),
    roleLabel: String(raw.roleLabel || raw.role || 'Other'),
    accessType,
    permissionScope,
    occupiedArea: String(raw.occupiedArea || raw.unitLabel || raw.area || ''),
    unitId: String(raw.unitId || raw.unitNumber || ''),
    notes: String(raw.notes || raw.instructions || ''),
    inviteCode: String(raw.inviteCode || ''),
    portalRoute: String(raw.portalRoute || '/tenant/request'),
    accessStatus: (['INVITED', 'ACTIVE', 'SUSPENDED'].includes(String(raw.accessStatus).toUpperCase())
      ? String(raw.accessStatus).toUpperCase()
      : 'INVITED') as ReporterAccessStatus,
    canCreateComplaints: raw.canCreateComplaints !== false,
    canViewOwnComplaints: raw.canViewOwnComplaints !== false,
    canViewPropertyComplaints,
    canActOnOwnerBehalf,
    canViewOwnerFinancials,
    canApproveWork: raw.canApproveWork === true && canActOnOwnerBehalf,
    createdAt: safeDate(raw.createdAt || raw.timestamp),
    updatedAt: safeDate(raw.updatedAt),
    invitedByOwnerUid: String(raw.invitedByOwnerUid || raw.ownerId || raw.ownerUid || '')
  };
}
