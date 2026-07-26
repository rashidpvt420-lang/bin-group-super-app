export const FIRESTORE_STATUS_IN_LIMIT = 10;

export const UNRESOLVED_MAINTENANCE_TICKET_STATUSES = [
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
] as const;

export const TERMINAL_MAINTENANCE_TICKET_STATUSES = [
  "COMPLETED",
  "TENANT_APPROVED",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
  "REJECTED",
] as const;

const LEGACY_UNRESOLVED_STATUS_VALUES = [
  "new",
  "pending",
  "pending_assignment",
  "dispatched",
  "claimed",
  "started",
] as const;

const normalize = (value: unknown) => String(value || "")
  .trim()
  .replace(/[\s-]+/g, "_")
  .toUpperCase();

const unresolvedSet = new Set<string>(UNRESOLVED_MAINTENANCE_TICKET_STATUSES);
const terminalSet = new Set<string>(TERMINAL_MAINTENANCE_TICKET_STATUSES);

export function normalizeMaintenanceTicketStatus(value: unknown): string {
  return normalize(value);
}

export function isUnresolvedMaintenanceTicketStatus(value: unknown): boolean {
  return unresolvedSet.has(normalize(value));
}

export function isTerminalMaintenanceTicketStatus(value: unknown): boolean {
  return terminalSet.has(normalize(value));
}

export const UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES = Object.freeze([
  ...UNRESOLVED_MAINTENANCE_TICKET_STATUSES,
  ...UNRESOLVED_MAINTENANCE_TICKET_STATUSES.map((status) => status.toLowerCase()),
  ...LEGACY_UNRESOLVED_STATUS_VALUES,
].filter((value, index, values) => values.indexOf(value) === index));

export function unresolvedMaintenanceTicketStatusQueryChunks(
  values: readonly string[] = UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES,
): string[][] {
  const uniqueValues = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueValues.length; index += FIRESTORE_STATUS_IN_LIMIT) {
    chunks.push(uniqueValues.slice(index, index + FIRESTORE_STATUS_IN_LIMIT));
  }
  return chunks;
}
