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
  accessStatus: "INVITED" | "ACTIVE" | "SUSPENDED";
  canCreateComplaints: boolean;
  canViewOwnComplaints: boolean;
  canViewPropertyComplaints: boolean;
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

export function resolvePropertyReporter(raw: any): PropertyReporter {
  return {
    id: String(raw.id || raw.reporterId || ''),
    reporterId: String(raw.reporterId || raw.id || ''),
    ownerId: String(raw.ownerId || ''),
    propertyId: String(raw.propertyId || ''),
    propertyName: String(raw.propertyName || 'Property'),
    reporterUid: raw.reporterUid ? String(raw.reporterUid) : null,
    reporterName: String(raw.reporterName || raw.name || ''),
    reporterEmail: String(raw.reporterEmail || raw.email || '').toLowerCase(),
    reporterPhone: String(raw.reporterPhone || raw.phone || ''),
    roleLabel: String(raw.roleLabel || raw.role || 'Other'),
    accessStatus: (['INVITED', 'ACTIVE', 'SUSPENDED'].includes(String(raw.accessStatus).toUpperCase()) 
      ? String(raw.accessStatus).toUpperCase() 
      : 'INVITED') as "INVITED" | "ACTIVE" | "SUSPENDED",
    canCreateComplaints: raw.canCreateComplaints !== false,
    canViewOwnComplaints: raw.canViewOwnComplaints !== false,
    canViewPropertyComplaints: Boolean(raw.canViewPropertyComplaints),
    createdAt: safeDate(raw.createdAt || raw.timestamp),
    updatedAt: safeDate(raw.updatedAt),
    invitedByOwnerUid: String(raw.invitedByOwnerUid || raw.ownerId || '')
  };
}
