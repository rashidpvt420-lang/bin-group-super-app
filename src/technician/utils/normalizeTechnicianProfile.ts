const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
const firstPresent = (...values: unknown[]) => values.find(present);

export const normalizeTechnicianStatus = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase();
  if (['valid', 'active', 'approved', 'issued', 'yes', 'true', 'complete', 'completed', 'synced'].includes(raw)) return 'valid';
  if (['expired', 'expiring', 'lapsed'].includes(raw)) return 'expired';
  if (['missing', 'none', 'no', 'false', 'not issued', 'not_issued'].includes(raw)) return 'missing';
  return 'pending';
};

const normalizeSkillLevel = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Pending sync';
  if (raw.includes('master')) return 'Master';
  if (raw.includes('supervisor') || raw.includes('lead')) return 'Supervisor';
  if (raw.includes('specialist') || raw.includes('senior') || raw.includes('expert')) return 'Specialist';
  if (raw.includes('skilled') || raw.includes('qualified')) return 'Skilled';
  if (raw.includes('junior') || raw.includes('trainee')) return 'Junior';
  return String(value).trim();
};

const normalizeDutyStatus = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase();
  if (['working', 'on_duty', 'on-duty', 'active', 'ready', 'available'].includes(raw)) return 'available';
  if (['break', 'busy', 'in_progress', 'on_job'].includes(raw)) return 'busy';
  if (['leave', 'on_leave', 'vacation'].includes(raw)) return 'on_leave';
  if (['off', 'offline', 'inactive'].includes(raw)) return 'offline';
  return raw || 'offline';
};

const boolValue = (...values: unknown[]) => {
  const value = firstPresent(...values);
  const raw = String(value ?? '').trim().toLowerCase();
  return value === true || ['true', 'yes', 'issued', 'assigned', 'valid', 'active', 'available'].includes(raw);
};

const textValue = (...values: unknown[]) => String(firstPresent(...values) ?? '').trim();

const requiredFields = [
  'primaryTrade',
  'skillLevel',
  'vehicleAssigned',
  'toolKitIssued',
  'ppeIssued',
  'medicalCardStatus',
  'drivingLicenseStatus',
  'certificationsStatus',
  'dutyStatus',
];

const hasRequiredValue = (profile: Record<string, any>, field: string) => {
  const value = profile[field];
  if (field === 'vehicleAssigned' || field === 'toolKitIssued' || field === 'ppeIssued') return value === true;
  if (field.endsWith('Status')) return normalizeTechnicianStatus(value) === 'valid';
  return present(value) && value !== 'Pending sync' && value !== 'offline';
};

export function normalizeTechnicianProfile(sources: {
  technician?: Record<string, any> | null;
  staffRoster?: Record<string, any> | null;
  hrStaff?: Record<string, any> | null;
  user?: Record<string, any> | null;
  attendance?: Record<string, any> | null;
  certifications?: unknown[];
}) {
  const merged = {
    ...(sources.attendance || {}),
    ...(sources.user || {}),
    ...(sources.hrStaff || {}),
    ...(sources.staffRoster || {}),
    ...(sources.technician || {}),
  } as Record<string, any>;

  const embeddedCertifications = Array.isArray(merged.certifications) ? merged.certifications : [];
  const certificationRows = Array.isArray(sources.certifications) ? sources.certifications : [];
  const allCertifications = [...embeddedCertifications, ...certificationRows];
  const certificationsStatus = allCertifications.length > 0 ? 'valid' : normalizeTechnicianStatus(firstPresent(merged.certificationsStatus, merged.certificationStatus, merged.certificateStatus));
  const dutyStatus = normalizeDutyStatus(firstPresent(merged.dutyStatus, merged.rosterStatus, merged.attendanceStatus, merged.status));
  const onDuty = boolValue(merged.onDuty, merged.isOnDuty, dutyStatus === 'available');

  const normalized = {
    uid: textValue(merged.uid, merged.userId, merged.technicianId, merged.id),
    fullName: textValue(merged.fullName, merged.displayName, merged.name, merged.employeeName, 'Technician'),
    email: textValue(merged.email),
    phone: textValue(merged.phoneNumber, merged.phone, merged.mobile),
    role: 'technician',
    status: String(firstPresent(merged.status, 'active')).toLowerCase(),
    primaryTrade: textValue(merged.primaryTrade, merged.trade, merged.specialization, merged.skill, merged.department, 'General Maintenance'),
    skillLevel: normalizeSkillLevel(firstPresent(merged.skillLevel, merged.grade, merged.rank, merged.level)),
    vehicleAssigned: boolValue(merged.vehicleAssigned, merged.assignedVehicle, merged.vehicleNumber, merged.vehicleStatus),
    vehicleNumber: textValue(merged.vehicleNumber, merged.assignedVehicle, merged.vehiclePlate),
    toolKitIssued: boolValue(merged.toolKitIssued, merged.toolsIssued, merged.toolKitStatus),
    ppeIssued: boolValue(merged.ppeIssued, merged.ppeStatus),
    medicalCardStatus: normalizeTechnicianStatus(firstPresent(merged.medicalCardStatus, merged.medicalStatus, merged.healthCardStatus, merged.medicalExpiry, merged.healthCardExpiry)),
    medicalCardExpiry: firstPresent(merged.medicalCardExpiry, merged.medicalExpiry, merged.healthCardExpiry) || null,
    drivingLicenseStatus: normalizeTechnicianStatus(firstPresent(merged.drivingLicenseStatus, merged.licenseStatus, merged.drivingLicenseExpiry, merged.licenseExpiry)),
    drivingLicenseExpiry: firstPresent(merged.drivingLicenseExpiry, merged.licenseExpiry) || null,
    certificationsStatus,
    certifications: allCertifications,
    onDuty,
    dutyStatus,
    dispatchReadiness: String(firstPresent(merged.dispatchReadiness, merged.dispatchStatus, '')).toLowerCase().includes('block') ? 'blocked' : dutyStatus === 'available' || onDuty ? 'ready' : 'not_ready',
    lastSyncedAt: firstPresent(merged.lastSyncedAt, merged.updatedAt, merged.createdAt) || null,
    syncStatus: 'missing',
    missingFields: [] as string[],
    raw: merged,
  };

  normalized.missingFields = requiredFields.filter((field) => !hasRequiredValue(normalized, field));
  normalized.syncStatus = normalized.missingFields.length === 0 ? 'synced' : normalized.missingFields.length < requiredFields.length ? 'partial' : 'missing';
  return normalized;
}

export const formatDocumentStatus = (status: string) => {
  if (status === 'valid') return 'Valid';
  if (status === 'expired') return 'Expired';
  if (status === 'missing') return 'Missing';
  return 'Pending sync';
};

export const formatDispatchReadiness = (status: string) => {
  if (status === 'ready') return 'Ready for dispatch';
  if (status === 'blocked') return 'Blocked';
  return 'Not ready';
};

export const formatMissingTechnicianField = (field: string) => ({
  primaryTrade: 'Primary trade is missing.',
  skillLevel: 'Skill level is missing.',
  vehicleAssigned: 'Vehicle assignment is missing.',
  toolKitIssued: 'Tool kit status is missing.',
  ppeIssued: 'PPE issue status is missing.',
  medicalCardStatus: 'Medical card status is missing or not valid.',
  drivingLicenseStatus: 'Driving license status is missing or not valid.',
  certificationsStatus: 'Certifications are missing.',
  dutyStatus: 'Duty status is missing.',
}[field] || `${field} is missing.`);
