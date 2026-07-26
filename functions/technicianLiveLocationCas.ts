export type TechnicianLiveSessionState = {
  exists: boolean;
  isTracking: boolean;
  trackingSessionId: string;
  activeTicketId: string;
  lastStoppedTicketId: string;
  expiresAtMs: number | null;
};

export type StopDecision =
  | "APPLY"
  | "ALREADY_STOPPED"
  | "REJECT_MISSING"
  | "REJECT_SUPERSEDED";

export type UpdateDecision =
  | "APPLY"
  | "REJECT_SUPERSEDED";

export type WatchdogDecision =
  | "RECONCILE"
  | "SKIP_MISSING"
  | "SKIP_NOT_TRACKING"
  | "SKIP_SESSION_SUPERSEDED"
  | "SKIP_TICKET_CHANGED"
  | "SKIP_EXPIRY_CHANGED"
  | "SKIP_NOT_EXPIRED";

const clean = (value: unknown) => String(value || "").trim();

export function liveSessionState(
  data: Record<string, unknown> | undefined,
  exists = true,
): TechnicianLiveSessionState {
  const expiresAt = data?.expiresAt as { toMillis?: () => number } | number | null | undefined;
  let expiresAtMs: number | null = null;
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
    expiresAtMs = expiresAt;
  } else if (expiresAt && typeof expiresAt.toMillis === "function") {
    const parsed = expiresAt.toMillis();
    expiresAtMs = Number.isFinite(parsed) ? parsed : null;
  }

  return {
    exists,
    isTracking: data?.isTracking === true,
    trackingSessionId: clean(data?.trackingSessionId),
    activeTicketId: clean(data?.activeTicketId),
    lastStoppedTicketId: clean(data?.lastStoppedTicketId),
    expiresAtMs,
  };
}

export function classifyStopRequest(
  current: TechnicianLiveSessionState,
  requestedTicketId: string,
  requestedSessionId: string,
): StopDecision {
  if (!current.exists) return "REJECT_MISSING";
  const ticketId = clean(requestedTicketId);
  const sessionId = clean(requestedSessionId);
  if (!ticketId || !sessionId) return "REJECT_SUPERSEDED";

  if (current.isTracking) {
    return current.trackingSessionId === sessionId && current.activeTicketId === ticketId
      ? "APPLY"
      : "REJECT_SUPERSEDED";
  }

  return current.trackingSessionId === sessionId &&
    !current.activeTicketId &&
    current.lastStoppedTicketId === ticketId
    ? "ALREADY_STOPPED"
    : "REJECT_SUPERSEDED";
}

export function classifyUpdateRequest(
  current: TechnicianLiveSessionState,
  requestedTicketId: string,
  requestedSessionId: string,
  transactionNowMs: number,
): UpdateDecision {
  if (!current.exists || !current.isTracking) return "APPLY";
  if (current.expiresAtMs !== null && current.expiresAtMs <= transactionNowMs) return "APPLY";
  return current.activeTicketId === clean(requestedTicketId) &&
    current.trackingSessionId === clean(requestedSessionId)
    ? "APPLY"
    : "REJECT_SUPERSEDED";
}

export function classifyWatchdogCandidate(
  queried: TechnicianLiveSessionState,
  current: TechnicianLiveSessionState,
  transactionNowMs: number,
): WatchdogDecision {
  if (!current.exists) return "SKIP_MISSING";
  if (!current.isTracking) return "SKIP_NOT_TRACKING";
  if (current.trackingSessionId !== queried.trackingSessionId) return "SKIP_SESSION_SUPERSEDED";
  if (current.activeTicketId !== queried.activeTicketId) return "SKIP_TICKET_CHANGED";
  if (current.expiresAtMs !== queried.expiresAtMs) return "SKIP_EXPIRY_CHANGED";
  if (current.expiresAtMs === null || current.expiresAtMs > transactionNowMs) return "SKIP_NOT_EXPIRED";
  return "RECONCILE";
}
