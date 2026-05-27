export interface OwnerComplaint {
  id: string;
  ticketId: string;
  propertyId: string;
  propertyName: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  reporterType: string;
  reporterName: string;
  assignedTechnicianName: string;
  costEstimate: number;
  finalCost: number;
  slaStatus: string;
  createdAt: Date | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  resolvedAt: Date | null;
  slaDueAt: Date | null;
  ownerVerifiedAt: Date | null;
  photosBefore: string[];
  proofPhotosAfter: string[];
  resolutionNotes: string;
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

export function resolveOwnerComplaint(raw: any): OwnerComplaint {
  return {
    id: String(raw.id || raw.ticketId || ''),
    ticketId: String(raw.ticketId || raw.id || ''),
    propertyId: String(raw.propertyId || ''),
    propertyName: String(raw.propertyName || raw.property?.name || 'Unknown Property'),
    category: String(raw.category || raw.serviceType || 'Other').toUpperCase(),
    priority: String(raw.priority || raw.severity || 'LOW').toUpperCase(),
    status: String(raw.status || 'OPEN').toUpperCase().replace(/\s+/g, '_'),
    description: String(raw.description || raw.issueDescription || ''),
    reporterType: String(raw.reporterType || 'TENANT').toUpperCase(),
    reporterName: String(raw.reporterName || raw.tenantName || raw.creatorName || 'Unknown'),
    assignedTechnicianName: String(raw.assignedTechnicianName || raw.technicianName || 'Unassigned'),
    costEstimate: Number(raw.costEstimate || raw.estimatedCost || 0),
    finalCost: Number(raw.finalCost || raw.cost || raw.invoiceAmount || 0),
    slaStatus: String(raw.slaStatus || 'ON_TIME').toUpperCase(),
    createdAt: safeDate(raw.createdAt || raw.timestamp),
    assignedAt: safeDate(raw.assignedAt || raw.acceptedAt),
    startedAt: safeDate(raw.startedAt || raw.inProgressAt),
    resolvedAt: safeDate(raw.resolvedAt || raw.completedAt),
    slaDueAt: safeDate(raw.slaDueAt || raw.dueDate),
    ownerVerifiedAt: safeDate(raw.ownerVerifiedAt || raw.verifiedAt),
    photosBefore: Array.isArray(raw.photosBefore || raw.beforePhotos) ? (raw.photosBefore || raw.beforePhotos) : (raw.photoUrl ? [raw.photoUrl] : []),
    proofPhotosAfter: Array.isArray(raw.proofPhotosAfter || raw.afterPhotos) ? (raw.proofPhotosAfter || raw.afterPhotos) : [],
    resolutionNotes: String(raw.resolutionNotes || raw.notes || raw.technicianNotes || '')
  };
}
