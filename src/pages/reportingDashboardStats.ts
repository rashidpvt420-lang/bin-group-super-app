// Pure aggregation for ReportingDashboard (N-10). Every figure shown to an owner or
// exported to PDF must be derived from records the caller could read. When the
// records needed for a metric are missing, the metric is `null` and the UI shows
// an explicit "not available" state; nothing is estimated, padded or hard-coded.

export type ReportingRecord = Record<string, any> & { id?: string };

export interface ReportingInputs {
  properties: ReportingRecord[];
  tickets: ReportingRecord[];
  contracts: ReportingRecord[];
  units: ReportingRecord[];
  selectedEmirate: string;
  now?: Date;
}

export interface ReportingStats {
  /** Average created → completed time of completed tickets, or null when no completed ticket has both timestamps. */
  avgResolutionMinutes: number | null;
  resolutionSampleSize: number;
  totalSettled: number;
  /** Occupied units / all units, or null when there are no unit records. */
  occupancyPercent: number | null;
  totalUnits: number;
  occupiedUnits: number;
  activeTickets: number;
  emiratesList: string[];
  regionalStats: Array<{ emirate: string; count: number }>;
  /** Real ticket counts per category (top 3), empty when there are no categorised tickets. */
  faultCategories: Array<{ category: string; count: number }>;
  /** Emergency tickets per calendar month, oldest first, for the last 6 months including the current one. */
  emergencyByMonth: Array<{ month: string; count: number }>;
}

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const upper = (value: unknown) => String(value ?? '').trim().toUpperCase();
const isCompleted = (ticket: ReportingRecord) => upper(ticket.status) === 'COMPLETED';
const isEmergency = (ticket: ReportingRecord) => upper(ticket.priority) === 'EMERGENCY' || ticket.isEmergency === true;

export function computeReportingStats(input: ReportingInputs): ReportingStats {
  const { properties, contracts, selectedEmirate } = input;
  const now = input.now ?? new Date();
  const inZone = selectedEmirate === 'ALL'
    ? properties
    : properties.filter((p) => upper(p.emirate) === selectedEmirate);
  const zoneIds = new Set(inZone.map((p) => p.id));
  const scoped = (rows: ReportingRecord[]) => (selectedEmirate === 'ALL' ? rows : rows.filter((r) => zoneIds.has(r.propertyId)));

  const tickets = scoped(input.tickets);
  const units = scoped(input.units);

  const durations = tickets
    .filter(isCompleted)
    .map((t) => {
      const created = toDate(t.createdAt);
      const completed = toDate(t.completedAt);
      return created && completed ? (completed.getTime() - created.getTime()) / 60000 : null;
    })
    .filter((m): m is number => m !== null && Number.isFinite(m) && m >= 0);

  const occupiedUnits = units.filter((u) => u.tenantId).length;

  const categoryCounts = new Map<string, number>();
  for (const ticket of tickets) {
    const category = String(ticket.category ?? '').trim();
    if (!category) continue;
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  const months: Array<{ month: string; count: number }> = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, count: 0 });
  }
  for (const ticket of tickets.filter(isEmergency)) {
    const created = toDate(ticket.createdAt);
    if (!created) continue;
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
    const bucket = months.find((m) => m.month === key);
    if (bucket) bucket.count += 1;
  }

  const emirates = Array.from(new Set(properties.map((p) => upper(p.emirate)))).filter(Boolean);

  return {
    avgResolutionMinutes: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    resolutionSampleSize: durations.length,
    totalSettled: scoped(contracts).reduce((sum, c) => sum + (Number(c.amountReceived) || 0), 0),
    occupancyPercent: units.length ? Math.round((occupiedUnits / units.length) * 100) : null,
    totalUnits: units.length,
    occupiedUnits,
    activeTickets: tickets.filter((t) => !isCompleted(t)).length,
    emiratesList: ['ALL', ...emirates],
    regionalStats: emirates.map((emirate) => ({ emirate, count: properties.filter((p) => upper(p.emirate) === emirate).length })),
    faultCategories: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
      .slice(0, 3),
    emergencyByMonth: months,
  };
}

export const NOT_AVAILABLE = 'Not available';

export function formatResolutionTime(minutes: number | null): string {
  if (minutes === null) return NOT_AVAILABLE;
  if (minutes < 60) return `${Math.round(minutes)} mins`;
  if (minutes < 60 * 48) return `${(minutes / 60).toFixed(1)} hrs`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

export function formatOccupancy(percent: number | null): string {
  return percent === null ? NOT_AVAILABLE : `${percent}%`;
}
