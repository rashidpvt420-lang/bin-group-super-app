export const FIRESTORE_STATUS_IN_LIMIT = 10;

export const UNRESOLVED_MAINTENANCE_TICKET_STATUSES = Object.freeze([
  "OPEN",
  "PENDING_SCHEDULING",
  "SCHEDULED",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "RESCHEDULE_REQUESTED",
  "CANCELLATION_REQUESTED",
  "ESCALATED",
  "REOPENED",
  "ON_HOLD",
  "DISPUTED",
]);

export const TERMINAL_MAINTENANCE_TICKET_STATUSES = Object.freeze([
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
  "REJECTED",
]);

const LEGACY_UNRESOLVED_STATUS_ALIASES = Object.freeze({
  NEW: "OPEN",
  UNASSIGNED: "OPEN",
  PENDING: "OPEN",
  PENDING_ASSIGNMENT: "OPEN",
  EMERGENCY_SUBMITTED: "OPEN",
  AUTO_ASSIGNED: "ASSIGNED",
  DISPATCHED: "ASSIGNED",
  TECHNICIAN_ASSIGNED: "ASSIGNED",
  CLAIMED: "ACCEPTED",
  ON_THE_WAY: "EN_ROUTE",
  STARTED: "IN_PROGRESS",
  WORK_STARTED: "IN_PROGRESS",
  QUOTE_REJECTED: "OPEN",
});

const normalizeRaw = (value) => String(value || "")
  .trim()
  .replace(/[\s-]+/g, "_")
  .toUpperCase();

const canonicalize = (value) => {
  const normalized = normalizeRaw(value);
  return LEGACY_UNRESOLVED_STATUS_ALIASES[normalized] || LEGACY_TERMINAL_STATUS_ALIASES[normalized] || normalized;
};

const unresolvedSet = new Set(UNRESOLVED_MAINTENANCE_TICKET_STATUSES);
const terminalSet = new Set(TERMINAL_MAINTENANCE_TICKET_STATUSES);

export function normalizeMaintenanceTicketStatus(value) {
  return canonicalize(value);
}

export function isUnresolvedMaintenanceTicketStatus(value) {
  return unresolvedSet.has(canonicalize(value));
}

export function isTerminalMaintenanceTicketStatus(value) {
  return terminalSet.has(canonicalize(value));
}

const LEGACY_UNRESOLVED_STATUS_VALUES = Object.freeze(
  Object.keys(LEGACY_UNRESOLVED_STATUS_ALIASES).flatMap((status) => [status, status.toLowerCase()]),
);

const LEGACY_TERMINAL_STATUS_ALIASES = Object.freeze({
  TENANT_APPROVED: "CLOSED",
  RESOLVED: "CLOSED",
  CLOSED_VERIFIED: "CLOSED",
  CANCELED: "CANCELLED",
});

export const UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES = Object.freeze([
  ...UNRESOLVED_MAINTENANCE_TICKET_STATUSES,
  ...UNRESOLVED_MAINTENANCE_TICKET_STATUSES.map((status) => status.toLowerCase()),
  ...LEGACY_UNRESOLVED_STATUS_VALUES,
].filter((value, index, values) => values.indexOf(value) === index));

export function unresolvedMaintenanceTicketStatusQueryChunks(
  values = UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES,
) {
  const uniqueValues = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  const chunks = [];
  for (let index = 0; index < uniqueValues.length; index += FIRESTORE_STATUS_IN_LIMIT) {
    chunks.push(uniqueValues.slice(index, index + FIRESTORE_STATUS_IN_LIMIT));
  }
  return chunks;
}
