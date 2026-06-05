export type HrSelfServiceField = {
  key: string;
  label: string;
  category:
    | 'identity'
    | 'employment'
    | 'payroll'
    | 'compliance'
    | 'attendance'
    | 'assets'
    | 'welfare'
    | 'requests'
    | 'security';
  requiredForDispatch?: boolean;
  requiredForPayroll?: boolean;
  sensitive?: boolean;
};

export type HrSelfServiceRequest = {
  value: string;
  label: string;
  category:
    | 'leave'
    | 'payroll'
    | 'letters'
    | 'documents'
    | 'assets'
    | 'safety'
    | 'welfare'
    | 'confidential'
    | 'general';
  requiresDateRange?: boolean;
  requiresHours?: boolean;
  priority: 'normal' | 'high' | 'urgent';
};

export const HR_SELF_SERVICE_IDENTITY_FIELDS: HrSelfServiceField[] = [
  { key: 'employeeCode', label: 'Employee ID / Staff Code', category: 'identity' },
  { key: 'fullName', label: 'Full Legal Name', category: 'identity', sensitive: true },
  { key: 'nationality', label: 'Nationality', category: 'identity', sensitive: true },
  { key: 'emiratesIdNumber', label: 'Emirates ID Number', category: 'identity', sensitive: true, requiredForDispatch: true },
  { key: 'passportNumber', label: 'Passport Number', category: 'identity', sensitive: true },
  { key: 'labourCardNumber', label: 'Labour Card Number', category: 'employment', sensitive: true, requiredForPayroll: true },
  { key: 'mohrePersonCode', label: 'MoHRE Person Code', category: 'employment', sensitive: true, requiredForPayroll: true },
  { key: 'trade', label: 'Trade / Specialisation', category: 'employment', requiredForDispatch: true },
  { key: 'department', label: 'Department', category: 'employment' },
  { key: 'supervisorName', label: 'Supervisor', category: 'employment' },
  { key: 'baseZone', label: 'Base Zone / Dispatch Zone', category: 'attendance', requiredForDispatch: true },
  { key: 'accommodationCamp', label: 'Accommodation / Camp', category: 'welfare' },
];

export const HR_SELF_SERVICE_COMPLIANCE_FIELDS: HrSelfServiceField[] = [
  { key: 'visaExpiry', label: 'Residency Visa Expiry', category: 'compliance', requiredForDispatch: true, sensitive: true },
  { key: 'emiratesIdExpiry', label: 'Emirates ID Expiry', category: 'compliance', requiredForDispatch: true, sensitive: true },
  { key: 'passportExpiry', label: 'Passport Expiry', category: 'compliance', requiredForDispatch: true, sensitive: true },
  { key: 'medicalExpiry', label: 'Medical Card / Insurance Expiry', category: 'compliance', requiredForDispatch: true, sensitive: true },
  { key: 'drivingLicenseExpiry', label: 'Driving Licence Expiry', category: 'compliance' },
  { key: 'tradeCertificateExpiry', label: 'Trade Certificate Expiry', category: 'compliance', requiredForDispatch: true },
  { key: 'occupationalHealthCardExpiry', label: 'Occupational Health Card Expiry', category: 'compliance', requiredForDispatch: true },
  { key: 'ppeStatus', label: 'PPE Status', category: 'assets', requiredForDispatch: true },
  { key: 'uniformStatus', label: 'Uniform Status', category: 'assets' },
  { key: 'safetyTrainingStatus', label: 'Safety Training Status', category: 'compliance', requiredForDispatch: true },
];

export const HR_SELF_SERVICE_PAYROLL_FIELDS: HrSelfServiceField[] = [
  { key: 'basicSalary', label: 'Basic Salary', category: 'payroll', sensitive: true, requiredForPayroll: true },
  { key: 'allowances', label: 'Allowances', category: 'payroll', sensitive: true },
  { key: 'grossSalary', label: 'Gross Salary', category: 'payroll', sensitive: true, requiredForPayroll: true },
  { key: 'wpsStatus', label: 'WPS Status', category: 'payroll', sensitive: true, requiredForPayroll: true },
  { key: 'salaryPaymentDay', label: 'Salary Payment Day', category: 'payroll' },
  { key: 'bankOrPayrollCard', label: 'Bank / Payroll Card Reference', category: 'payroll', sensitive: true, requiredForPayroll: true },
  { key: 'overtimeEligible', label: 'Overtime Eligible', category: 'payroll' },
  { key: 'eosbMode', label: 'End-of-Service Benefit Mode', category: 'payroll', sensitive: true },
];

export const HR_SELF_SERVICE_ASSET_FIELDS: HrSelfServiceField[] = [
  { key: 'toolKitId', label: 'Tool Kit ID', category: 'assets', requiredForDispatch: true },
  { key: 'vehicleId', label: 'Vehicle ID', category: 'assets' },
  { key: 'simCardNumber', label: 'Company SIM Card', category: 'assets', sensitive: true },
  { key: 'mobileDeviceId', label: 'Company Mobile Device', category: 'assets' },
  { key: 'ppeIssuedAt', label: 'PPE Issued Date', category: 'assets', requiredForDispatch: true },
  { key: 'assetAcknowledgementStatus', label: 'Asset Acknowledgement Status', category: 'assets', requiredForDispatch: true },
];

export const HR_SELF_SERVICE_REQUEST_TYPES: HrSelfServiceRequest[] = [
  { value: 'annual_leave', label: 'Annual Leave', category: 'leave', requiresDateRange: true, priority: 'normal' },
  { value: 'emergency_leave', label: 'Emergency Leave', category: 'leave', requiresDateRange: true, priority: 'high' },
  { value: 'sick_leave', label: 'Sick Leave / Medical', category: 'leave', requiresDateRange: true, priority: 'high' },
  { value: 'unpaid_leave', label: 'Unpaid Leave', category: 'leave', requiresDateRange: true, priority: 'normal' },
  { value: 'overtime', label: 'Overtime / Rest-Day Work', category: 'payroll', requiresDateRange: true, requiresHours: true, priority: 'high' },
  { value: 'payslip', label: 'Payslip Request', category: 'payroll', priority: 'normal' },
  { value: 'salary_query', label: 'Salary / Deduction Query', category: 'payroll', priority: 'high' },
  { value: 'salary_certificate', label: 'Salary Certificate', category: 'letters', priority: 'normal' },
  { value: 'noc_letter', label: 'NOC Letter', category: 'letters', priority: 'normal' },
  { value: 'experience_letter', label: 'Experience Letter', category: 'letters', priority: 'normal' },
  { value: 'contract_copy', label: 'Contract Copy', category: 'documents', priority: 'normal' },
  { value: 'document_update', label: 'Visa / EID / Passport Update', category: 'documents', priority: 'normal' },
  { value: 'tools_ppe', label: 'Tools / PPE / Uniform Request', category: 'assets', priority: 'normal' },
  { value: 'vehicle_issue', label: 'Vehicle / Transport Issue', category: 'assets', priority: 'normal' },
  { value: 'accommodation', label: 'Accommodation / Camp Issue', category: 'welfare', priority: 'high' },
  { value: 'safety_incident', label: 'Safety Incident Report', category: 'safety', priority: 'urgent' },
  { value: 'manager_issue', label: 'Private HR Complaint', category: 'confidential', priority: 'urgent' },
  { value: 'staff_wellbeing', label: 'Staff Wellbeing Support', category: 'welfare', priority: 'high' },
  { value: 'hr_support', label: 'HR Support / General Request', category: 'general', priority: 'normal' },
];

export const HR_SELF_SERVICE_COLLECTIONS = [
  'hrProfiles',
  'staffRequests',
  'staffDocuments',
  'staffPayslips',
  'attendanceLogs',
  'overtimeRequests',
  'staffAssets',
  'staffLetters',
  'staffComplaints',
  'staffTraining',
  'staffAgreements',
  'salaryHistory',
  'staffMoodCheckins',
  'hrAiConversations',
  'auditLogs',
] as const;

export const PAPERLESS_HR_PUBLIC_COPY = {
  title: 'Paperless Staff HR Self-Service',
  shortDescription:
    'A UAE-built staff portal for field maintenance teams to manage leave, payslip support, overtime, HR letters, documents, safety, accommodation, tools/PPE, and private HR cases without paper forms.',
  complianceNote:
    'The system supports internal workflow, document tracking, staff acknowledgements, and audit records. It does not replace mandatory government-approved employment documents or official approvals where UAE law requires them.',
};
