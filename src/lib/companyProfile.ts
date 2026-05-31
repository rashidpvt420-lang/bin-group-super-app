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
  companyName: 'BIN GROUP - UAE General Maintenance & Property Management',
  licenseInfo: 'All Kind Building Projects Contracting - L.L.C - S.P.C | UAE first unified property care operating model',
  headline: 'UAE-first no-call property care: maintenance, property management, contracts, tenant service, technician dispatch, proof-of-work, and owner visibility in one system.',
  mission: 'To remove delay, confusion, and manual follow-up from UAE property operations by giving owners, tenants, brokers, and technicians one transparent digital operating system.',
  vision: 'To make BIN GROUP the UAE benchmark for smart maintenance, annual service contracts, property management, and evidence-based facility operations.',
  promise: 'No waiting. No guessing. Real-time property care with direct field execution, photo evidence, GPS visibility, contract clarity, and owner confidence.',
  aboutText: 'BIN GROUP solves the full property-care chain: instant owner quote, contract selection, 15% mobilization, monthly or quarterly or annual payment planning, tenant service requests, technician GPS dispatch, before-and-after proof, broker referrals, AI design previews, and property passport records.',
  services: [
    { id: 'maintenance-contracts', title: 'Annual Maintenance Contracts', desc: 'High-value maintenance contracts for villas, towers, hotels, schools, clinics, hospitals, offices, accommodations, and government-style portfolios. Typical contract value starts from AED 50,000 per year and scales by asset size and SLA level.', icon: 'wrench' },
    { id: 'property-management', title: 'Property Management', desc: 'Unit management, tenant records, occupancy tracking, complaint handling, lease support, rent-cycle visibility, and owner reporting. Property management can be charged at 5% per rented unit or as agreed per portfolio.', icon: 'briefcase' },
    { id: 'full-coverage', title: 'Maintenance + Property Management', desc: 'Full-coverage operating model combining maintenance execution, tenant support, owner dashboard, proof-of-work, renewal readiness, and financial visibility for serious owners and institutional assets.', icon: 'building' },
    { id: 'technician-dispatch', title: 'Direct Technician Dispatch', desc: 'HR-free field execution model where technicians receive direct workfeeds, GPS-based jobs, proof upload requirements, and performance accountability without manual bottlenecks.', icon: 'zap' },
    { id: 'ai-property-intelligence', title: 'AI Property Intelligence', desc: 'AI-assisted quote logic, property classification, design previews, predictive maintenance signals, asset health scoring, and portfolio-level decision support.', icon: 'sparkles' },
    { id: 'audit-compliance', title: 'Evidence, Audit & Compliance', desc: 'Before-and-after photos, ticket history, property passport records, invoice traceability, tenant confirmation, owner visibility, and structured UAE-ready reporting.', icon: 'shield' },
  ],
  workflows: [
    'Owner Onboarding: property details, instant quote, contract selection, 15% mobilization, payment plan, and activation.',
    'Tenant Service: photo request, category selection, priority, location confirmation, and service tracking.',
    'Technician Execution: direct job feed, GPS route context, evidence upload, and completion confirmation.',
    'Broker Growth: lead registration, owner referral visibility, and commission-ready pipeline records.',
    'AI Design & Property Passport: interior or exterior visualization, asset history, contracts, tickets, and compliance records.',
  ],
  technologies: [
    'No-call customer journey from quote to contract to service tracking.',
    'GPS-enabled technician routing and field accountability.',
    'Digital proof-of-work with before-and-after evidence.',
    'Property passport records for every building, unit, contract, and service request.',
    'AI-powered quote, design, classification, and maintenance intelligence.',
  ],
  serviceAreas: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Al Ain'],
  contact: {
    whatsapp: '+971 50 123 4567',
    email: 'owner@bin-group.com',
    phone: '+971 50 123 4567',
  },
  termsUrl: '/terms',
  privacyUrl: '/privacy',
};

function isLegacyPlaceholderProfile(data?: Partial<CompanyProfile> | null) {
  return Boolean(
    data?.companyName === 'BIN GROUP INSTITUTIONAL' ||
    data?.licenseInfo === 'License #998273 - Dubai Economy' ||
    data?.contact?.email === 'support@bingroup.ae'
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
