export type TrustFeature = {
  title: string;
  problem: string;
  solution: string;
  ownerValue: string;
  tenantValue?: string;
  launchMetric: string;
};

export const UAE_TRUST_FEATURES: TrustFeature[] = [
  {
    title: 'BIN Property Trust Passport',
    problem: 'Owners do not know the real condition, risk, or proof history of each property.',
    solution: 'Create a property trust card with health score, AC/water/electrical risk, contract status, last service, open risks, SLA performance, photos, and QR verification.',
    ownerValue: 'Clear asset condition and proof before spending money.',
    tenantValue: 'Better maintained property with fewer repeated failures.',
    launchMetric: 'Every active property has a passport score and latest proof date.',
  },
  {
    title: 'Tenant Happiness & Response Score',
    problem: 'Owners cannot see tenant frustration until it becomes a complaint or vacancy risk.',
    solution: 'Track average response time, completion time, tenant rating, dispute rate, repeat issue rate, and emergency response history.',
    ownerValue: 'Early warning before tenant churn and reputation damage.',
    tenantValue: 'Visible service quality and faster escalation.',
    launchMetric: 'Each building shows response time, completion time, rating, and dispute rate.',
  },
  {
    title: 'AC Summer Protection Plan',
    problem: 'AC failure is one of the highest-emotion maintenance issues in the UAE.',
    solution: 'Run pre-summer AC inspection, filter cleaning schedule, compressor risk, gas leak checks, emergency AC priority, tenant comfort score, and monthly owner AC report.',
    ownerValue: 'Fewer emergency AC failures and more predictable cost.',
    tenantValue: 'Higher comfort during UAE summer.',
    launchMetric: 'AC assets have summer readiness status and next service date.',
  },
  {
    title: 'Owner Approval Thresholds',
    problem: 'Owners fear uncontrolled maintenance spending.',
    solution: 'Let owners define auto-approve, notify, approval-required, emergency-audit, preferred vendor, and blocked vendor rules.',
    ownerValue: 'Spending control without slowing urgent work.',
    tenantValue: 'Faster approvals for small works and clear escalation for large works.',
    launchMetric: 'Every owner can set thresholds by amount and emergency status.',
  },
  {
    title: 'Move-in / Move-out Evidence System',
    problem: 'Deposit and damage disputes happen because handover evidence is weak.',
    solution: 'Capture room photos, meters, AC condition, wall/paint condition, appliances, keys/cards/remotes, tenant signature, and owner report.',
    ownerValue: 'Defensible handover and fewer damage disputes.',
    tenantValue: 'Fair move-in/move-out proof and less unfair blame.',
    launchMetric: 'Each unit can hold move-in and move-out evidence bundles.',
  },
  {
    title: 'Vendor Trust Marketplace',
    problem: 'Owners cannot judge vendor quality, compliance, or repeated failures.',
    solution: 'Verify trade licence, insurance, trade category, past job score, response time, complaint rate, warranty, and suspension status.',
    ownerValue: 'Safer vendor selection with audit trail.',
    tenantValue: 'Better workmanship and fewer repeat visits.',
    launchMetric: 'Vendor profile includes verification and performance status.',
  },
  {
    title: 'Maintenance Warranty Ledger',
    problem: 'Owners hate paying twice for the same problem.',
    solution: 'Record warranty days, covered parts, covered labour, expiry, responsible technician/vendor, reopen button, and repeat issue warning.',
    ownerValue: 'Payment protection and repeat-issue control.',
    tenantValue: 'Repeat issue can be reopened under warranty.',
    launchMetric: 'Every completed ticket has warranty status and expiry.',
  },
  {
    title: 'SLA Credits & Refund Logic',
    problem: 'Service promises are weak unless failure has a consequence.',
    solution: 'Escalate late emergency assignments, warn late technicians, block payout without proof, credit repeated failures, and route disputes to admin review.',
    ownerValue: 'Accountability and visible service discipline.',
    tenantValue: 'Faster escalation when service is late or incomplete.',
    launchMetric: 'SLA status appears on tickets and reports.',
  },
  {
    title: 'Broker Commission Lifecycle',
    problem: 'Brokers lose trust when owner conversion and commission status are unclear.',
    solution: 'Track referral link, owner conversion, contract signed, payment received, commission payable, withdrawal request, and admin approval.',
    ownerValue: 'Cleaner acquisition channel and accountable referrals.',
    launchMetric: 'Each broker lead has conversion and commission status.',
  },
  {
    title: 'Launch Evidence Dashboard',
    problem: 'Hard public launch cannot be trusted without proof gates.',
    solution: 'Show Firebase Auth, Storage, Functions, FCM, GPS, AI, payment, PWA, PDF, RTL, every-button, and logout proof status.',
    ownerValue: 'Public proof that the platform is tested before full launch.',
    launchMetric: 'No hard launch until all required gates are passed or formally waived.',
  },
];

export const OWNER_SPENDING_THRESHOLDS = [
  { band: 'AED 0 - 250', decision: 'Auto-approve routine work', control: 'Still requires photo proof and ticket notes' },
  { band: 'AED 251 - 1,000', decision: 'Notify owner before work starts', control: 'Owner receives quote and scope summary' },
  { band: 'AED 1,001+', decision: 'Owner approval required', control: 'RFQ/vendor comparison and approval center' },
  { band: 'Emergency', decision: 'Proceed only if safety/property risk exists', control: 'Admin audit and owner notification required' },
];

export const UAE_TRUST_CENTER_POLICIES = [
  'No high-cost work without owner approval unless it is a documented emergency.',
  'No technician payout without before/after evidence where photo proof is required.',
  'No closed ticket without status timeline, notes, and tenant approval or dispute window.',
  'No vendor award without RFQ trail when threshold rules require comparison.',
  'No public hard launch until required production proof gates are passed or formally waived.',
  'No hidden AI decision: AI can triage and recommend, but admin/owner approval controls high-risk actions.',
  'No unclear payment flow: 15% mobilization, payment plan, manual bank/admin verification, and invoices must be visible.',
  'No unbounded staff dispatch: technician readiness, safety, HR documents, and compliance status must be visible to admin.',
];
