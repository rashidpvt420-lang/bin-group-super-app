/**
 * Pure SLA countdown helpers for technician job cards. No Firestore, React or I/O.
 *
 * The deadline is never invented. Resolution order:
 *   1. an explicit deadline stored on the ticket (slaDeadline / slaDueAt / slaTargetAt);
 *   2. for tickets still waiting for work to start, the same response window the server SLA cron
 *      (functions/slaCron.ts SLA_BREACH_AFTER_MS) uses to flag a breach: 24h after creation;
 *   3. otherwise there is no countdown, and the UI says so.
 */

/** Must equal SLA_BREACH_AFTER_MS in functions/slaCron.ts (pinned by a test). */
export const SLA_RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Amber starts when this share of the window (or this long, if the window is unknown) is left. */
export const SLA_AMBER_FRACTION = 0.25;
export const SLA_AMBER_FALLBACK_MS = 60 * 60 * 1000;

export type SlaCountdownState = 'green' | 'amber' | 'red' | 'none';
export type SlaDeadlineSource = 'ticket' | 'response-window' | 'none';

export type SlaCountdown = {
  state: SlaCountdownState;
  source: SlaDeadlineSource;
  deadlineMs: number | null;
  remainingMs: number | null;
  /** Compact clock text, e.g. "3h 12m 05s", "12m 40s", "Overdue 1h 05m"; null when there is no deadline. */
  clock: string | null;
};

const DONE_STATUSES = new Set(['completed', 'closed', 'resolved', 'cancelled', 'canceled', 'rejected']);
// Work has started, so the pre-work response window no longer applies (only an explicit deadline does).
const PRE_WORK_STATUSES = new Set(['open', 'new', 'pending', 'pending_scheduling', 'assigned', 'auto_assigned', 'dispatched', 'technician_assigned', 'reopened']);

export function slaTimeToMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const v = value as { toMillis?: () => number; seconds?: unknown; _seconds?: unknown };
  if (typeof v.toMillis === 'function') {
    const ms = v.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (typeof v._seconds === 'number') return v._seconds * 1000;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveSlaDeadline(job: Record<string, unknown> | null | undefined): { deadlineMs: number | null; startMs: number | null; source: SlaDeadlineSource } {
  if (!job) return { deadlineMs: null, startMs: null, source: 'none' };
  const status = String(job.status || '').toLowerCase();
  if (DONE_STATUSES.has(status)) return { deadlineMs: null, startMs: null, source: 'none' };
  const createdMs = slaTimeToMs(job.createdAt);
  const explicit = slaTimeToMs(job.slaDeadline) ?? slaTimeToMs(job.slaDueAt) ?? slaTimeToMs(job.slaTargetAt);
  if (explicit !== null) return { deadlineMs: explicit, startMs: createdMs, source: 'ticket' };
  if (createdMs !== null && PRE_WORK_STATUSES.has(status)) {
    return { deadlineMs: createdMs + SLA_RESPONSE_WINDOW_MS, startMs: createdMs, source: 'response-window' };
  }
  return { deadlineMs: null, startMs: null, source: 'none' };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatSlaClock(remainingMs: number): string {
  const overdue = remainingMs < 0;
  const totalSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  // Overdue time is shown to the minute so it does not flicker; live time ticks every second.
  const body = overdue
    ? (h > 0 ? `${h}h ${pad(m)}m` : `${m}m`)
    : (h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`);
  return overdue ? `Overdue ${body}` : body;
}

export function computeSlaCountdown(job: Record<string, unknown> | null | undefined, nowMs: number): SlaCountdown {
  const { deadlineMs, startMs, source } = resolveSlaDeadline(job);
  if (deadlineMs === null) return { state: 'none', source: 'none', deadlineMs: null, remainingMs: null, clock: null };
  const remainingMs = deadlineMs - nowMs;
  const windowMs = startMs !== null && deadlineMs > startMs ? deadlineMs - startMs : null;
  const amberAt = windowMs !== null ? windowMs * SLA_AMBER_FRACTION : SLA_AMBER_FALLBACK_MS;
  const state: SlaCountdownState = remainingMs <= 0 ? 'red' : remainingMs <= amberAt ? 'amber' : 'green';
  return { state, source, deadlineMs, remainingMs, clock: formatSlaClock(remainingMs) };
}
