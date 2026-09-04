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
  insufficientData: boolean;
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
const hasNumber = (value: any) => Number.isFinite(Number(value));

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
  const location = ticket?.gpsCheckIn || ticket?.arrivalGps || ticket?.locationProof || ticket?.evidence?.gps || ticket?.technicianLocation;
  return Boolean((before && after) || (ticket?.proofComplete === true) || (ticket?.evidenceComplete === true && location));
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

function hasOperationalSignal(context: any = {}): boolean {
  const tickets = collectTickets(context);
  const properties = asArray(context?.properties || context?.assets || context?.portfolio);
  return tickets.length > 0 || properties.length > 0 ||
    hasNumber(context?.propertyCount) ||
    hasNumber(context?.stats?.openTickets) || hasNumber(context?.openMissionCount) ||
    hasNumber(context?.stats?.slaBreaches) || hasNumber(context?.slaBreachCount) ||
    hasNumber(context?.stats?.repeatDefects) || hasNumber(context?.repeatDefectCount) ||
    hasNumber(context?.proofCoveragePct) || hasNumber(context?.stats?.proofCoveragePct) ||
    hasNumber(context?.bpiAverage) || hasNumber(context?.buildingPerformanceIndex) || hasNumber(context?.healthScore);
}

function resolveProofCoveragePct(context: any, closedTickets: any[]): number {
  if (closedTickets.length) return Math.round((closedTickets.filter(hasProof).length / closedTickets.length) * 100);
  if (hasNumber(context?.proofCoveragePct)) return toNumber(context.proofCoveragePct, 0);
  if (hasNumber(context?.stats?.proofCoveragePct)) return toNumber(context.stats.proofCoveragePct, 0);
  return 0;
}

function resolveBpi(context: any): number {
  if (hasNumber(context?.bpiAverage)) return toNumber(context.bpiAverage, 0);
  if (hasNumber(context?.buildingPerformanceIndex)) return toNumber(context.buildingPerformanceIndex, 0);
  if (hasNumber(context?.healthScore)) return toNumber(context.healthScore, 0);
  return 0;
}

export function calculateMaintenanceCreditScore(context: any = {}): number {
  if (!hasOperationalSignal(context)) return 0;

  const tickets = collectTickets(context);
  const openMissionCount = toNumber(context?.stats?.openTickets ?? context?.openMissionCount, tickets.filter(isOpen).length);
  const slaBreachCount = toNumber(context?.stats?.slaBreaches ?? context?.slaBreachCount, tickets.filter(isSlaBreach).length);
  const repeatDefectCount = toNumber(context?.stats?.repeatDefects ?? context?.repeatDefectCount, tickets.filter(isRepeatDefect).length);
  const closedTickets = tickets.filter((ticket) => !isOpen(ticket));
  const proofCoveragePct = resolveProofCoveragePct(context, closedTickets);
  const bpi = resolveBpi(context);

  const score = Math.round(
    35 +
    clamp(bpi, 0, 100) * 0.3 +
    clamp(proofCoveragePct, 0, 100) * 0.2 -
    slaBreachCount * 7 -
    repeatDefectCount * 5 -
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
  const hasData = hasOperationalSignal(context);
  const openMissionCount = hasData ? toNumber(context?.stats?.openTickets ?? context?.openMissionCount, tickets.filter(isOpen).length) : 0;
  const slaBreachCount = hasData ? toNumber(context?.stats?.slaBreaches ?? context?.slaBreachCount, tickets.filter(isSlaBreach).length) : 0;
  const repeatDefectCount = hasData ? toNumber(context?.stats?.repeatDefects ?? context?.repeatDefectCount, tickets.filter(isRepeatDefect).length) : 0;
  const closedTickets = tickets.filter((ticket) => !isOpen(ticket));
  const proofCoveragePct = hasData ? resolveProofCoveragePct(context, closedTickets) : 0;
  const maintenanceCreditScore = calculateMaintenanceCreditScore(context);
  const insufficientData = !hasData;
  const healthBand = insufficientData ? 'CRITICAL' : getTruthHealthBand(maintenanceCreditScore);
  const autopilotMode = insufficientData || healthBand === 'CRITICAL' ? 'LOCKED' : healthBand === 'AT_RISK' ? 'WATCH' : 'READY';

  const nextBestAction = insufficientData
    ? 'Collect live property, ticket, SLA, location, photo, and verification records before assigning a trusted health score.'
    : slaBreachCount > 0
      ? 'Review SLA breach causes and issue owner-visible service credit decision.'
      : repeatDefectCount > 0
        ? 'Escalate repeat defects into root-cause inspection before another temporary repair.'
        : proofCoveragePct < 90
          ? 'Enforce No-Photo, No-Location, No-Close proof before technician closeout.'
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
    evidenceProtocol: 'No-Photo, No-Location, No-Close',
    nextBestAction,
    insufficientData,
  };
}

function describeTruthLedger(snapshot: PropertyTruthLedgerSnapshot): string {
  if (snapshot.insufficientData) {
    return `Property Truth Ledger: INSUFFICIENT DATA. Maintenance Credit Score ${snapshot.maintenanceCreditScore}/100 (${snapshot.healthBand}). Autopilot mode: ${snapshot.autopilotMode}. Next best action: ${snapshot.nextBestAction}`;
  }
  return `Property Truth Ledger: Maintenance Credit Score ${snapshot.maintenanceCreditScore}/100 (${snapshot.healthBand}). Open missions: ${snapshot.openMissionCount}. SLA breaches: ${snapshot.slaBreachCount}. Repeat defects: ${snapshot.repeatDefectCount}. Proof coverage: ${snapshot.proofCoveragePct}%. Autopilot mode: ${snapshot.autopilotMode}. Next best action: ${snapshot.nextBestAction}`;
}

export function generateSovereignAIResponse(request: SovereignAIRequest): string {
  const text = lower(request.text);
  const snapshot = buildPropertyTruthLedger(request.pageContext || {});

  if (request.isAutoSummary) {
    const base = request.fallbackSummary ? `${request.fallbackSummary}\n\n` : '';
    return `${base}${describeTruthLedger(snapshot)}`;
  }

  if (snapshot.insufficientData && (text.includes('score') || text.includes('truth') || text.includes('ledger') || text.includes('working'))) {
    return `I cannot certify this property as verified yet because the live context has insufficient operational evidence. ${describeTruthLedger(snapshot)}`;
  }

  if (text.includes('truth') || text.includes('ledger') || text.includes('black box')) {
    return `BIN Property Truth Ledger records complaint time, owner approval, tenant confirmation, technician arrival, before/after proof, SLA result, invoice reference, and repeat-defect history. Current intelligence: ${describeTruthLedger(snapshot)}`;
  }

  if (text.includes('autopilot') || text.includes('silent mode') || text.includes('auto approve') || text.includes('no-call')) {
    return snapshot.insufficientData
      ? `AI Property Autopilot is LOCKED until live operational data is available. ${describeTruthLedger(snapshot)}`
      : `AI Property Autopilot is the owner-rule layer. Low-risk jobs can be auto-approved under the owner threshold, emergency cases dispatch immediately, repeated defects are escalated to root-cause inspection, and only cost/risk/legal exceptions interrupt the owner. Current mode: ${snapshot.autopilotMode}.`;
  }

  if (text.includes('credit score') || text.includes('maintenance score') || text.includes('trust score')) {
    return snapshot.insufficientData
      ? `Maintenance Credit Score cannot be trusted yet because operational evidence is insufficient. Current safe score: ${snapshot.maintenanceCreditScore}/100 (${snapshot.healthBand}).`
      : `Maintenance Credit Score is a 0-100 reliability score using SLA performance, repeat defects, proof quality, open mission load, and asset health. Current score: ${snapshot.maintenanceCreditScore}/100 (${snapshot.healthBand}).`;
  }

  if (text.includes('passport')) {
    return 'BIN Verified Property Passport is the permanent record for each asset: property profile, contracts, tenant issues, work orders, before/after proof, invoices, reports, warranties, and QR-verifiable maintenance history.';
  }

  if (text.includes('dispute') || text.includes('evidence')) {
    return 'The dispute-ready file collects the maintenance timeline, complaint evidence, technician attendance, before/after photos, approvals, invoices, SLA timestamps, and tenant verification.';
  }

  if (text.includes('repair memory') || text.includes('repeat')) {
    return `Repair Memory detects repeat issues before they become endless cost. Current repeat-defect count: ${snapshot.repeatDefectCount}. If the same AC, leak, pump, or electrical issue repeats, the next action should be root-cause inspection, not another temporary closeout.`;
  }

  if (text.includes('ai') || text.includes('working')) {
    return `AI layer status: deterministic property-intelligence assistant available. Live generative provider usage still requires Firebase Functions secret verification. ${describeTruthLedger(snapshot)}`;
  }

  if (request.role === 'tenant') {
    return 'Tenant guidance: submit the issue with photo evidence, keep the SLA timer visible, confirm technician arrival, and verify before/after completion only when the issue is genuinely resolved.';
  }

  if (request.role === 'technician') {
    return 'Technician protocol: check in with location, capture before photo, diagnose root cause, record material usage, upload after photo, and close only when tenant/owner verification is ready.';
  }

  if (request.role === 'broker') {
    return 'Broker protocol: use the Property Passport and Maintenance Credit Score to show verified maintenance history instead of informal claims like “well maintained”.';
  }

  if (request.role === 'admin') {
    return `${describeTruthLedger(snapshot)} Admin should monitor orphan records, SLA breaches, proof gaps, payment status, and repeated defects before public launch.`;
  }

  return `I can help with BIN GROUP Property Truth Infrastructure: Property Black Box, AI Property Autopilot, Owner Silent Mode, Repair Memory, Maintenance Credit Score, Verified Property Passport, and dispute-ready evidence files. ${describeTruthLedger(snapshot)}`;
}
