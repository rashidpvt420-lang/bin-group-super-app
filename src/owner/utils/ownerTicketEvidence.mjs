/**
 * BIN GROUP — Owner ticket evidence resolver.
 *
 * The technician flow and the server callables record work evidence under
 * several field names on the canonical maintenanceTickets document:
 *
 *   - confirmTechnicianBeforeWorkEvidence writes technicianBeforePhotos,
 *     technicianBeforePhotoUrl, technicianBeforeStoragePath and mirrors the
 *     URL into beforePhotos / beforePhotoUrl.
 *   - confirmTechnicianAfterWorkEvidence writes technicianAfterPhotos,
 *     technicianAfterPhotoUrl and technicianAfterStoragePath.
 *   - completion / ticketSystemService mirror after-work proof into
 *     afterPhotos, afterPhotoUrl, completionPhotos, proofPhotos and
 *     evidencePhotos.
 *   - the tenant/owner request flow records fault photos in photos,
 *     tenantPhotos, initialPhotoUrls or photoUrl.
 *   - the technician completion write stores technicianNotes / notes,
 *     materialsUsed and partsDisposition.
 *
 * The Owner ticket detail previously read only a subset of those fields,
 * repeated the same mirrored photo up to five times, and only rendered the
 * evidence inside the owner-review panel. This resolver reads every writer
 * field, de-duplicates by Storage object path, never invents evidence, and
 * reports an honest empty result when nothing was recorded.
 *
 * Pure ESM so the launch tests can execute it directly with node --test.
 */

export const OWNER_BEFORE_EVIDENCE_FIELDS = Object.freeze([
  'technicianBeforePhotos',
  'technicianBeforePhotoUrl',
  'beforePhotos',
  'beforePhotoUrl',
  'photosBefore',
  'photos',
  'tenantPhotos',
  'initialPhotoUrls',
  'photoUrl',
]);

export const OWNER_AFTER_EVIDENCE_FIELDS = Object.freeze([
  'technicianAfterPhotos',
  'technicianAfterPhotoUrl',
  'afterPhotos',
  'afterPhotoUrl',
  'proofPhotosAfter',
  'completionPhotos',
  'proofPhotos',
  'evidencePhotos',
]);

const BEFORE_STORAGE_PATH_FIELDS = Object.freeze(['technicianBeforeStoragePath']);
const AFTER_STORAGE_PATH_FIELDS = Object.freeze(['technicianAfterStoragePath']);

// Only technician-authored note fields. The generic `notes` field can carry
// requester text on some legacy tickets, so it is never attributed to the
// technician here.
const NOTE_FIELDS = Object.freeze(['technicianNotes', 'completionNotes', 'resolutionNotes']);
const NO_PARTS_PLACEHOLDERS = new Set(['', 'no parts entered']);

function clean(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Returns the Storage object path a Firebase download URL (or gs:// URL)
 * points at, or null when the value is not a Storage reference.
 */
export function storageObjectPathFromUrl(value) {
  const raw = clean(value, 2000);
  if (!raw) return null;
  if (raw.startsWith('gs://')) {
    const withoutScheme = raw.slice('gs://'.length);
    const slash = withoutScheme.indexOf('/');
    return slash > 0 ? withoutScheme.slice(slash + 1) || null : null;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  // https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded path>?alt=media&token=...
  const firebaseMatch = parsed.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
  if (firebaseMatch) return safeDecode(firebaseMatch[1]);
  // https://storage.googleapis.com/<bucket>/<path>
  if (parsed.hostname === 'storage.googleapis.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts.length > 1 ? safeDecode(parts.slice(1).join('/')) : null;
  }
  return null;
}

function isRenderableUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSafeTicketStoragePath(path) {
  return Boolean(path) && !path.includes('..') && !path.startsWith('/') && path.startsWith('maintenanceTickets/');
}

/**
 * Normalises one evidence entry (string URL, gs:// path, Storage path or an
 * object such as { url } / { downloadUrl } / { storagePath }) into
 * { url, storagePath } or null when nothing usable is present.
 */
function normaliseEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const value = clean(entry, 2000);
    if (!value) return null;
    if (isRenderableUrl(value)) {
      return { url: value, storagePath: storageObjectPathFromUrl(value) };
    }
    const gsPath = value.startsWith('gs://') ? storageObjectPathFromUrl(value) : value;
    return gsPath && isSafeTicketStoragePath(gsPath) ? { url: null, storagePath: gsPath } : null;
  }
  if (typeof entry === 'object') {
    const url = clean(entry.url || entry.downloadUrl || entry.downloadURL || entry.src || entry.photoUrl, 2000);
    const path = clean(entry.storagePath || entry.path || entry.fullPath, 600);
    if (url && isRenderableUrl(url)) {
      return { url, storagePath: storageObjectPathFromUrl(url) || (isSafeTicketStoragePath(path) ? path : null) };
    }
    if (path && isSafeTicketStoragePath(path)) return { url: null, storagePath: path };
    return null;
  }
  return null;
}

function collect(ticket, fields, storagePathFields) {
  const seen = new Set();
  const items = [];
  const add = (entry, source) => {
    const normalised = normaliseEntry(entry);
    if (!normalised) return;
    const key = normalised.storagePath || normalised.url;
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push({ ...normalised, source });
  };
  for (const field of fields) {
    const value = ticket?.[field];
    if (Array.isArray(value)) value.forEach((entry) => add(entry, field));
    else add(value, field);
  }
  // A confirmed Storage path without any mirrored URL is still real evidence;
  // the UI resolves it through the Storage SDK under the existing rules.
  for (const field of storagePathFields) {
    const path = clean(ticket?.[field], 600);
    if (path && isSafeTicketStoragePath(path)) add(path, field);
  }
  return items;
}

function resolveMaterials(ticket) {
  const list = Array.isArray(ticket?.materialsUsed)
    ? ticket.materialsUsed.map((item) => clean(typeof item === 'string' ? item : item?.name, 200)).filter(Boolean)
    : [];
  if (list.length > 0) return list;
  const disposition = clean(ticket?.partsDisposition, 400);
  if (disposition && !NO_PARTS_PLACEHOLDERS.has(disposition.toLowerCase())) return [disposition];
  if (ticket?.noPartsRequired === true) return ['No parts required'];
  return [];
}

function resolveNotes(ticket) {
  for (const field of NOTE_FIELDS) {
    const value = clean(ticket?.[field]);
    if (value) return value;
  }
  return '';
}

/**
 * Resolves the evidence the technician actually recorded on a ticket.
 * @returns {{ before: Array<{url: string|null, storagePath: string|null, source: string}>,
 *             after: Array<{url: string|null, storagePath: string|null, source: string}>,
 *             notes: string, materials: string[], hasAnyEvidence: boolean,
 *             afterEvidenceConfirmed: boolean, beforeEvidenceConfirmed: boolean }}
 */
export function resolveOwnerTicketEvidence(ticket) {
  const before = collect(ticket, OWNER_BEFORE_EVIDENCE_FIELDS, BEFORE_STORAGE_PATH_FIELDS);
  const after = collect(ticket, OWNER_AFTER_EVIDENCE_FIELDS, AFTER_STORAGE_PATH_FIELDS);
  const notes = resolveNotes(ticket);
  const materials = resolveMaterials(ticket);
  return {
    before,
    after,
    notes,
    materials,
    beforeEvidenceConfirmed: clean(ticket?.technicianBeforeEvidenceState, 40).toUpperCase() === 'CONFIRMED',
    afterEvidenceConfirmed: clean(ticket?.technicianAfterEvidenceState, 40).toUpperCase() === 'CONFIRMED',
    hasAnyEvidence: before.length > 0 || after.length > 0 || Boolean(notes) || materials.length > 0,
  };
}
