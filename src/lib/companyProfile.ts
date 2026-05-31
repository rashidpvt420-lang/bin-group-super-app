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
  companyName: 'BIN GROUP – UAE General Maintenance & Property Management',
  licenseInfo: 'All Kind Building Projects Contracting – L.L.C – S.P.C · UAE Sovereign Standard',
  headline: "The UAE's most advanced PropTech and Facility Management operating system for high-value assets and institutional portfolios.",
  mission: 'To redefine property operations in the UAE by merging elite facility management with real-time digital transparency, ensuring every asset is preserved, every tenant is satisfied, and every owner is informed.',
  vision: "To become the UAE's benchmark for autonomous property care, institutional maintenance contracts, and sovereign property management operations.",
  promise: 'Uncompromising quality, real-time accountability, and digital-first asset tracking. One property, one passport, one command center.',
  aboutText: "The UAE's most advanced PropTech and Facility Management operating system for high-value assets and institutional portfolios.",
  services: [
    { id: 'fm', title: 'Facility Management (FM)', desc: 'Full-spectrum facility management for residential towers, luxury villas, and commercial complexes across the UAE.', icon: 'building' },
    { id: 'pm', title: 'Property Management', desc: 'Rent collection, unit ledgers, tenant screening, legal compliance, and owner net-payout automation.', icon: 'briefcase' },
    { id: 'maintenance', title: 'General Maintenance (AMC)', desc: 'Annual Maintenance Contracts covering MEP, HVAC, Civil, and specialty works for hotels, hospitals, and schools.', icon: 'wrench' },
    { id: 'construction', title: 'Construction & Fit-out', desc: 'Structural repairs, interior fit-outs, and construction support for government and private developments.', icon: 'shield-check' },
    { id: 'ai', title: 'AI Design & Studio', desc: 'Sovereign AI for interior visualization, layout optimization, and predictive maintenance triage.', icon: 'sparkles' },
    { id: 'compliance', title: 'Audit & Compliance', desc: 'Full audit trails, property passports, and VAT-compliant financial reporting for institutional owners.', icon: 'shield' },
  ],
  workflows: [
    'AI Design Studio Demo: Visualize property upgrades and fit-outs with real-time AI generation.',
    'Property Passport Demo: Unified digital record for every unit, contract, and maintenance job.',
    'Tenant Complaint Demo: Photo-based request submission with live technician tracking.',
    'Technician Dispatch Demo: Automated assignment to on-duty specialists with proof-of-work.',
    'Broker/Referral Demo: Transparent lead management and automated commission tracking.',
    'Owner Onboarding Demo: Seamless property enrollment with instant quote generation.',
  ],
  technologies: [
    'Sovereign Data Storage: UAE-based secure cloud infrastructure with military-grade encryption.',
    'Sovereign AI Integration: Advanced LLM and Image-Gen models for property intelligence.',
    'Real-time Ops Ledger: Instant syncing between technician actions and owner dashboards.',
    'Institutional Payouts: Automated VAT handling and secure financial dispersal.',
  ],
  serviceAreas: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Al Ain'],
  contact: {
    whatsapp: '+971 50 123 4567',
    email: 'ops@bin-groups.com',
    phone: '+971 50 123 4567',
  },
  termsUrl: '/terms',
  privacyUrl: '/privacy',
};

export function normalizeCompanyProfile(data?: Partial<CompanyProfile> | null): CompanyProfile {
  const merged = {
    ...DEFAULT_COMPANY_PROFILE,
    ...(data || {}),
    contact: {
      ...DEFAULT_COMPANY_PROFILE.contact,
      ...(data?.contact || {}),
    },
  } as CompanyProfile;

  return {
    ...merged,
    aboutText: merged.aboutText || merged.headline,
    headline: merged.headline || merged.aboutText || DEFAULT_COMPANY_PROFILE.headline,
    services: Array.isArray(merged.services) && merged.services.length ? merged.services : DEFAULT_COMPANY_PROFILE.services,
    workflows: Array.isArray(merged.workflows) && merged.workflows.length ? merged.workflows : DEFAULT_COMPANY_PROFILE.workflows,
    technologies: Array.isArray(merged.technologies) && merged.technologies.length ? merged.technologies : DEFAULT_COMPANY_PROFILE.technologies,
    serviceAreas: Array.isArray(merged.serviceAreas) && merged.serviceAreas.length ? merged.serviceAreas : DEFAULT_COMPANY_PROFILE.serviceAreas,
  };
}
