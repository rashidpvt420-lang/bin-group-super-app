export const ADMIN_OPEN_TICKET_SHARD_COUNT = 20;

const CLOSED_TICKET_STATUSES = new Set([
  "COMPLETED",
  "CLOSED",
  "RESOLVED",
  "CANCELLED",
  "CANCELED",
  "completed",
  "closed",
  "resolved",
  "cancelled",
  "canceled",
]);

export function isOpenTicketStatus(status: unknown): boolean {
  const value = String(status || "").trim();
  if (!value) return true;
  return !CLOSED_TICKET_STATUSES.has(value) && !CLOSED_TICKET_STATUSES.has(value.toUpperCase());
}

export function openTicketDelta(before: { status?: unknown } | null | undefined, after: { status?: unknown } | null | undefined): number {
  const wasOpen = Boolean(before) && isOpenTicketStatus(before?.status);
  const isOpen = Boolean(after) && isOpenTicketStatus(after?.status);
  return (isOpen ? 1 : 0) - (wasOpen ? 1 : 0);
}

export function ownerIdOf(data: { ownerId?: unknown; ownerUid?: unknown } | null | undefined): string {
  return String(data?.ownerId || data?.ownerUid || "").trim();
}

export function shardIdFor(ticketId: string, shardCount = ADMIN_OPEN_TICKET_SHARD_COUNT): string {
  const count = Math.max(1, shardCount);
  let hash = 0;
  const key = String(ticketId || "");
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return String(hash % count);
}

export function ownerOpenTicketAdjustments(
  before: { status?: unknown; ownerId?: unknown; ownerUid?: unknown } | null | undefined,
  after: { status?: unknown; ownerId?: unknown; ownerUid?: unknown } | null | undefined,
): Array<{ ownerId: string; delta: number }> {
  const beforeOwner = ownerIdOf(before);
  const afterOwner = ownerIdOf(after);
  const beforeOpen = Boolean(before) && isOpenTicketStatus(before?.status);
  const afterOpen = Boolean(after) && isOpenTicketStatus(after?.status);
  const adjustments = new Map<string, number>();
  if (beforeOwner && afterOwner && beforeOwner === afterOwner) {
    const delta = (afterOpen ? 1 : 0) - (beforeOpen ? 1 : 0);
    if (delta) adjustments.set(beforeOwner, delta);
  } else {
    if (beforeOwner && beforeOpen) adjustments.set(beforeOwner, (adjustments.get(beforeOwner) || 0) - 1);
    if (afterOwner && afterOpen) adjustments.set(afterOwner, (adjustments.get(afterOwner) || 0) + 1);
  }
  return [...adjustments.entries()].filter(([, delta]) => delta).map(([ownerId, delta]) => ({ ownerId, delta }));
}

