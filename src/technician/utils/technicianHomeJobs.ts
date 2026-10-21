/** Pure helpers for the redesigned technician home (REDESIGN.md R3). No Firestore access here. */
export type HomeJob = Record<string, any> & { id: string };

// Work already started comes first, then jobs on the way, then accepted, then newly assigned.
const STAGE_ORDER: Record<string, number> = { in_progress: 0, waiting_parts: 1, arrived: 2, en_route: 3, on_the_way: 3, accepted: 4, assigned: 5, auto_assigned: 5, escalated: 6 };

export function jobStage(job: HomeJob): number {
  return STAGE_ORDER[String(job.status || '').toLowerCase()] ?? 9;
}

export function toMs(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** The time a technician should plan around: booked slot, else SLA deadline, else creation. */
export function jobTimeMs(job: HomeJob): number | null {
  return toMs(job.scheduledAt) ?? toMs(job.scheduledFor) ?? toMs(job.preferredDateTime) ?? toMs(job.slaDeadline) ?? toMs(job.createdAt);
}

export function sortHomeJobs(jobs: HomeJob[]): HomeJob[] {
  return [...jobs].sort((a, b) => jobStage(a) - jobStage(b) || (jobTimeMs(a) ?? Number.MAX_SAFE_INTEGER) - (jobTimeMs(b) ?? Number.MAX_SAFE_INTEGER));
}

export function jobTitle(job: HomeJob): string {
  return String(job.category || job.complaintCategory || job.title || 'Maintenance job');
}

export function jobPlace(job: HomeJob): string {
  const unit = job.unitNumber || job.unitLabel;
  return [job.propertyName, unit ? `Unit ${unit}` : ''].filter(Boolean).join(' · ');
}

export function jobAddress(job: HomeJob): string | null {
  const a = job.address || job.propertyLocation?.address || job.jobLocation?.address;
  return a ? String(a) : null;
}

/** Google Maps directions link (opens Maps/Waze chooser on phones). Null when we have nothing to route to. */
export function navigateUrl(job: HomeJob, pin: { lat: number; lng: number } | null): string | null {
  if (pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lng)) return `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`;
  const address = jobAddress(job);
  return address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null;
}

export function needsAccept(job: HomeJob): boolean {
  return ['assigned', 'auto_assigned'].includes(String(job.status || '').toLowerCase());
}

export function isStartOfDay(ms: number, now = Date.now()): boolean {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  return ms >= d.getTime();
}
