const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
const firstPresent = (...values: unknown[]) => values.find(present);

export const normalizeTechnicianStatus = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase();
  if (['valid', 'active', 'approved', 'issued', 'yes', 'true', 'complete', 'completed', 'synced'].includes(raw)) return 'valid';
  if (['expired', 'expiring', 'lapsed'].includes(raw)) return 'expired';
  if (['missing', 'none', 'no', 'false', 'not issued', 'not_issued'].includes(raw)) return 'missing';
  return 'pending';
};

const toMillis = (value: unknown): number | null => {
  if (!present(value)) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'object') {
    const candidate = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    const seconds = candidate.seconds ?? candidate._seconds;
    if (Number.isFinite(seconds)) return Number(seconds) * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const statusFromExpiry = (statusValue: unknown, expiryValue: unknown, nowMs: number) => {
  const expiryMs = toMillis(expiryValue);
  if (expiryMs !== null && expiryMs <= nowMs) return 'expired';
  return normalizeTechnicianStatus(statusValue ?? expiryValue);
};

const certificationExpiry = (certification: unknown): unknown => {
  if (!certification || typeof certification !== 'object') return null;
  const row = certification as Record<string, unknown>;
  return firstPresent(row.expiryAt, row.expiresAt, row.expiryDate, row.expiry, row.validUntil, row.validTo);
};

const certificationStatus = (certification: unknown, nowMs: number) => {
  if (!certification || typeof certification !== 'object') return 'missing';
  const row = certification as Record<string, unknown>;
  return statusFromExpiry(firstPresent(row.status, row.verificationStatus, row.approvalStatus), certificationExpiry(row), nowMs);
};

const normalizeSkillLevel = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Standard field technician';
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
  if (['break', 'on_break', 'on-break', 'busy', 'in_progress', 'on_job'].includes(raw)) return 'busy';
  if (['leave', 'on_leave', 'vacation'].includes(raw)) return 'on_leave';
  if (['off', 'off_duty', 'off-duty', 'offline', 'inactive'].includes(raw)) return 'offline';
  return raw || 'offline';
};

const boolValue = (...values: unknown[]) => {
  const value = firstPresent(...values);
  const raw = String(value ?? '').trim().toLowerCase();
  return value === true || ['true', 'yes', 'issued', 'assigned', 'valid', 'active', 'available', 'complete', 'completed'].includes(raw);
};

const textValue = (...values: unknown[]) => String(firstPresent(...values) ?? '').trim();

const coreSyncFields = ['fullName', 'primaryTrade', 'dutyStatus'];

const complianceActionFields = [
  'vehicleAssigned',
  'toolKitIssued',
  'ppeIssued',
  'medicalCardStatus',
  'drivingLicenseStatus',
  'certificationsStatus',
];

const hasCoreValue = (profile: Record<string, any>, field: string) => {
  const value = profile[field];
  return present(value) && value !== 'Pending sync' && value !== 'offline';
};

const hasComplianceValue = (profile: Record<string, any>, field: string) => {
  const value = profile[field];
  if (field === 'vehicleAssigned' || field === 'toolKitIssued' || field === 'ppeIssued') return value === true;
  if (field.endsWith('Status')) return normalizeTechnicianStatus(value) === 'valid';
  return present(value) && value !== 'Pending sync';
};

export function normalizeTechnicianProfile(sources: {
  technician?: Record<string, any> | null;
  staffRoster?: Record<string, any> | null;
  hrStaff?: Record<string, any> | null;
  hrProfile?: Record<string, any> | null;
  staffProfile?: Record<string, any> | null;
  staffAsset?: Record<string, any> | null;
  staffAgreement?: Record<string, any> | null;
  user?: Record<string, any> | null;
  attendance?: Record<string, any> | null;
  certifications?: unknown[];
  nowMs?: number;
}) {
  const merged = {
    ...(sources.attendance || {}),
    ...(sources.staffAgreement || {}),
    ...(sources.user || {}),
    ...(sources.hrProfile || {}),
    ...(sources.hrStaff || {}),
    ...(sources.staffProfile || {}),
    ...(sources.staffRoster || {}),
    ...(sources.staffAsset || {}),
    ...(sources.technician || {}),
  } as Record<string, any>;

  const nowMs = Number.isFinite(sources.nowMs) ? Number(sources.nowMs) : Date.now();
  const embeddedCertifications = Array.isArray(merged.certifications) ? merged.certifications : [];
  const certificationRows = Array.isArray(sources.certifications) ? sources.certifications : [];
  const allCertifications = [...embeddedCertifications, ...certificationRows];
  const certificationStates = allCertifications.map((row) => certificationStatus(row, nowMs));
  const certificationsStatus = allCertifications.length === 0
    ? normalizeTechnicianStatus(firstPresent(merged.certificationsStatus, merged.certificationStatus, merged.certificateStatus))
    : certificationStates.every((status) => status === 'valid')
      ? 'valid'
      : certificationStates.some((status) => status === 'expired')
        ? 'expired'
        : 'pending';
  const dutyStatus = normalizeDutyStatus(firstPresent(merged.dutyStatus, merged.rosterStatus, merged.attendanceStatus, merged.status, merged.isAvailable === true ? 'available' : undefined));
  const onDuty = boolValue(merged.onDuty, merged.isOnDuty, merged.isAvailable, dutyStatus === 'available');
  const primaryTrade = textValue(merged.primaryTrade, merged.trade, merged.specialization, merged.skill, merged.department, 'General Maintenance');
  const medicalCardExpiry = firstPresent(merged.medicalCardExpiry, merged.medicalExpiry, merged.healthCardExpiry) || null;
  const drivingLicenseExpiry = firstPresent(merged.drivingLicenseExpiry, merged.licenseExpiry) || null;
  const medicalCardStatus = statusFromExpiry(firstPresent(merged.medicalCardStatus, merged.medicalStatus, merged.healthCardStatus), medicalCardExpiry, nowMs);
  const drivingLicenseStatus = statusFromExpiry(firstPresent(merged.drivingLicenseStatus, merged.licenseStatus), drivingLicenseExpiry, nowMs);
  const explicitBlocked = String(firstPresent(merged.dispatchReadiness, merged.dispatchStatus, '')).toLowerCase().includes('block');
  const complianceBlocked = medicalCardStatus !== 'valid' || drivingLicenseStatus !== 'valid' || certificationsStatus !== 'valid';

  const normalized = {
    uid: textValue(merged.uid, merged.userId, merged.technicianId, merged.id),
    fullName: textValue(merged.fullName, merged.displayName, merged.name, merged.employeeName, 'Technician'),
    email: textValue(merged.email, merged.employeeEmail),
    phone: textValue(merged.phoneNumber, merged.phone, merged.mobile),
    role: 'technician',
    status: String(firstPresent(merged.status, 'active')).toLowerCase(),
    primaryTrade,
    skillLevel: normalizeSkillLevel(firstPresent(merged.skillLevel, merged.grade, merged.rank, merged.level, 'Standard field technician')),
    vehicleAssigned: boolValue(merged.vehicleAssigned, merged.assignedVehicle, merged.vehicleNumber, merged.vehicleStatus),
    vehicleNumber: textValue(merged.vehicleNumber, merged.assignedVehicle, merged.vehiclePlate),
    toolKitIssued: boolValue(merged.toolKitIssued, merged.toolsIssued, merged.toolKitStatus),
    ppeIssued: boolValue(merged.ppeIssued, merged.ppeStatus, merged.ppeIssuedAt),
    medicalCardStatus,
    medicalCardExpiry,
    drivingLicenseStatus,
    drivingLicenseExpiry,
    certificationsStatus,
    certifications: allCertifications,
    onDuty,
    dutyStatus,
    dispatchReadiness: explicitBlocked || complianceBlocked ? 'blocked' : dutyStatus === 'available' || onDuty ? 'ready' : 'not_ready',
    complianceBlocked,
    complianceBlockReasons: [
      medicalCardStatus !== 'valid' ? 'medicalCardStatus' : null,
      drivingLicenseStatus !== 'valid' ? 'drivingLicenseStatus' : null,
      certificationsStatus !== 'valid' ? 'certificationsStatus' : null,
    ].filter(Boolean) as string[],
    lastSyncedAt: firstPresent(merged.lastSyncedAt, merged.updatedAt, merged.createdAt) || null,
    syncStatus: 'missing',
    missingFields: [] as string[],
    complianceActionItems: [] as string[],
    raw: merged,
  };

  normalized.missingFields = coreSyncFields.filter((field) => !hasCoreValue(normalized, field));
  normalized.complianceActionItems = complianceActionFields.filter((field) => !hasComplianceValue(normalized, field));
  normalized.syncStatus = normalized.missingFields.length === 0 ? 'synced' : normalized.missingFields.length < coreSyncFields.length ? 'partial' : 'missing';
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
  fullName: 'Full legal name is missing.',
  primaryTrade: 'Primary trade is missing.',
  dutyStatus: 'Duty status is missing.',
  vehicleAssigned: 'Vehicle assignment is missing.',
  toolKitIssued: 'Tool kit status is missing.',
  ppeIssued: 'PPE issue status is missing.',
  medicalCardStatus: 'Medical card status is missing, pending, or expired.',
  drivingLicenseStatus: 'Driving license status is missing, pending, or expired.',
  certificationsStatus: 'One or more required certifications are missing, pending, or expired.',
}[field] || `${field} is missing.`);