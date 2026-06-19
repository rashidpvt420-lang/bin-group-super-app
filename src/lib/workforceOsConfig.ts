import {
  FIELD_WORKFORCE_MODULES,
  UAE_HR_AI_WORKFLOWS,
  UAE_HR_COMPLIANCE_RULES,
  UAE_HR_KPIS,
  UAE_HR_OS_POSITIONING,
  getMustHaveFieldWorkforceModules,
  getMustHaveHrRules,
} from './uaeHrComplianceConfig';

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
  { value: 'maternity_parental_leave', label: 'Maternity / Parental Leave', category: 'leave', priority: 'normal' },
  { value: 'bereavement_leave', label: 'Bereavement Leave', category: 'leave', priority: 'high' },
  { value: 'overtime', label: 'Overtime Review', category: 'overtime', priority: 'high' },
  { value: 'missed_punch', label: 'Missed Attendance / Geofence Exception', category: 'attendance', priority: 'high' },
  { value: 'shift_issue', label: 'Shift / Roster Issue', category: 'attendance', priority: 'normal' },
  { value: 'heat_stress_exception', label: 'Heat-Stress / Midday-Break Safety Alert', category: 'safety', priority: 'urgent' },
  { value: 'payslip', label: 'Payslip Request', category: 'payroll', priority: 'normal' },
  { value: 'wps_salary_review', label: 'WPS / Salary Payment Review', category: 'payroll', priority: 'high' },
  { value: 'allowance_review', label: 'Housing / Transport / Food Allowance Review', category: 'payroll', priority: 'normal' },
  { value: 'eosb_final_settlement', label: 'End-of-Service / Final Settlement Review', category: 'payroll', priority: 'high' },
  { value: 'document_update', label: 'Document Renewal / Compliance Passport', category: 'documents', priority: 'normal' },
  { value: 'visa_permit_status', label: 'Visa / Permit / Emirates ID Status', category: 'documents', priority: 'high' },
  { value: 'health_insurance', label: 'Health Insurance Card / Renewal Issue', category: 'documents', priority: 'high' },
  { value: 'certificate_update', label: 'Safety / Trade Certificate Update', category: 'training', priority: 'normal' },
  { value: 'training_request', label: 'Training Request', category: 'training', priority: 'normal' },
  { value: 'safety_incident', label: 'Safety Incident / Near Miss', category: 'safety', priority: 'urgent' },
  { value: 'injury_report', label: 'Work Injury / Medical Escalation', category: 'safety', priority: 'urgent' },
  { value: 'tools_ppe', label: 'Tools / PPE / Uniform Request', category: 'tools_ppe', priority: 'normal' },
  { value: 'accommodation', label: 'Accommodation / Camp Issue', category: 'accommodation', priority: 'high' },
  { value: 'transport_route', label: 'Transport / Site Route Issue', category: 'accommodation', priority: 'normal' },
  { value: 'manager_issue', label: 'Manager / Supervisor Issue', category: 'manager_issue', priority: 'urgent' },
  { value: 'confidential_grievance', label: 'Confidential Grievance', category: 'manager_issue', priority: 'urgent' },
  { value: 'hr_support', label: 'General HR Support', category: 'general_hr', priority: 'normal' },
] as const;

export const WORKFORCE_OS_POSITIONING = {
  ...UAE_HR_OS_POSITIONING,
  title: 'BIN GROUP Workforce OS',
  subtitle: 'UAE-focused labour-compliance and field-workforce operating system for maintenance and property management teams.',
  safeFirstMoverClaim: 'A field-operational HR and compliance model built for UAE maintenance and property management teams, connecting staff requests, visas, documents, attendance, shifts, WPS payroll, EOSB, tools/PPE, safety cases, certifications, and live service operations in one controlled workflow.',
  promise: 'No paperwork, no hidden overtime confusion, no missing document trail: every staff request, payroll query, safety case, compliance renewal, shift issue, and field-work record enters one controlled HR/Admin review chain.',
  workerEditableBoundary: 'Workers can submit requests, language preference, evidence, property/job references, incident photos, and notes. Workers must not directly edit role, salary, payroll approval, WPS status, overtime approval, certification approval, visa status, jurisdiction pack, or admin permissions.',
};

export const WORKFORCE_OS_COMPLIANCE_FIELDS = [
  'legalEntityId',
  'jurisdiction',
  'rulePackVersion',
  'permitType',
  'permitStatus',
  'visaExpiry',
  'emiratesIdExpiry',
  'passportExpiry',
  'medicalExpiry',
  'healthInsuranceExpiry',
  'drivingLicenseExpiry',
  'tradeCertificateExpiry',
  'safetyCertificateExpiry',
  'gpssaStatus',
  'emiratisationCategory',
  'basicSalaryAed',
  'allowancesAed',
  'wpsPersonId',
  'payrollRunId',
  'attendanceGeofencePolicy',
  'overtimeApprovalPolicy',
  'heatRiskLevel',
  'ppeIssuedAt',
  'toolboxTalkCompletedAt',
  'accommodationEligible',
  'campId',
  'transportRouteId',
  'dpiaRequired',
  'retentionClass',
] as const;

export const WORKFORCE_OS_FIELD_MODULES = FIELD_WORKFORCE_MODULES;
export const WORKFORCE_OS_COMPLIANCE_RULES = UAE_HR_COMPLIANCE_RULES;
export const WORKFORCE_OS_AI_WORKFLOWS = UAE_HR_AI_WORKFLOWS;
export const WORKFORCE_OS_KPIS = UAE_HR_KPIS;
export const WORKFORCE_OS_MUST_HAVE_MODULES = getMustHaveFieldWorkforceModules();
export const WORKFORCE_OS_MUST_HAVE_RULES = getMustHaveHrRules();

export function getWorkforceRequestMeta(requestType: string) {
  return WORKFORCE_OS_REQUEST_TYPES.find((item) => item.value === requestType) || WORKFORCE_OS_REQUEST_TYPES[0];
}

export function getWorkforceComplianceFieldStatus(record: Record<string, unknown>) {
  return WORKFORCE_OS_COMPLIANCE_FIELDS.map((field) => ({
    field,
    present: Boolean(record[field]),
  }));
}
