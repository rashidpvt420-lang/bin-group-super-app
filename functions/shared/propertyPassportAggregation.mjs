/**
 * Property-passport totals for Owner financial surfaces.
 * Live rent records store rentPaid / amountPaid / balance. Older imports store
 * paidBalance / outstandingBalance. Both must contribute, in that order.
 */

export function roundAed(value) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return 0;
  const normalized = Math.round(amount * 100) / 100;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function firstFiniteMoney(record, keys) {
  if (!record || typeof record !== "object") return null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const raw = record[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const amount = Number(raw);
    if (Number.isFinite(amount)) return roundAed(amount);
  }
  return null;
}

const COLLECTED_KEYS = ["rentPaid", "totalRentPaid", "paidAmount", "amountPaid", "collectedAmount", "paidBalance"];
const OUTSTANDING_KEYS = ["balance", "outstandingBalance", "balanceAmount", "remainingBalance", "rentOutstanding"];
const DUE_KEYS = ["rentDue", "totalRentDue", "dueAmount", "expectedRent", "amountDue", "annualRent"];

export function ledgerMoney(record) {
  const collected = firstFiniteMoney(record, COLLECTED_KEYS) ?? 0;
  let outstanding = firstFiniteMoney(record, OUTSTANDING_KEYS);
  if (outstanding === null) {
    const due = firstFiniteMoney(record, DUE_KEYS);
    outstanding = due === null ? 0 : roundAed(Math.max(due - collected, 0));
  }
  return { collected, outstanding };
}

function normalizedStatus(record, keys) {
  for (const key of keys) {
    const value = String(record?.[key] ?? "").trim().toLowerCase();
    if (value) return value;
  }
  return "";
}

function unitOccupancy(unit) {
  const status = normalizedStatus(unit, ["occupancyStatus", "tenantStatus"]);
  if (status === "occupied" || status === "leased") return "occupied";
  if (status === "vacant" || status === "available" || status === "empty") return "vacant";
  return "unknown";
}

function leaseBucket(lease) {
  const status = normalizedStatus(lease, ["leaseStatus", "status"]);
  if (status === "active" || status === "activated" || status === "current") return "active";
  if (status === "expired" || status === "ended" || status === "terminated") return "expired";
  return "other";
}

function ticketBucket(ticket) {
  const status = normalizedStatus(ticket, ["status", "ticketStatus"]);
  if (["closed", "resolved", "completed", "complete"].includes(status)) return "closed";
  if (["cancelled", "canceled", "rejected", "archived"].includes(status)) return "ignored";
  return "open";
}

export function passportIdentity(property) {
  const source = property && typeof property === "object" ? property : {};
  const ownerId = String(source.ownerId || source.ownerUid || "").trim();
  const ownerEmail = String(source.ownerEmail || "").trim().toLowerCase();
  const identity = {};
  if (ownerId) identity.ownerId = ownerId;
  if (ownerEmail) identity.ownerEmail = ownerEmail;
  return identity;
}

export function summarizePropertyPassportSources({ units = [], leases = [], ledgers = [], tickets = [] } = {}) {
  let occupiedUnits = 0;
  let vacantUnits = 0;
  for (const unit of units) {
    const occupancy = unitOccupancy(unit);
    if (occupancy === "occupied") occupiedUnits += 1;
    else if (occupancy === "vacant") vacantUnits += 1;
  }

  let activeLeases = 0;
  let expiredLeases = 0;
  for (const lease of leases) {
    const bucket = leaseBucket(lease);
    if (bucket === "active") activeLeases += 1;
    else if (bucket === "expired") expiredLeases += 1;
  }

  let collected = 0;
  let outstanding = 0;
  for (const ledger of ledgers) {
    const money = ledgerMoney(ledger);
    collected = roundAed(collected + money.collected);
    outstanding = roundAed(outstanding + money.outstanding);
  }

  let openTickets = 0;
  let closedTickets = 0;
  for (const ticket of tickets) {
    const bucket = ticketBucket(ticket);
    if (bucket === "closed") closedTickets += 1;
    else if (bucket === "open") openTickets += 1;
  }

  return {
    totalUnits: Array.isArray(units) ? units.length : 0,
    occupiedUnits,
    vacantUnits,
    activeLeases,
    expiredLeases,
    rentCollectedTotal: collected,
    rentOutstandingTotal: outstanding,
    maintenanceTicketsOpen: openTickets,
    maintenanceTicketsClosed: closedTickets,
    tenantCount: occupiedUnits,
  };
}

export function mergePassportRecords(groups) {
  const merged = new Map();
  for (const group of groups || []) {
    for (const record of group || []) {
      const id = String(record?.id || "").trim();
      if (!id || merged.has(id)) continue;
      merged.set(id, record);
    }
  }
  return [...merged.values()];
}

export function summarizeOwnerPassportFinancials(passports, feeRate = 0.05) {
  const unique = mergePassportRecords([passports]);
  let totalRevenue = 0;
  let maintenanceDeductions = 0;
  let pendingVerification = 0;
  for (const passport of unique) {
    totalRevenue = roundAed(totalRevenue + (firstFiniteMoney(passport, ["rentCollectedTotal", "grossRentCollected", "grossRent"]) ?? 0));
    maintenanceDeductions = roundAed(maintenanceDeductions + (firstFiniteMoney(passport, ["maintenanceCostTotal", "outstandingMaintenanceInvoices", "maintenanceDeductions"]) ?? 0));
    pendingVerification = roundAed(pendingVerification + (firstFiniteMoney(passport, ["pendingRentVerification", "pendingVerification"]) ?? 0));
  }
  const managementFees = roundAed(totalRevenue * Number(feeRate || 0));
  return {
    totalRevenue,
    maintenanceDeductions,
    pendingVerification,
    managementFees,
    netPayout: roundAed(Math.max(totalRevenue - managementFees - maintenanceDeductions, 0)),
    propertyCount: unique.length,
  };
}

const PAID_INVOICE_STATUSES = new Set([
  "PAID",
  "VERIFIED",
  "ADMIN_VERIFIED",
  "APPROVED",
  "SETTLED",
  "RECONCILED",
  "COMPLETED",
  "SUCCESS",
]);

function firstPositiveMoney(record, keys) {
  if (!record || typeof record !== "object") return 0;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const raw = record[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const amount = Number(String(raw).replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(amount) && amount > 0) return roundAed(amount);
  }
  return 0;
}

function normalizeInvoiceStatus(invoice) {
  return String(invoice?.status || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Sum Owner invoices that are recorded as paid/verified.
 * Mobilization deposits and service invoices are cash facts — they must not be
 * silently ignored when passport rent ledgers are still zero.
 */
export function summarizeOwnerPaidInvoices(invoices = []) {
  let total = 0;
  let count = 0;
  for (const invoice of invoices || []) {
    const status = normalizeInvoiceStatus(invoice);
    const verifiedFlag = invoice?.paymentVerified === true || invoice?.paid === true;
    if (!PAID_INVOICE_STATUSES.has(status) && !verifiedFlag) continue;
    const amount = firstFiniteMoney(invoice, ["amount", "amountPaid", "total", "grandTotal", "invoiceAmount"]) ?? 0;
    if (!(amount > 0)) continue;
    total = roundAed(total + amount);
    count += 1;
  }
  return { total, count };
}

/**
 * Same VERIFIED NOI basis as Owner advanced intelligence:
 * annual rent less recorded maintenance, operating expenses and management fees.
 * Returns null NOI when annual rent is missing — never invents income.
 */
export function summarizeOwnerVerifiedNoi(properties = []) {
  const rows = Array.isArray(properties) ? properties : [];
  let annualRentalIncome = 0;
  let maintenanceCost = 0;
  let operatingExpenses = 0;
  let managementFees = 0;
  for (const property of rows) {
    annualRentalIncome = roundAed(
      annualRentalIncome + firstPositiveMoney(property, ["annualRentalIncome", "annualRent", "rentAnnual", "expectedAnnualRent"]),
    );
    maintenanceCost = roundAed(
      maintenanceCost + firstPositiveMoney(property, ["maintenanceCostTotal", "maintenanceCost", "annualMaintenanceCost"]),
    );
    operatingExpenses = roundAed(
      operatingExpenses + firstPositiveMoney(property, ["operatingExpenses", "annualOperatingExpenses", "opex"]),
    );
    managementFees = roundAed(
      managementFees + firstPositiveMoney(property, ["managementFeesTotal", "annualManagementFees"]),
    );
  }
  const verifiedNoi = annualRentalIncome > 0
    ? roundAed(Math.max(0, annualRentalIncome - maintenanceCost - operatingExpenses - managementFees))
    : null;
  return {
    annualRentalIncome: annualRentalIncome > 0 ? annualRentalIncome : null,
    maintenanceCost: maintenanceCost > 0 ? maintenanceCost : null,
    operatingExpenses: operatingExpenses > 0 ? operatingExpenses : null,
    managementFees: managementFees > 0 ? managementFees : null,
    verifiedNoi,
    status: verifiedNoi !== null ? "VERIFIED" : "MISSING",
    basis: verifiedNoi !== null
      ? "Annual rent less recorded maintenance, operating expenses and management fees"
      : "Annual rent data is not recorded yet",
  };
}

/**
 * Owner Financial Truth surface: passport rent cash + paid invoices + VERIFIED NOI.
 * Does not treat mobilization invoices as rent payable to the owner.
 */
export function buildOwnerFinancialTruthSummary({
  passports = [],
  invoices = [],
  properties = [],
  feeRate = 0.05,
} = {}) {
  const rent = summarizeOwnerPassportFinancials(passports, feeRate);
  const paidInvoices = summarizeOwnerPaidInvoices(invoices);
  const noi = summarizeOwnerVerifiedNoi(properties);
  const hasRentCash = rent.totalRevenue > 0 || rent.netPayout > 0;
  const hasVerifiedNoi = noi.verifiedNoi !== null;
  const hasPaidInvoices = paidInvoices.total > 0;
  let primaryKind = "empty";
  let primaryValue = 0;
  if (hasRentCash) {
    primaryKind = "net_payout";
    primaryValue = rent.netPayout;
  } else if (hasVerifiedNoi) {
    primaryKind = "verified_noi";
    primaryValue = noi.verifiedNoi;
  } else if (hasPaidInvoices) {
    primaryKind = "paid_invoices";
    primaryValue = paidInvoices.total;
  }
  return {
    ...rent,
    paidInvoiceTotal: paidInvoices.total,
    paidInvoiceCount: paidInvoices.count,
    annualRentalIncome: noi.annualRentalIncome,
    verifiedNoi: noi.verifiedNoi,
    verifiedNoiStatus: noi.status,
    verifiedNoiBasis: noi.basis,
    primaryKind,
    primaryValue,
    hasRecordedFinancials: hasRentCash || hasVerifiedNoi || hasPaidInvoices || rent.propertyCount > 0,
  };
}
