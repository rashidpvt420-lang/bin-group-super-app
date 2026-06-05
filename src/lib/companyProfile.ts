export type CompanyService = {
  id: number | string;
  title: string;
  desc: string;
  icon?: 'building' | 'zap' | 'briefcase' | 'users' | 'shield' | 'wrench' | 'sparkles' | 'shield-check';
};

export type CompanyProfile = {
  companyName: string;
  licenseInfo: string;
  headline: string;
  mission: string;
  vision: string;
  promise: string;
  aboutText: string;
  services: CompanyService[];
  workflows: string[];
  technologies: string[];
  serviceAreas: string[];
  contact: {
    whatsapp: string;
    email: string;
    phone: string;
  };
  termsUrl: string;
  privacyUrl: string;
};

export const COMPANY_PROFILE_DOC_PATH = ['settings', 'companyProfile'] as const;

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyName: 'BIN GROUP - Smart Maintenance, Property Management & Workforce OS UAE',
  licenseInfo: 'All Kind Building Projects Contracting - L.L.C - S.P.C | UAE property-care, field operations, paperless staff HR, payroll transparency, and workforce compliance operating model',
  headline: 'BIN GROUP is building one of the UAE\'s first AI-driven, multilingual Blue-Collar Workforce ESS platforms embedded directly into live facilities management, property maintenance, tenant service, technician dispatch, payroll transparency, safety, and compliance workflows.',
  mission: 'To solve the operational problems owners, tenants, technicians, and blue-collar field teams face every day: delayed maintenance, scattered WhatsApp calls, unclear service history, missing proof, paper HR forms, expired staff documents, overtime disputes, payroll confusion, weak safety reporting, and no single controlled system connecting property care with workforce care.',
  vision: 'To make BIN GROUP the UAE benchmark for smart property care and paperless blue-collar workforce operations, then scale the model globally as a trusted Home OS + Workforce OS for maintenance, property management, staff HR self-service, compliance, payroll visibility, and owner confidence.',
  promise: 'No waiting. No guessing. No paperwork. One clear digital property-care and workforce chain: quote, contract, 15% mobilization, payment plan, tenant request, GPS technician dispatch, before-and-after evidence, attendance log, overtime review, WPS-ready payroll visibility, staff HR request, compliance passport, safety report, owner report, and property history.',
  aboutText: 'BIN GROUP is built for serious owners of villas, apartments, towers, hotels, schools, clinics, hospitals, offices, accommodations, retail spaces, malls, warehouses, and government-style portfolios. The app turns every property into a controlled digital asset with service history, contract visibility, evidence, reporting, and real-time operational accountability. Internally, BIN GROUP also runs Workforce OS: a UAE-built, AI-assisted, multilingual, paperless HR self-service model for field maintenance staff, technicians, cleaners, security teams, plumbers, electricians, HVAC teams, and supervisors. Staff can access leave requests, sick leave uploads, payslip support, overtime review, WPS-ready salary visibility, HR letters, document renewal records, staff agreements, safety reports, accommodation issues, tools/PPE requests, compliance certificates, and confidential HR support without manual paperwork.',
  services: [
    { id: 'maintenance-contracts', title: 'Annual Maintenance Contracts', desc: 'Custom maintenance contracts for villas, towers, hotels, schools, clinics, hospitals, offices, accommodations, malls, and large portfolios. Scope is prepared by property type, size, asset condition, SLA level, and service risk.', icon: 'wrench' },
    { id: 'property-management', title: 'Property Management', desc: 'Owner visibility for units, tenants, complaints, occupancy, lease support, rent-cycle context, reporting, and property records. The property management model can follow the 5% per rented unit structure or portfolio agreement.', icon: 'briefcase' },
    { id: 'full-coverage', title: 'Maintenance + Property Management', desc: 'A full-coverage property-care model combining owner contracts, tenant service, technician execution, reporting, proof-of-work, renewal readiness, and long-term property intelligence.', icon: 'building' },
    { id: 'technician-dispatch', title: 'Direct Technician Dispatch', desc: 'Structured field execution where technicians receive job cards, location context, safety notes, SLA expectations, before-and-after proof requirements, geolocation attendance context, and completion workflows inside the app.', icon: 'zap' },
    { id: 'workforce-os', title: 'BIN GROUP Workforce OS', desc: 'An AI-assisted, mobile-first, multilingual Blue-Collar ESS for maintenance, cleaning, security, HVAC, plumbing, electrical, and FM teams: attendance, leave, overtime, payslip support, WPS-ready salary visibility, HR letters, document renewal, staff agreements, safety cases, accommodation issues, tools/PPE, and confidential HR support.', icon: 'users' },
    { id: 'wps-payroll-transparency', title: 'WPS-Ready Payroll Transparency', desc: 'Staff can see basic salary, allowances, overtime requests, deductions, payment status, salary query history, and payroll dispute cases in one controlled record while HR/Admin keeps approval authority.', icon: 'shield-check' },
    { id: 'compliance-passport', title: 'Digital Compliance Passport', desc: 'Visa, Emirates ID, passport, medical card, driving licence, trade certification, SIRA/BICSc-style training references where applicable, PPE, toolbox talks, and dispatch-readiness records are tracked in one workforce dossier.', icon: 'shield-check' },
    { id: 'owner-trust', title: 'Owner Trust & Proof', desc: 'Every serious action is designed to build trust: clear quote path, contract record, 15% mobilization step, service request trail, GPS context, photo evidence, reports, compliance logs, staff accountability, and property passport history.', icon: 'shield-check' },
    { id: 'demo-video-guidance', title: 'Demo & Video Walkthroughs', desc: 'Public previews show what owners, tenants, technicians, brokers, and staff will see before they log in, making the app easier to understand, share, and trust.', icon: 'sparkles' },
    { id: 'ai-property-people-intelligence', title: 'AI Property & People Intelligence', desc: 'AI-assisted quote logic, property classification, design previews, predictive maintenance signals, asset health scoring, staff HR triage, multilingual People AI support, and portfolio-level decision support.', icon: 'sparkles' },
  ],
  workflows: [
    'Owner Onboarding: property details, instant quote, contract selection, 15% mobilization, payment plan, and activation.',
    'Tenant Service: category, priority, photo proof, location context, service tracking, and completion confirmation.',
    'Technician Execution: direct job feed, route context, property-linked attendance, SLA expectation, safety notes, before-and-after proof, and job closure.',
    'Worker ESS: multilingual mobile self-service for leave, sick leave, overtime, payslip support, payroll dispute, HR letters, salary query, document renewal, accommodation issue, tools/PPE request, safety incident, and confidential complaint submission from the app.',
    'WPS-Ready Payroll Transparency: basic salary, allowances, overtime, deductions, net salary status, payment month, payroll query, and HR/Admin approval trail remain visible without giving staff unsafe edit access.',
    'Compliance Passport: visa, Emirates ID, passport, medical card, driving licence, trade certification, SIRA/BICSc-style training references where applicable, PPE, toolbox talk, and dispatch-readiness records are monitored before field deployment.',
    'HR/Admin Control: staff registration, salary package, leave balance, document expiries, staff agreement, permissions, request approvals, payroll review, compliance review, and audit logs remain controlled from one system.',
    'Broker Growth: owner referral, property opportunity, pipeline status, and commission-ready record trail.',
    'AI Design & Property Passport: upgrade ideas, asset history, contracts, tickets, reports, invoices, HR compliance context, and operational records stay attached to the property and workforce.',
  ],
  technologies: [
    'No-call owner journey from quote to contract to service tracking.',
    'No-paperwork staff journey for leave, payroll support, document updates, staff letters, safety, tools/PPE, and HR case handling.',
    'Mobile-first multilingual ESS support for English, Arabic, Hindi, Urdu, Malayalam, Tagalog, Bengali, and Nepali workforce contexts.',
    'GPS-enabled technician routing, property-linked attendance context, and field accountability.',
    'Digital proof-of-work with before-and-after evidence.',
    'WPS-ready payroll visibility fields for basic salary, allowances, overtime review, deductions, net salary status, and payroll dispute tracking.',
    'Staff agreement acknowledgement, salary package records, request logs, payroll review records, and HR audit trail.',
    'Document-expiry intelligence for visa, Emirates ID, passport, medical card, driving licence, certification, PPE, toolbox talks, and dispatch readiness.',
    'Ejari/Tawtheeq-style property reference fields can be stored for compliance context without claiming direct government integration unless approved access exists.',
    'Demo and video walkthroughs for public education and trust-building.',
    'Property passport records for every building, unit, contract, service request, compliance event, and staff-linked operation.',
    'AI-powered quote, design, classification, maintenance, and staff People AI support intelligence.',
  ],
  serviceAreas: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Al Ain'],
  contact: {
    whatsapp: '+971 55 2423233',
    email: 'owner@bin-group.com',
    phone: '+971 55 7474560',
  },
  termsUrl: '/terms',
  privacyUrl: '/privacy',
};

function isLegacyPlaceholderProfile(data?: Partial<CompanyProfile> | null) {
  const name = String(data?.companyName || '').toLowerCase();
  const license = String(data?.licenseInfo || '').toLowerCase();
  const email = String(data?.contact?.email || '').toLowerCase();
  return Boolean(
    (name.includes('institutional') && !name.includes('maintenance')) ||
    (license.includes('dubai economy') && !license.includes('l.l.c')) ||
    (email.startsWith('support@') && !email.includes('bin-group'))
  );
}

export function normalizeCompanyProfile(data?: Partial<CompanyProfile> | null): CompanyProfile {
  const safeData = isLegacyPlaceholderProfile(data) ? null : data;
  const merged = {
    ...DEFAULT_COMPANY_PROFILE,
    ...(safeData || {}),
    contact: {
      ...DEFAULT_COMPANY_PROFILE.contact,
      ...(safeData?.contact || {}),
    },
  } as CompanyProfile;

  return {
    ...merged,
    aboutText: merged.aboutText || merged.headline,
    headline: merged.headline || merged.aboutText || DEFAULT_COMPANY_PROFILE.headline,
    mission: merged.mission || DEFAULT_COMPANY_PROFILE.mission,
    vision: merged.vision || DEFAULT_COMPANY_PROFILE.vision,
    promise: merged.promise || DEFAULT_COMPANY_PROFILE.promise,
    services: Array.isArray(merged.services) && merged.services.length ? merged.services : DEFAULT_COMPANY_PROFILE.services,
    workflows: Array.isArray(merged.workflows) && merged.workflows.length ? merged.workflows : DEFAULT_COMPANY_PROFILE.workflows,
    technologies: Array.isArray(merged.technologies) && merged.technologies.length ? merged.technologies : DEFAULT_COMPANY_PROFILE.technologies,
    serviceAreas: Array.isArray(merged.serviceAreas) && merged.serviceAreas.length ? merged.serviceAreas : DEFAULT_COMPANY_PROFILE.serviceAreas,
  };
}
