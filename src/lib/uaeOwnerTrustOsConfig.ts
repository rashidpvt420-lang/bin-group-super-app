export type TrustOsPriority = 'must-have' | 'high' | 'later';
export type TrustOsSurface = 'owner' | 'tenant' | 'technician' | 'admin' | 'broker' | 'vendor' | 'public';

export type OwnerTrustOsCapability = {
  id: string;
  title: string;
  priority: TrustOsPriority;
  surfaces: TrustOsSurface[];
  appCollection: string;
  businessReason: string;
  implementationRule: string;
  proofRequired: string[];
};

export type OwnerApprovalRule = {
  id: string;
  title: string;
  thresholdAed: number;
  rule: string;
};

export type MaintenanceTrustLedgerField = {
  key: string;
  label: string;
  ownerVisible: boolean;
  requiredForVerifiedClose: boolean;
};

export const UAE_OWNER_TRUST_OS_POSITIONING = {
  category: 'UAE-native owner trust operating system for maintenance and property management',
  winningMessage: 'We make every repair accountable.',
  productPromise:
    'Every maintenance request becomes a structured, owner-visible financial and operational record: intake, scope, quote, approval, dispatch, evidence, invoice, warranty, tenant verification, and reporting.',
  beachhead:
    'Dubai-first workflow for boutique property managers, leasing operators, landlord offices, and maintenance companies managing 50 to 3,000 units; Abu Dhabi expansion follows once the operating loop is proven.',
  safeMarketClaim:
    'A UAE-focused trust, procurement, and compliance workflow for maintenance and property management. Do not claim monopoly or regulator status unless formally approved by the relevant authority.',
};

export const UAE_OWNER_TRUST_OS_CAPABILITIES: OwnerTrustOsCapability[] = [
  {
    id: 'whatsapp-intake',
    title: 'WhatsApp-first bilingual intake',
    priority: 'must-have',
    surfaces: ['tenant', 'owner', 'admin'],
    appCollection: 'communication_intake',
    businessReason: 'Reduces app-install friction and converts messy calls, photos, and voice notes into structured work orders.',
    implementationRule: 'Require opt-in, store channel consent, preserve chat evidence, and route every incoming request to a ticket draft before dispatch.',
    proofRequired: ['channelConsentAt', 'sourceChannel', 'originalMessageRef', 'language', 'ticketDraftId'],
  },
  {
    id: 'voice-image-workorder',
    title: 'Voice-note and photo to work-order drafting',
    priority: 'must-have',
    surfaces: ['tenant', 'admin', 'technician'],
    appCollection: 'tickets',
    businessReason: 'Turns Arabic/English voice notes and damage images into standardised categories, urgency, trade, and scope drafts.',
    implementationRule: 'AI may draft category, urgency, scope, and trade; admin or dispatcher approval remains required before paid work or vendor commitment.',
    proofRequired: ['mediaRefs', 'aiDraft', 'humanApprovedBy', 'trade', 'urgency'],
  },
  {
    id: 'quote-benchmark-governance',
    title: 'Quote benchmark and approval governance',
    priority: 'must-have',
    surfaces: ['owner', 'admin', 'vendor'],
    appCollection: 'quotes',
    businessReason: 'Attacks the owner fear of opaque pricing by comparing quote scope, trade, area, amount, and final invoice.',
    implementationRule: 'Standardise scope before requesting bids; flag quote variance; require owner approval above configured thresholds.',
    proofRequired: ['standardScope', 'quoteBandAed', 'selectedQuoteId', 'variancePct', 'approvalRuleId'],
  },
  {
    id: 'three-quote-rfq',
    title: 'Three-quote RFQ engine for controlled jobs',
    priority: 'high',
    surfaces: ['admin', 'owner', 'vendor'],
    appCollection: 'vendor_rfqs',
    businessReason: 'Creates transparent procurement rather than informal contractor selection.',
    implementationRule: 'Require three comparable quotes for non-emergency work above threshold unless admin records an exception reason.',
    proofRequired: ['rfqId', 'vendorQuoteRefs', 'comparisonMatrix', 'exceptionReason'],
  },
  {
    id: 'maintenance-trust-ledger',
    title: 'Maintenance Trust Ledger',
    priority: 'must-have',
    surfaces: ['owner', 'tenant', 'technician', 'admin', 'public'],
    appCollection: 'maintenance_ledger',
    businessReason: 'Creates the private operational dataset competitors and government systems do not own end-to-end.',
    implementationRule: 'Every repair must write an immutable ledger event from intake through verified closeout and owner reporting.',
    proofRequired: ['ticketId', 'propertyId', 'ledgerHash', 'timeline', 'evidenceRefs', 'invoiceRef'],
  },
  {
    id: 'qr-property-passport',
    title: 'QR verified property maintenance passport',
    priority: 'must-have',
    surfaces: ['owner', 'tenant', 'broker', 'public'],
    appCollection: 'property_passports',
    businessReason: 'Turns service history, warranties, recurring faults, and verified evidence into a trust signal for owners, tenants, buyers, and brokers.',
    implementationRule: 'Public pages must expose only safe, approved maintenance history and never leak tenant private data, staff data, or unpaid invoice details.',
    proofRequired: ['publicSlug', 'visibilityPolicy', 'verifiedJobsCount', 'warrantyRefs', 'lastVerifiedAt'],
  },
  {
    id: 'move-in-move-out-chain',
    title: 'Move-in and move-out evidence chain',
    priority: 'high',
    surfaces: ['owner', 'tenant', 'admin', 'broker'],
    appCollection: 'moveout_requests',
    businessReason: 'Creates tamper-evident comparison packs for deposit disputes, vacancy turn, damage attribution, and re-letting readiness.',
    implementationRule: 'Capture room-by-room condition, media, meter readings, keys, handover signatures, and repair deductions with audit timestamps.',
    proofRequired: ['conditionChecklist', 'beforeRefs', 'afterRefs', 'meterReadings', 'handoverSignatures'],
  },
  {
    id: 'offline-technician-mode',
    title: 'Offline-first technician execution',
    priority: 'must-have',
    surfaces: ['technician', 'admin'],
    appCollection: 'offline_work_logs',
    businessReason: 'Technicians work in basements, plant rooms, rooftops, and weak-signal areas; evidence cannot disappear when connectivity drops.',
    implementationRule: 'Queue check-in, photos, materials, notes, safety checks, and closeout locally; sync with conflict resolution when signal returns.',
    proofRequired: ['offlineSessionId', 'syncedAt', 'gpsSnapshot', 'beforePhotoRef', 'afterPhotoRef'],
  },
  {
    id: 'owner-pl-reporting',
    title: 'Owner P&L and yield reporting',
    priority: 'high',
    surfaces: ['owner', 'admin'],
    appCollection: 'owner_reports',
    businessReason: 'Gives owners monthly or quarterly operating statements for rent, service charges, maintenance costs, management fees, invoices, and tax-readiness context where relevant.',
    implementationRule: 'Do not imply every small natural-person landlord owes UAE corporate tax; present reporting as financial visibility and entity-level readiness.',
    proofRequired: ['reportPeriod', 'rentLedgerRef', 'maintenanceSpendAed', 'managementFeeAed', 'exportedAt'],
  },
  {
    id: 'vendor-scorecard',
    title: 'Contractor scorecard and repeat-fault ranking',
    priority: 'high',
    surfaces: ['admin', 'owner', 'vendor'],
    appCollection: 'vendor_scorecards',
    businessReason: 'Builds a contractor marketplace moat around price accuracy, SLA performance, proof quality, repeat faults, and owner satisfaction.',
    implementationRule: 'Score only verified completed work; weight repeat faults, dispute rate, SLA misses, quote variance, and proof completeness.',
    proofRequired: ['completedJobs', 'slaRatePct', 'repeatFaultRatePct', 'disputeRatePct', 'proofCoveragePct'],
  },
  {
    id: 'privacy-consent-guardrails',
    title: 'PDPL-aware media, location, chat, and voice retention controls',
    priority: 'must-have',
    surfaces: ['tenant', 'owner', 'technician', 'admin', 'vendor'],
    appCollection: 'data_governance_events',
    businessReason: 'Property evidence includes personal data, locations, photos, voice notes, and chat histories; trust in data handling is product trust.',
    implementationRule: 'Record consent/lawful basis, retention class, role access, media visibility, export log, and deletion eligibility for evidence objects.',
    proofRequired: ['lawfulBasis', 'retentionClass', 'roleAccess', 'exportLog', 'deleteAfter'],
  },
];

export const UAE_OWNER_APPROVAL_RULES: OwnerApprovalRule[] = [
  { id: 'auto-under-500', title: 'Auto-approve low-risk repair', thresholdAed: 500, rule: 'Auto-approve non-emergency low-risk repairs when property owner enabled silent mode and vendor score is trusted.' },
  { id: 'owner-approval-over-500', title: 'Owner approval required', thresholdAed: 500, rule: 'Require explicit owner approval when cost exceeds AED 500 unless emergency safety override is recorded.' },
  { id: 'three-quotes-over-1500', title: 'Three quotes required', thresholdAed: 1500, rule: 'Require three comparable quotes for non-emergency work above AED 1,500 or record admin exception.' },
];

export const MAINTENANCE_TRUST_LEDGER_FIELDS: MaintenanceTrustLedgerField[] = [
  { key: 'issueType', label: 'Issue type', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'urgency', label: 'Urgency', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'trade', label: 'Required trade', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'estimateBandAed', label: 'Estimate band', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'finalQuoteAed', label: 'Final quote', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'approvalRuleId', label: 'Approval rule', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'vendorId', label: 'Vendor or technician', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'slaTargetAt', label: 'SLA target', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'beforePhotoRef', label: 'Before evidence', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'afterPhotoRef', label: 'After evidence', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'gpsCheckIn', label: 'Location check-in', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'invoiceRef', label: 'Invoice reference', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'warrantyImpact', label: 'Warranty impact', ownerVisible: true, requiredForVerifiedClose: false },
  { key: 'tenantVerification', label: 'Tenant verification', ownerVisible: true, requiredForVerifiedClose: true },
  { key: 'satisfactionOutcome', label: 'Satisfaction outcome', ownerVisible: true, requiredForVerifiedClose: false },
];

export const UAE_LAUNCH_TRADE_COVERAGE = [
  'AC',
  'Plumbing',
  'Electrical',
  'Handyman',
  'Pest control',
  'Annual maintenance contracts',
] as const;

export function getMustHaveOwnerTrustCapabilities() {
  return UAE_OWNER_TRUST_OS_CAPABILITIES.filter((capability) => capability.priority === 'must-have');
}

export function getOwnerTrustCapabilitiesBySurface(surface: TrustOsSurface) {
  return UAE_OWNER_TRUST_OS_CAPABILITIES.filter((capability) => capability.surfaces.includes(surface));
}

export function buildLedgerCompletenessChecklist(record: Record<string, unknown>) {
  return MAINTENANCE_TRUST_LEDGER_FIELDS.map((field) => ({
    ...field,
    present: Boolean(record[field.key]),
  }));
}

export function getApprovalRuleForAmount(amountAed: number): OwnerApprovalRule {
  if (amountAed > 1500) {
    return UAE_OWNER_APPROVAL_RULES.find((rule) => rule.id === 'three-quotes-over-1500')!;
  }
  if (amountAed > 500) {
    return UAE_OWNER_APPROVAL_RULES.find((rule) => rule.id === 'owner-approval-over-500')!;
  }
  return UAE_OWNER_APPROVAL_RULES.find((rule) => rule.id === 'auto-under-500')!;
}

export function getQuoteAwardGate(amountAed: number, quotesReceived: number) {
  const minimumQuotes = amountAed > 1500 ? 3 : 1;
  return {
    rule: getApprovalRuleForAmount(amountAed),
    minimumQuotes,
    received: quotesReceived,
    allowed: quotesReceived >= minimumQuotes,
  };
}

export function getQuoteBenchmark(amounts: number[]) {
  const valid = amounts.filter((amount) => Number.isFinite(amount) && amount > 0);
  if (valid.length === 0) return null;
  const average = valid.reduce((sum, amount) => sum + amount, 0) / valid.length;
  return {
    average,
    deviationPct: (amount: number) => (average > 0 ? ((amount - average) / average) * 100 : 0),
  };
}
