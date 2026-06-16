export type HrPriority = 'must-have' | 'high' | 'medium' | 'later';
export type HrJurisdiction = 'uae-mainland' | 'dubai' | 'abu-dhabi' | 'difc' | 'adgm' | 'free-zone-configurable';

export type HrComplianceRule = {
  id: string;
  title: string;
  jurisdiction: HrJurisdiction;
  priority: HrPriority;
  productImplication: string;
  requiredFields: string[];
  approvalBoundary: string;
};

export type FieldWorkforceModule = {
  id: string;
  title: string;
  priority: HrPriority;
  owner: 'hr' | 'finance' | 'operations' | 'hse' | 'admin';
  collection: string;
  description: string;
  workerCanSubmit: string[];
  adminControlled: string[];
};

export type WorkforceKpi = {
  id: string;
  label: string;
  target: string;
  owner: 'hr' | 'finance' | 'operations' | 'hse' | 'admin';
};

export const UAE_HR_OS_POSITIONING = {
  category: 'UAE labour-compliance and field-workforce operating system',
  promise:
    'One controlled workflow for visas, documents, payroll, WPS, attendance, shifts, safety, certifications, and property-linked field execution.',
  launchModel:
    'Use BIN GROUP operations as the captive pilot, then sell to UAE maintenance, FM, property management, and contractor fleets.',
  safeAiBoundary:
    'AI can classify, draft, rank, summarise, and flag anomalies. Human approval is required for employment-impacting decisions, payroll approval, disciplinary action, termination, and final compliance decisions.',
};

export const UAE_HR_COMPLIANCE_RULES: HrComplianceRule[] = [
  {
    id: 'entity-jurisdiction-pack',
    title: 'Entity-level labour rule pack',
    jurisdiction: 'free-zone-configurable',
    priority: 'must-have',
    productImplication: 'Do not hard-code one labour model. Store jurisdiction and legal entity per employee, contractor, and payroll run.',
    requiredFields: ['legalEntityId', 'jurisdiction', 'workLocationEmirate', 'employmentType', 'rulePackVersion'],
    approvalBoundary: 'Only admin, HR admin, or legal/compliance roles may change entity jurisdiction after onboarding.',
  },
  {
    id: 'work-permit-onboarding',
    title: 'Work permit, residency, medical, Emirates ID onboarding workflow',
    jurisdiction: 'uae-mainland',
    priority: 'must-have',
    productImplication: 'Create status tracking for permit, medical, Emirates ID, residency, contract, insurance, and joining clearance.',
    requiredFields: ['permitType', 'permitStatus', 'medicalStatus', 'emiratesIdStatus', 'residencyStatus', 'insuranceStatus'],
    approvalBoundary: 'Worker may upload documents and evidence; HR controls status, approval, and official dates.',
  },
  {
    id: 'wps-payroll-control',
    title: 'Payroll and WPS control',
    jurisdiction: 'uae-mainland',
    priority: 'must-have',
    productImplication: 'Generate payroll runs, WPS-ready files, salary payment status, error handling, and payroll audit records.',
    requiredFields: ['basicSalaryAed', 'allowancesAed', 'deductionsAed', 'netPayAed', 'wpsPersonId', 'payrollRunId', 'paymentStatus'],
    approvalBoundary: 'Finance/Admin approves salary package and payroll. Worker can raise a query but cannot edit payroll approval or WPS status.',
  },
  {
    id: 'working-hours-overtime',
    title: 'Working hours, breaks, and overtime guardrails',
    jurisdiction: 'uae-mainland',
    priority: 'must-have',
    productImplication: 'Roster engine must flag excessive overtime, missing breaks, and high-risk schedules before payroll close.',
    requiredFields: ['shiftStartAt', 'shiftEndAt', 'breakMinutes', 'overtimeMinutes', 'supervisorApprovalId'],
    approvalBoundary: 'Supervisor can request overtime; HR/Finance must approve payable overtime policy outcome.',
  },
  {
    id: 'leave-accruals',
    title: 'Statutory leave accrual and leave case tracking',
    jurisdiction: 'uae-mainland',
    priority: 'must-have',
    productImplication: 'Track annual, sick, maternity, parental, bereavement, emergency, and unpaid leave with approval trail.',
    requiredFields: ['leaveType', 'accrualBalanceDays', 'requestedDays', 'medicalEvidenceRef', 'approvalStatus'],
    approvalBoundary: 'Worker submits request/evidence; HR controls balance, eligibility, and approval.',
  },
  {
    id: 'eosb-final-settlement',
    title: 'End-of-service benefit and final settlement',
    jurisdiction: 'uae-mainland',
    priority: 'must-have',
    productImplication: 'Calculate EOSB, unpaid salary, leave balance, deductions, company property return, and settlement signoff.',
    requiredFields: ['joiningDate', 'lastWorkingDate', 'basicSalaryAed', 'serviceYears', 'eosbAed', 'finalSettlementStatus'],
    approvalBoundary: 'Finance and HR approve final settlement; worker may view and acknowledge but not change calculation inputs.',
  },
  {
    id: 'emiratisation-gpssa',
    title: 'Emiratisation and GPSSA control where applicable',
    jurisdiction: 'uae-mainland',
    priority: 'high',
    productImplication: 'Track skilled roles, Emirati headcount, GPSSA registration status, and semi-annual compliance deadlines by legal entity.',
    requiredFields: ['nationality', 'skilledRole', 'gpssaStatus', 'emiratisationCategory', 'deadlineAt'],
    approvalBoundary: 'HR/Admin controls classification and filings; employee self-service shows status only.',
  },
  {
    id: 'health-insurance-renewal',
    title: 'Health insurance lifecycle',
    jurisdiction: 'uae-mainland',
    priority: 'high',
    productImplication: 'Block visa/residency readiness when required health insurance is missing, expired, or pending renewal.',
    requiredFields: ['policyNumber', 'insurer', 'insuranceStartAt', 'insuranceExpiryAt', 'renewalStatus'],
    approvalBoundary: 'HR/Admin controls insurance policy status; worker can upload card/photo and raise issue.',
  },
  {
    id: 'heat-stress-midday-break',
    title: 'Heat-stress and midday-break roster controls',
    jurisdiction: 'uae-mainland',
    priority: 'must-have',
    productImplication: 'Flag outdoor direct-sun work during restricted summer windows and require shade, water, first-aid, and supervisor exception controls.',
    requiredFields: ['outdoorWork', 'directSunExposure', 'shiftWindow', 'heatRiskLevel', 'mitigationChecklist'],
    approvalBoundary: 'Operations schedules work; HSE/Admin must approve any exception case.',
  },
  {
    id: 'injury-incident-management',
    title: 'Occupational injury, near-miss, PPE, and HSE evidence',
    jurisdiction: 'uae-mainland',
    priority: 'must-have',
    productImplication: 'Capture incident photos, witness notes, medical escalation, compensation workflow, and corrective actions.',
    requiredFields: ['incidentType', 'severity', 'siteId', 'photos', 'witnesses', 'medicalEscalation', 'correctiveAction'],
    approvalBoundary: 'Worker and supervisor may report; HSE/Admin controls classification, closure, and legal record.',
  },
  {
    id: 'labour-accommodation',
    title: 'Accommodation and transport register',
    jurisdiction: 'uae-mainland',
    priority: 'high',
    productImplication: 'Track accommodation eligibility, room/bed assignment, transport route, issue cases, and inspection trail.',
    requiredFields: ['accommodationEligible', 'campId', 'roomId', 'bedId', 'transportRouteId', 'inspectionStatus'],
    approvalBoundary: 'Worker can raise issue; HR/Admin controls assignment and compliance status.',
  },
  {
    id: 'privacy-biometrics-dpia',
    title: 'Privacy, biometrics, and DPIA workflow',
    jurisdiction: 'free-zone-configurable',
    priority: 'must-have',
    productImplication: 'Biometric, location, health, incident, and AI-supported employment workflows must carry minimisation, access, and audit controls.',
    requiredFields: ['dataCategory', 'lawfulBasis', 'retentionClass', 'dpiaRequired', 'roleAccessPolicy', 'auditLogRef'],
    approvalBoundary: 'Admin cannot silently enable high-risk processing without compliance review and logged approval.',
  },
];

export const FIELD_WORKFORCE_MODULES: FieldWorkforceModule[] = [
  {
    id: 'employee-master-document-centre',
    title: 'Employee master, visa, and document centre',
    priority: 'must-have',
    owner: 'hr',
    collection: 'employees',
    description: 'Single dossier for passport, visa, Emirates ID, medical, insurance, contract, licences, certifications, accommodation, and dispatch readiness.',
    workerCanSubmit: ['document uploads', 'renewal evidence', 'contact updates', 'emergency contact updates'],
    adminControlled: ['role', 'status', 'salary', 'visa status', 'approval state', 'compliance classification'],
  },
  {
    id: 'payroll-wps-eosb',
    title: 'Payroll, WPS, EOSB, and final settlement',
    priority: 'must-have',
    owner: 'finance',
    collection: 'payroll_runs',
    description: 'Payroll close, WPS-ready export, payslip issue flow, salary dispute cases, EOSB calculation, and settlement signoff.',
    workerCanSubmit: ['payslip request', 'salary query', 'deduction dispute', 'bank detail evidence'],
    adminControlled: ['payroll approval', 'WPS status', 'salary package', 'deductions', 'EOSB calculation'],
  },
  {
    id: 'attendance-geofence-offline',
    title: 'Time, attendance, geofencing, and offline mode',
    priority: 'must-have',
    owner: 'operations',
    collection: 'attendance_events',
    description: 'Clock-in/out, property/job linkage, offline queue, geofence, supervisor exception handling, and payroll-impacting attendance audit.',
    workerCanSubmit: ['clock in', 'clock out', 'late reason', 'missed punch request', 'offline sync evidence'],
    adminControlled: ['exception approval', 'payroll impact', 'fraud flag', 'shift correction'],
  },
  {
    id: 'shift-roster-heat-control',
    title: 'Shift, roster, overtime, and heat-risk control',
    priority: 'must-have',
    owner: 'operations',
    collection: 'shift_rosters',
    description: 'Rotating teams, emergency coverage, overtime alerts, midday-break controls, certificate matching, and property distance planning.',
    workerCanSubmit: ['availability note', 'shift issue', 'overtime evidence'],
    adminControlled: ['roster publication', 'overtime approval', 'heat exception', 'skill assignment'],
  },
  {
    id: 'whatsapp-worker-self-service',
    title: 'WhatsApp-first worker self-service',
    priority: 'must-have',
    owner: 'hr',
    collection: 'workforce_requests',
    description: 'Shift reminders, leave request, document-expiry reminders, payslip retrieval, incident escalation, and multilingual support with opt-in tracking.',
    workerCanSubmit: ['leave request', 'document update', 'payslip query', 'incident report', 'tool/PPE request'],
    adminControlled: ['status', 'approval', 'priority override', 'official response', 'case closure'],
  },
  {
    id: 'safety-incidents-ppe-toolbox',
    title: 'Safety, incidents, PPE, and toolbox talks',
    priority: 'must-have',
    owner: 'hse',
    collection: 'safety_cases',
    description: 'Incident, near miss, PPE issuance, training evidence, toolbox talks, first-aid escalation, and corrective action trail.',
    workerCanSubmit: ['incident report', 'near miss', 'PPE request', 'unsafe condition photo'],
    adminControlled: ['severity', 'investigation status', 'corrective action', 'legal closure'],
  },
  {
    id: 'training-certification-dispatch-readiness',
    title: 'Training, licences, certifications, and dispatch readiness',
    priority: 'high',
    owner: 'operations',
    collection: 'certifications',
    description: 'Know which technician is legally and operationally ready for AC, electrical, plumbing, HSE, driving, or site-specific work.',
    workerCanSubmit: ['certificate upload', 'training request', 'renewal reminder response'],
    adminControlled: ['certificate approval', 'expiry override', 'dispatch eligibility', 'trade assignment'],
  },
  {
    id: 'contractor-employee-separation',
    title: 'Contractor versus employee workflow separation',
    priority: 'high',
    owner: 'admin',
    collection: 'workforce_parties',
    description: 'Separate employed staff, part-time labour, temporary permits, subcontractors, and vendor technicians with different permissions and commercial treatment.',
    workerCanSubmit: ['profile evidence', 'assignment evidence', 'issue report'],
    adminControlled: ['party type', 'commercial status', 'permit status', 'system permissions'],
  },
  {
    id: 'hr-property-job-linkage',
    title: 'HR-to-property and job-card linkage',
    priority: 'high',
    owner: 'operations',
    collection: 'job_workforce_links',
    description: 'Connect who attended which asset, at which property, under which certificate, at what time, with what payroll cost and safety state.',
    workerCanSubmit: ['job check-in', 'material usage', 'completion notes', 'safety checklist'],
    adminControlled: ['cost allocation', 'certificate validation', 'SLA attribution', 'property compliance badge'],
  },
];

export const UAE_HR_AI_WORKFLOWS = [
  { id: 'resume-ranking', label: 'Resume parsing and ranking', approval: 'Recruiter approval required before shortlist decision' },
  { id: 'bilingual-contract-drafting', label: 'Arabic/English contract drafting', approval: 'Approved clause library and HR/legal version approval required' },
  { id: 'payroll-anomaly-detection', label: 'Payroll anomaly detection', approval: 'Finance approval required before payroll correction' },
  { id: 'shift-optimisation', label: 'Shift optimisation', approval: 'Operations approval required before roster publication' },
  { id: 'incident-photo-classification', label: 'Incident photo classification', approval: 'HSE/admin approval required before final severity classification' },
  { id: 'employee-support-copilot', label: 'Employee support copilot', approval: 'Copilot can explain policy and route cases, not approve benefits or discipline' },
] as const;

export const UAE_HR_KPIS: WorkforceKpi[] = [
  { id: 'payroll-close-time', label: 'Payroll close time', target: 'Under 1 working day at steady state', owner: 'finance' },
  { id: 'wps-success-rate', label: 'WPS success rate', target: 'Above 99.5%', owner: 'finance' },
  { id: 'payroll-error-rate', label: 'Payroll error rate', target: 'Below 0.5%', owner: 'finance' },
  { id: 'document-renewal-rate', label: 'Visa / ID / insurance renewal on-time rate', target: 'Above 98%', owner: 'hr' },
  { id: 'attendance-completeness', label: 'Attendance capture completeness', target: 'Above 97% of planned shifts', owner: 'operations' },
  { id: 'illegal-overtime', label: 'Overtime outside policy', target: 'Near zero', owner: 'hr' },
  { id: 'incident-latency', label: 'Serious incident reporting latency', target: 'Under 15 minutes', owner: 'hse' },
  { id: 'cert-expiry-breaches', label: 'Certification expiry breaches', target: 'Zero', owner: 'operations' },
  { id: 'whatsapp-containment', label: 'WhatsApp self-service containment', target: 'Above 60% of routine HR tickets', owner: 'hr' },
  { id: 'pilot-retention', label: 'Pilot customer retention', target: '100%', owner: 'admin' },
];

export function getMustHaveHrRules() {
  return UAE_HR_COMPLIANCE_RULES.filter((rule) => rule.priority === 'must-have');
}

export function getMustHaveFieldWorkforceModules() {
  return FIELD_WORKFORCE_MODULES.filter((module) => module.priority === 'must-have');
}

export function getRulesByJurisdiction(jurisdiction: HrJurisdiction) {
  return UAE_HR_COMPLIANCE_RULES.filter((rule) => rule.jurisdiction === jurisdiction || rule.jurisdiction === 'free-zone-configurable');
}
