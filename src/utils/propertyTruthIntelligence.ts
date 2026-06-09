export type SovereignRole = 'owner' | 'tenant' | 'technician' | 'broker' | 'admin' | 'unknown';

export type TruthHealthBand = 'VERIFIED' | 'WATCHLIST' | 'AT_RISK' | 'CRITICAL';

export interface PropertyTruthLedgerSnapshot {
  maintenanceCreditScore: number;
  healthBand: TruthHealthBand;
  openMissionCount: number;
  slaBreachCount: number;
  repeatDefectCount: number;
  proofCoveragePct: number;
  propertyCount: number;
  autopilotMode: 'READY' | 'WATCH' | 'LOCKED';
  evidenceProtocol: string;
  nextBestAction: string;
}

export interface SovereignAIRequest {
  role: SovereignRole;
  text: string;
  pageContext?: any;
  isAutoSummary?: boolean;
  fallbackSummary?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toNumber = (value: any, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asArray = (value: any): any[] => Array.isArray(value) ? value : [];
const lower = (value: any) => String(value ?? '').toLowerCase();

function collectTickets(context: any): any[] {
  const tickets = [
    ...asArray(context?.tickets),
    ...asArray(context?.activeTickets),
    ...asArray(context?.serviceTickets),
    ...asArray(context?.activeDispatches),
    ...asArray(context?.missions),
  ];

  const seen = new Set<string>();
  return tickets.filter((ticket, index) => {
    const id = String(ticket?.id ?? ticket?.ticketId ?? ticket?.missionId ?? index);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function hasProof(ticket: any): boolean {
  const before = ticket?.beforePhoto || ticket?.beforePhotoUrl || ticket?.beforeImage || ticket?.evidence?.before || ticket?.photos?.before;
  const after = ticket?.afterPhoto || ticket?.afterPhotoUrl || ticket?.afterImage || ticket?.evidence?.after || ticket?.photos?.after;
  const gps = ticket?.gpsCheckIn || ticket?.arrivalGps || ticket?.locationProof || ticket?.evidence?.gps || ticket?.technicianLocation;
  return Boolean((before && after) || (ticket?.proofComplete === true) || (ticket?.evidenceComplete === true && gps));
}

function isOpen(ticket: any): boolean {
  const status = lower(ticket?.status || ticket?.state || ticket?.missionStatus);
  return !['closed', 'complete', 'completed', 'resolved', 'verified', 'cancelled', 'canceled'].includes(status);
}

function isSlaBreach(ticket: any): boolean {
  const status = lower(ticket?.slaStatus || ticket?.sla || ticket?.breachStatus);
  return status.includes('breach') || ticket?.slaBreached === true || ticket?.isSlaBreached === true || ticket?.breached === true;
}

function isRepeatDefect(ticket: any): boolean {
  return ticket?.repeat === true || ticket?.isRepeat === true || ticket?.recurring === true || toNumber(ticket?.repeatCount) > 1 || lower(ticket?.flags).includes('repeat');
}

export function calculateMaintenanceCreditScore(context: any = {}): number {
  const tickets = collectTickets(context);
  const openMissionCount = toNumber(context?.stats?.openTickets ?? context?.openMissionCount, tickets.filter(isOpen).length);
  const slaBreachCount = toNumber(context?.stats?.slaBreaches ?? context?.slaBreachCount, tickets.filter(isSlaBreach).length);
  const repeatDefectCount = toNumber(context?.stats?.repeatDefects ?? context?.repeatDefectCount, tickets.filter(isRepeatDefect).length);
  const proofEligibleTickets = tickets.filter((ticket) => !isOpen(ticket));
  const proofCoveragePct = proofEligibleTickets.length
    ? Math.round((proofEligibleTickets.filter(hasProof).length / proofEligibleTickets.length) * 100)
    : toNumber(context?.proofCoveragePct ?? context?.stats?.proofCoveragePct, 92);
  const bpi = toNumber(context?.bpiAverage ?? context?.buildingPerformanceIndex ?? context?.healthScore, 82);

  const score = Math.round(
    50 +
    clamp(bpi, 0, 100) * 0.28 +
    clamp(proofCoveragePct, 0, 100) * 0.16 -
    slaBreachCount * 6 -
    repeatDefectCount * 4 -
    openMissionCount * 1.5
  );

  return clamp(score, 0, 100);
}

export function getTruthHealthBand(score: number): TruthHealthBand {
  if (score >= 86) return 'VERIFIED';
  if (score >= 72) return 'WATCHLIST';
  if (score >= 55) return 'AT_RISK';
  return 'CRITICAL';
}

export function buildPropertyTruthLedger(context: any = {}): PropertyTruthLedgerSnapshot {
  const tickets = collectTickets(context);
  const properties = asArray(context?.properties || context?.assets || context?.portfolio);
  const openMissionCount = toNumber(context?.stats?.openTickets ?? context?.openMissionCount, tickets.filter(isOpen).length);
  const slaBreachCount = toNumber(context?.stats?.slaBreaches ?? context?.slaBreachCount, tickets.filter(isSlaBreach).length);
  const repeatDefectCount = toNumber(context?.stats?.repeatDefects ?? context?.repeatDefectCount, tickets.filter(isRepeatDefect).length);
  const closedTickets = tickets.filter((ticket) => !isOpen(ticket));
  const proofCoveragePct = closedTickets.length
    ? Math.round((closedTickets.filter(hasProof).length / closedTickets.length) * 100)
    : toNumber(context?.proofCoveragePct ?? context?.stats?.proofCoveragePct, 92);
  const maintenanceCreditScore = calculateMaintenanceCreditScore(context);
  const healthBand = getTruthHealthBand(maintenanceCreditScore);
  const autopilotMode = healthBand === 'CRITICAL' ? 'LOCKED' : healthBand === 'AT_RISK' ? 'WATCH' : 'READY';

  const nextBestAction = slaBreachCount > 0
    ? 'Review SLA breach causes and issue owner-visible service credit decision.'
    : repeatDefectCount > 0
      ? 'Escalate repeat defects into root-cause inspection before another temporary repair.'
      : proofCoveragePct < 90
        ? 'Enforce No-Photo, No-GPS, No-Close proof before technician closeout.'
        : 'Activate Owner Silent Mode for low-risk repairs under the owner-approved threshold.';

  return {
    maintenanceCreditScore,
    healthBand,
    openMissionCount,
    slaBreachCount,
    repeatDefectCount,
    proofCoveragePct: clamp(proofCoveragePct, 0, 100),
    propertyCount: properties.length || toNumber(context?.propertyCount, 0),
    autopilotMode,
    evidenceProtocol: 'No-Photo, No-GPS, No-Close',
    nextBestAction,
  };
}

function describeTruthLedger(snapshot: PropertyTruthLedgerSnapshot): string {
  return `Property Truth Ledger: Maintenance Credit Score ${snapshot.maintenanceCreditScore}/100 (${snapshot.healthBand}). Open missions: ${snapshot.openMissionCount}. SLA breaches: ${snapshot.slaBreachCount}. Repeat defects: ${snapshot.repeatDefectCount}. Proof coverage: ${snapshot.proofCoveragePct}%. Autopilot mode: ${snapshot.autopilotMode}. Next best action: ${snapshot.nextBestAction}`;
}

export function generateSovereignAIResponse(request: SovereignAIRequest): string {
  const text = lower(request.text);
  const snapshot = buildPropertyTruthLedger(request.pageContext || {});

  if (request.isAutoSummary) {
    const base = request.fallbackSummary ? `${request.fallbackSummary}\n\n` : '';
    return `${base}${describeTruthLedger(snapshot)}`;
  }

  if (text.includes('truth') || text.includes('ledger') || text.includes('black box')) {
    return `BIN Property Truth Ledger records complaint time, owner approval, tenant confirmation, technician GPS arrival, before/after proof, SLA result, invoice reference, and repeat-defect history. Current intelligence: ${describeTruthLedger(snapshot)}`;
  }

  if (text.includes('autopilot') || text.includes('silent mode') || text.includes('auto approve') || text.includes('no-call')) {
    return `AI Property Autopilot is the owner-rule layer. Low-risk jobs can be auto-approved under the owner threshold, emergency cases dispatch immediately, repeated defects are escalated to root-cause inspection, and only cost/risk/legal exceptions interrupt the owner. Current mode: ${snapshot.autopilotMode}.`;
  }

  if (text.includes('credit score') || text.includes('maintenance score') || text.includes('trust score')) {
    return `Maintenance Credit Score is a 0-100 reliability score using SLA performance, repeat defects, proof quality, open mission load, and asset health. Current score: ${snapshot.maintenanceCreditScore}/100 (${snapshot.healthBand}).`;
  }

  if (text.includes('passport')) {
    return 'BIN Verified Property Passport is the permanent record for each asset: property profile, contracts, tenant issues, work orders, before/after proof, invoices, reports, warranties, and QR-verifiable maintenance history.';
  }

  if (text.includes('dispute') || text.includes('court') || text.includes('evidence')) {
    return 'The dispute-ready file collects the maintenance timeline, complaint evidence, GPS attendance, before/after photos, approvals, invoices, SLA timestamps, and tenant verification. It is designed as an evidence bundle, not a substitute for UAE legal advice.';
  }

  if (text.includes('repair memory') || text.includes('repeat')) {
    return `Repair Memory detects repeat issues before they become endless cost. Current repeat-defect count: ${snapshot.repeatDefectCount}. If the same AC, leak, pump, or electrical issue repeats, the next action should be root-cause inspection, not another temporary closeout.`;
  }

  if (text.includes('ai') || text.includes('working')) {
    return `AI layer status: operational as a deterministic property-intelligence assistant using role context and page context. It can summarize dashboards, explain SLA/BPI, calculate a Maintenance Credit Score, reason about Property Truth Ledger data, and recommend next actions. Generative model API usage should still be verified separately with environment keys before claiming live Gemini/OpenAI responses.`;
  }

  if (request.role === 'tenant') {
    return 'Tenant guidance: submit the issue with photo evidence, keep the SLA timer visible, confirm technician arrival, and verify before/after completion only when the issue is genuinely resolved.';
  }

  if (request.role === 'technician') {
    return 'Technician protocol: check in with GPS, capture before photo, diagnose root cause, record material usage, upload after photo, and close only when tenant/owner verification is ready.';
  }

  if (request.role === 'broker') {
    return 'Broker protocol: use the Property Passport and Maintenance Credit Score to show verified maintenance history instead of informal claims like “well maintained”.';
  }

  if (request.role === 'admin') {
    return `${describeTruthLedger(snapshot)} Admin should monitor orphan records, SLA breaches, proof gaps, payment status, and repeated defects before public launch.`;
  }

  return `I can help with BIN GROUP Property Truth Infrastructure: Property Black Box, AI Property Autopilot, Owner Silent Mode, Repair Memory, Maintenance Credit Score, Verified Property Passport, and dispute-ready evidence files. ${describeTruthLedger(snapshot)}`;
}
