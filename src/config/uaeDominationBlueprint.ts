// BIN GROUP UAE domination product blueprint.
// This file is intentionally executable configuration, not only documentation.
// Dashboards, marketing pages, onboarding, reporting, and launch gates can import
// these constants as the single source of truth for the No-Call Maintenance OS.

export type PortalRole = 'tenant' | 'owner' | 'technician' | 'broker' | 'admin';

export type CompetitivePlatform = 'Buildium' | 'AppFolio' | 'MRI' | 'Yardi' | 'RealPage' | 'DoorLoop' | 'Local UAE operators';

export type NoCallModuleStatus = 'build-now' | 'pilot-next' | 'enterprise-phase' | 'deferred';

export type BinPermission =
  | 'canViewPayments'
  | 'canVerifyPayments'
  | 'canManageTenants'
  | 'canManageTechnicians'
  | 'canManageContracts'
  | 'canManageProperties'
  | 'canViewFinancials'
  | 'canEditPricing'
  | 'canManageCompanyProfile'
  | 'canDispatchJobs'
  | 'canViewAuditLogs'
  | 'canExportReports';

export type SlaPriority = 'EMERGENCY' | 'HIGH' | 'MEDIUM' | 'STANDARD' | 'LOW';

export const UAE_DOMINATION_POSITIONING = {
  category: 'No-Call Maintenance & Property Operations OS',
  promise: 'Every issue tracked. Every repair verified. Every owner protected.',
  wedge: 'UAE landlords and property managers with 5-100 units who are tired of WhatsApp maintenance chaos.',
  expansion: 'Move from maintenance proof to full property management, schools, hotels, malls, mosques, majlis, and government-grade facilities management.',
  nonNegotiables: [
    'Arabic and English must be first-class, including RTL layouts and PDF output.',
    'Tenant request creation must require evidence and exact service location before dispatch.',
    'Owner approvals must be simple: what happened, cost, proof, approve or dispute.',
    'Technician workflow must prove arrival, work, parts, before/after photos, and completion.',
    'Admin must see live risk, SLA, cash, disputes, technician capacity, and owner onboarding state.',
    'Every financial, contract, ticket, and evidence event must leave an audit trail.',
  ],
} as const;

export const CANONICAL_SLA_POLICY: Record<SlaPriority, { minutes: number; label: string; tenantCopy: string; adminEscalationCopy: string }> = {
  EMERGENCY: {
    minutes: 30,
    label: 'Emergency',
    tenantCopy: 'Life, safety, active leak, electrical hazard, lockout, or severe AC failure requiring immediate dispatch.',
    adminEscalationCopy: 'Immediate dispatcher review. Show on SOS board. Escalate if no technician accepts within 10 minutes.',
  },
  HIGH: {
    minutes: 120,
    label: 'High',
    tenantCopy: 'Urgent issue affecting comfort, habitability, access, or asset protection.',
    adminEscalationCopy: 'Operations supervisor review if unassigned after 30 minutes.',
  },
  MEDIUM: {
    minutes: 240,
    label: 'Medium',
    tenantCopy: 'Normal repair that should be scheduled quickly but is not safety critical.',
    adminEscalationCopy: 'Dispatcher review if unassigned after 90 minutes.',
  },
  STANDARD: {
    minutes: 480,
    label: 'Standard',
    tenantCopy: 'Routine maintenance request within the normal service window.',
    adminEscalationCopy: 'Review in daily maintenance queue.',
  },
  LOW: {
    minutes: 1440,
    label: 'Low',
    tenantCopy: 'Non-urgent request, cosmetic item, general inquiry, or planned follow-up.',
    adminEscalationCopy: 'Track for batch scheduling and owner reporting.',
  },
};

export function slaMinutesForPriority(priority: string | undefined | null): number {
  const normalized = String(priority || 'STANDARD').trim().toUpperCase();
  if (normalized === 'EMERGENCY' || normalized === 'SOS') return CANONICAL_SLA_POLICY.EMERGENCY.minutes;
  if (normalized === 'URGENT' || normalized === 'HIGH') return CANONICAL_SLA_POLICY.HIGH.minutes;
  if (normalized === 'MEDIUM') return CANONICAL_SLA_POLICY.MEDIUM.minutes;
  if (normalized === 'LOW') return CANONICAL_SLA_POLICY.LOW.minutes;
  return CANONICAL_SLA_POLICY.STANDARD.minutes;
}

export const ROLE_QUICK_ACTIONS: Record<PortalRole, Array<{ id: string; label: string; target: string; whyItMatters: string }>> = {
  tenant: [
    { id: 'report_issue', label: 'Report Issue', target: '/tenant/request', whyItMatters: 'Fastest path to create a photo-backed maintenance ticket.' },
    { id: 'track_request', label: 'Track Request', target: '/tenant/tickets', whyItMatters: 'Shows status, ETA, proof, and dispute options.' },
    { id: 'emergency', label: 'Emergency', target: '/tenant/emergency', whyItMatters: 'Separates true SOS from normal maintenance.' },
    { id: 'documents_payments', label: 'Documents & Payments', target: '/tenant/documents', whyItMatters: 'Reduces WhatsApp/file chasing.' },
  ],
  owner: [
    { id: 'health', label: 'Property Health', target: '/owner/dashboard', whyItMatters: 'Single view of risk, SLA, tickets, and cost.' },
    { id: 'approvals', label: 'Pending Approvals', target: '/owner/approvals', whyItMatters: 'Owners should see only decisions that need action.' },
    { id: 'financials', label: 'Financials', target: '/owner/financials', whyItMatters: 'Shows contract value, invoices, payouts, and maintenance spend.' },
    { id: 'passport', label: 'Property Passport', target: '/owner/property-passport', whyItMatters: 'Creates asset memory and legal evidence.' },
  ],
  technician: [
    { id: 'jobs', label: 'Jobs', target: '/technician/jobs', whyItMatters: 'Field worker should start from assigned and open missions.' },
    { id: 'map', label: 'Live Map', target: '/technician/map', whyItMatters: 'GPS routing and arrival proof.' },
    { id: 'offline', label: 'Offline Queue', target: '/technician/offline', whyItMatters: 'Protects field workflow when connection is weak.' },
    { id: 'proof', label: 'Proof', target: '/technician/proof-readiness', whyItMatters: 'No Photo, No Pay enforcement.' },
  ],
  broker: [
    { id: 'leads', label: 'Leads', target: '/broker/leads', whyItMatters: 'Captures owner/property opportunities.' },
    { id: 'referrals', label: 'Referrals', target: '/broker/referrals', whyItMatters: 'Creates attribution before commission disputes happen.' },
    { id: 'commissions', label: 'Commissions', target: '/broker/commissions', whyItMatters: 'Makes broker payout trust visible.' },
    { id: 'documents', label: 'Documents', target: '/broker/documents', whyItMatters: 'Keeps RERA/KYC evidence organized.' },
  ],
  admin: [
    { id: 'sla', label: 'SLA Command', target: '/tickets', whyItMatters: 'Prevents breach before customer anger.' },
    { id: 'payments', label: 'Payment Approvals', target: '/payments', whyItMatters: 'Controls activation, cash, and fraud risk.' },
    { id: 'dispatch', label: 'Dispatch', target: '/technicians/map', whyItMatters: 'Technician capacity and nearest-job view.' },
    { id: 'launch', label: 'Launch Control', target: '/ops/public-launch-command', whyItMatters: 'Keeps public claims tied to proof.' },
  ],
};

export const COMPETITIVE_BASELINE = [
  {
    platform: 'Buildium' as CompetitivePlatform,
    strongAt: ['maintenance tracking', 'tenant and owner portals', 'accounting', 'leasing', 'tenant screening'],
    binCounterMove: 'Win on UAE-first Arabic/RTL, GPS proof, owner evidence, technician field execution, and No-Call workflow simplicity.',
  },
  {
    platform: 'AppFolio' as CompetitivePlatform,
    strongAt: ['real-time property management', 'financial tracking', 'tenant communication', 'mobile inspections', 'automation'],
    binCounterMove: 'Win on local service execution, technician proof, SLA credits, UAE owner onboarding, broker attribution, and evidence vault.',
  },
  {
    platform: 'MRI' as CompetitivePlatform,
    strongAt: ['enterprise real estate', 'lease management', 'tax/insurance workflows', 'reporting', 'large portfolio operations'],
    binCounterMove: 'Win with faster mid-market onboarding, UAE compliance packs, property passports, no-call maintenance, and government/institutional exports.',
  },
  {
    platform: 'Local UAE operators' as CompetitivePlatform,
    strongAt: ['relationships', 'Arabic service', 'local technician network', 'offline trust'],
    binCounterMove: 'Win by combining local service with app evidence, transparent owner reporting, SLA proof, and broker-led acquisition.',
  },
] as const;

export const UAE_DOMINATION_MODULES: Array<{
  id: string;
  role: PortalRole | 'cross-role';
  status: NoCallModuleStatus;
  title: string;
  problemSolved: string;
  buildSpec: string[];
  successMetric: string;
}> = [
  {
    id: 'tenant-one-tap-maintenance',
    role: 'tenant',
    status: 'build-now',
    title: 'Tenant One-Tap Maintenance',
    problemSolved: 'Tenants do not want to navigate a complex system when AC, plumbing, or electrical issues happen.',
    buildSpec: ['AC not cooling shortcut', 'Leak shortcut', 'Electrical issue shortcut', 'Exact service location required', 'Photo required before dispatch'],
    successMetric: '80% of tenant tickets created in under 90 seconds.',
  },
  {
    id: 'owner-approval-command-strip',
    role: 'owner',
    status: 'build-now',
    title: 'Owner Approval Command Strip',
    problemSolved: 'Owners need to know only what requires a decision now.',
    buildSpec: ['Pending cost approvals', 'High-risk tickets', 'Disputes', 'Expiring documents', 'Monthly cost variance'],
    successMetric: 'Owner approval response time below 12 hours in pilot.',
  },
  {
    id: 'technician-proof-engine',
    role: 'technician',
    status: 'build-now',
    title: 'Technician Proof Engine',
    problemSolved: 'Maintenance quality is hard to trust without structured field evidence.',
    buildSpec: ['GPS arrival', 'Before photos', 'After photos', 'Parts used', 'Tenant sign/decline', 'Rework flag'],
    successMetric: '95% completed jobs have full evidence pack.',
  },
  {
    id: 'broker-attribution-ledger',
    role: 'broker',
    status: 'build-now',
    title: 'Broker Attribution Ledger',
    problemSolved: 'Brokers need proof that they brought owner leads or contracts.',
    buildSpec: ['Referral link', 'QR lead capture', 'Owner contract linkage', 'Commission state timeline', 'Admin dispute resolution'],
    successMetric: '100% broker-sourced deals have attribution before contract activation.',
  },
  {
    id: 'sla-trust-center',
    role: 'cross-role',
    status: 'build-now',
    title: 'SLA Trust Center',
    problemSolved: 'Tenants, owners, technicians, and admins need one shared SLA truth.',
    buildSpec: ['One canonical SLA policy', 'Breach countdown', 'Escalation ladder', 'Owner-visible credits', 'Admin breach queue'],
    successMetric: 'Zero SLA disputes caused by inconsistent priority policy.',
  },
  {
    id: 'property-health-passport',
    role: 'owner',
    status: 'pilot-next',
    title: 'Property Health Passport',
    problemSolved: 'Owners lack a living asset record for defects, maintenance history, documents, and cost risk.',
    buildSpec: ['Asset registry', 'Inspection history', 'Recurring defects', 'Document expiry', 'Cost forecast', 'Insurance/export packet'],
    successMetric: 'Every pilot building has a health passport before month two.',
  },
  {
    id: 'monthly-owner-report',
    role: 'owner',
    status: 'pilot-next',
    title: 'Monthly Owner Report',
    problemSolved: 'Owners do not want to call to understand what happened in their property.',
    buildSpec: ['Tickets summary', 'Photos/evidence links', 'Spend', 'SLA performance', 'Tenant satisfaction', 'Next-month risks'],
    successMetric: 'Owner monthly report open rate above 75%.',
  },
  {
    id: 'admin-cost-leakage-radar',
    role: 'admin',
    status: 'pilot-next',
    title: 'Cost Leakage Radar',
    problemSolved: 'Property operations lose profit through repeat visits, weak diagnosis, parts leakage, and slow approvals.',
    buildSpec: ['Repeat issue detection', 'Parts anomaly detection', 'Technician rework rate', 'Vendor quote variance', 'Margin alert'],
    successMetric: 'Reduce repeat jobs by 20% within 90 days.',
  },
  {
    id: 'institutional-compliance-pack',
    role: 'cross-role',
    status: 'enterprise-phase',
    title: 'Institutional Compliance Pack',
    problemSolved: 'Schools, hotels, malls, and government clients need audit-ready reporting beyond normal maintenance tickets.',
    buildSpec: ['CRI index', 'Asset integrity score', 'DLD/ADM exports', 'Insurer export', 'Certificate verifier', 'Public verification links'],
    successMetric: 'First institutional pilot accepts generated monthly compliance packet.',
  },
];

export const PILOT_DOMINATION_METRICS = [
  { id: 'calls_avoided', label: 'Calls Avoided', target: '60% fewer maintenance follow-up calls' },
  { id: 'ticket_creation_speed', label: 'Ticket Creation Speed', target: 'Under 90 seconds for common tenant issue' },
  { id: 'first_response_time', label: 'First Response Time', target: 'Emergency under 10 minutes, high under 30 minutes' },
  { id: 'completion_evidence', label: 'Completion Evidence', target: '95% proof completeness' },
  { id: 'owner_approval_speed', label: 'Owner Approval Speed', target: 'Under 12 hours average' },
  { id: 'tenant_satisfaction', label: 'Tenant Satisfaction', target: '4.5/5 or better' },
  { id: 'repeat_issue_rate', label: 'Repeat Issue Rate', target: '20% reduction by day 90' },
  { id: 'broker_attribution', label: 'Broker Attribution', target: '100% broker-sourced deals traced' },
  { id: 'sla_dispute_rate', label: 'SLA Dispute Rate', target: 'Zero disputes from inconsistent policy' },
  { id: 'owner_retention_signal', label: 'Owner Retention Signal', target: '70%+ pilot owners agree to continue/expand' },
] as const;
