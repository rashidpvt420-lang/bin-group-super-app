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
  companyName: 'BIN GROUP - Smart Maintenance & Property Management UAE',
  licenseInfo: 'All Kind Building Projects Contracting - L.L.C - S.P.C | UAE property-care, field operations, and paperless staff HR operating model',
  headline: 'A trusted UAE property-care platform for owners, tenants, technicians, brokers, and company staff: maintenance contracts, property management, tenant requests, technician dispatch, proof-of-work, staff HR self-service, compliance records, and AI property intelligence in one app.',
  mission: 'To solve the real operational problems property owners and field teams face every day: delayed maintenance, scattered phone calls, unclear service history, missing proof, weak reporting, paper HR forms, expired staff documents, and no single controlled system connecting owners, tenants, technicians, brokers, HR, finance, and operations.',
  vision: 'To make BIN GROUP the UAE benchmark for smart property care and paperless field workforce operations, then scale the model globally as a trusted operating system for maintenance, property management, staff HR self-service, compliance, and owner confidence.',
  promise: 'No waiting. No guessing. No paperwork. One clear digital property-care and workforce chain: quote, contract, 15% mobilization, payment plan, tenant request, GPS technician dispatch, before-and-after evidence, staff HR request, compliance alert, owner report, and property passport history.',
  aboutText: 'BIN GROUP is built for serious owners of villas, apartments, towers, hotels, schools, clinics, hospitals, offices, accommodations, retail spaces, malls, warehouses, and government-style portfolios. The app turns every property into a controlled digital asset with service history, contract visibility, evidence, reporting, and real-time operational accountability. Internally, BIN GROUP also runs a UAE-built paperless HR self-service model for field maintenance staff, giving technicians and staff digital access to leave requests, payslip support, overtime review, HR letters, document renewal records, staff agreements, safety reports, accommodation issues, tools/PPE requests, and confidential HR support without manual paperwork.',
  services: [
    { id: 'maintenance-contracts', title: 'Annual Maintenance Contracts', desc: 'Custom maintenance contracts for villas, towers, hotels, schools, clinics, hospitals, offices, accommodations, malls, and large portfolios. Scope is prepared by property type, size, asset condition, SLA level, and service risk.', icon: 'wrench' },
    { id: 'property-management', title: 'Property Management', desc: 'Owner visibility for units, tenants, complaints, occupancy, lease support, rent-cycle context, reporting, and property records. The property management model can follow the 5% per rented unit structure or portfolio agreement.', icon: 'briefcase' },
    { id: 'full-coverage', title: 'Maintenance + Property Management', desc: 'A full-coverage property-care model combining owner contracts, tenant service, technician execution, reporting, proof-of-work, renewal readiness, and long-term property intelligence.', icon: 'building' },
    { id: 'technician-dispatch', title: 'Direct Technician Dispatch', desc: 'Structured field execution where technicians receive job cards, location context, safety notes, SLA expectations, before-and-after proof requirements, and completion workflows inside the app.', icon: 'zap' },
    { id: 'paperless-hr-self-service', title: 'Paperless Staff HR Self-Service', desc: 'A UAE-built staff portal for field maintenance teams: leave, sick leave, overtime, payslip support, salary queries, HR letters, document renewal, staff agreement acknowledgement, tools/PPE requests, safety incidents, accommodation cases, and confidential HR support without paper forms.', icon: 'users' },
    { id: 'workforce-compliance', title: 'Field Workforce Compliance', desc: 'Visa, Emirates ID, passport, medical card, driving licence, trade certification, PPE, training, and dispatch-readiness records are tracked in one HR and operations dossier so expired or missing records can be escalated before field deployment.', icon: 'shield-check' },
    { id: 'owner-trust', title: 'Owner Trust & Proof', desc: 'Every serious action is designed to build trust: clear quote path, contract record, 15% mobilization step, service request trail, GPS context, photo evidence, reports, and property passport history.', icon: 'shield-check' },
    { id: 'demo-video-guidance', title: 'Demo & Video Walkthroughs', desc: 'Public previews show what owners, tenants, technicians, brokers, and staff will see before they log in, making the app easier to understand, share, and trust.', icon: 'sparkles' },
    { id: 'ai-property-intelligence', title: 'AI Property & People Intelligence', desc: 'AI-assisted quote logic, property classification, design previews, predictive maintenance signals, asset health scoring, staff HR triage, multilingual support, and portfolio-level decision support.', icon: 'sparkles' },
  ],
  workflows: [
    'Owner Onboarding: property details, instant quote, contract selection, 15% mobilization, payment plan, and activation.',
    'Tenant Service: category, priority, photo proof, location context, service tracking, and completion confirmation.',
    'Technician Execution: direct job feed, route context, SLA expectation, safety notes, before-and-after proof, and job closure.',
    'Staff HR Self-Service: leave, sick leave, overtime, payslip support, HR letters, salary query, document renewal, accommodation issue, tools/PPE request, safety incident, and confidential complaint submission from the app.',
    'HR/Admin Control: staff registration, salary package, leave balance, visa/Emirates ID/passport/medical/driving licence expiry, staff agreement, permissions, request approvals, and audit logs remain controlled from one system.',
    'Broker Growth: owner referral, property opportunity, pipeline status, and commission-ready record trail.',
    'AI Design & Property Passport: upgrade ideas, asset history, contracts, tickets, reports, invoices, HR compliance context, and operational records stay attached to the property and workforce.',
  ],
  technologies: [
    'No-call owner journey from quote to contract to service tracking.',
    'No-paperwork staff journey for leave, payroll support, document updates, staff letters, safety, tools/PPE, and HR case handling.',
    'GPS-enabled technician routing and field accountability.',
    'Digital proof-of-work with before-and-after evidence.',
    'Staff agreement acknowledgement, salary package records, request logs, and HR audit trail.',
    'Document-expiry intelligence for visa, Emirates ID, passport, medical card, driving licence, certification, PPE, and dispatch readiness.',
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
