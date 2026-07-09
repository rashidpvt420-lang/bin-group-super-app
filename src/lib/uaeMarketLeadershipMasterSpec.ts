export type MarketLeadershipPriority = 'must-have' | 'high' | 'medium' | 'later';
export type MarketLeadershipPhase = 'mvp' | 'pilot' | 'scale' | 'partnership';
export type MarketLeadershipSurface =
  | 'public'
  | 'owner'
  | 'tenant'
  | 'technician'
  | 'vendor'
  | 'broker'
  | 'admin'
  | 'hr'
  | 'finance'
  | 'hse'
  | 'operations';

export type MarketLeadershipCapability = {
  id: string;
  title: string;
  phase: MarketLeadershipPhase;
  priority: MarketLeadershipPriority;
  surfaces: MarketLeadershipSurface[];
  promise: string;
  implementation: string;
  proofFields: string[];
  antiMistakeRule: string;
};

export type MarketLeadershipCollection = {
  collection: string;
  owner: MarketLeadershipSurface;
  purpose: string;
  hardenedRuleRequired: boolean;
  publicSafe: boolean;
};

export type MarketLeadershipGate = {
  id: string;
  title: string;
  mustPassBefore: 'controlled-pilot' | 'public-launch' | 'enterprise-sales';
  proofCommandOrEvidence: string;
};

export const UAE_MARKET_LEADERSHIP_POSITIONING = {
  category: 'UAE-native owner trust operating system for maintenance, property management, and field workforce compliance',
  winningMessage: 'We make every repair accountable.',
  ownerPromise:
    'Every repair becomes a faster, cheaper, transparent, approval-governed, and auditable financial record for the owner.',
  workforcePromise:
    'Every worker, shift, permit, payroll event, safety case, and property job card is controlled in one UAE field-workforce operating graph.',
  beachhead:
    'Dubai-first controlled pilot for boutique property managers, leasing operators, landlord offices, maintenance companies, and FM operators managing 50 to 3,000 units; Abu Dhabi follows after workflow proof.',
  safeClaim:
    'Position BIN GROUP as a regulator-aligned private operating layer, not as a regulator, government registry, tax authority, or replacement for Dubai REST, Ejari, DLD, DARI, ADREC, MoHRE, ICP, GDRFA, or WPS rails.',
  taxPositioning:
    'Owner P&L is for yield, service-charge, maintenance-spend, management-fee, invoice, VAT, and entity-level tax-readiness visibility. Do not imply every natural-person landlord owes UAE corporate tax.',
};

export const UAE_MARKET_REALITY_MAP = {
  regulatorSystems: [
    'Dubai REST / DLD digital owner and tenant layer',
    'Ejari tenancy and management-contract workflows',
    'ADREC / DARI PMA, lease, owner-association, market-data, and API programmes',
    'Madhmoun-style listing and advertising authenticity signals',
  ],
  competitorLayers: [
    'Property operations platforms: HappyTenant, MRI, Urbanise',
    'Enterprise FM and CMMS platforms: Facilio, PlanRadar-style field systems',
    'Consumer service marketplaces: Justlife, ServiceMarket-style home service supply',
    'Portal and lead ecosystems: Bayut, Dubizzle, Property Finder-style lead and listing flows',
  ],
  strategicGap:
    'No incumbent cleanly owns the UAE owner-control layer that combines messaging intake, quote benchmarking, approval governance, contractor accountability, maintenance proof, reporting, and field-workforce compliance in one private operating dataset.',
};

export const UAE_PROPERTY_TRUST_OS_LOOP = [
  'WhatsApp, app, broker, owner, or tenant intake with opt-in and source evidence',
  'Voice, image, and text converted into a structured work-order draft',
  'Human-reviewed category, trade, urgency, site, and scope standardisation',
  'Quote benchmark, threshold rule, three-quote RFQ, or emergency override',
  'Owner approval or pre-approved auto-approval rule',
  'Technician/vendor dispatch with certificate, distance, SLA, and availability checks',
  'Offline-safe site attendance, QR scan, before/after proof, material usage, and safety checklist',
  'Tenant verification, owner-visible ledger closeout, invoice match, warranty update, and repeat-fault tracking',
  'Monthly or quarterly owner P&L, yield, maintenance-spend, and trust passport reporting',
] as const;

export const UAE_OWNER_TRUST_MASTER_CAPABILITIES: MarketLeadershipCapability[] = [
  {
    id: 'whatsapp-business-intake',
    title: 'WhatsApp Business intake with opt-in and evidence capture',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['tenant', 'owner', 'admin', 'operations'],
    promise: 'Tenants and owners can report issues without app-install friction while BIN GROUP keeps consent and evidence clean.',
    implementation: 'Capture channel opt-in, phone, language, message type, media refs, voice note refs, original message ref, and ticket draft link before dispatch.',
    proofFields: ['channelOptInAt', 'sourceChannel', 'whatsappMessageRef', 'language', 'ticketDraftId'],
    antiMistakeRule: 'Never send unsolicited WhatsApp messages and never treat chatbot output as final approval.',
  },
  {
    id: 'bilingual-voice-image-workorder',
    title: 'Arabic/English voice-note and photo to work-order draft',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['tenant', 'owner', 'admin', 'technician'],
    promise: 'Messy voice notes and damage images become clean work orders with category, urgency, trade, and scope.',
    implementation: 'Use AI only to draft issue type, urgency, required trade, risk, and scope; dispatcher approval is required before paid work.',
    proofFields: ['mediaRefs', 'transcript', 'aiDraft', 'humanApprovedBy', 'trade', 'urgency'],
    antiMistakeRule: 'AI classification cannot approve quotes, payroll, legal, safety, or employment-impacting decisions.',
  },
  {
    id: 'quote-benchmark-approval-governance',
    title: 'Quote benchmarking and owner approval governance',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['owner', 'admin', 'vendor', 'finance'],
    promise: 'Owners see why a repair costs what it costs and when approval is required.',
    implementation: 'Store standard scope, price band, quote variance, selected vendor, invoice match, and approval threshold result.',
    proofFields: ['standardScope', 'estimateBandAed', 'quoteBandAed', 'variancePct', 'approvalRuleId', 'invoiceMatchStatus'],
    antiMistakeRule: 'Do not award high-value non-emergency work without three quotes or a logged exception.',
  },
  {
    id: 'three-quote-rfq-engine',
    title: 'Three-quote RFQ engine above threshold',
    phase: 'pilot',
    priority: 'high',
    surfaces: ['owner', 'admin', 'vendor'],
    promise: 'Procurement becomes comparable, auditable, and owner-safe.',
    implementation: 'Require three comparable vendor quotes above AED 1,500 for non-emergency work; capture comparison matrix and exception reasons.',
    proofFields: ['rfqId', 'minimumQuotes', 'vendorQuoteRefs', 'comparisonMatrix', 'exceptionReason'],
    antiMistakeRule: 'Emergency overrides must record safety reason, approver, timestamp, and post-job audit.',
  },
  {
    id: 'maintenance-trust-ledger',
    title: 'Maintenance Trust Ledger',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['owner', 'tenant', 'technician', 'vendor', 'admin', 'public'],
    promise: 'Every repair creates the private operational dataset that proves accountability.',
    implementation: 'Write immutable ledger events for intake, triage, approval, dispatch, check-in, evidence, closeout, invoice, warranty, dispute, and owner report.',
    proofFields: ['ledgerHash', 'ticketId', 'propertyId', 'timeline', 'evidenceRefs', 'invoiceRef', 'warrantyImpact'],
    antiMistakeRule: 'Never delete or overwrite evidence events; append corrections with actor, reason, and timestamp.',
  },
  {
    id: 'qr-property-maintenance-passport',
    title: 'QR property maintenance passport',
    phase: 'pilot',
    priority: 'must-have',
    surfaces: ['owner', 'tenant', 'broker', 'public'],
    promise: 'A safe public trust page can show approved maintenance history, warranties, recurring-fault patterns, and verified service state.',
    implementation: 'Expose only owner-approved, privacy-safe summaries; hide tenant data, staff data, private chat, location traces, and unpaid invoice detail.',
    proofFields: ['publicSlug', 'visibilityPolicy', 'verifiedJobsCount', 'warrantyRefs', 'lastVerifiedAt'],
    antiMistakeRule: 'Public passport must never claim government verification unless an official integration or approval exists.',
  },
  {
    id: 'owner-pl-yield-reporting',
    title: 'Owner P&L, yield, and maintenance cost reporting',
    phase: 'pilot',
    priority: 'high',
    surfaces: ['owner', 'admin', 'finance'],
    promise: 'Owners get monthly or quarterly operating statements instead of scattered invoices and WhatsApp updates.',
    implementation: 'Combine rent ledger, service charges, management fees, maintenance spend, invoices, SLA credits, warranty recoveries, and export-ready statements.',
    proofFields: ['reportPeriod', 'rentLedgerRef', 'maintenanceSpendAed', 'managementFeeAed', 'invoiceRefs', 'exportedAt'],
    antiMistakeRule: 'Tax language must remain readiness and reporting support; do not present automated tax advice as official advice.',
  },
  {
    id: 'move-in-move-out-evidence-chain',
    title: 'Move-in / move-out evidence chain',
    phase: 'pilot',
    priority: 'high',
    surfaces: ['owner', 'tenant', 'broker', 'admin'],
    promise: 'Deposit disputes, vacancy turns, damage attribution, and re-letting readiness become evidence-led.',
    implementation: 'Capture room condition, photos, videos, meter readings, keys, handover signatures, repair deductions, and tamper-evident comparison packs.',
    proofFields: ['conditionChecklist', 'beforeRefs', 'afterRefs', 'meterReadings', 'keyRegister', 'handoverSignatures'],
    antiMistakeRule: 'No deduction should be shown as final without owner/tenant evidence trail and dispute window status.',
  },
  {
    id: 'vendor-scorecard-repeat-faults',
    title: 'Vendor scorecard and repeat-fault ranking',
    phase: 'scale',
    priority: 'high',
    surfaces: ['owner', 'admin', 'vendor'],
    promise: 'The contractor marketplace moat comes from performance evidence, not provider listing alone.',
    implementation: 'Score verified jobs by SLA, quote variance, proof quality, dispute rate, repeat-fault rate, warranty reliability, and owner satisfaction.',
    proofFields: ['completedJobs', 'slaRatePct', 'quoteVariancePct', 'repeatFaultRatePct', 'disputeRatePct', 'proofCoveragePct'],
    antiMistakeRule: 'Do not rank vendors on unverified, private, discriminatory, or employment-sensitive data.',
  },
  {
    id: 'portal-listing-verification-path',
    title: 'Verified maintenance record for future portal partnerships',
    phase: 'partnership',
    priority: 'later',
    surfaces: ['broker', 'owner', 'public'],
    promise: 'A verified maintenance record can become a listing conversion asset before formal portal badge integrations.',
    implementation: 'Start with public verified maintenance pages; pursue Bayut/Dubizzle/Property Finder partnerships only after adoption proof.',
    proofFields: ['publicRecordUrl', 'ownerApprovalAt', 'brokerShareLog', 'portalPartnerStatus'],
    antiMistakeRule: 'Do not promise a Property Finder, Dubizzle, or Bayut badge until a signed partnership/API path exists.',
  },
  {
    id: 'privacy-consent-retention-guardrails',
    title: 'PDPL-aware consent, retention, and access controls',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['tenant', 'owner', 'technician', 'vendor', 'admin', 'hr'],
    promise: 'Photos, voice notes, chats, GPS, and repair records are handled as trust data, not loose attachments.',
    implementation: 'Attach lawful basis, consent channel, retention class, role access, export log, deletion eligibility, and media visibility to evidence objects.',
    proofFields: ['lawfulBasis', 'consentRef', 'retentionClass', 'roleAccessPolicy', 'exportLog', 'deleteAfter'],
    antiMistakeRule: 'Never expose private media publicly or across roles without explicit visibility policy.',
  },
];

export const UAE_HR_WORKFORCE_MASTER_CAPABILITIES: MarketLeadershipCapability[] = [
  {
    id: 'uae-compliance-engine',
    title: 'Entity-level UAE labour compliance engine',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['hr', 'admin', 'finance'],
    promise: 'Mainland, DIFC, ADGM, and configurable free-zone rules can be controlled by legal entity instead of hard-coded globally.',
    implementation: 'Store jurisdiction, legal entity, work location, employment type, rule-pack version, and compliance approval history.',
    proofFields: ['legalEntityId', 'jurisdiction', 'workLocationEmirate', 'employmentType', 'rulePackVersion'],
    antiMistakeRule: 'No compliance rule should be global-only; every rule must be entity and jurisdiction aware.',
  },
  {
    id: 'visa-document-lifecycle',
    title: 'Visa, permit, Emirates ID, medical, insurance, and document lifecycle',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['hr', 'admin', 'operations'],
    promise: 'Missed renewals become visible before they become operational or legal failures.',
    implementation: 'Track passport, work permit, medical, Emirates ID, residency, contract, insurance, licences, certificates, accommodation, and renewal blockers.',
    proofFields: ['permitStatus', 'medicalStatus', 'emiratesIdStatus', 'residencyStatus', 'insuranceStatus', 'expiryAt'],
    antiMistakeRule: 'Workers may upload evidence, but HR controls official status, dates, approvals, and rejection reasons.',
  },
  {
    id: 'payroll-wps-eosb-settlement',
    title: 'Payroll, WPS, EOSB, and final settlement',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['finance', 'hr', 'admin'],
    promise: 'The monthly payroll workflow becomes auditable, WPS-ready, and settlement-safe.',
    implementation: 'Generate payroll runs, SIF/WPS-ready files, payslips, payment reconciliation, salary queries, EOSB, final settlement, and seven-year record retention.',
    proofFields: ['basicSalaryAed', 'allowancesAed', 'deductionsAed', 'netPayAed', 'payrollRunId', 'wpsStatus', 'retentionUntil'],
    antiMistakeRule: 'Workers can query payroll but cannot alter approved payroll, WPS status, EOSB inputs, or finance approvals.',
  },
  {
    id: 'offline-field-attendance-geofence',
    title: 'Offline field attendance, geofence, and job-card linkage',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['technician', 'operations', 'hr', 'finance'],
    promise: 'Basements, plant rooms, rooftops, and weak-signal sites no longer break attendance or payroll evidence.',
    implementation: 'Queue clock-in/out, property QR scan, job linkage, GPS snapshot, missed-punch reason, and sync status for supervisor review.',
    proofFields: ['attendanceEventId', 'offlineSessionId', 'propertyId', 'jobCardId', 'gpsSnapshot', 'syncedAt'],
    antiMistakeRule: 'Offline records must sync with conflict review instead of silently overwriting live attendance.',
  },
  {
    id: 'shift-overtime-heat-stress-controls',
    title: 'Shift, overtime, break, and heat-stress controls',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['operations', 'hr', 'hse', 'finance'],
    promise: 'Rosters catch risk before work starts and before payroll closes.',
    implementation: 'Flag excess overtime, missing breaks, direct-sun work during restricted windows, certificate mismatch, and emergency coverage gaps.',
    proofFields: ['shiftStartAt', 'shiftEndAt', 'breakMinutes', 'overtimeMinutes', 'outdoorWork', 'heatMitigationChecklist'],
    antiMistakeRule: 'Heat-risk exceptions require HSE/admin approval, mitigation evidence, and post-shift audit.',
  },
  {
    id: 'whatsapp-worker-self-service',
    title: 'WhatsApp-first worker self-service',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['hr', 'technician', 'operations'],
    promise: 'Workers can handle routine HR and field cases without a heavy app workflow.',
    implementation: 'Support shift reminders, late reasons, leave requests, document reminders, payslip retrieval, incident escalation, and multilingual responses.',
    proofFields: ['workerOptInAt', 'requestType', 'language', 'caseId', 'officialResponseRef', 'closedAt'],
    antiMistakeRule: 'The bot can collect and explain; it cannot approve leave, payroll, discipline, or safety closure without human approval.',
  },
  {
    id: 'safety-incidents-ppe-toolbox',
    title: 'Safety, incidents, PPE, and toolbox talks',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['technician', 'hse', 'operations', 'admin'],
    promise: 'Injuries, near misses, heat risk, PPE issues, and corrective actions are captured as controlled evidence.',
    implementation: 'Capture incident photos, witness notes, severity draft, medical escalation, PPE issue, toolbox attendance, corrective action, and HSE closeout.',
    proofFields: ['incidentType', 'severity', 'siteId', 'photos', 'witnesses', 'medicalEscalation', 'correctiveAction'],
    antiMistakeRule: 'AI can classify incident photos, but HSE/admin must approve final severity and closure.',
  },
  {
    id: 'training-certification-dispatch-readiness',
    title: 'Training, licence, certificate, and dispatch readiness',
    phase: 'pilot',
    priority: 'high',
    surfaces: ['technician', 'operations', 'hr'],
    promise: 'Only qualified and currently valid people are dispatched to sensitive jobs.',
    implementation: 'Match job trade, site requirement, certificate expiry, driving licence, HSE status, and property access clearance before dispatch.',
    proofFields: ['certificateType', 'expiryAt', 'trade', 'dispatchEligible', 'approvedBy', 'propertyAccessStatus'],
    antiMistakeRule: 'Do not dispatch expired, rejected, or unapproved certificate profiles to regulated/high-risk work.',
  },
  {
    id: 'contractor-employee-separation',
    title: 'Contractor versus employee workflow separation',
    phase: 'pilot',
    priority: 'high',
    surfaces: ['hr', 'admin', 'vendor', 'finance'],
    promise: 'Employees, part-time labour, temporary permits, subcontractors, and vendor technicians are treated with correct permissions and commercial logic.',
    implementation: 'Separate party type, permit route, payroll/WPS eligibility, invoice route, insurance proof, access permissions, and job evidence requirements.',
    proofFields: ['partyType', 'permitType', 'commercialStatus', 'wpsEligible', 'vendorId', 'systemRole'],
    antiMistakeRule: 'Never mix employee payroll rules with vendor invoice workflows or contractor access rights.',
  },
  {
    id: 'hr-property-job-cost-linkage',
    title: 'HR-to-property job-cost linkage',
    phase: 'scale',
    priority: 'high',
    surfaces: ['owner', 'hr', 'operations', 'finance', 'admin'],
    promise: 'BIN GROUP can prove who attended which asset, at which property, under which certificate, with what labour cost and safety state.',
    implementation: 'Link attendance, certificates, job cards, property, asset, materials, payroll cost, SLA attribution, and safety case records.',
    proofFields: ['employeeId', 'propertyId', 'assetId', 'jobCardId', 'certificateId', 'labourCostAed', 'safetyCaseId'],
    antiMistakeRule: 'Owner-facing labour analytics must aggregate or permission personal data according to role and privacy policy.',
  },
  {
    id: 'biometrics-ai-dpia-control',
    title: 'Biometrics, AI, and DPIA governance',
    phase: 'mvp',
    priority: 'must-have',
    surfaces: ['hr', 'admin', 'hse'],
    promise: 'High-risk HR processing is governed before it becomes a legal or trust problem.',
    implementation: 'Require lawful basis, minimisation, role access, DPIA status, AI decision boundary, human reviewer, and audit log for biometric, health, incident, and employment-impacting workflows.',
    proofFields: ['dataCategory', 'lawfulBasis', 'dpiaRequired', 'roleAccessPolicy', 'humanReviewerId', 'auditLogRef'],
    antiMistakeRule: 'No autonomous adverse employment decision is allowed from AI scoring or biometric data.',
  },
];

export const UAE_MARKET_LEADERSHIP_DATA_MODEL: MarketLeadershipCollection[] = [
  { collection: 'communication_intake', owner: 'operations', purpose: 'WhatsApp/app/call intake, opt-in, media refs, language, and ticket draft evidence.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'maintenance_ledger', owner: 'admin', purpose: 'Immutable repair timeline from intake to owner report.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'quote_benchmarks', owner: 'finance', purpose: 'Trade, area, scope, estimate band, quote variance, and invoice matching.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'vendor_rfqs', owner: 'operations', purpose: 'Three-quote procurement, comparison matrix, exception reason, and award decision.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'property_passports', owner: 'owner', purpose: 'Owner-approved safe maintenance passport summaries and warranty status.', hardenedRuleRequired: true, publicSafe: true },
  { collection: 'owner_reports', owner: 'finance', purpose: 'Owner P&L, yield, service charge, management fee, invoice, VAT, and export-ready reporting.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'move_evidence_chains', owner: 'operations', purpose: 'Move-in/out condition packs, meter readings, keys, deductions, signatures, and dispute window.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'employees', owner: 'hr', purpose: 'Employee master, visa, Emirates ID, medical, insurance, certificate, accommodation, and dispatch readiness.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'payroll_runs', owner: 'finance', purpose: 'Payroll close, WPS status, payslip, EOSB, salary query, settlement, and retention records.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'attendance_events', owner: 'operations', purpose: 'Clock-in/out, offline queue, geofence, QR scan, job-card linkage, and payroll-impact evidence.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'shift_rosters', owner: 'operations', purpose: 'Shift, overtime, break, heat-risk, certificate matching, and emergency coverage control.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'safety_cases', owner: 'hse', purpose: 'Incident, near-miss, PPE, toolbox, medical escalation, corrective action, and HSE closure.', hardenedRuleRequired: true, publicSafe: false },
  { collection: 'data_governance_events', owner: 'admin', purpose: 'Consent, lawful basis, retention class, role access, export logs, DPIA, and deletion eligibility.', hardenedRuleRequired: true, publicSafe: false },
];

export const UAE_RELEASE_GATES: MarketLeadershipGate[] = [
  {
    id: 'no-generic-app-positioning',
    title: 'Public copy says owner trust OS, not generic maintenance app',
    mustPassBefore: 'controlled-pilot',
    proofCommandOrEvidence: 'Route /uae-market-leadership renders the winning message and safe-claim language.',
  },
  {
    id: 'whatsapp-consent-before-ticket',
    title: 'WhatsApp intake cannot create final jobs without opt-in and human review',
    mustPassBefore: 'controlled-pilot',
    proofCommandOrEvidence: 'communication_intake records include channelOptInAt, sourceChannel, ticketDraftId, and humanApprovedBy before dispatch.',
  },
  {
    id: 'owner-approval-and-three-quotes',
    title: 'Quote governance is enforced above AED 500 / AED 1,500 thresholds',
    mustPassBefore: 'public-launch',
    proofCommandOrEvidence: 'Quote award gate requires owner approval above AED 500 and three comparable quotes above AED 1,500 unless emergency exception exists.',
  },
  {
    id: 'trust-ledger-append-only',
    title: 'Maintenance Trust Ledger is append-only and evidence-led',
    mustPassBefore: 'public-launch',
    proofCommandOrEvidence: 'Firestore rules/functions prevent unsafe client writes and all closeouts include ledgerHash, evidenceRefs, invoiceRef, and actor trail.',
  },
  {
    id: 'public-passport-privacy-safe',
    title: 'QR property passport exposes only approved safe summaries',
    mustPassBefore: 'public-launch',
    proofCommandOrEvidence: 'Public passport route hides tenant private data, worker data, exact GPS, private media, and unpaid invoice details.',
  },
  {
    id: 'hr-payroll-wps-entity-controls',
    title: 'HR compliance is entity-aware and payroll/WPS controlled',
    mustPassBefore: 'enterprise-sales',
    proofCommandOrEvidence: 'Employee and payroll records include legalEntityId, jurisdiction, payrollRunId, WPS status, approval, and retention policy.',
  },
  {
    id: 'offline-field-attendance-sync',
    title: 'Offline technician attendance sync has conflict review',
    mustPassBefore: 'public-launch',
    proofCommandOrEvidence: 'Offline sessions write queued events with syncedAt and supervisor exception handling before payroll impact.',
  },
  {
    id: 'ai-human-approval-boundary',
    title: 'AI is assistive only for employment, payroll, safety, quote, and legal-impacting decisions',
    mustPassBefore: 'controlled-pilot',
    proofCommandOrEvidence: 'AI records carry aiDraft, humanApprovedBy, approvalBoundary, and auditLogRef where decision impact exists.',
  },
];

export const UAE_MVP_BUILD_ORDER = [
  'Public /uae-market-leadership page and Trust Center positioning',
  'Communication intake schema with WhatsApp opt-in, media, language, and ticket draft state',
  'Maintenance Trust Ledger schema and append-only event creation path',
  'Owner quote threshold rules: auto-under-500, approval-over-500, three-quotes-over-1500',
  'Technician offline evidence queue: check-in, QR, photos, notes, safety, materials, sync',
  'Owner P&L reporting shell with corrected UAE tax wording',
  'HR master: employee document lifecycle, payroll/WPS, attendance, rosters, safety, data governance',
  'Firestore rules hardening and smoke tests for every new collection before public launch',
] as const;

export function getMustHaveMarketLeadershipCapabilities() {
  return [...UAE_OWNER_TRUST_MASTER_CAPABILITIES, ...UAE_HR_WORKFORCE_MASTER_CAPABILITIES].filter(
    (capability) => capability.priority === 'must-have',
  );
}

export function getCapabilitiesBySurface(surface: MarketLeadershipSurface) {
  return [...UAE_OWNER_TRUST_MASTER_CAPABILITIES, ...UAE_HR_WORKFORCE_MASTER_CAPABILITIES].filter((capability) =>
    capability.surfaces.includes(surface),
  );
}

export function getCapabilitiesByPhase(phase: MarketLeadershipPhase) {
  return [...UAE_OWNER_TRUST_MASTER_CAPABILITIES, ...UAE_HR_WORKFORCE_MASTER_CAPABILITIES].filter(
    (capability) => capability.phase === phase,
  );
}

export function getHardenedCollectionsRequired() {
  return UAE_MARKET_LEADERSHIP_DATA_MODEL.filter((entry) => entry.hardenedRuleRequired);
}

export function getLaunchGatesBefore(stage: MarketLeadershipGate['mustPassBefore']) {
  return UAE_RELEASE_GATES.filter((gate) => gate.mustPassBefore === stage);
}
