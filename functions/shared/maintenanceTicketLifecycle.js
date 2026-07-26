export const FIRESTORE_STATUS_IN_LIMIT = 10;

export const UNRESOLVED_MAINTENANCE_TICKET_STATUSES = Object.freeze([
  "UNASSIGNED",
  "OPEN",
  "PENDING",
  "PENDING_ASSIGNMENT",
  "ASSIGNED",
  "AUTO_ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ON_THE_WAY",
  "ARRIVED",
  "IN_PROGRESS",
  "WORK_STARTED",
  "WAITING_PARTS",
  "ESCALATED",
  "REOPENED",
  "ON_HOLD",
  "DISPUTED",
]);

export const TERMINAL_MAINTENANCE_TICKET_STATUSES = Object.freeze([
  "COMPLETED",
  "TENANT_APPROVED",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
  "REJECTED",
]);

const LEGACY_UNRESOLVED_STATUS_VALUES = Object.freeze([
  "new",
  "pending",
  "pending_assignment",
  "dispatched",
  "claimed",
  "started",
]);

const normalize = (value) => String(value || "")
  .trim()
  .replace(/[\s-]+/g, "_")
  .toUpperCase();

const unresolvedSet = new Set(UNRESOLVED_MAINTENANCE_TICKET_STATUSES);
const terminalSet = new Set(TERMINAL_MAINTENANCE_TICKET_STATUSES);

export function normalizeMaintenanceTicketStatus(value) {
  return normalize(value);
}

export function isUnresolvedMaintenanceTicketStatus(value) {
  return unresolvedSet.has(normalize(value));
}

export function isTerminalMaintenanceTicketStatus(value) {
  return terminalSet.has(normalize(value));
}

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
