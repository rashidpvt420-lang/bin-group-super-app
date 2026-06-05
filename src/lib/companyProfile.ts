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
  companyName: 'BIN GROUP - UAE General Maintenance, Property Management & Workforce OS',
  licenseInfo: 'All Kind Building Projects Contracting - L.L.C - S.P.C | UAE maintenance, property management, digital property-care operations, paperless staff self-service, and workforce compliance operating model',
  headline: 'BIN GROUP is a UAE maintenance and property management company rooted in Al Ain since 2010, now operating through a formally licensed LLC structure and building a trusted digital property-care and paperless staff operations platform.',
  mission: 'To deliver dependable maintenance and property management services that protect clients\' properties, reduce operational stress, and improve daily property care through clear communication, professional service standards, digital records, and accountable field execution.',
  vision: 'To become a trusted UAE property-care company starting from Al Ain, known for reliable maintenance, transparent property management, smart digital operations, paperless staff workflows, and long-term client relationships.',
  promise: 'Trusted maintenance and property care, rooted in Al Ain: clear quotes, documented contracts, 15% mobilization, payment-plan visibility, tenant requests, technician dispatch, before-and-after evidence, owner reports, staff self-service, compliance records, and no unnecessary paperwork.',
  aboutText: 'BIN GROUP began as a small local maintenance operation in Al Ain in 2010, supporting practical property-care needs in the local market. The company has now moved into its formally licensed LLC phase, building on that experience with a more structured and technology-driven operating model for villas, apartments, buildings, hotels, schools, clinics, hospitals, offices, accommodations, retail spaces, warehouses, and large property portfolios. The public profile is designed around trust: legal company identity, licence details, service coverage, direct contact, clear service scope, and honest claims that can be verified. BIN GROUP also develops Workforce OS, a UAE-focused, multilingual, paperless staff self-service model for maintenance and property management field teams. The system is positioned as a field-operational HR workflow, not as an unsupported world-first claim: staff can request leave, upload sick leave documents, raise overtime and payroll queries, request HR letters, track document renewals, report safety issues, request tools/PPE, flag accommodation matters, and communicate with HR/Admin through one controlled digital chain.',
  services: [
    { id: 'maintenance-contracts', title: 'Annual Maintenance Contracts', desc: 'Custom maintenance contracts for villas, apartments, towers, hotels, schools, clinics, hospitals, offices, accommodations, malls, warehouses, and large portfolios. Scope is prepared by property type, asset condition, SLA level, risk profile, and service coverage.', icon: 'wrench' },
    { id: 'property-management', title: 'Property Management Support', desc: 'Owner and tenant coordination, complaint follow-up, lease and occupancy context, vendor supervision, property condition records, move-in/move-out support, service reporting, and portfolio visibility subject to the company\'s licensed activity scope.', icon: 'briefcase' },
    { id: 'full-coverage', title: 'Maintenance + Property Management', desc: 'A full property-care model combining owner contracts, tenant service, technician execution, reporting, proof-of-work, renewal readiness, and long-term property history in one digital operating flow.', icon: 'building' },
    { id: 'technician-dispatch', title: 'Direct Technician Dispatch', desc: 'Structured field execution where technicians receive job cards, location context, safety notes, SLA expectations, before-and-after proof requirements, attendance context, and completion workflows inside the app.', icon: 'zap' },
    { id: 'workforce-os', title: 'Paperless Staff Self-Service', desc: 'A UAE-focused, multilingual, paperless staff self-service workflow for maintenance and property management field teams: leave, sick leave, overtime review, payslip support, salary queries, HR letters, document renewals, safety reports, accommodation issues, tools/PPE, and confidential HR support.', icon: 'users' },
    { id: 'wps-payroll-transparency', title: 'Payroll-Ready Staff Records', desc: 'Staff can view and query controlled payroll-related records such as basic salary context, allowances, overtime requests, deductions, payment status, and salary dispute cases while HR/Admin keeps approval authority.', icon: 'shield-check' },
    { id: 'compliance-passport', title: 'Digital Compliance Passport', desc: 'Visa, Emirates ID, passport, medical card, driving licence, trade certification, training references, PPE, toolbox talks, and dispatch-readiness records are tracked in one workforce dossier.', icon: 'shield-check' },
    { id: 'owner-trust', title: 'Owner Trust & Proof', desc: 'Every serious action is designed to build trust: quote path, contract record, 15% mobilization step, service request trail, GPS context, photo evidence, reports, compliance logs, staff accountability, and property passport history.', icon: 'shield-check' },
    { id: 'demo-video-guidance', title: 'Demo & Video Walkthroughs', desc: 'Public previews show what owners, tenants, technicians, brokers, and staff will see before they log in, making the app easier to understand, share, and trust.', icon: 'sparkles' },
    { id: 'ai-property-people-intelligence', title: 'AI-Assisted Property & People Intelligence', desc: 'AI-assisted quote logic, property classification, design previews, predictive maintenance signals, asset health scoring, staff HR triage, multilingual support, and portfolio-level decision support.', icon: 'sparkles' },
  ],
  workflows: [
    'Owner Onboarding: property details, instant quote, contract selection, 15% mobilization, payment plan, and activation.',
    'Tenant Service: category, priority, photo proof, location context, service tracking, and completion confirmation.',
    'Technician Execution: direct job feed, route context, property-linked attendance, SLA expectation, safety notes, before-and-after proof, and job closure.',
    'Worker ESS: multilingual mobile self-service for leave, sick leave, overtime, payslip support, payroll dispute, HR letters, salary query, document renewal, accommodation issue, tools/PPE request, safety incident, and confidential complaint submission from the app.',
    'Payroll-Ready Transparency: basic salary context, allowances, overtime, deductions, net salary status, payment month, payroll query, and HR/Admin approval trail remain visible without giving staff unsafe edit access.',
    'Compliance Passport: visa, Emirates ID, passport, medical card, driving licence, trade certification, training references, PPE, toolbox talk, and dispatch-readiness records are monitored before field deployment.',
    'HR/Admin Control: staff registration, salary package, leave balance, document expiries, staff agreement, permissions, request approvals, payroll review, compliance review, and audit logs remain controlled from one system.',
    'Broker Growth: owner referral, property opportunity, pipeline status, and commission-ready record trail.',
    'AI Design & Property Passport: upgrade ideas, asset history, contracts, tickets, reports, invoices, HR compliance context, and operational records stay attached to the property and workforce.',
  ],
  technologies: [
    'Bilingual English/Arabic company profile with professional, verifiable claims.',
    'No-call owner journey from quote to contract to service tracking.',
    'No-paperwork staff journey for leave, payroll support, document updates, staff letters, safety, tools/PPE, and HR case handling.',
    'Mobile-first multilingual ESS support for English, Arabic, Hindi, Urdu, Malayalam, Tagalog, Bengali, and Nepali workforce contexts.',
    'GPS-enabled technician routing, property-linked attendance context, and field accountability.',
    'Digital proof-of-work with before-and-after evidence.',
    'Payroll-ready visibility fields for basic salary context, allowances, overtime review, deductions, net salary status, and payroll dispute tracking.',
    'Staff agreement acknowledgement, salary package records, request logs, payroll review records, and HR audit trail.',
    'Document-expiry intelligence for visa, Emirates ID, passport, medical card, driving licence, certification, PPE, toolbox talks, and dispatch readiness.',
    'Ejari/Tawtheeq-style property reference fields can be stored for compliance context without claiming direct government integration unless approved access exists.',
    'Demo and video walkthroughs for public education and trust-building.',
    'Property passport records for every building, unit, contract, service request, compliance event, and staff-linked operation.',
    'AI-powered quote, design, classification, maintenance, and staff People AI support intelligence.',
  ],
  serviceAreas: ['Al Ain', 'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'],
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
