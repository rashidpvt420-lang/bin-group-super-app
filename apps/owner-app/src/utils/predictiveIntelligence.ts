/**
 * Evidence-first maintenance intelligence for the standalone Owner application.
 * Work-order recurrence is a review signal, not a calibrated failure forecast.
 */
export interface HistoricalWorkOrder {
  ticketId: string;
  propertyId?: string;
  createdAt: Date | string | number | null;
  completedAt?: Date | string | number | null;
  category: string;
  cost: number;
  trade: string;
  priority: string;
  status?: string;
  dueAt?: Date | string | number | null;
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
    propertyId: string;
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
  advisoryGuidance?: string;
  guidanceProvider?: string;
  alerts: Array<{
    type: 'CRITICAL' | 'WARNING' | 'INFO';
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
const EXCLUDED = new Set(['CANCELLED', 'CANCELED', 'REJECTED', 'ARCHIVED']);
/**
 * A watch signal requires at least three dated records for the same property
 * and trade/category in the previous 365 days. It does not imply failure risk.
 */
export async function generatePredictiveIntelligence(context: HistoricalContext): Promise<MissionGuidancePayload> {
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const recent = (Array.isArray(context.workOrderHistory) ? context.workOrderHistory : [])
    .map((ticket) => ({ ...ticket, propertyId: String(ticket.propertyId || context.propertyId || '').trim(), parsedDate: asDate(ticket.createdAt) }))
    .filter((ticket) => ticket.propertyId && ticket.parsedDate && ticket.parsedDate.getTime() >= oneYearAgo && ticket.parsedDate.getTime() <= now && !EXCLUDED.has(normalizeCategory(ticket.status)));
  const groups = new Map<string, { propertyId: string; category: string; count: number }>();
  for (const ticket of recent) {
    const category = normalizeCategory(ticket.category || ticket.trade);
    const key = `${ticket.propertyId}::${category}`;
    const current = groups.get(key) || { propertyId: ticket.propertyId, category, count: 0 };
    current.count += 1;
    groups.set(key, current);
  }
  const recurring = [...groups.values()].filter((group) => group.count >= 3).sort((a, b) => b.count - a.count).map((group) => ({
    propertyId: group.propertyId,
    assetCategory: group.category,
    evidenceCount: group.count,
    riskLevel: 'RECURRING' as const,
    probability: null,
    guidance: 'Review the linked work orders and arrange a qualified inspection before authorizing replacement or capital expenditure.',
  }));
  const evidenceStatus: AssetResiliencePrediction['evidenceStatus'] =
    recent.length === 0 ? 'INSUFFICIENT_HISTORY' : recurring.length ? 'RECURRING_PATTERNS_FOUND' : 'NO_RECURRING_PATTERN';
  return {
    propertyId: context.propertyId,
    ownerId: context.ownerId,
    generatedAt: new Date(now).toISOString(),
    assetResilience: {
      evidenceStatus,
      healthIndex: null,
      predictedDecay12Months: null,
      criticalFailureWindows: recurring,
      basis: 'Dated work-order recurrence only. A condition score requires linked asset inspections, service readings and validated outcomes.',
    },
    financialForecast: {
      evidenceStatus: 'NOT_AVAILABLE',
      expectedNetROI: null,
      quarterlyProjections: [],
      riskFactors: [],
      guidance: 'A trustworthy cash-flow forecast is not available from the current historical snapshot alone.',
      basis: 'Forecasting requires future-dated rent/receivable schedules, committed costs, reconciled transactions and an explicit valuation basis. No ROI or AED projection is fabricated.',
    },
    alerts: recurring.map((item) => ({
      type: 'WARNING' as const,
      message: `${item.assetCategory} has ${item.evidenceCount} dated work orders at property record ${item.propertyId} in the last 12 months.`,
      recommendation: item.guidance,
      thresholdCrossed: 'THREE_DATED_WORK_ORDERS_IN_12_MONTHS',
    })),
  };
}
