// Who the technician should contact on site, and when.
// Phone/WhatsApp are offered only while the job is active for this technician;
// after completion/closure the technician falls back to Operations.

export type JobContactRole = 'onsite' | 'tenant' | 'owner' | 'requester';
export type JobContact = { name: string; phone: string; role: JobContactRole };

const ACTIVE_CONTACT_STATUSES = new Set([
  'ASSIGNED', 'AUTO_ASSIGNED', 'DISPATCHED', 'TECHNICIAN_ASSIGNED', 'ACCEPTED', 'CLAIMED',
  'EN_ROUTE', 'ON_THE_WAY', 'ARRIVED', 'ON_SITE', 'IN_PROGRESS', 'STARTED', 'WORK_STARTED', 'ON_HOLD', 'PAUSED',
]);

export function isJobContactWindowOpen(status: unknown): boolean {
  return ACTIVE_CONTACT_STATUSES.has(String(status || '').trim().replace(/[\s-]+/g, '_').toUpperCase());
}

/** Normalise to E.164 digits without '+', UAE-aware. Returns '' for unusable values like "N/A". */
export function normalizeContactPhone(raw: unknown): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  let digits = text.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 10) digits = `971${digits.slice(1)}`; // 05x xxx xxxx
  else if (digits.length === 9 && digits.startsWith('5')) digits = `971${digits}`; // 5x xxx xxxx
  if (digits.length < 8 || digits.length > 15) return '';
  return digits;
}

export function telHref(phone: string): string { return phone ? `tel:+${phone}` : ''; }
export function whatsAppHref(phone: string): string { return phone ? `https://wa.me/${phone}` : ''; }

export function resolveJobContact(ticket: any): JobContact | null {
  if (!ticket) return null;
  const onsite = normalizeContactPhone(ticket.onSiteContactPhone || ticket.contactDuringService || ticket.scheduledService?.contactDuringService);
  if (onsite) return { name: String(ticket.onSiteContactName || ticket.tenantName || ''), phone: onsite, role: 'onsite' };
  const tenant = normalizeContactPhone(ticket.tenantPhone);
  if (tenant) return { name: String(ticket.tenantName || ''), phone: tenant, role: 'tenant' };
  const owner = normalizeContactPhone(ticket.ownerPhone);
  if (owner) return { name: String(ticket.ownerName || ''), phone: owner, role: 'owner' };
  const requester = normalizeContactPhone(ticket.requesterPhone);
  if (requester) return { name: String(ticket.requesterName || ticket.tenantName || ticket.ownerName || ''), phone: requester, role: 'requester' };
  return null;
}

/** Single opening point for tel:/wa.me so native handling can be added in one place. */
export function openContactUrl(url: string): void {
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}
