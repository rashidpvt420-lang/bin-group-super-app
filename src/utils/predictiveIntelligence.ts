/**
 * Evidence-first maintenance intelligence.
 *
 * This module intentionally reports recurring work-order patterns only. It
 * does not infer failure probabilities, property health, ROI or cash forecasts
 * from sparse tickets. Those require a validated asset-condition model and a
 * complete, dated and reconciled financial schedule.
 */
export interface HistoricalWorkOrder {
  ticketId: string;
  propertyId?: string;
  createdAt: any;
  completedAt?: any;
  category: string;
  cost: number;
  trade: string;
  priority: string;
  status?: string;
}
export interface HistoricalContext {
  propertyId: string;
  ownerId: string;
  workOrderHistory: HistoricalWorkOrder[];
  financialHistory: Array<{ invoiceId?: string; date: Date; type: 'debit' | 'credit'; amount: number; category: string }>;
  propertyDetails: { sqft: number | null; grade: string | null; propertyType: string | null; emirate: string | null };
}
export interface AssetResiliencePrediction {
  evidenceStatus: 'INSUFFICIENT_HISTORY' | 'NO_RECURRING_PATTERN' | 'RECURRING_PATTERNS_FOUND';
  healthIndex: null;
  predictedDecay12Months: null;
  criticalFailureWindows: Array<{
    propertyId: string | null;
    assetCategory: string;
    evidenceCount: number;
    riskLevel: 'RECURRING';
    probability: null;
    guidance: string;
  }>;
  basis: string;
}
export interface FinancialYieldForecast {
  evidenceStatus: 'NOT_AVAILABLE';
  expectedNetROI: null;
  quarterlyProjections: [];
  riskFactors: string[];
  guidance: string;
  basis: string;
}
export interface MissionGuidancePayload {
  propertyId: string;
  ownerId: string;
  generatedAt: string;
  assetResilience: AssetResiliencePrediction;
  financialForecast: FinancialYieldForecast;
  alerts: Array<{
    type: 'WARNING' | 'INFO';
    message: string;
    recommendation: string;
    thresholdCrossed?: string;
  }>;
}
function asDate(value: any): Date | null {
  try {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (value && typeof value.toDate === 'function') {
      const date = value.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
    }
    if (value && Number.isFinite(Number(value.seconds))) {
      const date = new Date(Number(value.seconds) * 1000);
      return Number.isFinite(date.getTime()) ? date : null;
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}
function normalizeCategory(value: unknown): string {
  return String(value || 'GENERAL').trim().toUpperCase().replace(/[\s-]+/g, '_');
}
/**
 * Counts recurring ticket categories separately per property. A watch signal
 * requires at least three dated records in the previous 365 days. It is a
 * recurrence signal, not a prediction of equipment failure.
 */
export async function generatePredictiveIntelligence(context: HistoricalContext): Promise<MissionGuidancePayload> {
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const recent = (Array.isArray(context.workOrderHistory) ? context.workOrderHistory : [])
    .map((ticket) => ({ ...ticket, parsedDate: asDate(ticket.createdAt) }))
    .filter((ticket) => ticket.parsedDate && ticket.parsedDate.getTime() >= oneYearAgo && ticket.parsedDate.getTime() <= now);
  const groups = new Map<string, { propertyId: string | null; category: string; count: number }>();
  for (const ticket of recent) {
    const propertyId = String(ticket.propertyId || '').trim() || null;
    const status = normalizeCategory(ticket.status);
    if (!propertyId || ['CANCELLED', 'CANCELED', 'REJECTED', 'ARCHIVED'].includes(status)) continue;
    const category = normalizeCategory(ticket.category || ticket.trade);
    const key = `${propertyId}::${category}`;
    const current = groups.get(key) || { propertyId, category, count: 0 };
    current.count += 1;
    groups.set(key, current);
  }
  const recurring = [...groups.values()]
    .filter((group) => group.count >= 3)
    .sort((a, b) => b.count - a.count)
    .map((group) => ({
      propertyId: group.propertyId,
      assetCategory: group.category,
      evidenceCount: group.count,
      riskLevel: 'RECURRING' as const,
      probability: null,
      guidance: 'Review the linked work orders and arrange a qualified inspection before authorizing replacement or capital expenditure.',
    }));
  const evidenceStatus: AssetResiliencePrediction['evidenceStatus'] =
    recent.length === 0 ? 'INSUFFICIENT_HISTORY' : recurring.length > 0 ? 'RECURRING_PATTERNS_FOUND' : 'NO_RECURRING_PATTERN';
  const alerts: MissionGuidancePayload['alerts'] = recurring.map((item) => ({
    type: 'WARNING',
    message: `${item.assetCategory} has ${item.evidenceCount} recorded work orders at property record ${item.propertyId} in the last 12 months.`,
    recommendation: item.guidance,
    thresholdCrossed: 'THREE_DATED_WORK_ORDERS_IN_12_MONTHS',
  }));
  return {
    propertyId: context.propertyId,
    ownerId: context.ownerId,
    generatedAt: new Date(now).toISOString(),
    assetResilience: {
      evidenceStatus,
      // A ticket count alone is not a validated condition score or failure model.
      healthIndex: null,
      predictedDecay12Months: null,
      criticalFailureWindows: recurring,
      basis: 'Dated work-order recurrence only. A scored asset-condition model requires linked asset inspections, service readings and validated outcome data.',
    },
    financialForecast: {
      evidenceStatus: 'NOT_AVAILABLE',
      expectedNetROI: null,
      quarterlyProjections: [],
      riskFactors: [],
      guidance: 'A trustworthy cash-flow forecast is not available from the current historical snapshot alone.',
      basis: 'Forecasting requires complete future-dated rent/receivable schedules, committed costs, reconciled transactions and an explicit valuation basis for ROI. No baseline or AED projection is fabricated.',
    },
    alerts,
  };
}
