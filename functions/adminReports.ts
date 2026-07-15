import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

type ReportType = "financial" | "operational" | "performance" | "owner" | "sla_breaches";
type AnyRecord = Record<string, unknown>;

type AdminReportAuth = {
  uid: string;
  token?: AnyRecord;
} | null | undefined;

type ReportServices = {
  db: admin.firestore.Firestore;
  now: () => Date;
  maxDocs: number;
};

type NormalizedParams = {
  reportType: ReportType;
  startDate: Date;
  endDate: Date;
  filters: AnyRecord;
};

const db = admin.firestore();
const adminRoles = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const reportTypes = new Set<ReportType>(["financial", "operational", "performance", "owner", "sla_breaches"]);
const allowedFilters = new Set(["ownerId", "propertyId", "emirate", "status"]);

const asRecord = (value: unknown): AnyRecord => {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
};

const text = (value: unknown, fallback = ""): string => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const lower = (value: unknown): string => text(value).toLowerCase();

const amount = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const record = asRecord(value);
  if (typeof record.toDate === "function") {
    const parsed = (record.toDate as () => Date)();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const seconds = amount(record.seconds ?? record._seconds);
  if (seconds) return new Date(seconds * 1000);
  return null;
};

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
};

const parseDateParam = (value: unknown, fallback: Date, isEnd = false): Date => {
  const raw = text(value);
  if (!raw) return isEnd ? endOfDay(fallback) : startOfDay(fallback);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpsError("invalid-argument", "Invalid report date range.");
  }
  return isEnd ? endOfDay(parsed) : startOfDay(parsed);
};

const dateFromRecord = (record: AnyRecord): Date | null => {
  return toDate(record.paidAt) ||
    toDate(record.approvedAt) ||
    toDate(record.completedAt) ||
    toDate(record.resolvedAt) ||
    toDate(record.detectedAt) ||
    toDate(record.createdAt) ||
    toDate(record.updatedAt) ||
    toDate(record.date);
};

const inRange = (date: Date | null, startDate: Date, endDate: Date): boolean => {
  return Boolean(date && date.getTime() >= startDate.getTime() && date.getTime() <= endDate.getTime());
};

const sanitizeFilters = (input: unknown): AnyRecord => {
  const filters = asRecord(input);
  const safe: AnyRecord = {};
  for (const [key, value] of Object.entries(filters)) {
    if (allowedFilters.has(key) && text(value)) safe[key] = text(value).slice(0, 120);
  }
  return safe;
};

const normalizeParams = (data: unknown, now: Date): NormalizedParams => {
  const payload = asRecord(data);
  const requestedType = text(payload.reportType || payload.type || "financial") as ReportType;
  if (!reportTypes.has(requestedType)) {
    throw new HttpsError("invalid-argument", "Unsupported report type.");
  }

  const defaultEnd = now;
  const defaultStart = new Date(defaultEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startDate = parseDateParam(payload.startDate, defaultStart);
  const endDate = parseDateParam(payload.endDate, defaultEnd, true);
  if (startDate.getTime() > endDate.getTime()) {
    throw new HttpsError("invalid-argument", "Report start date must be before end date.");
  }
  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() > maxRangeMs) {
    throw new HttpsError("invalid-argument", "Report date range cannot exceed 366 days.");
  }

  return {
    reportType: requestedType,
    startDate,
    endDate,
    filters: sanitizeFilters(payload.filters),
  };
};

const tokenHasAdminRole = (token: AnyRecord): boolean => {
  const role = lower(token.role || token.userRole || token.primaryRole);
  return token.admin === true ||
    token.isAdmin === true ||
    token.superAdmin === true ||
    token.super_admin === true ||
    adminRoles.has(role);
};

async function assertAdmin(auth: AdminReportAuth, firestore: admin.firestore.Firestore): Promise<void> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  if (tokenHasAdminRole(asRecord(auth.token))) return;
  void firestore;
  throw new HttpsError("permission-denied", "Admin access required.");
}

const matchesFilters = (record: AnyRecord, filters: AnyRecord): boolean => {
  for (const [key, filterValue] of Object.entries(filters)) {
    const expected = lower(filterValue);
    if (!expected) continue;
    if (key === "ownerId" && ![record.ownerId, record.ownerUid, record.userId].some((value) => lower(value) === expected)) return false;
    if (key === "propertyId" && ![record.propertyId, record.propertyUid, record.assetId].some((value) => lower(value) === expected)) return false;
    if (key === "emirate" && lower(record.emirate || record.city || record.area) !== expected) return false;
    if (key === "status" && lower(record.status || record.paymentStatus || record.ticketStatus) !== expected) return false;
  }
  return true;
};

const safePaymentStatus = (record: AnyRecord): boolean => {
  const status = lower(record.status || record.paymentStatus || record.state);
  const recordType = lower(record.recordType || record.transactionType || record.type);
  if (["sla_credit", "refund", "credit"].includes(recordType)) return false;
  if (["rejected", "failed", "cancelled", "canceled", "void", "draft", "review_required"].includes(status)) return false;
  return record.paymentVerified === true ||
    record.verified === true ||
    ["paid", "approved", "verified", "succeeded", "success"].includes(status);
};

const revenueFrom = (record: AnyRecord): number => {
  return amount(record.amount) ||
    amount(record.totalAmount) ||
    amount(record.total) ||
    amount(record.value) ||
    amount(record.mobilizationAmount) ||
    amount(record.paidAmount);
};

const costFrom = (record: AnyRecord): number => {
  return amount(record.actualCost) ||
    amount(record.cost) ||
    amount(record.totalCost) ||
    amount(record.vendorCost) ||
    amount(record.materialsCost) ||
    amount(record.partsCost);
};

const isCompletedTicket = (record: AnyRecord): boolean => {
  const status = lower(record.status || record.ticketStatus);
  return ["completed", "complete", "resolved", "closed", "done"].includes(status);
};

async function readCollection(firestore: admin.firestore.Firestore, collectionName: string, maxDocs: number): Promise<AnyRecord[]> {
  const snap = await firestore.collection(collectionName).limit(maxDocs).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...asRecord(doc.data()) }));
}

const emptyRow = (date: string) => ({ date, revenue: 0, costs: 0, tickets: 0, completedJobs: 0 });

function addRowValue(rows: Map<string, ReturnType<typeof emptyRow>>, date: Date, update: Partial<ReturnType<typeof emptyRow>>): void {
  const key = dayKey(date);
  const existing = rows.get(key) || emptyRow(key);
  rows.set(key, {
    ...existing,
    revenue: existing.revenue + amount(update.revenue),
    costs: existing.costs + amount(update.costs),
    tickets: existing.tickets + amount(update.tickets),
    completedJobs: existing.completedJobs + amount(update.completedJobs),
  });
}

async function buildDailyReport(params: NormalizedParams, services: ReportServices) {
  const [paymentTransactions, tickets] = await Promise.all([
    readCollection(services.db, "payment_transactions", services.maxDocs),
    readCollection(services.db, "maintenanceTickets", services.maxDocs),
  ]);

  const rows = new Map<string, ReturnType<typeof emptyRow>>();

  paymentTransactions.forEach((record) => {
    const date = dateFromRecord(record);
    if (!safePaymentStatus(record) || !inRange(date, params.startDate, params.endDate) || !matchesFilters(record, params.filters)) return;
    addRowValue(rows, date as Date, { revenue: revenueFrom(record) });
  });

  tickets.forEach((record) => {
    const date = dateFromRecord(record);
    if (!inRange(date, params.startDate, params.endDate) || !matchesFilters(record, params.filters)) return;
    addRowValue(rows, date as Date, {
      costs: costFrom(record),
      tickets: 1,
      completedJobs: isCompletedTicket(record) ? 1 : 0,
    });
  });

  const data = Array.from(rows.values()).sort((a, b) => a.date.localeCompare(b.date));
  const totalRevenue = data.reduce((sum, row) => sum + row.revenue, 0);
  const totalCosts = data.reduce((sum, row) => sum + row.costs, 0);
  const totalTickets = data.reduce((sum, row) => sum + row.tickets, 0);
  const totalCompleted = data.reduce((sum, row) => sum + row.completedJobs, 0);

  return {
    data,
    summary: {
      totalRevenue,
      totalCosts,
      totalTickets,
      totalCompleted,
      profit: totalRevenue - totalCosts,
    },
  };
}

async function buildSlaReport(params: NormalizedParams, services: ReportServices) {
  const breaches = (await readCollection(services.db, "sla_breaches", services.maxDocs))
    .filter((record) => inRange(dateFromRecord(record), params.startDate, params.endDate) && matchesFilters(record, params.filters))
    .map((record) => ({
      id: text(record.id),
      ticketId: text(record.ticketId),
      ownerId: text(record.ownerId),
      tier: text(record.tier || record.severity || "standard"),
      penaltyAmount: amount(record.penaltyAmount || record.penalty || record.creditAmount),
      status: text(record.status || "open"),
      detectedAt: dateFromRecord(record)?.toISOString() || null,
    }))
    .sort((a, b) => text(b.detectedAt).localeCompare(text(a.detectedAt)));

  return {
    data: [],
    breaches,
    summary: {
      totalBreaches: breaches.length,
      totalPenaltyAmount: breaches.reduce((sum, item) => sum + item.penaltyAmount, 0),
    },
  };
}

export async function runGetAdminReports(
  data: unknown,
  auth: AdminReportAuth,
  services: ReportServices = { db, now: () => new Date(), maxDocs: 1000 },
) {
  await assertAdmin(auth, services.db);
  const params = normalizeParams(data, services.now());
  const report = params.reportType === "sla_breaches" ? await buildSlaReport(params, services) : await buildDailyReport(params, services);

  return {
    reportType: params.reportType,
    startDate: dayKey(params.startDate),
    endDate: dayKey(params.endDate),
    filters: params.filters,
    generatedAt: services.now().toISOString(),
    ...report,
  };
}

export const getAdminReports = onCall({ cors: true }, async (request) => {
  return runGetAdminReports(request.data, request.auth);
});
