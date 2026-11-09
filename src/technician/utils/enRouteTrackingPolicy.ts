// P1-6 (audit 9 Nov 2026): the technician shell, not the job page, owns live GPS while a job is en route.
// Pure decision logic so it can be unit tested without a browser.

export const EN_ROUTE_STATUSES = ['EN_ROUTE', 'ON_THE_WAY'];

export const isEnRouteStatus = (status: unknown) => EN_ROUTE_STATUSES.includes(String(status || '').trim().toUpperCase().replace(/[\s-]+/g, '_'));

export type ShellTrackingInput = {
  /** The assigned-jobs listener has delivered at least one snapshot. */
  loaded: boolean;
  /** Assigned active jobs (id + status) from the listener. */
  jobs: Array<{ id: string; status?: unknown }>;
  /** Ticket the browser is streaming GPS for right now, or null. */
  activeTicketId: string | null;
  /** Ticket whose job page is open; that page drives start/stop (arrival needs a fresh fix). */
  pageOwnerTicketId: string | null;
  online: boolean;
};

export type ShellTrackingDecision =
  | { action: 'none'; reason: string }
  | { action: 'start'; ticketId: string }
  | { action: 'stop'; ticketId: string };

export function decideShellTracking(input: ShellTrackingInput): ShellTrackingDecision {
  if (!input.loaded) return { action: 'none', reason: 'jobs not loaded yet' };
  if (input.pageOwnerTicketId) return { action: 'none', reason: 'job page owns tracking' };
  const enRoute = input.jobs.filter((job) => isEnRouteStatus(job.status)).map((job) => job.id).sort();
  if (input.activeTicketId) {
    if (enRoute.includes(input.activeTicketId)) return { action: 'none', reason: 'already tracking the en-route job' };
    // The tracked job is no longer en route (arrived, cancelled, reassigned or completed).
    return { action: 'stop', ticketId: input.activeTicketId };
  }
  if (!input.online) return { action: 'none', reason: 'offline' };
  if (enRoute.length > 0) return { action: 'start', ticketId: enRoute[0] };
  return { action: 'none', reason: 'no en-route job' };
}
