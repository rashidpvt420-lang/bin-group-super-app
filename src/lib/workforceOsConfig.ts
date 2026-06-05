export const WORKFORCE_OS_LANGUAGES = [
  'English',
  'Arabic',
  'Hindi',
  'Urdu',
  'Malayalam',
  'Tagalog',
  'Bengali',
  'Nepali',
] as const;

export const WORKFORCE_OS_REQUEST_TYPES = [
  { value: 'annual_leave', label: 'Annual Leave', category: 'leave', priority: 'normal' },
  { value: 'emergency_leave', label: 'Emergency Leave', category: 'leave', priority: 'high' },
  { value: 'sick_leave', label: 'Sick Leave / Medical Upload', category: 'leave', priority: 'normal' },
  { value: 'overtime', label: 'Overtime Review', category: 'overtime', priority: 'high' },
  { value: 'payslip', label: 'Payslip Request', category: 'payroll', priority: 'normal' },
  { value: 'wps_salary_review', label: 'WPS / Salary Payment Review', category: 'payroll', priority: 'high' },
  { value: 'allowance_review', label: 'Housing / Transport / Food Allowance Review', category: 'payroll', priority: 'normal' },
  { value: 'document_update', label: 'Document Renewal / Compliance Passport', category: 'documents', priority: 'normal' },
  { value: 'certificate_update', label: 'Safety / Trade Certificate Update', category: 'training', priority: 'normal' },
  { value: 'training_request', label: 'Training Request', category: 'training', priority: 'normal' },
  { value: 'safety_incident', label: 'Safety Incident / Near Miss', category: 'safety', priority: 'urgent' },
  { value: 'tools_ppe', label: 'Tools / PPE / Uniform Request', category: 'tools_ppe', priority: 'normal' },
  { value: 'accommodation', label: 'Accommodation / Camp Issue', category: 'accommodation', priority: 'high' },
  { value: 'manager_issue', label: 'Manager / Supervisor Issue', category: 'manager_issue', priority: 'urgent' },
  { value: 'hr_support', label: 'General HR Support', category: 'general_hr', priority: 'normal' },
] as const;

export const WORKFORCE_OS_POSITIONING = {
  title: 'BIN GROUP Workforce OS',
  subtitle: 'UAE-focused, multilingual, paperless staff self-service for maintenance and property management field teams.',
  safeFirstMoverClaim: 'A field-operational HR self-service model built for UAE maintenance and property management teams, connecting staff requests, compliance documents, attendance context, payroll-ready records, tools/PPE, safety cases, and live service operations in one controlled workflow.',
  promise: 'No paperwork, no hidden overtime confusion, no missing document trail: every staff request, payroll query, safety case, compliance renewal, and field-work issue enters one controlled HR/Admin review chain.',
  workerEditableBoundary: 'Workers can submit requests, language preference, evidence, property/job references, and notes. Workers must not directly edit role, salary, payroll approval, WPS status, overtime approval, certification approval, or admin permissions.',
};

export const WORKFORCE_OS_COMPLIANCE_FIELDS = [
  'visaExpiry',
  'emiratesIdExpiry',
  'passportExpiry',
  'medicalExpiry',
  'drivingLicenseExpiry',
  'tradeCertificateExpiry',
  'safetyCertificateExpiry',
  'ppeIssuedAt',
  'toolboxTalkCompletedAt',
] as const;

export function getWorkforceRequestMeta(requestType: string) {
  return WORKFORCE_OS_REQUEST_TYPES.find((item) => item.value === requestType) || WORKFORCE_OS_REQUEST_TYPES[0];
}
