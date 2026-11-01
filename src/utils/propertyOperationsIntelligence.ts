import { resolvePropertyHealth } from './propertyIntelligenceEngine';

export type IntelligenceRow = { id?: string; propertyId?: string; [key: string]: any };

export type PropertyOperationsSummary = {
  propertyCount: number;
  portfolioHealthScore: number | null;
  portfolioHealthReasons: string[];
  passportCoveredProperties: number;
  missingPassportProperties: number;
  registeredAssets: number;
  linkedWorkOrders: number;
  openWorkOrders: number;
  urgentOpenWorkOrders: number;
  completedWorkOrders: number;
  unlinkedWorkOrders: number;
  verifiedPaidInvoiceCount: number;
  verifiedPaidInvoiceAed: number;
  outstandingActionCount: number;
};

const CLOSED_STATUSES = new Set(['CLOSED', 'RESOLVED', 'COMPLETED', 'COMPLETE', 'DONE']);
const IGNORED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'REJECTED', 'ARCHIVED']);
const PAID_STATUSES = new Set([
  'PAID', 'VERIFIED', 'ADMIN_VERIFIED', 'SETTLED',
  'RECONCILED', 'COMPLETED', 'SUCCESS',
]);
const ASSET_ARRAY_KEYS = ['assets', 'equipment', 'appliances', 'hvacAssets', 'fireSafetyAssets'];

function upper(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function positiveMoney(record: IntelligenceRow): number {
  for (const key of ['amount', 'amountPaid', 'total', 'grandTotal', 'invoiceAmount']) {
    const raw = record?.[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const amount = Number(String(raw).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100) / 100;
  }
  return 0;
}

function recordsFromFirstAvailableAssetArray(source: IntelligenceRow | undefined): any[] {
  if (!source) return [];
  for (const key of ASSET_ARRAY_KEYS) {
    if (Array.isArray(source[key]) && source[key].length > 0) return source[key];
  }
  return [];
}

function assetCountForProperty(property: IntelligenceRow, passport?: IntelligenceRow): number {
  // Prefer the canonical property asset list. Passport asset arrays are a
  // fallback only, preventing the same equipment from being counted twice.
  const rows = recordsFromFirstAvailableAssetArray(property)
    .length > 0
    ? recordsFromFirstAvailableAssetArray(property)
    : recordsFromFirstAvailableAssetArray(passport);
  return rows.length;
}

function passportPropertyId(passport: IntelligenceRow): string {
  return String(passport.propertyId || passport.property?.id || passport.id || '').trim();
}

/**
 * Builds one owner-scoped operational picture from records already fetched by
 * the authenticated Owner portal. It never invents a zero for missing data:
 * callers must display source errors separately when a stream failed.
 */
export function buildPropertyOperationsSummary(input: {
  properties?: IntelligenceRow[];
  passports?: IntelligenceRow[];
  tickets?: IntelligenceRow[];
  invoices?: IntelligenceRow[];
} = {}): PropertyOperationsSummary {
  const properties = Array.isArray(input.properties) ? input.properties : [];
  const passports = Array.isArray(input.passports) ? input.passports : [];
  const tickets = Array.isArray(input.tickets) ? input.tickets : [];
  const invoices = Array.isArray(input.invoices) ? input.invoices : [];

  const propertyIds = new Set(properties.map((row) => String(row.id || '').trim()).filter(Boolean));
  const passportsByProperty = new Map<string, IntelligenceRow>();
  for (const passport of passports) {
    const propertyId = passportPropertyId(passport);
    if (propertyId && propertyIds.has(propertyId) && !passportsByProperty.has(propertyId)) {
      passportsByProperty.set(propertyId, passport);
    }
  }

  let registeredAssets = 0;
  for (const property of properties) {
    registeredAssets += assetCountForProperty(property, passportsByProperty.get(String(property.id || '')));
  }

  const linkedTickets = tickets.filter((ticket) => {
    const propertyId = String(ticket.propertyId || '').trim();
    return propertyId && propertyIds.has(propertyId);
  });
  const unlinkedWorkOrders = tickets.filter((ticket) => {
    const propertyId = String(ticket.propertyId || '').trim();
    return !propertyId || !propertyIds.has(propertyId);
  }).length;

  let openWorkOrders = 0;
  let urgentOpenWorkOrders = 0;
  let completedWorkOrders = 0;
  for (const ticket of linkedTickets) {
    const status = upper(ticket.status || ticket.ticketStatus);
    if (CLOSED_STATUSES.has(status)) {
      completedWorkOrders += 1;
      continue;
    }
    if (IGNORED_STATUSES.has(status)) continue;
    openWorkOrders += 1;
    if (['CRITICAL', 'EMERGENCY', 'URGENT', 'HIGH'].includes(upper(ticket.priority || ticket.severity))) {
      urgentOpenWorkOrders += 1;
    }
  }

  let verifiedPaidInvoiceCount = 0;
  let verifiedPaidInvoiceAed = 0;
  const seenInvoiceIds = new Set<string>();
  for (const invoice of invoices) {
    const id = String(invoice.id || '').trim();
    if (id && seenInvoiceIds.has(id)) continue;
    if (id) seenInvoiceIds.add(id);
    const verifiedFlag = invoice.paymentVerified === true || invoice.paid === true;
    if (!PAID_STATUSES.has(upper(invoice.status)) && !verifiedFlag) continue;
    const amount = positiveMoney(invoice);
    if (!(amount > 0)) continue;
    verifiedPaidInvoiceCount += 1;
    verifiedPaidInvoiceAed = Math.round((verifiedPaidInvoiceAed + amount) * 100) / 100;
  }

  const passportCoveredProperties = passportsByProperty.size;
  const missingPassportProperties = Math.max(0, properties.length - passportCoveredProperties);
  const health = resolvePropertyHealth(properties, linkedTickets);
  const outstandingActionCount = openWorkOrders + missingPassportProperties + unlinkedWorkOrders;

  return {
    propertyCount: properties.length,
    portfolioHealthScore: properties.length ? health.score : null,
    portfolioHealthReasons: health.reasons,
    passportCoveredProperties,
    missingPassportProperties,
    registeredAssets,
    linkedWorkOrders: linkedTickets.length,
    openWorkOrders,
    urgentOpenWorkOrders,
    completedWorkOrders,
    unlinkedWorkOrders,
    verifiedPaidInvoiceCount,
    verifiedPaidInvoiceAed,
    outstandingActionCount,
  };
}
